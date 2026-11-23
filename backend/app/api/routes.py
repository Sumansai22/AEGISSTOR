"""
AEGISSTOR REST API Endpoints
"""
import os
import platform
import psutil
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from app.database.session import get_db, SessionLocal
from app.models.database import (
    StorageTelemetry, PerformanceTelemetry, ScanResult,
    RiskAlert, OptimizationRecommendation, SimulationResult,
    ApplicationSetting, AuditLog
)
from app.services.storage_monitor import storage_monitor
from app.services.performance_monitor import performance_monitor
from app.services.storage_scanner import storage_scanner
from app.services.forecasting_service import forecasting_service
from app.services.risk_engine import risk_engine
from app.services.optimization_engine import optimization_engine
from app.services.digital_twin import digital_twin_service
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

@router.get("/history")
def get_history(hours: int = 24, db: Session = Depends(get_db)):
    since = datetime.utcnow() - timedelta(hours=hours)
    records = (
        db.query(StorageTelemetry)
        .filter(StorageTelemetry.timestamp >= since)
        .order_by(StorageTelemetry.timestamp.asc())
        .limit(200)
        .all()
    )
    result = []
    for r in records:
        result.append({
            "timestamp": r.timestamp.strftime("%H:%M:%S"),
            "drive": r.drive_name,
            "used_gb": round(r.used_bytes / (1024 ** 3), 2),
            "free_gb": round(r.free_bytes / (1024 ** 3), 2),
            "usage_percent": r.usage_percent,
            "read_mb_s": round(r.read_bytes_sec / (1024 * 1024), 2),
            "write_mb_s": round(r.write_bytes_sec / (1024 * 1024), 2)
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
