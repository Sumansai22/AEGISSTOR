"""
Central Notification Engine for AEGISSTOR
Coordinates real-time telemetry surveillance, alert rules evaluation,
escalation sweeps, notification lifecycle management, and audit trailing.
"""
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.database.session import SessionLocal
from app.models.database import (
    Notification, Incident, IncidentAcknowledgement, AlertRule,
    NotificationDeliveryLog, SystemAnnouncement, User
)
from app.notifications.event_processor import event_processor
from app.notifications.escalation import escalation_engine
from app.notifications.dispatcher import dispatcher
from app.services.storage_monitor import storage_monitor
from app.services.performance_monitor import performance_monitor
from app.services.aws_service import aws_service
from app.services.predictive_forecasting import predictive_forecasting_service

class NotificationEngine:
    def process_live_telemetry_snapshot(self):
        """
        Called periodically by background telemetry worker to evaluate actual system metrics
        against active alert rules. All hardware and external probes are collected BEFORE
        opening the database session, keeping SQLite transactions minimal and non-blocking.
        """
        # Step 1: Collect all metrics in-memory first (zero DB locks held during probes)
        metrics_to_eval: List[Dict[str, Any]] = []

        try:
            # 1. Local Storage Metrics
            storage_summary = storage_monitor.get_storage_summary()
            overall_pct = storage_summary.get("overall_usage_percent", 0.0)
            metrics_to_eval.append({
                "category": "STORAGE",
                "metric_key": "storage_usage_percent",
                "resource": "SystemStorage",
                "current_value": overall_pct
            })

            for d in storage_summary.get("drives", []):
                drive_name = d.get("device", "Unknown")
                drive_pct = d.get("usage_percent", 0.0)
                free_gb = d.get("free_gb", 0.0)

                metrics_to_eval.append({
                    "category": "STORAGE",
                    "metric_key": "storage_usage_percent",
                    "resource": drive_name,
                    "current_value": drive_pct
                })
                metrics_to_eval.append({
                    "category": "STORAGE",
                    "metric_key": "storage_headroom_gb",
                    "resource": drive_name,
                    "current_value": free_gb
                })
                if not d.get("is_accessible", True):
                    metrics_to_eval.append({
                        "category": "STORAGE",
                        "metric_key": "storage_unavailable",
                        "resource": drive_name,
                        "current_value": 1.0
                    })

            # 2. Performance Metrics
            perf = performance_monitor.get_current_metrics()
            metrics_to_eval.append({
                "category": "PERFORMANCE",
                "metric_key": "cpu_percent",
                "resource": "HostCPU",
                "current_value": perf.get("cpu_percent", 0.0)
            })
            metrics_to_eval.append({
                "category": "PERFORMANCE",
                "metric_key": "ram_percent",
                "resource": "HostRAM",
                "current_value": perf.get("memory_percent", 0.0)
            })

        except Exception as probe_err:
            print(f"[NotificationEngine] Metric probing error: {probe_err}")

        # Step 2: Write/evaluate metrics in a fast, isolated database transaction
        db = SessionLocal()
        try:
            for item in metrics_to_eval:
                try:
                    event_processor.evaluate_metric(
                        db=db,
                        category=item["category"],
                        metric_key=item["metric_key"],
                        resource=item["resource"],
                        current_value=item["current_value"],
                        metadata=item.get("metadata")
                    )
                except Exception as eval_e:
                    print(f"[NotificationEngine] Metric eval error for {item.get('metric_key')}: {eval_e}")

            # Escalation sweep
            try:
                escalation_engine.check_and_escalate_incidents(db, org_id=1, dispatcher=dispatcher)
            except Exception as esc_e:
                print(f"[NotificationEngine] Escalation sweep error: {esc_e}")

        except Exception as e:
            print(f"[NotificationEngine] Surveillance evaluation error: {e}")
        finally:
            db.close()

    def enforce_retention(self, db: Session, retention_days: int = 90):
        """Purge notifications and delivery logs exceeding data retention window."""
        cutoff = datetime.utcnow() - timedelta(days=retention_days)
        try:
            db.query(Notification).filter(
                Notification.created_at < cutoff,
                Notification.is_read == True
            ).delete(synchronize_session=False)
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"[NotificationEngine] Retention purge error: {e}")

notification_engine = NotificationEngine()
