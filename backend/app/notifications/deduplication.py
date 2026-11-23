"""
Notification & Alert Deduplication Engine
Suppresses duplicate alerts, repetitive notifications within cooldown windows,
and alerts caused by flapping metrics.
"""
import hashlib
from datetime import datetime, timedelta
from typing import Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session
from app.models.database import AlertEvent, AlertRule

class DeduplicationEngine:
    def __init__(self):
        # In-memory tracking of recent alert occurrences: key -> (timestamp, count)
        self._recent_signatures: Dict[str, Tuple[datetime, int]] = {}

    def get_fingerprint(self, rule_name: str, resource: str, severity: str) -> str:
        """Generate deterministic fingerprint for alert state."""
        raw = f"{rule_name.strip().lower()}:{resource.strip().lower()}:{severity.strip().upper()}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def should_suppress(
        self,
        db: Session,
        rule: AlertRule,
        resource: str,
        severity: str,
        current_value: Optional[float] = None
    ) -> Tuple[bool, Optional[str]]:
        """
        Evaluate if this alert event should be suppressed from dispatching
        external notifications due to cooldown or flapping.
        """
        # Critical and Emergency security rules are never suppressed
        if severity == "EMERGENCY" and rule.category == "SECURITY":
            return False, None

        fingerprint = self.get_fingerprint(rule.name, resource, severity)
        now = datetime.utcnow()
        cooldown_delta = timedelta(minutes=rule.cooldown_minutes or 30)

        # 1. Check in-memory fast cache
        if fingerprint in self._recent_signatures:
            last_time, count = self._recent_signatures[fingerprint]
            time_diff = now - last_time

            # Flapping detection: more than 4 triggers within 5 minutes
            if time_diff < timedelta(minutes=5) and count >= 4:
                self._recent_signatures[fingerprint] = (now, count + 1)
                return True, "FLAPPING_DETECTION_EXCEEDED"

            # Cooldown active
            if time_diff < cooldown_delta:
                self._recent_signatures[fingerprint] = (last_time, count + 1)
                return True, f"COOLDOWN_ACTIVE_{int((cooldown_delta - time_diff).total_seconds() / 60)}M_REMAINING"

        # 2. Query recent alert events in persistent database for restart safety
        cutoff = now - cooldown_delta
        recent_db_event = db.query(AlertEvent).filter(
            AlertEvent.rule_id == rule.id,
            AlertEvent.resource == resource,
            AlertEvent.severity == severity,
            AlertEvent.is_suppressed == False,
            AlertEvent.event_timestamp >= cutoff
        ).order_by(AlertEvent.event_timestamp.desc()).first()

        if recent_db_event:
            elapsed = (now - recent_db_event.event_timestamp).total_seconds()
            remaining_mins = max(1, int((cooldown_delta.total_seconds() - elapsed) / 60))
            self._recent_signatures[fingerprint] = (recent_db_event.event_timestamp, 2)
            return True, f"PERSISTENT_COOLDOWN_ACTIVE_{remaining_mins}M_REMAINING"

        # Not suppressed: record first trigger
        self._recent_signatures[fingerprint] = (now, 1)
        return False, None

    def clear_fingerprint(self, rule_name: str, resource: str, severity: str):
        """Clear fingerprint when underlying alert condition is verified resolved."""
        fp = self.get_fingerprint(rule_name, resource, severity)
        self._recent_signatures.pop(fp, None)

deduplication_engine = DeduplicationEngine()
