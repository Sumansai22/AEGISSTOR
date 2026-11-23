"""
Notification Dispatcher Subsystem
Asynchronously routes notifications to configured channels (In-App, Email, Web Push, SMS, AWS SNS)
with user preferences, quiet hours enforcement, and delivery auditing.
"""
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.models.database import Notification, User
from app.notifications.preferences import preferences_manager
from app.notifications.channels.in_app import InAppChannel
from app.notifications.channels.email import EmailChannel
from app.notifications.channels.web_push import WebPushChannel
from app.notifications.channels.sms import SMSChannel
from app.notifications.channels.aws_sns import AWSSNSChannel

class NotificationDispatcher:
    def __init__(self):
        self.in_app_channel = InAppChannel()
        self.email_channel = EmailChannel()
        self.web_push_channel = WebPushChannel()
        self.sms_channel = SMSChannel()
        self.aws_sns_channel = AWSSNSChannel()

    def dispatch_notification(
        self,
        db: Session,
        notification: Notification,
        target_user_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Route notification across all active channels permitted by user preferences.
        """
        results: Dict[str, Any] = {
            "notification_id": notification.id,
            "channels": {}
        }

        # 1. Always deliver in-app notification
        in_app_res = self.in_app_channel.deliver(db, notification, recipient="in_app_feed")
        results["channels"]["in_app"] = in_app_res

        # 2. Find target users (or all active admins in organization)
        users = []
        if target_user_id:
            user = db.query(User).filter(User.id == target_user_id, User.is_active == True).first()
            if user:
                users.append(user)
        else:
            users = db.query(User).filter(
                User.org_id == notification.org_id,
                User.is_active == True
            ).all()

        for user in users:
            pref = preferences_manager.get_or_create_user_preferences(db, user.id, notification.org_id)

            # Check quiet hours
            in_quiet = preferences_manager.is_in_quiet_hours(pref, notification.severity)
            if in_quiet:
                # Log quiet hours skip for non-critical channels
                results["channels"]["quiet_hours"] = {
                    "user_id": user.id,
                    "status": "SKIPPED_QUIET_HOURS",
                    "severity": notification.severity
                }
                continue

            # Email Delivery
            if preferences_manager.should_dispatch_channel(pref, "EMAIL", notification.severity):
                email_target = pref.notification_email or user.email
                email_res = self.email_channel.deliver(db, notification, email_target)
                results["channels"]["email"] = email_res

            # Web Push Delivery
            if preferences_manager.should_dispatch_channel(pref, "WEB_PUSH", notification.severity):
                push_res = self.web_push_channel.deliver(db, notification, user.id)
                results["channels"]["web_push"] = push_res

            # SMS Delivery (Critical / Emergency only)
            if preferences_manager.should_dispatch_channel(pref, "SMS", notification.severity):
                if pref.notification_phone:
                    sms_res = self.sms_channel.deliver(db, notification, pref.notification_phone)
                    results["channels"]["sms"] = sms_res

            # AWS SNS Delivery (Critical / Emergency only)
            if preferences_manager.should_dispatch_channel(pref, "AWS_SNS", notification.severity):
                if pref.aws_sns_topic_arn:
                    sns_res = self.aws_sns_channel.deliver(db, notification, pref.aws_sns_topic_arn)
                    results["channels"]["aws_sns"] = sns_res

        return results

    def send_test_notification(
        self,
        db: Session,
        channel: str,
        recipient: str,
        severity: str = "INFO"
    ) -> Dict[str, Any]:
        """Trigger a verified test notification to confirm channel configuration."""
        import uuid
        from datetime import datetime
        test_notif = Notification(
            org_id=1,
            event_id=f"TEST-{uuid.uuid4().hex[:8].upper()}",
            title=f"AEGISSTOR Diagnostic Test Notification [{channel.upper()}]",
            message=f"This is an authentic diagnostic test dispatch confirming channel '{channel}' configuration and operational connectivity.",
            category="SYSTEM",
            severity=severity,
            source="TestDiagnosticTool",
            resource="DiagnosticsSubsystem",
            details_json='{"test_mode": true}',
            created_at=datetime.utcnow()
        )
        db.add(test_notif)
        db.commit()
        db.refresh(test_notif)

        channel_upper = channel.upper()
        if channel_upper == "IN_APP":
            return self.in_app_channel.deliver(db, test_notif, recipient or "desktop_user")
        elif channel_upper == "EMAIL":
            return self.email_channel.deliver(db, test_notif, recipient)
        elif channel_upper == "WEB_PUSH":
            return self.web_push_channel.deliver(db, test_notif, user_id=1)
        elif channel_upper == "SMS":
            return self.sms_channel.deliver(db, test_notif, recipient)
        elif channel_upper == "AWS_SNS":
            return self.aws_sns_channel.deliver(db, test_notif, recipient)
        else:
            return {"success": False, "error": f"Unknown delivery channel '{channel}'"}

dispatcher = NotificationDispatcher()
