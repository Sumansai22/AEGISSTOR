"""
AEGISSTOR REST API Endpoints
"""
import os
import platform
import psutil
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Response
from sqlalchemy.orm import Session

from app.database.session import get_db, SessionLocal
from app.models.database import (
    StorageTelemetry, PerformanceTelemetry, ScanResult,
    RiskAlert, OptimizationRecommendation, SimulationResult,
    ApplicationSetting, AuditLog, HistoricalTelemetry
)
from app.services.storage_monitor import storage_monitor
from app.services.performance_monitor import performance_monitor
from app.services.storage_scanner import storage_scanner
from app.services.forecasting_service import forecasting_service
from app.services.risk_engine import risk_engine
from app.services.optimization_engine import optimization_engine
from app.services.digital_twin import digital_twin_service
from app.services.historical_pipeline import historical_pipeline
from app.schemas.all_schemas import (
    DriveInfo, StorageSummary, DiskIOStats, PerformanceCurrent,
    ScanRequest, ScanSummary, ForecastResponse, RiskSummary,
    OptimizationRecommendationItem, OptimizationActionRequest, OptimizationActionResponse,
    SimulationRequest, SimulationResponse, SystemSettingItem, AuditLogItem
)

router = APIRouter()

# --- System & Health Endpoints ---

@router.get("/health")
def get_health():
    db_status = "connected"
    try:
        from app.database.session import engine
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "status": "healthy",
        "app": "AEGISSTOR",
        "version": "2.0.0",
        "database": db_status,
        "timestamp": datetime.utcnow().isoformat()
    }

@router.get("/system/info")
def get_system_info():
    """Return genuine OS, CPU, and host platform information."""
    uname = platform.uname()
    boot_time = datetime.fromtimestamp(psutil.boot_time()).strftime("%Y-%m-%d %H:%M:%S")
    return {
        "hostname": uname.node,
        "os_name": uname.system,
        "os_release": uname.release,
        "os_version": uname.version,
        "machine_architecture": uname.machine,
        "processor": uname.processor,
        "cpu_physical_cores": psutil.cpu_count(logical=False),
        "cpu_logical_cores": psutil.cpu_count(logical=True),
        "total_ram_gb": round(psutil.virtual_memory().total / (1024 ** 3), 2),
        "system_boot_time": boot_time,
        "python_version": platform.python_version()
    }

# --- Storage Monitoring Endpoints ---

@router.get("/storage/drives")
def get_storage_drives():
    return storage_monitor.get_all_drives()

@router.get("/storage/summary")
def get_storage_summary():
    return storage_monitor.get_storage_summary()

@router.get("/storage/io")
def get_storage_io():
    return storage_monitor.get_live_io_rates()

# --- Storage Scanner Endpoints ---

@router.post("/storage/scan")
def trigger_storage_scan(payload: ScanRequest, background_tasks: BackgroundTasks):
    if storage_scanner.is_scanning:
        return {"status": "ALREADY_RUNNING", "message": "A scan is already in progress."}

    path = payload.target_path.strip()
    if not os.path.exists(path):
        raise HTTPException(status_code=400, detail=f"Target path '{path}' does not exist.")

    # Execute scanner in background
    background_tasks.add_task(
        storage_scanner.scan_directory,
        target_path=path,
        max_files=payload.max_files or 40000,
        max_depth=payload.max_depth or 5
    )
    return {
        "status": "STARTED",
        "target_path": path,
        "message": f"Storage scan initiated for {path}."
    }

@router.get("/storage/scan/status")
def get_scan_status():
    return {
        "is_scanning": storage_scanner.is_scanning,
        "current_scan_path": storage_scanner.current_scan_path,
        "progress": storage_scanner.progress
    }

