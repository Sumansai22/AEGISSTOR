"""
AEGISSTOR Notification, Alerting and Incident Management Test Suite
Validates event generation, threshold rules, duplicate suppression, multi-channel dispatch,
quiet hours enforcement, incident lifecycle, escalation, and announcement management.
"""
import sys
from pathlib import Path
from datetime import datetime, timedelta
import pytest
from fastapi.testclient import TestClient

backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.main import app
from app.database.session import SessionLocal
from app.models.database import (
    Notification, Incident, IncidentAcknowledgement, AlertRule, AlertEvent,
    NotificationPreference, NotificationDeliveryLog, SystemAnnouncement
)
from app.notifications.deduplication import deduplication_engine
from app.notifications.preferences import preferences_manager
from app.notifications.event_processor import event_processor
from app.notifications.escalation import escalation_engine
from app.notifications.dispatcher import dispatcher

client = TestClient(app)

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_alert_rules_seeded(db_session):
    """Verify that default alert rules for all 5 domains are present in database."""
    rules = db_session.query(AlertRule).all()
    assert len(rules) >= 10

    categories = {r.category for r in rules}
    assert "STORAGE" in categories
    assert "PERFORMANCE" in categories
    assert "DATABASE" in categories
    assert "AWS" in categories
    assert "AI_FORECAST" in categories


def test_event_processing_and_incident_creation(db_session):
    """Verify event evaluation creates an Incident and Notification when threshold is breached."""
    import uuid
    test_vol = f"VOL_{uuid.uuid4().hex[:6].upper()}:"

    # Test storage utilization breach at 92% (breaches Critical threshold 90%)
    res = event_processor.evaluate_metric(
        db=db_session,
        category="STORAGE",
        metric_key="storage_usage_percent",
        resource=test_vol,
        current_value=92.4,
        metadata={"unit_test": True}
    )

    assert res is not None
    assert res["breached"] is True
    assert res["severity"] == "CRITICAL"
    assert "incident_number" in res
    assert "notification_id" in res

    # Verify incident persisted in DB
    inc = db_session.query(Incident).filter(
        Incident.incident_number == res["incident_number"]
    ).first()
    assert inc is not None
    assert inc.severity == "CRITICAL"
    assert inc.status == "OPEN"
    assert inc.resource == test_vol
    assert inc.root_cause_evidence is not None


def test_duplicate_alert_suppression(db_session):
    """Verify deduplication engine suppresses repetitive notifications within cooldown window."""
    rule = db_session.query(AlertRule).filter(
        AlertRule.name == "Storage Utilization 80%"
    ).first()
    assert rule is not None

    resource_name = "TEST_VOL_SUPPRESS_E:"

    # First trigger: should NOT be suppressed
    suppressed1, reason1 = deduplication_engine.should_suppress(
        db=db_session,
        rule=rule,
        resource=resource_name,
        severity="WARNING",
        current_value=84.0
    )
    assert suppressed1 is False
    assert reason1 is None

    # Immediate second trigger: MUST be suppressed due to cooldown
    suppressed2, reason2 = deduplication_engine.should_suppress(
        db=db_session,
        rule=rule,
        resource=resource_name,
        severity="WARNING",
        current_value=85.0
    )
    assert suppressed2 is True
    assert "COOLDOWN_ACTIVE" in reason2


def test_quiet_hours_enforcement_and_emergency_bypass(db_session):
    """Verify quiet hours suppresses Info/Warning but NEVER suppresses Emergency/Critical."""
    pref = NotificationPreference(
        user_id=999,
        org_id=1,
        quiet_hours_enabled=True,
        quiet_hours_start="00:00",
        quiet_hours_end="23:59",  # Active all day for test
        email_enabled=True,
        in_app_enabled=True
    )

    # Info alert must be caught in quiet hours
    assert preferences_manager.is_in_quiet_hours(pref, "INFO") is True
    assert preferences_manager.is_in_quiet_hours(pref, "WARNING") is True

    # Critical & Emergency must bypass quiet hours
    assert preferences_manager.is_in_quiet_hours(pref, "CRITICAL") is False
    assert preferences_manager.is_in_quiet_hours(pref, "EMERGENCY") is False


