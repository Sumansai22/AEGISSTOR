"""
Intelligent Event Processor & Alert Rules Evaluator
Processes real telemetry snapshots and system events against configured alert rules,
creates/resolves incidents, deduplicates alerts, and coordinates notification creation.
"""
import json
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.models.database import (
    AlertRule, AlertEvent, Incident, IncidentAcknowledgement, Notification
)
from app.notifications.templates import template_engine
from app.notifications.deduplication import deduplication_engine
from app.notifications.dispatcher import dispatcher

class EventProcessor:
    def evaluate_metric(
        self,
        db: Session,
        category: str,
        metric_key: str,
        resource: str,
        current_value: float,
        metadata: Optional[Dict[str, Any]] = None,
        org_id: int = 1
    ) -> Optional[Dict[str, Any]]:
        """
        Evaluate a single telemetry observation against matching enabled alert rules.
        """
        metadata = metadata or {}
        rules = db.query(AlertRule).filter(
            AlertRule.org_id == org_id,
            AlertRule.category == category,
            AlertRule.metric_key == metric_key,
            AlertRule.is_enabled == True
        ).all()

        if not rules:
            return None

        sev_ranking = {"INFO": 1, "WARNING": 2, "CRITICAL": 3, "EMERGENCY": 4}
        best_match = None
        best_sev_rank = 0

        # Find the highest severity breach across all matching rules
        for rule in rules:
            breached, severity, threshold = self._check_breach(rule, current_value)
            if breached:
                rank = sev_ranking.get(severity, 1)
                if rank > best_sev_rank:
                    best_sev_rank = rank
                    best_match = (rule, severity, threshold)

        if best_match:
            rule, severity, threshold = best_match

            # 1. Deduplication check
            suppressed, reason = deduplication_engine.should_suppress(
                db, rule, resource, severity, current_value
            )

            # Record alert event in audit log
            event = AlertEvent(
                rule_id=rule.id,
                org_id=org_id,
                resource=resource,
                severity=severity,
                current_value=current_value,
                threshold_value=threshold,
                message=f"{rule.name} breached: current {current_value} {rule.operator} {threshold}",
                event_timestamp=datetime.utcnow(),
                is_suppressed=suppressed,
                suppression_reason=reason
            )
            db.add(event)
            db.commit()

            if not suppressed:
                # 2. Find or create Incident
                incident = self._get_or_create_incident(
                    db, rule, resource, severity, current_value, threshold, metadata, org_id
                )

                # 3. Render notification template
                title, msg, evidence, action = template_engine.render(
                    category=category,
                    metric_key=metric_key,
                    resource=resource,
                    severity=severity,
                    current_val=current_value,
                    threshold_val=threshold,
                    metadata=metadata
                )

                # Update incident evidence
                if not incident.root_cause_evidence:
                    incident.root_cause_evidence = evidence
                    incident.recommended_action = action
                    db.commit()

                # 4. Create Notification
                event_id = f"EVT-{uuid.uuid4().hex[:12].upper()}"
                notification = Notification(
                    org_id=org_id,
                    event_id=event_id,
                    incident_id=incident.id,
                    title=title,
                    message=msg,
                    category=category,
                    severity=severity,
                    source=f"RuleEngine:{rule.name}",
                    resource=resource,
                    details_json=json.dumps({
                        "metric_key": metric_key,
                        "current_value": current_value,
                        "threshold_value": threshold,
                        "root_cause_evidence": evidence,
                        "recommended_action": action,
                        **metadata
                    }),
                    created_at=datetime.utcnow()
                )
                db.add(notification)
                db.commit()
                db.refresh(notification)

                # 5. Dispatch across channels
                dispatch_results = dispatcher.dispatch_notification(db, notification)

                return {
                    "breached": True,
                    "severity": severity,
                    "incident_number": incident.incident_number,
                    "notification_id": notification.id,
                    "dispatch_results": dispatch_results
                }
        else:
            # Value is within normal bounds. Auto-resolve if configured and non-security.
            for rule in rules:
                if rule.auto_resolve and rule.category != "SECURITY":
                    self._check_auto_resolve(db, rule, resource, current_value, org_id)

        return None

    def _check_breach(self, rule: AlertRule, current_value: float) -> (bool, str, float):
        op = rule.operator.strip()

        # Check Emergency first
        if rule.emergency_threshold is not None:
            if self._compare(current_value, op, rule.emergency_threshold):
                return True, "EMERGENCY", rule.emergency_threshold

        # Check Critical next
        if rule.critical_threshold is not None:
            if self._compare(current_value, op, rule.critical_threshold):
                return True, "CRITICAL", rule.critical_threshold

        # Check Warning next
        if rule.warning_threshold is not None:
            if self._compare(current_value, op, rule.warning_threshold):
                return True, "WARNING", rule.warning_threshold

        return False, "INFO", 0.0

    @staticmethod
    def _compare(val: float, op: str, threshold: float) -> bool:
        if op == ">=":
            return val >= threshold
        elif op == ">":
            return val > threshold
        elif op == "<=":
            return val <= threshold
        elif op == "<":
            return val < threshold
        elif op in ("==", "="):
            return val == threshold
        elif op == "!=":
            return val != threshold
        return False

    def _get_or_create_incident(
        self,
        db: Session,
        rule: AlertRule,
        resource: str,
        severity: str,
        current_value: float,
        threshold: float,
        metadata: Dict[str, Any],
        org_id: int
    ) -> Incident:
        """Find existing open incident for this resource/category or create a new tracking ticket."""
        existing = db.query(Incident).filter(
            Incident.org_id == org_id,
            Incident.category == rule.category,
            Incident.resource == resource,
            Incident.status.in_(["OPEN", "ACKNOWLEDGED", "ESCALATED"])
        ).first()

        if existing:
            # Upgrade severity if higher
            sev_order = {"INFO": 1, "WARNING": 2, "CRITICAL": 3, "EMERGENCY": 4}
            if sev_order.get(severity, 1) > sev_order.get(existing.severity, 1):
                existing.severity = severity
                existing.status = "OPEN"  # Reopen if escalated
                db.commit()
            return existing

        # Create new incident number
        now = datetime.utcnow()
        month_str = now.strftime("%Y%m")
        count = db.query(Incident).count() + 1
        incident_number = f"INC-{month_str}-{count:04d}"

        incident = Incident(
            incident_number=incident_number,
            org_id=org_id,
            title=f"[{severity}] {rule.name} on {resource}",
            category=rule.category,
            severity=severity,
            status="OPEN",
            resource=resource,
            related_telemetry_json=json.dumps({
                "metric_key": rule.metric_key,
                "current_value": current_value,
                "threshold_value": threshold,
                **metadata
            }),
            created_at=now
        )
        db.add(incident)
        db.commit()
        db.refresh(incident)

        return incident

    def _check_auto_resolve(
        self,
        db: Session,
        rule: AlertRule,
        resource: str,
        current_value: float,
        org_id: int
    ):
        """Auto-resolve open incidents when metric returns to safe levels."""
        # Never auto-resolve security incidents!
        if rule.category == "SECURITY":
            return

        open_inc = db.query(Incident).filter(
            Incident.org_id == org_id,
            Incident.category == rule.category,
            Incident.resource == resource,
            Incident.status.in_(["OPEN", "ACKNOWLEDGED", "ESCALATED"])
        ).first()

        if open_inc:
            now = datetime.utcnow()
            open_inc.status = "RESOLVED"
            open_inc.resolved_at = now
            open_inc.resolution_notes = f"Auto-resolved: underlying metric '{rule.metric_key}' returned to safe level ({current_value})."

            ack = IncidentAcknowledgement(
                incident_id=open_inc.id,
                user_email="system@aegisstor.internal",
                action_type="RESOLVE",
                comment=open_inc.resolution_notes,
                timestamp=now
            )
            db.add(ack)

            # Clear deduplication fingerprint
            deduplication_engine.clear_fingerprint(rule.name, resource, open_inc.severity)
            db.commit()

event_processor = EventProcessor()
