"""
Historical Storage Telemetry Pipeline Service
Captures, persists, and queries time-series telemetry for local disks, external volumes,
and AWS S3 buckets with data quality status, growth calculations, and retention policies.
"""
import os
import math
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.models.database import HistoricalStorageTelemetry, StorageTelemetry
from app.database.session import SessionLocal, execute_with_db_retry
from app.services.storage_monitor import storage_monitor
from app.services.aws_service import aws_service
from app.core.config import DATA_DIR

class HistoricalPipelineService:
    def __init__(self):
        self.default_retention_days: int = 90

    def record_local_storage_sample(self, org_id: int = 1) -> List[Dict[str, Any]]:
        """Record a time-series point for all detected physical drives with retry on lock."""
        drives = storage_monitor.get_all_drives()
        now = datetime.utcnow()
        saved = []

        def _do_write():
            nonlocal saved
            saved = []
            db = SessionLocal()
            try:
                for d in drives:
                    # Calculate daily growth relative to previous sample if available
                    prev = (
                        db.query(HistoricalStorageTelemetry)
                        .filter(
                            HistoricalStorageTelemetry.resource_id == d["device"],
                            HistoricalStorageTelemetry.org_id == org_id
                        )
                        .order_by(HistoricalStorageTelemetry.timestamp.desc())
                        .first()
                    )

                    daily_growth = 0.0
                    if prev:
                        dt_days = max((now - prev.timestamp).total_seconds() / 86400.0, 0.0001)
                        growth_delta = d["used_bytes"] - prev.used_capacity_bytes
                        daily_growth = growth_delta / dt_days

                    entry = HistoricalStorageTelemetry(
                        org_id=org_id,
                        timestamp=now,
                        resource_id=d["device"],
                        resource_type="LOCAL_DISK" if "USB" not in d.get("drive_type", "") else "EXTERNAL_DISK",
                        total_capacity_bytes=float(d["total_bytes"]),
                        used_capacity_bytes=float(d["used_bytes"]),
                        available_capacity_bytes=float(d["free_bytes"]),
                        utilization_percent=float(d["usage_percent"]),
                        daily_growth_bytes=float(daily_growth),
                        read_throughput_mb_s=float(d.get("read_throughput_mb_s", 0.0)),
                        write_throughput_mb_s=float(d.get("write_throughput_mb_s", 0.0)),
                        iops=float(d.get("read_ops_sec", 0.0) + d.get("write_ops_sec", 0.0)),
                        collection_source="WIN32_COLLECTOR",
                        data_quality_status="VERIFIED_OBSERVATION"
                    )
                    db.add(entry)
                    saved.append({
                        "resource_id": d["device"],
                        "used_gb": d["used_gb"],
                        "total_gb": d["total_gb"]
                    })
                db.commit()
            except Exception:
                db.rollback()
                raise
            finally:
                db.close()

        try:
            execute_with_db_retry(_do_write)
            return saved
        except Exception as e:
            print(f"[HistoricalPipeline] Error recording local sample: {e}")
            return []

    def record_s3_storage_sample(self, bucket_name: Optional[str] = None, org_id: int = 1) -> Optional[Dict[str, Any]]:
        """Record an S3 telemetry point into historical storage database with retry on lock."""
        target_bucket = bucket_name or aws_service.default_bucket
        meta = aws_service.get_bucket_metadata(target_bucket)
        if not meta.get("success"):
            return None

        now = datetime.utcnow()
        used_bytes = float(meta.get("total_size_bytes", 0))
        # S3 bucket capacity is elastic; we consider 10 TB soft cap or allocated bytes
        total_bytes = max(used_bytes * 2.0, 10.0 * (1024 ** 4))
        avail_bytes = max(0.0, total_bytes - used_bytes)
        pct = round((used_bytes / total_bytes * 100.0), 2) if total_bytes > 0 else 0.0

        def _do_write():
            db = SessionLocal()
            try:
                # Calculate growth from prior sample
                prev = (
                    db.query(HistoricalStorageTelemetry)
                    .filter(
                        HistoricalStorageTelemetry.resource_id == target_bucket,
                        HistoricalStorageTelemetry.org_id == org_id
                    )
                    .order_by(HistoricalStorageTelemetry.timestamp.desc())
                    .first()
                )
                daily_growth = 0.0
                if prev:
                    dt_days = max((now - prev.timestamp).total_seconds() / 86400.0, 0.0001)
                    daily_growth = (used_bytes - prev.used_capacity_bytes) / dt_days

                entry = HistoricalStorageTelemetry(
                    org_id=org_id,
                    timestamp=now,
                    resource_id=target_bucket,
                    resource_type="AWS_S3",
                    total_capacity_bytes=total_bytes,
                    used_capacity_bytes=used_bytes,
                    available_capacity_bytes=avail_bytes,
                    utilization_percent=pct,
                    daily_growth_bytes=daily_growth,
                    read_throughput_mb_s=0.0,
                    write_throughput_mb_s=0.0,
                    iops=0.0,
                    collection_source="AWS_S3_SDK",
                    data_quality_status="VERIFIED_OBSERVATION"
                )
                db.add(entry)
                db.commit()
            except Exception:
                db.rollback()
                raise
            finally:
                db.close()

        try:
            execute_with_db_retry(_do_write)
            return {
                "resource_id": target_bucket,
                "used_bytes": used_bytes,
                "total_objects": meta.get("object_count", 0)
            }
        except Exception as e:
            print(f"[HistoricalPipeline] Error recording S3 sample: {e}")
            return None

    def record_database_storage_sample(self, org_id: int = 1) -> Optional[Dict[str, Any]]:
        """Record database storage telemetry sample into historical database with retry on lock."""
        db_file = DATA_DIR / "aegisstor.db"
        if not db_file.exists():
            return None
        size_bytes = float(db_file.stat().st_size)
        now = datetime.utcnow()
        total_bytes = 100.0 * (1024 ** 3) # 100 GB volume quota
        avail_bytes = max(0.0, total_bytes - size_bytes)
        pct = round((size_bytes / total_bytes * 100.0), 3) if total_bytes > 0 else 0.0

        def _do_write():
            db = SessionLocal()
            try:
                prev = (
                    db.query(HistoricalStorageTelemetry)
                    .filter(
                        HistoricalStorageTelemetry.resource_id == "internal_db",
                        HistoricalStorageTelemetry.org_id == org_id
                    )
                    .order_by(HistoricalStorageTelemetry.timestamp.desc())
                    .first()
                )
                daily_growth = 0.0
                if prev:
                    dt_days = max((now - prev.timestamp).total_seconds() / 86400.0, 0.0001)
                    daily_growth = (size_bytes - prev.used_capacity_bytes) / dt_days

                entry = HistoricalStorageTelemetry(
                    org_id=org_id,
                    timestamp=now,
                    resource_id="internal_db",
                    resource_type="DATABASE",
                    total_capacity_bytes=total_bytes,
                    used_capacity_bytes=size_bytes,
                    available_capacity_bytes=avail_bytes,
                    utilization_percent=pct,
                    daily_growth_bytes=daily_growth,
                    read_throughput_mb_s=0.0,
                    write_throughput_mb_s=0.0,
                    iops=0.0,
                    collection_source="SQLITE_STORAGE_ENGINE",
                    data_quality_status="VERIFIED_OBSERVATION"
                )
                db.add(entry)
                db.commit()
            except Exception:
                db.rollback()
                raise
            finally:
                db.close()

        try:
            execute_with_db_retry(_do_write)
            return {
                "resource_id": "internal_db",
                "used_bytes": size_bytes,
                "used_mb": round(size_bytes / (1024 ** 2), 2)
            }
        except Exception as e:
            print(f"[HistoricalPipeline] Error recording database sample: {e}")
            return None

    def get_resource_history(
        self,
        resource_id: str,
        hours: int = 72,
        org_id: int = 1
    ) -> List[Dict[str, Any]]:
        """Retrieve chronological history for a specific resource."""
        db = SessionLocal()
        try:
            since = datetime.utcnow() - timedelta(hours=hours)
            records = (
                db.query(HistoricalStorageTelemetry)
                .filter(
                    HistoricalStorageTelemetry.resource_id == resource_id,
                    HistoricalStorageTelemetry.org_id == org_id,
                    HistoricalStorageTelemetry.timestamp >= since
                )
                .order_by(HistoricalStorageTelemetry.timestamp.asc())
                .all()
            )
            return [
                {
                    "timestamp": r.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    "used_gb": round(r.used_capacity_bytes / (1024 ** 3), 3),
                    "total_gb": round(r.total_capacity_bytes / (1024 ** 3), 3),
                    "free_gb": round(r.available_capacity_bytes / (1024 ** 3), 3),
                    "utilization_percent": r.utilization_percent,
                    "daily_growth_gb": round(r.daily_growth_bytes / (1024 ** 3), 3),
                    "read_throughput_mb_s": r.read_throughput_mb_s,
                    "write_throughput_mb_s": r.write_throughput_mb_s,
                    "data_quality_status": r.data_quality_status
                }
                for r in records
            ]
        finally:
            db.close()

    def enforce_retention(self, days: Optional[int] = None, org_id: int = 1) -> int:
        """Purge historical observations older than retention window."""
        limit_days = days or self.default_retention_days
        cutoff = datetime.utcnow() - timedelta(days=limit_days)
        db = SessionLocal()
        try:
            deleted = (
                db.query(HistoricalStorageTelemetry)
                .filter(
                    HistoricalStorageTelemetry.org_id == org_id,
                    HistoricalStorageTelemetry.timestamp < cutoff
                )
                .delete(synchronize_session=False)
            )
            db.commit()
            return deleted
        except Exception:
            db.rollback()
            return 0
        finally:
            db.close()

historical_pipeline = HistoricalPipelineService()
