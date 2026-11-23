"""
Email Notification Channel
Sends emails via configurable standard SMTP.
Never fakes delivery: only reports DELIVERED if SMTP server acknowledges 250 OK.
"""
import os
import smtplib
import time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.database import Notification, NotificationDeliveryLog

class EmailChannel:
    name: str = "EMAIL"

    def __init__(self):
        self.smtp_host = os.environ.get("AEGISSTOR_SMTP_HOST", os.environ.get("SMTP_HOST", "")).strip()
        self.smtp_port = int(os.environ.get("AEGISSTOR_SMTP_PORT", os.environ.get("SMTP_PORT", "587")))
        self.smtp_user = os.environ.get("AEGISSTOR_SMTP_USER", os.environ.get("SMTP_USER", "")).strip()
        self.smtp_password = os.environ.get("AEGISSTOR_SMTP_PASS", os.environ.get("SMTP_PASS", "")).strip()
        self.smtp_tls = os.environ.get("AEGISSTOR_SMTP_TLS", "true").lower() in ("true", "1", "yes")
        self.from_email = os.environ.get("AEGISSTOR_SMTP_FROM", os.environ.get("SMTP_FROM", "alerts@aegisstor.internal")).strip()

    def is_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_port)

    def deliver(
        self,
        db: Session,
        notification: Notification,
        recipient_email: str,
        attempt: int = 1,
        max_retries: int = 3
    ) -> Dict[str, Any]:
        """Dispatch email with exponential backoff on transient errors."""
        if not recipient_email or "@" not in recipient_email:
            return self._record_log(
                db, notification.id, recipient_email or "unknown",
                "FAILED", attempt, error="Invalid recipient email address"
            )

        if not self.is_configured():
            return self._record_log(
                db, notification.id, recipient_email,
                "FAILED", attempt,
                error="SMTP host not configured. Set AEGISSTOR_SMTP_HOST to enable live email delivery."
            )

        # Build MIME Message
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"[{notification.severity}] {notification.title} - AEGISSTOR"
        msg["From"] = self.from_email
        msg["To"] = recipient_email

        plain_text = f"""AEGISSTOR NOTIFICATION
===============================================
Severity: {notification.severity}
Category: {notification.category}
Resource: {notification.resource or 'System'}
Timestamp: {notification.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}

{notification.title}
-----------------------------------------------
{notification.message}

Details: {notification.details_json}
===============================================
This is an automated notification from AEGISSTOR Storage Intelligence Platform.
"""
        html_text = f"""
        <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px;">
          <div style="max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 8px; border: 1px solid #334155; padding: 24px;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 16px;">
              <h2 style="color: #38bdf8; margin: 0;">AEGISSTOR Alert</h2>
              <span style="background: {'#ef4444' if notification.severity in ('CRITICAL', 'EMERGENCY') else '#f59e0b' if notification.severity == 'WARNING' else '#38bdf8'}; color: #fff; padding: 4px 10px; border-radius: 4px; font-weight: bold; font-size: 12px;">
                {notification.severity}
              </span>
            </div>
            <h3 style="color: #f1f5f9; margin-top: 0;">{notification.title}</h3>
            <p style="color: #cbd5e1; font-size: 15px; line-height: 1.5;">{notification.message}</p>
            <div style="background: #090d16; padding: 12px; border-radius: 6px; font-size: 13px; color: #94a3b8; margin: 16px 0;">
              <div><strong>Resource:</strong> {notification.resource or 'Host System'}</div>
              <div><strong>Category:</strong> {notification.category}</div>
              <div><strong>Timestamp:</strong> {notification.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}</div>
            </div>
            <p style="color: #64748b; font-size: 12px; margin-top: 24px; border-top: 1px solid #334155; padding-top: 12px;">
              AEGISSTOR Predictive Storage & Security Infrastructure
            </p>
          </div>
        </body>
        </html>
        """
        msg.attach(MIMEText(plain_text, "plain"))
        msg.attach(MIMEText(html_text, "html"))

        # Send with retry loop
        current_attempt = attempt
        last_error = ""

        while current_attempt <= max_retries:
            try:
                server = smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=10)
                if self.smtp_tls:
                    server.starttls()
                if self.smtp_user and self.smtp_password:
                    server.login(self.smtp_user, self.smtp_password)
                send_response = server.sendmail(self.from_email, [recipient_email], msg.as_string())
                server.quit()

                return self._record_log(
                    db, notification.id, recipient_email,
                    "DELIVERED", current_attempt,
                    response=f"SMTP 250 OK: {str(send_response)}",
                    delivered_at=datetime.utcnow()
                )
            except Exception as e:
                last_error = str(e)
                if current_attempt < max_retries:
                    backoff_delay = 0.5 * (2 ** (current_attempt - 1))
                    time.sleep(backoff_delay)
                    current_attempt += 1
                else:
                    break

        return self._record_log(
            db, notification.id, recipient_email,
            "FAILED", current_attempt, error=f"SMTP Delivery failed after {current_attempt} attempts: {last_error}"
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
            "attempts": attempt,
            "error": error
        }
