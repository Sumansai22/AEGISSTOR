"""
SQLAlchemy Persistent Models for AEGISSTOR Enterprise Platform
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Index
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

# --- Multi-Tenant & Identity Models ---

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(150), unique=True, nullable=False)
    slug = Column(String(100), unique=True, index=True, nullable=False)
    industry_type = Column(String(100), default="Enterprise")  # Healthcare, Banking, Education, Corporate, Datacenter
    status = Column(String(30), default="ACTIVE")  # ACTIVE, SUSPENDED
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    database_connections = relationship("DatabaseConnection", back_populates="organization", cascade="all, delete-orphan")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(150), nullable=False)
    password_hash = Column(String(500), nullable=False)
    role = Column(String(50), default="VIEWER")  # SUPER_ADMIN, DATABASE_ADMIN, ANALYST, VIEWER
    mfa_secret = Column(String(100), nullable=True)
    mfa_enabled = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    must_change_password = Column(Boolean, default=False)
    failed_login_attempts = Column(Integer, default=0)
    last_login_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="users")
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")

class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_jti = Column(String(100), index=True)
    ip_address = Column(String(50), default="127.0.0.1")
    user_agent = Column(String(255), default="Desktop Application")
    is_revoked = Column(Boolean, default=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="sessions")

# --- Enterprise Database Connection & Telemetry Models ---

class DatabaseConnection(Base):
    __tablename__ = "database_connections"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    db_type = Column(String(50), nullable=False)  # POSTGRESQL, MYSQL, SQL_SERVER, ORACLE
    host = Column(String(255), nullable=False)
    port = Column(Integer, nullable=False)
    database_name = Column(String(150), nullable=False)
    username = Column(String(150), nullable=False)
    encrypted_password = Column(Text, nullable=False)
    ssl_mode = Column(String(30), default="prefer")
    is_active = Column(Boolean, default=True)
    last_sync_at = Column(DateTime, nullable=True)
    status_message = Column(String(255), default="Ready")
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="database_connections")
    telemetry_records = relationship("DatabaseTelemetry", back_populates="database_connection", cascade="all, delete-orphan")

class DatabaseTelemetry(Base):
    __tablename__ = "database_telemetry"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    org_id = Column(Integer, index=True, default=1)
    db_connection_id = Column(Integer, ForeignKey("database_connections.id", ondelete="CASCADE"), nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    total_size_bytes = Column(Float, nullable=False)
    data_size_bytes = Column(Float, default=0.0)
    index_size_bytes = Column(Float, default=0.0)
    table_count = Column(Integer, default=0)
    active_connections = Column(Integer, default=0)
    query_latency_ms = Column(Float, default=0.0)
    read_throughput_mb_s = Column(Float, default=0.0)
    write_throughput_mb_s = Column(Float, default=0.0)
    growth_rate_daily_bytes = Column(Float, default=0.0)
    top_tables_json = Column(Text, default="[]")  # Table names, row counts, total bytes (metadata only)

    database_connection = relationship("DatabaseConnection", back_populates="telemetry_records")

# --- Local Storage & System Telemetry Models ---

class StorageTelemetry(Base):
    __tablename__ = "storage_telemetry"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    org_id = Column(Integer, index=True, default=1)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    drive_name = Column(String(50), index=True)
    mount_point = Column(String(255))
    filesystem = Column(String(50))
    total_bytes = Column(Float)
    used_bytes = Column(Float)
    free_bytes = Column(Float)
    usage_percent = Column(Float)
    read_bytes_sec = Column(Float, default=0.0)
    write_bytes_sec = Column(Float, default=0.0)
    read_ops_sec = Column(Float, default=0.0)
    write_ops_sec = Column(Float, default=0.0)
    disk_health = Column(String(100), default="Healthy")

class HistoricalStorageTelemetry(Base):
    """
    Consolidated enterprise historical telemetry for local disks, external disks,
    S3 buckets, and enterprise databases with quality tracking.
    """
    __tablename__ = "historical_storage_telemetry"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    org_id = Column(Integer, index=True, default=1)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    resource_id = Column(String(150), index=True, nullable=False)  # "C:", "aegisstor-mon-...", "prod_pg_db"
    resource_type = Column(String(50), index=True, nullable=False) # LOCAL_DISK, EXTERNAL_DISK, AWS_S3, DATABASE
    total_capacity_bytes = Column(Float, nullable=False)
    used_capacity_bytes = Column(Float, nullable=False)
    available_capacity_bytes = Column(Float, nullable=False)
    utilization_percent = Column(Float, nullable=False)
    daily_growth_bytes = Column(Float, default=0.0)
    read_throughput_mb_s = Column(Float, default=0.0)
    write_throughput_mb_s = Column(Float, default=0.0)
    iops = Column(Float, default=0.0)
    collection_source = Column(String(100), default="WIN32_COLLECTOR") # WIN32_COLLECTOR, AWS_S3_SDK, DATABASE_CATALOG
    data_quality_status = Column(String(50), default="VERIFIED_OBSERVATION") # VERIFIED_OBSERVATION, PARTIAL_SAMPLE, ESTIMATED

    __table_args__ = (
        Index("idx_hist_resource_time", "resource_id", "timestamp"),
    )

class PerformanceTelemetry(Base):
    __tablename__ = "performance_telemetry"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    org_id = Column(Integer, index=True, default=1)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    cpu_percent = Column(Float)
    memory_total = Column(Float)
    memory_used = Column(Float)
    memory_free = Column(Float)
    memory_percent = Column(Float)
    io_read_bytes_sec = Column(Float, default=0.0)
    io_write_bytes_sec = Column(Float, default=0.0)
    running_processes_count = Column(Integer, default=0)

class ScanResult(Base):
    __tablename__ = "scan_results"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    org_id = Column(Integer, index=True, default=1)
    timestamp = Column(DateTime, default=datetime.utcnow)
    target_path = Column(String(500), index=True)
    status = Column(String(50), default="COMPLETED")
    total_files = Column(Integer, default=0)
    total_dirs = Column(Integer, default=0)
    total_bytes = Column(Float, default=0.0)
    duration_sec = Column(Float, default=0.0)
    summary_json = Column(Text)

# --- Predictive Intelligence & Anomaly Models ---

class ForecastResult(Base):
    __tablename__ = "forecast_results"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    org_id = Column(Integer, index=True, default=1)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    resource_type = Column(String(50), default="LOCAL_DISK")  # LOCAL_DISK, DATABASE
    resource_name = Column(String(150), index=True)
    horizon_days = Column(Integer)  # 7, 15, 30, 60, 90
    predicted_used_bytes = Column(Float)
    predicted_usage_percent = Column(Float)
    confidence_lower_bytes = Column(Float)
    confidence_upper_bytes = Column(Float)
    model_type = Column(String(50))  # LIGHTGBM, RANDOM_FOREST, LINEAR_REGRESSION, MOVING_AVERAGE
    metrics_json = Column(Text, default="{}")  # MAE, RMSE, MAPE, R2

class StorageAnomaly(Base):
    __tablename__ = "storage_anomalies"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    org_id = Column(Integer, index=True, default=1)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    resource_type = Column(String(50))  # LOCAL_STORAGE, DATABASE
    resource_id = Column(String(100))
    metric_name = Column(String(100))  # DAILY_GROWTH_SURGE, IO_SPIKE, LATENCY_SPIKE
    severity = Column(String(20))  # MODERATE, HIGH, CRITICAL
    anomaly_score = Column(Float)
    expected_value = Column(Float)
    actual_value = Column(Float)
    description = Column(Text)
    is_resolved = Column(Boolean, default=False)

class RiskAlert(Base):
    __tablename__ = "risk_alerts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    org_id = Column(Integer, index=True, default=1)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    drive_name = Column(String(50), index=True)
    risk_level = Column(String(20))  # LOW, MODERATE, HIGH, CRITICAL
    title = Column(String(200))
    reason = Column(Text)
    recommended_action = Column(Text)
    is_resolved = Column(Boolean, default=False)

class OptimizationRecommendation(Base):
    __tablename__ = "optimization_recommendations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    org_id = Column(Integer, index=True, default=1)
    timestamp = Column(DateTime, default=datetime.utcnow)
    drive_name = Column(String(50))
    category = Column(String(50))  # TEMP_FILES, DUPLICATES, LARGE_FILES, CAPACITY, IO_LOAD, DB_INDEX_BLOAT
    issue = Column(String(255))
    expected_benefit = Column(String(255))
    estimated_recovery_bytes = Column(Float, default=0.0)
    risk_level = Column(String(20))  # LOW, MODERATE, HIGH
    recommended_action = Column(Text)
    target_paths_json = Column(Text, default="[]")
    status = Column(String(30), default="PENDING")  # PENDING, APPLIED, DISMISSED

class SimulationResult(Base):
    __tablename__ = "simulation_results"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    org_id = Column(Integer, index=True, default=1)
    timestamp = Column(DateTime, default=datetime.utcnow)
    scenario_name = Column(String(100))
    drive_name = Column(String(50))
    input_params_json = Column(Text)
    projected_usage_percent = Column(Float)
    projected_free_bytes = Column(Float)
    days_to_exhaustion = Column(Float, nullable=True)
    risk_before = Column(String(20))
    risk_after = Column(String(20))
    summary_text = Column(Text)

# --- Governance, Privacy Guard & Audit Models ---

class PrivacyPolicy(Base):
    __tablename__ = "privacy_policies"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, nullable=False)
    data_minimization_mode = Column(Boolean, default=True)  # Strictly metadata only
    mask_identifiers = Column(Boolean, default=True)
    retention_days = Column(Integer, default=30)
    enforce_tenant_isolation = Column(Boolean, default=True)
    credential_encryption_active = Column(Boolean, default=True)
    audit_level = Column(String(50), default="DETAILED")
    updated_at = Column(DateTime, default=datetime.utcnow)

class ApplicationSetting(Base):
    __tablename__ = "application_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text)
    updated_at = Column(DateTime, default=datetime.utcnow)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    org_id = Column(Integer, index=True, default=1)
    user_id = Column(Integer, nullable=True)
    user_email = Column(String(255), default="system@aegisstor.internal")
    request_id = Column(String(100), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    action_type = Column(String(100))  # AUTH_LOGIN, DB_CONNECT, SCAN_START, CLEANUP_EXEC, POLICY_CHANGE
    resource = Column(String(255))
    description = Column(Text)
    status = Column(String(30))  # SUCCESS, FAILED, WARNING
    details_json = Column(Text, default="{}")


# --- Enterprise Notifications, Alert Rules & Incident Management Subsystem ---

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    incident_number = Column(String(50), unique=True, index=True, nullable=False)
    org_id = Column(Integer, index=True, default=1)
    title = Column(String(255), nullable=False)
    category = Column(String(50), nullable=False)  # STORAGE, DATABASE, PERFORMANCE, AWS, AI_FORECAST, SECURITY
    severity = Column(String(20), nullable=False)  # INFO, WARNING, CRITICAL, EMERGENCY
    status = Column(String(30), default="OPEN", index=True)  # OPEN, ACKNOWLEDGED, RESOLVED, ESCALATED
    resource = Column(String(255), nullable=False)
    root_cause_evidence = Column(Text, nullable=True)
    recommended_action = Column(Text, nullable=True)
    related_telemetry_json = Column(Text, default="{}")
    escalation_level = Column(Integer, default=0)
    escalated_at = Column(DateTime, nullable=True)
    assigned_to_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    acknowledged_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    resolution_notes = Column(Text, nullable=True)

    notifications = relationship("Notification", back_populates="incident", cascade="all, delete-orphan")
    acknowledgements = relationship("IncidentAcknowledgement", back_populates="incident", cascade="all, delete-orphan")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    org_id = Column(Integer, index=True, default=1)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    event_id = Column(String(100), unique=True, index=True, nullable=False)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    category = Column(String(50), nullable=False)  # STORAGE, DATABASE, PERFORMANCE, AWS, AI_FORECAST, SECURITY, ANNOUNCEMENT
    severity = Column(String(20), nullable=False)  # INFO, WARNING, CRITICAL, EMERGENCY
    source = Column(String(100), default="AEGISSTOR_MONITOR")
    resource = Column(String(255), nullable=True)
    details_json = Column(Text, default="{}")
    is_read = Column(Boolean, default=False, index=True)
    read_at = Column(DateTime, nullable=True)
    is_archived = Column(Boolean, default=False, index=True)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    incident = relationship("Incident", back_populates="notifications")
    delivery_logs = relationship("NotificationDeliveryLog", back_populates="notification", cascade="all, delete-orphan")


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    org_id = Column(Integer, index=True, default=1)
    email_enabled = Column(Boolean, default=True)
    in_app_enabled = Column(Boolean, default=True)
    web_push_enabled = Column(Boolean, default=True)
    sms_enabled = Column(Boolean, default=False)
    aws_sns_enabled = Column(Boolean, default=False)
    notification_email = Column(String(255), nullable=True)
    notification_phone = Column(String(50), nullable=True)
    aws_sns_topic_arn = Column(String(255), nullable=True)
    min_severity_email = Column(String(20), default="WARNING")
    min_severity_in_app = Column(String(20), default="INFO")
    min_severity_web_push = Column(String(20), default="WARNING")
    min_severity_sms = Column(String(20), default="CRITICAL")
    min_severity_aws_sns = Column(String(20), default="CRITICAL")
    storage_warning_percent = Column(Float, default=80.0)
    storage_critical_percent = Column(Float, default=90.0)
    cpu_critical_percent = Column(Float, default=85.0)
    ram_critical_percent = Column(Float, default=90.0)
    quiet_hours_enabled = Column(Boolean, default=False)
    quiet_hours_start = Column(String(10), default="22:00")
    quiet_hours_end = Column(String(10), default="07:00")
    quiet_hours_timezone = Column(String(50), default="UTC")
    retention_days = Column(Integer, default=90)
    updated_at = Column(DateTime, default=datetime.utcnow)


class NotificationDeliveryLog(Base):
    __tablename__ = "notification_delivery_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    notification_id = Column(Integer, ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False, index=True)
    channel = Column(String(30), nullable=False)  # IN_APP, EMAIL, WEB_PUSH, SMS, AWS_SNS
    recipient = Column(String(255), nullable=False)
    status = Column(String(30), default="PENDING")  # DELIVERED, FAILED, RETRYING, SKIPPED_QUIET_HOURS, PENDING
    attempt_count = Column(Integer, default=1)
    provider_response = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    notification = relationship("Notification", back_populates="delivery_logs")


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    org_id = Column(Integer, index=True, default=1)
    name = Column(String(150), nullable=False)
    category = Column(String(50), nullable=False)  # STORAGE, DATABASE, PERFORMANCE, AWS, AI_FORECAST, SECURITY
    metric_key = Column(String(100), nullable=False)
    operator = Column(String(10), default=">=")
    warning_threshold = Column(Float, nullable=True)
    critical_threshold = Column(Float, nullable=True)
    emergency_threshold = Column(Float, nullable=True)
    is_enabled = Column(Boolean, default=True)
    cooldown_minutes = Column(Integer, default=30)
    auto_resolve = Column(Boolean, default=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    events = relationship("AlertEvent", back_populates="rule", cascade="all, delete-orphan")


class AlertEvent(Base):
    __tablename__ = "alert_events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    rule_id = Column(Integer, ForeignKey("alert_rules.id", ondelete="SET NULL"), nullable=True, index=True)
    org_id = Column(Integer, index=True, default=1)
    resource = Column(String(255), nullable=False)
    severity = Column(String(20), nullable=False)
    current_value = Column(Float, nullable=True)
    threshold_value = Column(Float, nullable=True)
    message = Column(Text, nullable=False)
    event_timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    is_suppressed = Column(Boolean, default=False)
    suppression_reason = Column(String(100), nullable=True)

    rule = relationship("AlertRule", back_populates="events")


class IncidentAcknowledgement(Base):
    __tablename__ = "incident_acknowledgements"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    user_email = Column(String(255), default="admin@aegisstor.local")
    action_type = Column(String(50), nullable=False)  # ACKNOWLEDGE, ASSIGN, ESCALATE, RESOLVE, COMMENT
    comment = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    incident = relationship("Incident", back_populates="acknowledgements")


class NotificationSubscription(Base):
    __tablename__ = "notification_subscriptions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint = Column(String(500), nullable=False)
    p256dh = Column(String(255), nullable=False)
    auth_key = Column(String(255), nullable=False)
    user_agent = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class SystemAnnouncement(Base):
    __tablename__ = "system_announcements"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    org_id = Column(Integer, index=True, default=1)
    version = Column(String(50), default="2.1.0")
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(50), default="FEATURE")  # FEATURE, MAINTENANCE, SECURITY_PATCH, SERVICE_STATUS, ML_UPDATE, AWS_UPDATE
    impact = Column(String(50), default="LOW")  # LOW, MEDIUM, HIGH
    is_active = Column(Boolean, default=True)
    created_by_user = Column(String(255), default="system@aegisstor.internal")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
