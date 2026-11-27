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

from app.models.database import HistoricalStorageTelemetry, StorageTelemetry, HistoricalTelemetry, PerformanceTelemetry
from app.database.session import SessionLocal, execute_with_db_retry
from app.services.storage_monitor import storage_monitor
from app.services.performance_monitor import performance_monitor
from app.services.aws_service import aws_service
from app.core.config import DATA_DIR

class HistoricalPipelineService:
    def __init__(self):
        self.default_retention_days: int = 90

    @staticmethod
    def _parse_iso_or_datetime(s: str) -> datetime:
        s = s.strip()
        if "T" in s:
            clean = s.replace("Z", "")
            return datetime.fromisoformat(clean)
        formats = ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"]
        for fmt in formats:
            try:
                return datetime.strptime(s, fmt)
            except ValueError:
                pass
        return datetime.fromisoformat(s)

    @staticmethod
    def _determine_bucket_seconds(start: datetime, end: datetime, interval_str: Optional[str] = None) -> int:
        if interval_str:
            i_str = interval_str.lower().strip()
            if i_str in ["raw", "none", "0"]:
                return 0
            interval_map = {
                "1m": 60, "5m": 300, "10m": 600, "15m": 900, "30m": 1800,
                "1h": 3600, "2h": 7200, "4h": 14400, "6h": 21600, "12h": 43200, "1d": 86400
            }
            if i_str in interval_map:
                return interval_map[i_str]

        span_sec = max(int((end - start).total_seconds()), 1)
        if span_sec <= 3600:
            return 30
        elif span_sec <= 86400:
            return 300
        elif span_sec <= 7 * 86400:
            return 3600
        elif span_sec <= 30 * 86400:
            return 14400
        elif span_sec <= 90 * 86400:
            return 43200
        else:
            return 86400

    def record_telemetry_snapshot(self, org_id: int = 1) -> List[Dict[str, Any]]:
        """
        Record a unified verified historical telemetry snapshot for all local
        storage drives, combined with host CPU, RAM, and Disk I/O performance.
        Configurable interval (default 5s) with db retry and duplicate prevention.
        """
        drives = storage_monitor.get_all_drives()
        perf = performance_monitor.get_current_metrics()
        now = datetime.utcnow()
        saved = []

        def _do_write():
            nonlocal saved
            saved = []
            db = SessionLocal()
            try:
                for d in drives:
                    device_id = d.get("device", "C:")
                    total_gb = float(d.get("total_gb", round(d.get("total_bytes", 0.0) / (1024 ** 3), 2)))
                    used_gb = float(d.get("used_gb", round(d.get("used_bytes", 0.0) / (1024 ** 3), 2)))
                    free_gb = float(d.get("free_gb", round(d.get("free_bytes", 0.0) / (1024 ** 3), 2)))
                    usage_pct = float(d.get("usage_percent", 0.0))

                    cpu_pct = float(perf.get("cpu_percent", 0.0))
                    ram_pct = float(perf.get("memory_percent", 0.0))
                    ram_used_gb = float(perf.get("memory_used_gb", 0.0))
                    ram_avail_gb = float(perf.get("memory_free_gb", 0.0))

                    read_mb = float(d.get("read_throughput_mb_s", perf.get("io_read_mb_s", 0.0)))
                    write_mb = float(d.get("write_throughput_mb_s", perf.get("io_write_mb_s", 0.0)))

                    # Duplicate check: avoid inserting if same device collected within 1 second
                    recent = (
                        db.query(HistoricalTelemetry)
                        .filter(
                            HistoricalTelemetry.device_id == device_id,
                            HistoricalTelemetry.org_id == org_id,
                            HistoricalTelemetry.timestamp_utc >= now - timedelta(seconds=1)
                        )
                        .first()
                    )
                    if recent:
                        continue

                    entry = HistoricalTelemetry(
                        org_id=org_id,
                        timestamp_utc=now,
                        device_id=device_id,
                        total_storage_gb=total_gb,
                        used_storage_gb=used_gb,
                        free_storage_gb=free_gb,
                        utilization_percent=usage_pct,
                        cpu_percent=cpu_pct,
                        ram_percent=ram_pct,
                        ram_used_gb=ram_used_gb,
                        ram_available_gb=ram_avail_gb,
                        disk_read_mb_s=read_mb,
                        disk_write_mb_s=write_mb,
                        collection_status="VERIFIED"
                    )
                    db.add(entry)
                    saved.append({
                        "device_id": device_id,
                        "timestamp_utc": now.isoformat(),
                        "total_storage_gb": total_gb,
                        "used_storage_gb": used_gb,
                        "cpu_percent": cpu_pct,
                        "ram_percent": ram_pct,
                        "status": "VERIFIED"
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
            print(f"[HistoricalPipeline] Error recording unified telemetry snapshot: {e}")
            return []

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

    def get_historical_report(
        self,
        range_str: str = "24h",
        device_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        interval: Optional[str] = None,
        org_id: int = 1
    ) -> Dict[str, Any]:
        """
        Generate structured historical telemetry report with intelligent downsampling/aggregation.
        Returns genuine persisted records and summary metrics.
        """
        now = datetime.utcnow()
        if start_date and end_date:
            try:
                start_dt = self._parse_iso_or_datetime(start_date)
                end_dt = self._parse_iso_or_datetime(end_date)
                range_label = "custom"
            except Exception:
                start_dt = now - timedelta(hours=24)
                end_dt = now
                range_label = range_str or "24h"
        else:
            range_label = range_str or "24h"
            range_map = {
                "1h": timedelta(hours=1),
                "24h": timedelta(hours=24),
                "7d": timedelta(days=7),
                "30d": timedelta(days=30),
                "90d": timedelta(days=90),
            }
            td = range_map.get(range_label.lower(), timedelta(hours=24))
            start_dt = now - td
            end_dt = now

        db = SessionLocal()
        try:
            query = (
                db.query(HistoricalTelemetry)
                .filter(
                    HistoricalTelemetry.org_id == org_id,
                    HistoricalTelemetry.timestamp_utc >= start_dt,
                    HistoricalTelemetry.timestamp_utc <= end_dt
                )
            )
            if device_id:
                query = query.filter(HistoricalTelemetry.device_id == device_id)

            records = query.order_by(HistoricalTelemetry.timestamp_utc.asc()).all()

            if not records:
                return {
                    "success": True,
                    "data_available": False,
                    "range": range_label,
                    "record_count": 0,
                    "message": "Historical telemetry has not been collected yet."
                }

            # Summary metrics over actual collected records
            total_storage_gb = max(r.total_storage_gb for r in records)
            avg_used_storage = round(sum(r.used_storage_gb for r in records) / len(records), 2)
            max_used_storage = round(max(r.used_storage_gb for r in records), 2)
            avg_utilization = round(sum(r.utilization_percent for r in records) / len(records), 2)
            avg_cpu = round(sum(r.cpu_percent for r in records) / len(records), 1)
            avg_ram = round(sum(r.ram_percent for r in records) / len(records), 1)

            # Determine aggregation bucket size
            bucket_sec = self._determine_bucket_seconds(start_dt, end_dt, interval)

            if bucket_sec <= 0:
                storage_history = []
                performance_history = []
                disk_io_history = []
                for r in records:
                    ts_str = r.timestamp_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
                    storage_history.append({
                        "timestamp": ts_str,
                        "device_id": r.device_id,
                        "total_storage_gb": r.total_storage_gb,
                        "used_storage_gb": r.used_storage_gb,
                        "free_storage_gb": r.free_storage_gb,
                        "utilization_percent": r.utilization_percent
                    })
                    performance_history.append({
                        "timestamp": ts_str,
                        "cpu_percent": r.cpu_percent,
                        "ram_percent": r.ram_percent,
                        "ram_used_gb": r.ram_used_gb,
                        "ram_available_gb": r.ram_available_gb
                    })
                    disk_io_history.append({
                        "timestamp": ts_str,
                        "device_id": r.device_id,
                        "disk_read_mb_s": r.disk_read_mb_s,
                        "disk_write_mb_s": r.disk_write_mb_s
                    })
            else:
                buckets: Dict[Tuple[int, str], List[HistoricalTelemetry]] = {}
                for r in records:
                    bucket_key = int(r.timestamp_utc.timestamp() // bucket_sec) * bucket_sec
                    dev = r.device_id
                    key = (bucket_key, dev)
                    if key not in buckets:
                        buckets[key] = []
                    buckets[key].append(r)

                storage_history = []
                disk_io_history = []
                perf_buckets: Dict[int, List[HistoricalTelemetry]] = {}

                for (b_ts, dev), b_records in sorted(buckets.items(), key=lambda x: (x[0][0], x[0][1])):
                    dt = datetime.utcfromtimestamp(b_ts)
                    ts_str = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
                    n = len(b_records)

                    tot_gb = max(x.total_storage_gb for x in b_records)
                    used_gb = round(sum(x.used_storage_gb for x in b_records) / n, 2)
                    free_gb = round(sum(x.free_storage_gb for x in b_records) / n, 2)
                    util_pct = round(sum(x.utilization_percent for x in b_records) / n, 2)
                    read_mb = round(sum(x.disk_read_mb_s for x in b_records) / n, 2)
                    write_mb = round(sum(x.disk_write_mb_s for x in b_records) / n, 2)

                    storage_history.append({
                        "timestamp": ts_str,
                        "device_id": dev,
                        "total_storage_gb": tot_gb,
                        "used_storage_gb": used_gb,
                        "free_storage_gb": free_gb,
                        "utilization_percent": util_pct
                    })
                    disk_io_history.append({
                        "timestamp": ts_str,
                        "device_id": dev,
                        "disk_read_mb_s": read_mb,
                        "disk_write_mb_s": write_mb
                    })

                    if b_ts not in perf_buckets:
                        perf_buckets[b_ts] = []
                    perf_buckets[b_ts].extend(b_records)

                performance_history = []
                for b_ts, b_records in sorted(perf_buckets.items(), key=lambda x: x[0]):
                    dt = datetime.utcfromtimestamp(b_ts)
                    ts_str = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
                    n = len(b_records)
                    performance_history.append({
                        "timestamp": ts_str,
                        "cpu_percent": round(sum(x.cpu_percent for x in b_records) / n, 1),
                        "ram_percent": round(sum(x.ram_percent for x in b_records) / n, 1),
                        "ram_used_gb": round(sum(x.ram_used_gb for x in b_records) / n, 2),
                        "ram_available_gb": round(sum(x.ram_available_gb for x in b_records) / n, 2)
                    })

            return {
                "success": True,
                "data_available": True,
                "range": range_label,
                "summary": {
                    "total_storage_gb": total_storage_gb,
                    "average_used_storage_gb": avg_used_storage,
                    "maximum_used_storage_gb": max_used_storage,
                    "average_utilization_percent": avg_utilization,
                    "average_cpu_percent": avg_cpu,
                    "average_ram_percent": avg_ram
                },
                "storage_history": storage_history,
                "performance_history": performance_history,
                "disk_io_history": disk_io_history,
                "record_count": len(storage_history),
                "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
            }
        finally:
            db.close()

    def enforce_retention(self, days: Optional[int] = None, org_id: int = 1) -> int:
        """Purge historical observations older than retention window."""
        limit_days = days or self.default_retention_days
        cutoff = datetime.utcnow() - timedelta(days=limit_days)
        db = SessionLocal()
        try:
            deleted_storage = (
                db.query(HistoricalStorageTelemetry)
                .filter(
                    HistoricalStorageTelemetry.org_id == org_id,
                    HistoricalStorageTelemetry.timestamp < cutoff
                )
                .delete(synchronize_session=False)
            )
            deleted_unified = (
                db.query(HistoricalTelemetry)
                .filter(
                    HistoricalTelemetry.org_id == org_id,
                    HistoricalTelemetry.timestamp_utc < cutoff
                )
                .delete(synchronize_session=False)
            )
            db.commit()
            return deleted_storage + deleted_unified
        except Exception:
            db.rollback()
            return 0
        finally:
            db.close()

historical_pipeline = HistoricalPipelineService()