@router.get("/storage/scan/latest")
def get_latest_scan_result(db: Session = Depends(get_db)):
    if storage_scanner.last_result:
        return storage_scanner.last_result

    # Fallback to most recent scan from DB
    latest = db.query(ScanResult).order_by(ScanResult.timestamp.desc()).first()
    if latest and latest.summary_json:
        import json
        res = json.loads(latest.summary_json)
        res["id"] = latest.id
        return res

    # If no scan has been run yet, prepare default guidance
    user_home = os.path.expanduser("~")
    return {
        "target_path": user_home,
        "status": "NO_SCAN_YET",
        "timestamp": datetime.utcnow().isoformat(),
        "duration_sec": 0.0,
        "total_files": 0,
        "total_dirs": 0,
        "total_bytes": 0.0,
        "size_formatted": "0 B",
        "largest_files": [],
        "largest_folders": [],
        "duplicates": [],
        "categories": [],
        "temp_files_bytes": 0.0,
        "temp_files_count": 0,
        "temp_files_list": []
    }

# --- System Performance Endpoints ---

@router.get("/performance/current")
def get_performance_current():
    return performance_monitor.get_current_metrics()

@router.get("/performance/history")
def get_performance_history(limit: int = 50, db: Session = Depends(get_db)):
    records = (
        db.query(PerformanceTelemetry)
        .order_by(PerformanceTelemetry.timestamp.desc())
        .limit(limit)
        .all()
    )
    data = []
    for r in reversed(records):
        data.append({
            "timestamp": r.timestamp.strftime("%H:%M:%S"),
            "cpu_percent": r.cpu_percent,
            "memory_percent": r.memory_percent,
            "memory_used_gb": round(r.memory_used / (1024 ** 3), 2),
            "running_processes": r.running_processes_count
        })
    return data

# --- ML Forecasting Endpoints ---

@router.get("/predictions")
@router.get("/forecast")
def get_forecast(drive: Optional[str] = None):
    # Default to primary drive C:
    target_drive = drive or "C:"
    return forecasting_service.train_and_forecast(target_drive)

@router.post("/forecast/calibrate-seed")
def seed_historical_telemetry_for_testing(db: Session = Depends(get_db)):
    """
    Populates 35 realistic time-stepped historical telemetry data points
    derived from current actual drive usage so users can test LightGBM
    immediately without waiting weeks for organic telemetry accumulation.
    """
    drives = storage_monitor.get_all_drives()
    if not drives:
        raise HTTPException(status_code=400, detail="No storage drives detected.")

    primary = drives[0]
    base_used = primary["used_bytes"]
    base_total = primary["total_bytes"]
    drive_device = primary["device"]

    now = datetime.utcnow()
    # Create 35 hourly snapshots backwards
    new_records = []
    for i in range(35, 0, -1):
        step_time = now - timedelta(hours=i * 2)
        # Small realistic variance
        var_gb = (35 - i) * 0.08 + (np.sin(i) * 0.02)
        step_used = max(0.0, base_used - (var_gb * (1024 ** 3)))
        step_pct = (step_used / base_total * 100.0) if base_total > 0 else 0.0

        new_records.append(StorageTelemetry(
            timestamp=step_time,
            drive_name=drive_device,
            mount_point=primary["mountpoint"],
            filesystem=primary["fstype"],
            total_bytes=base_total,
            used_bytes=step_used,
            free_bytes=base_total - step_used,
            usage_percent=round(step_pct, 2),
            read_bytes_sec=1024 * 1024 * 5,
            write_bytes_sec=1024 * 1024 * 2,
            read_ops_sec=120,
            write_ops_sec=80,
            disk_health=primary["disk_health"]
        ))

    db.add_all(new_records)
    db.add(AuditLog(
        action_type="CALIBRATION_SEED",
        description=f"Generated {len(new_records)} calibrated telemetry points for {drive_device} to enable instant LightGBM model evaluation.",
        status="SUCCESS"
    ))
    db.commit()

    return {
        "status": "SUCCESS",
        "message": f"Added {len(new_records)} historical calibration points for {drive_device}. LightGBM regressor is now active!"
    }

# --- Risk Management Endpoints ---

@router.get("/risks")
def get_risk_assessment():
    return risk_engine.evaluate_risks()

# --- Optimization Recommendations Endpoints ---

@router.get("/recommendations")
def get_optimization_recommendations():
    return optimization_engine.generate_recommendations()

@router.post("/recommendations/apply")
def apply_optimization_action(payload: OptimizationActionRequest):
    return optimization_engine.execute_safe_cleanup(
        recommendation_id=payload.recommendation_id,
        confirmed=payload.confirmed,
        file_paths=payload.delete_file_paths
    )

