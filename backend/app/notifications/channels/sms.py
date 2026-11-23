"""
SMS Notification Channel
Dispatches urgent SMS notifications to administrators for Critical / Emergency incidents.
Never fakes delivery: requires active provider credentials and reports genuine provider responses.
"""
import os
from datetime import datetime
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.database import Notification, NotificationDeliveryLog

class SMSChannel:
    name: str = "SMS"

    def __init__(self):
        self.account_sid = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
        self.auth_token = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
        self.from_number = os.environ.get("TWILIO_FROM_NUMBER", "").strip()

    def is_configured(self) -> bool:
        return bool(self.account_sid and self.auth_token and self.from_number)

    def deliver(
        self,
        db: Session,
        notification: Notification,
        recipient_phone: str,
        attempt: int = 1
    ) -> Dict[str, Any]:
        """Dispatch SMS via provider or report unconfigured state truthfully."""
        if not recipient_phone or len(recipient_phone) < 8:
            return self._record_log(
                db, notification.id, recipient_phone or "none",
                "FAILED", attempt, error="Invalid or missing recipient phone number."
            )

        if not self.is_configured():
            return self._record_log(
                db, notification.id, recipient_phone,
                "FAILED", attempt,
                error="SMS provider credentials not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER."
            )

        body_text = f"[AEGISSTOR {notification.severity}] {notification.title}: {notification.message[:120]} (Res: {notification.resource or 'Host'})"

        try:
            # If twilio package is available
            from twilio.rest import Client
            client = Client(self.account_sid, self.auth_token)
            msg = client.messages.create(
                body=body_text,
                from_=self.from_number,
                to=recipient_phone
            )
            return self._record_log(
                db, notification.id, recipient_phone,
                "DELIVERED", attempt,
                response=f"Twilio SID: {msg.sid}, Status: {msg.status}",
                delivered_at=datetime.utcnow()
            )
        except ImportError:
            return self._record_log(
                db, notification.id, recipient_phone,
                "FAILED", attempt,
                error="Twilio Python library not installed."
            )
        except Exception as e:
            return self._record_log(
                db, notification.id, recipient_phone,
                "FAILED", attempt,
                error=f"SMS transmission failed: {str(e)}"
            )

    def _record_log(
        self,
        db: Session,
        notification_id: int,
        recipient: str,
        status: str,
        attempt: int,
        response: Optional[str] = None,
        error: Optional[str] = None,
        delivered_at: Optional[datetime] = None
    ) -> Dict[str, Any]:
        try:
            log_entry = NotificationDeliveryLog(
                notification_id=notification_id,
                channel=self.name,
                recipient=recipient,
                status=status,
                attempt_count=attempt,
                provider_response=response,
                error_message=error,
                delivered_at=delivered_at
            )
            db.add(log_entry)
            db.commit()
        except Exception:
            db.rollback()

        return {
            "success": status == "DELIVERED",
            "channel": self.name,
            "status": status,
            "recipient": recipient,
            "error": error
        }
