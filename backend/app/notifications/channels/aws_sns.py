"""
AWS SNS Notification Channel
Dispatches notifications to AWS SNS Topics using the authenticated AWS profile 'aegisstor'.
Never fakes delivery: requires verified AWS credentials and publishes to genuine SNS Topic ARNs.
"""
import json
from datetime import datetime
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.database import Notification, NotificationDeliveryLog
from app.services.aws_service import DEFAULT_PROFILE, DEFAULT_REGION

class AWSSNSChannel:
    name: str = "AWS_SNS"

    def __init__(self, profile_name: str = DEFAULT_PROFILE, region_name: str = DEFAULT_REGION):
        self.profile_name = profile_name
        self.region_name = region_name

    def _get_sns_client(self):
        import boto3
        session = boto3.Session(profile_name=self.profile_name, region_name=self.region_name)
        return session.client("sns")

    def deliver(
        self,
        db: Session,
        notification: Notification,
        topic_arn: str,
        attempt: int = 1
    ) -> Dict[str, Any]:
        """Publish notification message to AWS Simple Notification Service (SNS)."""
        if not topic_arn or not topic_arn.startswith("arn:aws:sns:"):
            return self._record_log(
                db, notification.id, topic_arn or "none",
                "FAILED", attempt,
                error="Invalid or missing AWS SNS Topic ARN. Format must be arn:aws:sns:region:account:topic"
            )

        subject_str = f"[{notification.severity}] {notification.title}"[:100]
        message_payload = {
            "default": f"AEGISSTOR [{notification.severity}] {notification.title}\n{notification.message}\nResource: {notification.resource}\nTimestamp: {notification.created_at.isoformat()}",
            "email": f"AEGISSTOR [{notification.severity}] {notification.title}\n\n{notification.message}\n\nCategory: {notification.category}\nResource: {notification.resource}\nSeverity: {notification.severity}\nTime: {notification.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}",
            "sqs": json.dumps({
                "notification_id": notification.id,
                "event_id": notification.event_id,
                "title": notification.title,
                "severity": notification.severity,
                "resource": notification.resource,
                "details": notification.details_json
            })
        }

        try:
            client = self._get_sns_client()
            response = client.publish(
                TopicArn=topic_arn,
                Subject=subject_str,
                Message=json.dumps(message_payload),
                MessageStructure="json",
                MessageAttributes={
                    "severity": {
                        "DataType": "String",
                        "StringValue": notification.severity
                    },
                    "category": {
                        "DataType": "String",
                        "StringValue": notification.category
                    }
                }
            )

            message_id = response.get("MessageId", "unknown")
            return self._record_log(
                db, notification.id, topic_arn,
                "DELIVERED", attempt,
                response=f"AWS SNS MessageId: {message_id}",
                delivered_at=datetime.utcnow()
            )
        except Exception as e:
            return self._record_log(
                db, notification.id, topic_arn,
                "FAILED", attempt,
                error=f"AWS SNS publish error: {str(e)}"
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