def test_in_app_channel_delivery(db_session):
    """Verify In-App delivery writes directly to notifications delivery log."""
    import uuid
    notif = Notification(
        org_id=1,
        event_id=f"TEST-INAPP-{uuid.uuid4().hex[:8]}",
        title="Test In-App Notification",
        message="Validating in-app notification center delivery.",
        category="STORAGE",
        severity="INFO",
        source="UnitTest",
        resource="C:",
        created_at=datetime.utcnow()
    )
    db_session.add(notif)
    db_session.commit()
    db_session.refresh(notif)

    deliv_res = dispatcher.in_app_channel.deliver(db_session, notif, "test_admin")
    assert deliv_res["success"] is True
    assert deliv_res["status"] == "DELIVERED"

    # Check log entry
    log = db_session.query(NotificationDeliveryLog).filter(
        NotificationDeliveryLog.notification_id == notif.id
    ).first()
    assert log is not None
    assert log.status == "DELIVERED"
    assert log.channel == "IN_APP"


def test_incident_acknowledgement_and_resolution(db_session):
    """Verify admin acknowledgement and resolution of operational incidents."""
    inc = Incident(
        incident_number=f"INC-TEST-{datetime.utcnow().strftime('%H%M%S')}",
        org_id=1,
        title="Test Incident for Acknowledgement",
        category="PERFORMANCE",
        severity="WARNING",
        status="OPEN",
        resource="HostCPU",
        created_at=datetime.utcnow()
    )
    db_session.add(inc)
    db_session.commit()
    db_session.refresh(inc)

    # Acknowledge via API
    res_ack = client.post(
        f"/api/v1/incidents/{inc.id}/acknowledge",
        json={"comment": "Investigating high CPU utilization."}
    )
    assert res_ack.status_code == 200
    assert res_ack.json()["status"] == "ACKNOWLEDGED"

    # Verify updated DB state
    db_session.refresh(inc)
    assert inc.status == "ACKNOWLEDGED"
    assert inc.acknowledged_at is not None

    # Resolve via API
    res_res = client.post(
        f"/api/v1/incidents/{inc.id}/resolve",
        json={"comment": "Resolved: runaway worker process terminated."}
    )
    assert res_res.status_code == 200
    assert res_res.json()["status"] == "RESOLVED"

    db_session.refresh(inc)
    assert inc.status == "RESOLVED"
    assert inc.resolved_at is not None
    assert "runaway worker" in inc.resolution_notes


def test_escalation_engine_sweep(db_session):
    """Verify escalation engine escalates open unacknowledged Critical incidents past timer."""
    # Create incident created 20 minutes ago (exceeding 15-minute Critical threshold)
    old_time = datetime.utcnow() - timedelta(minutes=25)
    inc = Incident(
        incident_number=f"INC-ESC-{datetime.utcnow().strftime('%H%M%S')}",
        org_id=1,
        title="Unacknowledged Critical Incident",
        category="STORAGE",
        severity="CRITICAL",
        status="OPEN",
        resource="Volume_Escalation",
        created_at=old_time
    )
    db_session.add(inc)
    db_session.commit()
    db_session.refresh(inc)

    escalated = escalation_engine.check_and_escalate_incidents(db_session, org_id=1)
    assert len(escalated) >= 1

    # Check incident status updated to ESCALATED and level incremented
    db_session.refresh(inc)
    assert inc.status == "ESCALATED"
    assert inc.escalation_level >= 1
    assert inc.escalated_at is not None


def test_api_notification_endpoints():
    """Verify REST endpoints for notifications, unread count, read-all, and stats."""
    # 1. Unread count
    res_count = client.get("/api/v1/notifications/unread-count")
    assert res_count.status_code == 200
    assert "unread_count" in res_count.json()

    # 2. List notifications
    res_list = client.get("/api/v1/notifications?limit=10")
    assert res_list.status_code == 200
    data = res_list.json()
    assert "total" in data
    assert "items" in data

    # 3. Mark read-all
    res_readall = client.post("/api/v1/notifications/read-all")
    assert res_readall.status_code == 200
    assert res_readall.json()["success"] is True

    # 4. Incident stats
    res_stats = client.get("/api/v1/incidents/stats")
    assert res_stats.status_code == 200
    stats = res_stats.json()
    assert "total_incidents" in stats
    assert "mtta_minutes" in stats
    assert "mttr_minutes" in stats
    assert "trends" in stats

    # 5. System updates / announcements
    res_ann = client.get("/api/v1/system-updates")
    assert res_ann.status_code == 200
    ann_items = res_ann.json()
    assert len(ann_items) >= 1
    assert "version" in ann_items[0]