# --- Digital Twin Simulation Endpoints ---

@router.post("/simulation/run")
def run_digital_twin_simulation(payload: SimulationRequest):
    return digital_twin_service.run_simulation(
        drive_name=payload.drive_name,
        monthly_growth_rate_percent=payload.monthly_growth_rate_percent or 0.0,
        removed_unnecessary_files_gb=payload.removed_unnecessary_files_gb or 0.0,
        capacity_expansion_gb=payload.capacity_expansion_gb or 0.0,
        continuation_days=payload.continuation_days or 90
    )

# --- Historical Reports & Telemetry Endpoints ---

@router.get("/reports/historical")
def get_historical_reports(
    range: str = "24h",
    device_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    interval: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Unified Historical Telemetry Report endpoint.
    Retrieves real persisted telemetry with intelligent aggregation,
    time-window filtering, device filtering, and KPI summaries.
    """
    try:
        report = historical_pipeline.get_historical_report(
            range_str=range,
            device_id=device_id,
            start_date=start_date,
            end_date=end_date,
            interval=interval,
            org_id=1
        )
        return report
    except Exception as e:
        return {
            "success": False,
            "data_available": False,
            "range": range,
            "record_count": 0,
            "message": f"Historical telemetry reporting error: {str(e)}"
        }

@router.get("/reports/historical/csv")
def export_historical_report_csv(
    range: str = "24h",
    device_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Export authentic retrieved historical telemetry records as CSV."""
    import io
    import csv
    report = historical_pipeline.get_historical_report(
        range_str=range,
        device_id=device_id,
        start_date=start_date,
        end_date=end_date,
        interval="raw",
        org_id=1
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Timestamp_UTC", "Device_ID", "Total_Storage_GB", "Used_Storage_GB",
        "Free_Storage_GB", "Utilization_Percent", "CPU_Percent", "RAM_Percent",
        "RAM_Used_GB", "RAM_Available_GB", "Disk_Read_MB_s", "Disk_Write_MB_s"
    ])

    records = report.get("storage_history", [])
    perf_map = {p["timestamp"]: p for p in report.get("performance_history", [])}
    io_map = {f"{i['timestamp']}_{i.get('device_id')}": i for i in report.get("disk_io_history", [])}

    for s in records:
        ts = s.get("timestamp")
        dev = s.get("device_id")
        p = perf_map.get(ts, {})
        io_entry = io_map.get(f"{ts}_{dev}", {})
        writer.writerow([
            ts,
            dev,
            s.get("total_storage_gb"),
            s.get("used_storage_gb"),
            s.get("free_storage_gb"),
            s.get("utilization_percent"),
            p.get("cpu_percent", 0.0),
            p.get("ram_percent", 0.0),
            p.get("ram_used_gb", 0.0),
            p.get("ram_available_gb", 0.0),
            io_entry.get("disk_read_mb_s", 0.0),
            io_entry.get("disk_write_mb_s", 0.0)
        ])

    filename = f"AEGISSTOR_historical_report_{range}.csv"
    return Response(
        content=output.getvalue().encode("utf-8"),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/history")
def get_history(hours: int = 24, drive: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Chronological historical storage telemetry series with valid ISO timestamps and downsampling.
    Preserves backwards compatibility with legacy frontend callers.
    """
    range_str = f"{hours}h" if hours in [1, 24] else ("7d" if hours <= 168 else ("30d" if hours <= 720 else "90d"))
    report = historical_pipeline.get_historical_report(range_str=range_str, device_id=drive)
    if not report.get("data_available"):
        return []

    result = []
    io_map = {f"{i['timestamp']}_{i.get('device_id')}": i for i in report.get("disk_io_history", [])}
    for s in report.get("storage_history", []):
        ts = s.get("timestamp")
        dev = s.get("device_id")
        io_entry = io_map.get(f"{ts}_{dev}", {})
        result.append({
            "timestamp": ts,
            "drive": dev,
            "used_gb": s.get("used_storage_gb"),
            "free_gb": s.get("free_storage_gb"),
            "usage_percent": s.get("utilization_percent"),
            "read_mb_s": io_entry.get("disk_read_mb_s", 0.0),
            "write_mb_s": io_entry.get("disk_write_mb_s", 0.0)
        })
    return result

# --- Settings & Audit Log Endpoints ---

@router.get("/settings")
def get_application_settings(db: Session = Depends(get_db)):
    settings = db.query(ApplicationSetting).all()
    return {s.key: s.value for s in settings}

@router.post("/settings")
def update_application_settings(settings: Dict[str, str], db: Session = Depends(get_db)):
    for k, v in settings.items():
        existing = db.query(ApplicationSetting).filter(ApplicationSetting.key == k).first()
        if existing:
            existing.value = str(v)
            existing.updated_at = datetime.utcnow()
        else:
            db.add(ApplicationSetting(key=k, value=str(v)))
    db.add(AuditLog(
        action_type="SETTINGS_UPDATE",
        description="Application monitoring settings updated.",
        status="SUCCESS",
        details_json=str(settings)
    ))
    db.commit()
    return {"status": "SUCCESS", "message": "Settings updated successfully."}

@router.get("/audit-logs")
def get_audit_logs(limit: int = 50, db: Session = Depends(get_db)):
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": l.id,
            "timestamp": l.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            "action_type": l.action_type,
            "description": l.description,
            "status": l.status
        }
        for l in logs
    ]

# --- Security Center & Privacy Guard Routes (/api/security & /api/privacy) ---
from app.security.service import security_service
from app.privacy.guard import privacy_guard

@router.get("/security/status")
@router.get("/security/dashboard")
def legacy_security_dashboard():
    return security_service.get_security_dashboard(org_id=1)

@router.get("/security/checks")
def legacy_security_checks():
    return security_service.get_security_checks()

@router.post("/security/checks/run")
@router.post("/security/scan")
def legacy_run_security_scan():
    return security_service.run_security_scan(org_id=1)

@router.get("/security/events")
def legacy_security_events(event_type: str = "ALL", severity: str = "ALL", limit: int = 50):
    return security_service.get_security_events(event_type=event_type, severity=severity, limit=limit, org_id=1)

@router.get("/security/alerts")
def legacy_security_alerts():
    dash = security_service.get_security_dashboard(org_id=1)
    return {
        "active_alerts_count": dash.get("active_alerts_count", 0),
        "overall_status": dash.get("overall_status"),
        "failed_checks": [c for c in dash.get("latest_scan", {}).get("checks", []) if c.get("status") in ("FAILED", "WARNING")],
        "recent_critical_events": [e for e in dash.get("recent_events", []) if e.get("severity") in ("HIGH", "CRITICAL")]
    }

@router.get("/privacy/status")
@router.get("/privacy/dashboard")
def legacy_privacy_dashboard():
    return privacy_guard.get_privacy_dashboard(org_id=1)

@router.get("/privacy/settings")
@router.get("/privacy/policy")
def legacy_privacy_settings():
    return privacy_guard.get_policy(org_id=1)

@router.put("/privacy/settings")
@router.post("/privacy/settings")
@router.post("/privacy/policy")
def legacy_update_privacy_settings(updates: dict):
    return privacy_guard.update_policy(org_id=1, updates=updates)

@router.post("/privacy/scan")
def legacy_trigger_privacy_scan():
    return privacy_guard.start_privacy_scan(org_id=1)

@router.get("/privacy/scan-history")
def legacy_privacy_scan_history(limit: int = 20):
    return privacy_guard.get_privacy_scan_history(limit=limit, org_id=1)

@router.get("/privacy/events")
def legacy_privacy_events(limit: int = 50):
    return privacy_guard.get_privacy_events(limit=limit, org_id=1)

@router.get("/privacy/retention/preview")
@router.post("/privacy/retention/preview")
def legacy_preview_retention_purge(retention_days: int = None):
    return privacy_guard.preview_retention_purge(retention_days=retention_days, org_id=1)

@router.post("/privacy/purge")
@router.post("/privacy/purge-retention")
def legacy_trigger_retention_purge(retention_days: int = None):
    return privacy_guard.enforce_retention_purge(retention_days=retention_days, org_id=1)
