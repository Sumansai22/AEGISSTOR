"""
Pydantic Schemas for AEGISSTOR API
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

# --- System & Storage Schemas ---

class DriveInfo(BaseModel):
    device: str
    mountpoint: str
    fstype: str
    opts: str
    total_bytes: float
    used_bytes: float
    free_bytes: float
    usage_percent: float
    drive_type: Optional[str] = "Fixed Storage"
    hardware_name: Optional[str] = "Primary Drive"
    read_bytes_sec: float = 0.0
    write_bytes_sec: float = 0.0
    read_ops_sec: float = 0.0
    write_ops_sec: float = 0.0
    disk_health: str = "Healthy"

class StorageSummary(BaseModel):
    total_drives: int
    total_storage_bytes: float
    total_used_bytes: float
    total_free_bytes: float
    overall_usage_percent: float
    drives: List[DriveInfo]

class DiskIOStats(BaseModel):
    timestamp: datetime
    read_bytes_sec: float
    write_bytes_sec: float
    read_ops_sec: float
    write_ops_sec: float
    read_throughput_mb_s: float
    write_throughput_mb_s: float

# --- Performance Schemas ---

class ProcessItem(BaseModel):
    pid: int
    name: str
    cpu_percent: float
    memory_percent: float
    memory_mb: float
    username: Optional[str] = "N/A"
    status: Optional[str] = "running"

class PerformanceCurrent(BaseModel):
    timestamp: datetime
    cpu_percent: float
    cpu_count_logical: int
    cpu_count_physical: int
    memory_total_bytes: float
    memory_used_bytes: float
    memory_free_bytes: float
    memory_percent: float
    io_read_mb_s: float
    io_write_mb_s: float
    network_sent_mb_s: float
    network_recv_mb_s: float
    top_processes: List[ProcessItem]

# --- Storage Analyzer Schemas ---

class ScanRequest(BaseModel):
    target_path: str
    max_depth: Optional[int] = 5
    max_files: Optional[int] = 50000

class FileItem(BaseModel):
    path: str
    name: str
    size_bytes: float
    size_formatted: str
    category: str
    extension: str
    modified_time: str
    is_safe_to_delete: bool = False

class FolderItem(BaseModel):
    path: str
    name: str
    size_bytes: float
    size_formatted: str
    file_count: int
    subfolder_count: int

class DuplicateFileItem(BaseModel):
    path: str
    name: str
    size_bytes: float
    modified_time: str

class DuplicateGroup(BaseModel):
    file_hash: str
    size_bytes: float
    size_formatted: str
    count: int
    wasted_bytes: float
    files: List[DuplicateFileItem]

class CategoryStat(BaseModel):
    category: str
    extension_list: List[str]
    total_bytes: float
    size_formatted: str
    file_count: int
    percent_of_scanned: float

class ScanSummary(BaseModel):
    id: Optional[int] = None
    target_path: str
    status: str
    timestamp: datetime
    duration_sec: float
    total_files: int
    total_dirs: int
    total_bytes: float
    size_formatted: str
    largest_files: List[FileItem]
    largest_folders: List[FolderItem]
    duplicates: List[DuplicateGroup]
    categories: List[CategoryStat]
    temp_files_bytes: float
    temp_files_count: int
    temp_files_list: List[FileItem]

# --- ML Forecasting Schemas ---

class ForecastPoint(BaseModel):
    timestamp: str
    label: str # "T+24h", "T+7d", etc.
    predicted_used_bytes: float
    predicted_usage_percent: float
    confidence_lower_bytes: float
    confidence_upper_bytes: float
    confidence_lower_percent: float
    confidence_upper_percent: float

class ForecastMetric(BaseModel):
    mae_gb: float
    rmse_gb: float
    mape_percent: float
    sample_count: int
    model_name: str
    r2_score: Optional[float] = 0.0

class StorageRunway(BaseModel):
    hours_to_80_percent: Optional[float] = None
    hours_to_90_percent: Optional[float] = None
    hours_to_95_percent: Optional[float] = None
    estimated_exhaustion_days: Optional[float] = None
    daily_growth_gb: float
    growth_trend_description: str

class ForecastResponse(BaseModel):
    drive_name: str
    current_used_bytes: float
    total_capacity_bytes: float
    current_usage_percent: float
    sufficient_data: bool
    data_points_collected: int
    min_required_points: int
    model_type: str
    status_message: str
    metrics: Optional[ForecastMetric] = None
    runway: StorageRunway
    forecast_points: List[ForecastPoint]
    historical_points: List[Dict[str, Any]]

# --- Risk Engine Schemas ---

class RiskAlertItem(BaseModel):
    id: Optional[int] = None
    timestamp: datetime
    drive_name: str
    risk_level: str # LOW, MODERATE, HIGH, CRITICAL
    title: str
    reason: str
    recommended_action: str
    is_resolved: bool = False

class RiskSummary(BaseModel):
    overall_system_risk: str # LOW, MODERATE, HIGH, CRITICAL
    active_alerts_count: int
    critical_count: int
    high_count: int
    moderate_count: int
    low_count: int
    alerts: List[RiskAlertItem]

# --- Optimization Engine Schemas ---

class OptimizationRecommendationItem(BaseModel):
    id: int
    timestamp: datetime
    drive_name: str
    category: str # TEMP_FILES, DUPLICATES, LARGE_FILES, CAPACITY, IO_LOAD
    issue: str
    expected_benefit: str
    estimated_recovery_bytes: float
    estimated_recovery_formatted: str
    risk_level: str
    recommended_action: str
    target_paths: List[str]
    status: str

class OptimizationActionRequest(BaseModel):
    recommendation_id: int
    confirmed: bool
    delete_file_paths: Optional[List[str]] = None

class OptimizationActionResponse(BaseModel):
    success: bool
    message: str
    freed_bytes: float
    freed_formatted: str
    details: List[str]

# --- Digital Twin Simulation Schemas ---

class SimulationRequest(BaseModel):
    drive_name: str
    monthly_growth_rate_percent: Optional[float] = 0.0
    removed_unnecessary_files_gb: Optional[float] = 0.0
    capacity_expansion_gb: Optional[float] = 0.0
    continuation_days: Optional[int] = 90

class SimulationResponse(BaseModel):
    scenario_name: str
    drive_name: str
    current_total_bytes: float
    current_used_bytes: float
    current_free_bytes: float
    current_usage_percent: float
    current_risk: str

    projected_total_bytes: float
    projected_used_bytes: float
    projected_free_bytes: float
    projected_usage_percent: float
    projected_risk: str

    days_to_exhaustion: Optional[float] = None
    estimated_exhaustion_date: Optional[str] = "Safe (> 1 year)"
    risk_change_summary: str
    simulation_notes: List[str]
    timeline_projection: List[Dict[str, Any]]

# --- Settings & Audit Schemas ---

class SystemSettingItem(BaseModel):
    key: str
    value: str
    updated_at: Optional[datetime] = None

class AuditLogItem(BaseModel):
    id: int
    timestamp: datetime
    action_type: str
    description: str
    status: str
    details_json: str

# --- Notification, Incident & Alert Rule Schemas ---

class NotificationItem(BaseModel):
    id: int
    event_id: str
    incident_id: Optional[int] = None
    title: str
    message: str
    category: str
    severity: str
    source: str
    resource: Optional[str] = None
    details_json: str
    is_read: bool
    read_at: Optional[datetime] = None
    is_archived: bool
    created_at: datetime

class IncidentItem(BaseModel):
    id: int
    incident_number: str
    title: str
    category: str
    severity: str
    status: str
    resource: str
    root_cause_evidence: Optional[str] = None
    recommended_action: Optional[str] = None
    related_telemetry_json: str
    escalation_level: int
    escalated_at: Optional[datetime] = None
    assigned_to_user_id: Optional[int] = None
    created_at: datetime
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    resolution_notes: Optional[str] = None

class IncidentActionRequest(BaseModel):
    comment: Optional[str] = None
    assigned_user_id: Optional[int] = None

class AlertRuleCreateRequest(BaseModel):
    name: str
    category: str
    metric_key: str
    operator: str = ">="
    warning_threshold: Optional[float] = None
    critical_threshold: Optional[float] = None
    emergency_threshold: Optional[float] = None
    is_enabled: bool = True
    cooldown_minutes: int = 30
    auto_resolve: bool = True
    description: Optional[str] = None

class NotificationPreferenceUpdateRequest(BaseModel):
    email_enabled: Optional[bool] = None
    in_app_enabled: Optional[bool] = None
    web_push_enabled: Optional[bool] = None
    sms_enabled: Optional[bool] = None
    aws_sns_enabled: Optional[bool] = None
    notification_email: Optional[str] = None
    notification_phone: Optional[str] = None
    aws_sns_topic_arn: Optional[str] = None
    min_severity_email: Optional[str] = None
    min_severity_in_app: Optional[str] = None
    min_severity_web_push: Optional[str] = None
    min_severity_sms: Optional[str] = None
    min_severity_aws_sns: Optional[str] = None
    storage_warning_percent: Optional[float] = None
    storage_critical_percent: Optional[float] = None
    cpu_critical_percent: Optional[float] = None
    ram_critical_percent: Optional[float] = None
    quiet_hours_enabled: Optional[bool] = None
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    retention_days: Optional[int] = None

class TestNotificationRequest(BaseModel):
    channel: str
    recipient: Optional[str] = None
    severity: str = "INFO"

class SystemAnnouncementCreateRequest(BaseModel):
    version: str = "2.1.0"
    title: str
    description: str
    category: str = "FEATURE"
    impact: str = "LOW"

class PushSubscriptionRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
