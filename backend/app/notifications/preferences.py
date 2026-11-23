"""
Notification Preferences Manager & Quiet Hours Policy Engine
"""
from datetime import datetime, time
from typing import Optional
from sqlalchemy.orm import Session
from app.models.database import NotificationPreference, User

SEVERITY_HIERARCHY = {
    "INFO": 1,
    "WARNING": 2,
    "CRITICAL": 3,
    "EMERGENCY": 4
}

class PreferencesManager:
    @staticmethod
    def get_or_create_user_preferences(db: Session, user_id: int, org_id: int = 1) -> NotificationPreference:
        """Fetch existing user preferences or generate default baseline preferences."""
        pref = db.query(NotificationPreference).filter(
            NotificationPreference.user_id == user_id
        ).first()

        if not pref:
            # Find user email if available
            user = db.query(User).filter(User.id == user_id).first()
            user_email = user.email if user else None

            pref = NotificationPreference(
                user_id=user_id,
                org_id=org_id,
                email_enabled=True,
                in_app_enabled=True,
                web_push_enabled=True,
                sms_enabled=False,
                aws_sns_enabled=False,
                notification_email=user_email,
                min_severity_email="WARNING",
                min_severity_in_app="INFO",
                min_severity_web_push="WARNING",
                min_severity_sms="CRITICAL",
                min_severity_aws_sns="CRITICAL",
                storage_warning_percent=80.0,
                storage_critical_percent=90.0,
                cpu_critical_percent=85.0,
                ram_critical_percent=90.0,
                quiet_hours_enabled=False,
                quiet_hours_start="22:00",
                quiet_hours_end="07:00",
                quiet_hours_timezone="UTC",
                retention_days=90
            )
            db.add(pref)
            db.commit()
            db.refresh(pref)

        return pref

    @staticmethod
    def is_in_quiet_hours(pref: NotificationPreference, severity: str) -> bool:
        """
        Check if quiet hours are currently active.
        IMPORTANT: CRITICAL and EMERGENCY alerts are NEVER suppressed by quiet hours!
        """
        if not pref.quiet_hours_enabled:
            return False

        # Life-safety, emergency and critical events bypass quiet hours
        if severity in ("CRITICAL", "EMERGENCY"):
            return False

        try:
            now_time = datetime.utcnow().time()
            start_parts = [int(p) for p in pref.quiet_hours_start.split(":")]
            end_parts = [int(p) for p in pref.quiet_hours_end.split(":")]
            start_t = time(start_parts[0], start_parts[1])
            end_t = time(end_parts[0], end_parts[1])

            if start_t <= end_t:
                return start_t <= now_time <= end_t
            else:
                # Spans midnight (e.g. 22:00 to 07:00)
                return now_time >= start_t or now_time <= end_t
        except Exception:
            return False

    @staticmethod
    def should_dispatch_channel(pref: NotificationPreference, channel: str, severity: str) -> bool:
        """Check if user preferences permit dispatching on a specific channel for given severity."""
        sev_rank = SEVERITY_HIERARCHY.get(severity.upper(), 1)

        if channel == "IN_APP":
            if not pref.in_app_enabled:
                return False
            req_rank = SEVERITY_HIERARCHY.get(pref.min_severity_in_app.upper(), 1)
            return sev_rank >= req_rank

        elif channel == "EMAIL":
            if not pref.email_enabled or not pref.notification_email:
                return False
            req_rank = SEVERITY_HIERARCHY.get(pref.min_severity_email.upper(), 2)
            return sev_rank >= req_rank

        elif channel == "WEB_PUSH":
            if not pref.web_push_enabled:
                return False
            req_rank = SEVERITY_HIERARCHY.get(pref.min_severity_web_push.upper(), 2)
            return sev_rank >= req_rank

        elif channel == "SMS":
            if not pref.sms_enabled or not pref.notification_phone:
                return False
            req_rank = SEVERITY_HIERARCHY.get(pref.min_severity_sms.upper(), 3)
            return sev_rank >= req_rank

        elif channel == "AWS_SNS":
            if not pref.aws_sns_enabled or not pref.aws_sns_topic_arn:
                return False
            req_rank = SEVERITY_HIERARCHY.get(pref.min_severity_aws_sns.upper(), 3)
            return sev_rank >= req_rank

        return False

preferences_manager = PreferencesManager()
