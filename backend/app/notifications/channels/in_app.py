"""
In-App Notification Channel
Delivers notifications directly into the in-app notification center database table.
"""
from datetime import datetime
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.database import Notification, NotificationDeliveryLog

class InAppChannel:
    name: str = "IN_APP"

    def deliver(
        self,
        db: Session,
        notification: Notification,
        recipient: str,
        attempt: int = 1
    ) -> Dict[str, Any]:
        """Record successful in-app notification delivery."""
        try:
            log_entry = NotificationDeliveryLog(
                notification_id=notification.id,
                channel=self.name,
                recipient=recipient or "desktop_user",
                status="DELIVERED",
                attempt_count=attempt,
                provider_response="Delivered to in-app notification feed",
                delivered_at=datetime.utcnow()
            )
            db.add(log_entry)
            db.commit()
            return {
                "success": True,
                "channel": self.name,
                "status": "DELIVERED",
                "recipient": recipient
            }
        except Exception as e:
            db.rollback()
            return {
                "success": False,
                "channel": self.name,
                "status": "FAILED",
                "error": str(e)
            }
