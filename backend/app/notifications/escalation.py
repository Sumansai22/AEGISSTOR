"""
Incident Escalation Engine
Monitors open, unresolved Critical and Emergency incidents and escalates them
according to configured policy timers.
"""
from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.models.database import Incident, IncidentAcknowledgement, Notification

DEFAULT_ESCALATION_DELAYS = {
    "EMERGENCY": timedelta(minutes=10),
    "CRITICAL": timedelta(minutes=15),
    "WARNING": timedelta(minutes=60)
}

class EscalationEngine:
    def check_and_escalate_incidents(
        self,
        db: Session,
        org_id: int = 1,
        dispatcher = None
    ) -> List[Dict[str, Any]]:
        """
        Scan for unacknowledged critical/emergency incidents past their escalation threshold.
        """
        now = datetime.utcnow()
        escalated_records = []

        # Find OPEN incidents that have not been acknowledged
        open_incidents = db.query(Incident).filter(
            Incident.org_id == org_id,
            Incident.status.in_(["OPEN", "ESCALATED"]),
            Incident.severity.in_(["CRITICAL", "EMERGENCY"]),
            Incident.acknowledged_at == None,
            Incident.resolved_at == None
        ).all()

        for inc in open_incidents:
            delay = DEFAULT_ESCALATION_DELAYS.get(inc.severity, timedelta(minutes=30))
            ref_time = inc.escalated_at or inc.created_at

            if (now - ref_time) >= delay:
                # Escalate incident
                inc.escalation_level += 1
                inc.status = "ESCALATED"
                inc.escalated_at = now

                # Audit log in incident acknowledgements
                ack_log = IncidentAcknowledgement(
                    incident_id=inc.id,
                    user_email="escalation_engine@aegisstor.internal",
                    action_type="ESCALATE",
                    comment=f"Incident automatically escalated to Level {inc.escalation_level} due to lack of acknowledgement within {int(delay.total_seconds() / 60)} minutes.",
                    timestamp=now
                )
                db.add(ack_log)
                db.commit()

                # Generate escalation notification
                esc_notification = Notification(
                    org_id=inc.org_id,
                    event_id=f"ESC-{inc.incident_number}-L{inc.escalation_level}",
                    incident_id=inc.id,
                    title=f"[ESCALATED - LEVEL {inc.escalation_level}] {inc.title}",
                    message=f"INCIDENT NOT ACKNOWLEDGED: {inc.incident_number} has been escalated to Level {inc.escalation_level}. Immediate administrative intervention required.",
                    category=inc.category,
                    severity=inc.severity,
                    source="EscalationEngine",
                    resource=inc.resource,
                    details_json=inc.related_telemetry_json,
                    created_at=now
                )
                db.add(esc_notification)
                db.commit()
                db.refresh(esc_notification)

                # Dispatch across high-priority channels
                if dispatcher:
                    dispatcher.dispatch_notification(db, esc_notification)

                escalated_records.append({
                    "incident_number": inc.incident_number,
                    "title": inc.title,
                    "severity": inc.severity,
                    "escalation_level": inc.escalation_level,
                    "escalated_at": now.isoformat()
                })

        return escalated_records

escalation_engine = EscalationEngine()
