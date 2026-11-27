"""
Database Session, Schema Migration & Enterprise Seeding
Configured for SQLite WAL mode, connection busy_timeout, and retry handling.
"""
import time
import random
import logging
from datetime import datetime
from sqlalchemy import create_engine, text, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError

from app.core.config import DATABASE_URL, IS_SQLITE
from app.models.database import (
    Base, Organization, User, PrivacyPolicy, ApplicationSetting,
    HistoricalTelemetry, StorageTelemetry, PerformanceTelemetry,
    SecurityEvent, SecurityScanResult, PrivacyEvent, PrivacyScanResult
)
from app.security.hasher import hash_password

logger = logging.getLogger("aegisstor.database")

# 1. Engine configuration with dialect-specific settings
if IS_SQLITE:
    engine = create_engine(
        DATABASE_URL,
        connect_args={
            "check_same_thread": False,
            "timeout": 60.0
        },
        pool_pre_ping=True
    )

    # 2. Connection-level SQLite PRAGMAs: WAL mode, 60s busy_timeout, NORMAL synchronous
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA busy_timeout=60000;")
            cursor.execute("PRAGMA synchronous=NORMAL;")
            cursor.execute("PRAGMA foreign_keys=ON;")
        finally:
            cursor.close()
else:
    # Standard connection pooling for PostgreSQL / MySQL in cloud environments (e.g. Render)
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def is_sqlite_lock_error(e: Exception) -> bool:
    """Determine whether an exception is an SQLite busy or locked condition."""
    msg = str(e).lower()
    return "database is locked" in msg or "database table is locked" in msg or "busy" in msg or (
        isinstance(e, OperationalError) and "locked" in msg
    )

def execute_with_db_retry(func, max_retries: int = 5, initial_delay: float = 0.05, backoff: float = 2.0):
    """
    Executes a database operation with bounded exponential backoff on SQLite lock/busy.
    Does not retry unrelated errors.
    """
    delay = initial_delay
    last_err = None
    for attempt in range(max_retries):
        try:
            return func()
        except Exception as e:
            if is_sqlite_lock_error(e) and attempt < max_retries - 1:
                jitter = random.uniform(0.5, 1.5)
                time.sleep(delay * jitter)
                delay *= backoff
                last_err = e
                logger.warning(f"[SQLite Retry] Attempt {attempt + 1}/{max_retries} due to lock: {e}")
                continue
            raise
    if last_err:
        raise last_err

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)
    
    # Safe SQLite column migrations for existing tables
    if IS_SQLITE:
        with engine.connect() as conn:
            tables_to_migrate = [
                ("storage_telemetry", "org_id", "INTEGER DEFAULT 1"),
                ("performance_telemetry", "org_id", "INTEGER DEFAULT 1"),
                ("scan_results", "org_id", "INTEGER DEFAULT 1"),
                ("forecast_results", "org_id", "INTEGER DEFAULT 1"),
                ("forecast_results", "resource_type", "VARCHAR(50) DEFAULT 'LOCAL_DISK'"),
                ("forecast_results", "resource_name", "VARCHAR(150)"),
                ("forecast_results", "horizon_days", "INTEGER"),
                ("risk_alerts", "org_id", "INTEGER DEFAULT 1"),
                ("optimization_recommendations", "org_id", "INTEGER DEFAULT 1"),
                ("simulation_results", "org_id", "INTEGER DEFAULT 1"),
                ("audit_logs", "org_id", "INTEGER DEFAULT 1"),
                ("audit_logs", "user_id", "INTEGER"),
                ("audit_logs", "user_email", "VARCHAR(255)"),
                ("audit_logs", "request_id", "VARCHAR(100)"),
                ("audit_logs", "resource", "VARCHAR(255)"),
                ("users", "must_change_password", "BOOLEAN DEFAULT 0"),
                ("privacy_policies", "detect_sensitive_data", "BOOLEAN DEFAULT 1"),
                ("privacy_policies", "sensitive_detection_categories", "VARCHAR(255) DEFAULT 'EMAIL,PHONE,IP,CREDENTIAL,AWS_KEY,TOKEN'"),
                ("privacy_policies", "auto_mask_telemetry", "BOOLEAN DEFAULT 1"),
            ]
            for tbl, col, col_type in tables_to_migrate:
                try:
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN {col} {col_type};"))
                    conn.commit()
                except Exception:
                    # Column already exists
                    pass

    db = SessionLocal()
    try:
        # 1. Seed Default Organization
        default_org = db.query(Organization).filter(Organization.id == 1).first()
        if not default_org:
            default_org = Organization(
                id=1,
                name="Primary Enterprise Organization",
                slug="primary-enterprise",
                industry_type="Financial / Healthcare",
                status="ACTIVE"
            )
            db.add(default_org)
            db.flush()

        # 2. Seed Default Super Admin User
        admin_user = db.query(User).filter(User.email == "admin@aegisstor.internal").first()
        if not admin_user:
            admin_user = User(
                id=1,
                org_id=1,
                email="admin@aegisstor.internal",
                full_name="Enterprise Security Administrator",
                password_hash=hash_password("AdminPassword@2026!"),
                role="SUPER_ADMIN",
                is_active=True
            )
            db.add(admin_user)
            db.flush()

        # 3. Seed Default Privacy Policy
        policy = db.query(PrivacyPolicy).filter(PrivacyPolicy.org_id == 1).first()
        if not policy:
            policy = PrivacyPolicy(
                org_id=1,
                data_minimization_mode=True,
                mask_identifiers=True,
                retention_days=30,
                enforce_tenant_isolation=True,
                credential_encryption_active=True,
                audit_level="DETAILED"
            )
            db.add(policy)

        # 4. Seed Default Application Settings
        default_settings = {
            "telemetry_interval_sec": "5",
            "warning_usage_percent": "80.0",
            "critical_usage_percent": "90.0",
            "runway_warning_days": "30.0",
            "runway_critical_days": "7.0",
            "excluded_scan_paths": "Windows,System Volume Information,$Recycle.Bin,WinSxS,pagefile.sys,hiberfil.sys",
            "retention_days": "30"
        }
        for k, v in default_settings.items():
            existing = db.query(ApplicationSetting).filter(ApplicationSetting.key == k).first()
            if not existing:
                db.add(ApplicationSetting(key=k, value=v))

        # 5. Seed Enterprise Alert Rules (Phase 2)
        from app.models.database import AlertRule, SystemAnnouncement, NotificationPreference
        default_rules = [
            # Storage Rules
            {"name": "Storage Utilization 70%", "category": "STORAGE", "metric_key": "storage_usage_percent", "operator": ">=", "warning_threshold": 70.0, "critical_threshold": None, "emergency_threshold": None, "cooldown_minutes": 30, "auto_resolve": True, "description": "Early capacity warning when storage utilization exceeds 70%."},
            {"name": "Storage Utilization 80%", "category": "STORAGE", "metric_key": "storage_usage_percent", "operator": ">=", "warning_threshold": 80.0, "critical_threshold": None, "emergency_threshold": None, "cooldown_minutes": 30, "auto_resolve": True, "description": "Moderate capacity alert when volume usage exceeds 80%."},
            {"name": "Storage Utilization 90%", "category": "STORAGE", "metric_key": "storage_usage_percent", "operator": ">=", "warning_threshold": None, "critical_threshold": 90.0, "emergency_threshold": None, "cooldown_minutes": 15, "auto_resolve": True, "description": "High urgency alert when storage usage exceeds 90%."},
            {"name": "Storage Utilization 95%", "category": "STORAGE", "metric_key": "storage_usage_percent", "operator": ">=", "warning_threshold": None, "critical_threshold": None, "emergency_threshold": 95.0, "cooldown_minutes": 10, "auto_resolve": True, "description": "Imminent storage exhaustion alert when volume usage exceeds 95%."},
            {"name": "Low Disk Headroom", "category": "STORAGE", "metric_key": "storage_headroom_gb", "operator": "<=", "warning_threshold": 20.0, "critical_threshold": 10.0, "emergency_threshold": 5.0, "cooldown_minutes": 15, "auto_resolve": True, "description": "Available free headroom is severely constrained for paging and transaction logs."},
            {"name": "Storage Volume Inaccessible", "category": "STORAGE", "metric_key": "storage_unavailable", "operator": "==", "warning_threshold": None, "critical_threshold": 1.0, "emergency_threshold": None, "cooldown_minutes": 10, "auto_resolve": True, "description": "Storage volume disconnected or unreadable by system storage APIs."},

            # Database Security Rules
            {"name": "Database Auth Failures", "category": "DATABASE", "metric_key": "db_auth_failures", "operator": ">=", "warning_threshold": 2.0, "critical_threshold": 3.0, "emergency_threshold": 5.0, "cooldown_minutes": 15, "auto_resolve": True, "description": "Repeated failed authentication attempts on enterprise database."},
            {"name": "Database Suspicious Query", "category": "DATABASE", "metric_key": "db_suspicious_query", "operator": ">=", "warning_threshold": None, "critical_threshold": 1.0, "emergency_threshold": 3.0, "cooldown_minutes": 15, "auto_resolve": False, "description": "SQL injection signatures or unauthorized query patterns detected."},

            # System Performance Rules
            {"name": "High Host CPU Load", "category": "PERFORMANCE", "metric_key": "cpu_percent", "operator": ">=", "warning_threshold": 85.0, "critical_threshold": 95.0, "emergency_threshold": 99.0, "cooldown_minutes": 15, "auto_resolve": True, "description": "High CPU utilization sustained across physical and logical cores."},
            {"name": "High Host RAM Load", "category": "PERFORMANCE", "metric_key": "ram_percent", "operator": ">=", "warning_threshold": 90.0, "critical_threshold": 95.0, "emergency_threshold": 99.0, "cooldown_minutes": 15, "auto_resolve": True, "description": "Physical RAM consumption approaching host capacity limit."},

            # AWS S3 Cloud Storage Rules
            {"name": "AWS Credentials Expired", "category": "AWS", "metric_key": "aws_credentials_status", "operator": "==", "warning_threshold": None, "critical_threshold": 0.0, "emergency_threshold": None, "cooldown_minutes": 20, "auto_resolve": True, "description": "AWS STS verification failed or session token expired for profile aegisstor."},
            {"name": "AWS Public Access Unblocked", "category": "AWS", "metric_key": "aws_public_access_unblocked", "operator": "==", "warning_threshold": None, "critical_threshold": None, "emergency_threshold": 1.0, "cooldown_minutes": 10, "auto_resolve": False, "description": "Bucket Block Public Access protection altered or disabled."},
            {"name": "AWS S3 Encryption Disabled", "category": "AWS", "metric_key": "aws_encryption_disabled", "operator": "==", "warning_threshold": None, "critical_threshold": 1.0, "emergency_threshold": None, "cooldown_minutes": 15, "auto_resolve": False, "description": "Server-side encryption is disabled or non-compliant with AES256 standards."},

            # AI Forecasting Rules
            {"name": "AI Capacity Exhaustion Imminent", "category": "AI_FORECAST", "metric_key": "forecast_exhaustion_days", "operator": "<=", "warning_threshold": 30.0, "critical_threshold": 14.0, "emergency_threshold": 7.0, "cooldown_minutes": 60, "auto_resolve": True, "description": "Machine learning forecast predicts volume capacity exhaustion within runway window."}
        ]
        for rule_data in default_rules:
            existing_rule = db.query(AlertRule).filter(AlertRule.name == rule_data["name"]).first()
            if not existing_rule:
                db.add(AlertRule(org_id=1, **rule_data))

        # 6. Seed Verified System Announcements (Phase 8)
        default_announcements = [
            {
                "version": "2.1.0",
                "title": "AEGISSTOR 2.1.0 Notification & Incident Management Active",
                "description": "Enterprise-grade event-driven notification engine with multi-channel dispatch (In-App, Email, Push, SMS, SNS) and incident escalation tracking.",
                "category": "FEATURE",
                "impact": "LOW",
                "is_active": True
            },
            {
                "version": "2.0.2",
                "title": "AWS S3 Cloud Telemetry Engine Synchronized",
                "description": "Verified integration with AWS profile aegisstor in ap-southeast-2. Monitored bucket aegisstor-mon-425178888081-ap-southeast-2-an with SSE-S3 AES256 encryption.",
                "category": "AWS_UPDATE",
                "impact": "LOW",
                "is_active": True
            },
            {
                "version": "2.0.1",
                "title": "Predictive 6-Model Forecasting Tournament Enabled",
                "description": "Tournament evaluation featuring Seasonal Naive, Moving Average, Linear Regression, Ridge Regression, Random Forest, and LightGBM with rolling-origin backtesting.",
                "category": "ML_UPDATE",
                "impact": "MEDIUM",
                "is_active": True
            },
            {
                "version": "2.0.0",
                "title": "Enterprise Security Subsystem & Argon2id Hardening",
                "description": "Implemented OWASP-compliant Argon2id password hashing, AES-256-GCM authenticated credential encryption, and MFA replay protection.",
                "category": "SECURITY_PATCH",
                "impact": "HIGH",
                "is_active": True
            }
        ]
        for ann in default_announcements:
            existing_ann = db.query(SystemAnnouncement).filter(SystemAnnouncement.title == ann["title"]).first()
            if not existing_ann:
                db.add(SystemAnnouncement(org_id=1, **ann))

        # 7. Seed Default Notification Preferences for Super Admin
        admin_user = db.query(User).filter(User.email == "admin@aegisstor.local").first()
        if admin_user:
            admin_pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == admin_user.id).first()
            if not admin_pref:
                db.add(NotificationPreference(
                    user_id=admin_user.id,
                    org_id=1,
                    email_enabled=True,
                    in_app_enabled=True,
                    web_push_enabled=True,
                    sms_enabled=False,
                    aws_sns_enabled=False,
                    notification_email=admin_user.email,
                    min_severity_email="WARNING",
                    min_severity_in_app="INFO",
                    min_severity_web_push="WARNING",
                    min_severity_sms="CRITICAL",
                    min_severity_aws_sns="CRITICAL",
                    storage_warning_percent=80.0,
                    storage_critical_percent=90.0,
                    cpu_critical_percent=85.0,
                    ram_critical_percent=90.0,
                    quiet_hours_enabled=False,
                    retention_days=90
                ))

        # 8. Seed Default Active Database Connection (Internal SQLite Storage Engine)
        from app.models.database import DatabaseConnection
        from app.security.crypto import encrypt_credential
        existing_db_conn = db.query(DatabaseConnection).filter(DatabaseConnection.name == "AEGISSTOR Internal SQLite Engine").first()
        if not existing_db_conn:
            sqlite_conn = DatabaseConnection(
                org_id=1,
                name="AEGISSTOR Internal SQLite Engine",
                db_type="SQLITE",
                host="localhost",
                port=0,
                database_name="aegisstor.db",
                username="app",
                encrypted_password=encrypt_credential("internal"),
                ssl_mode="prefer",
                is_active=True,
                status_message="Connected (Active Local Engine)",
                last_sync_at=datetime.utcnow()
            )
            db.add(sqlite_conn)

        # 9. Verify and backfill HistoricalTelemetry if newly created and existing telemetry exists
        hist_count = db.query(HistoricalTelemetry).count()
        if hist_count == 0:
            storage_rows = (
                db.query(StorageTelemetry)
                .order_by(StorageTelemetry.timestamp.asc())
                .all()
            )
            if storage_rows:
                perf_rows = (
                    db.query(PerformanceTelemetry)
                    .order_by(PerformanceTelemetry.timestamp.asc())
                    .all()
                )
                perf_idx = 0
                perf_len = len(perf_rows)
                backfill_entries = []
                for s in storage_rows:
                    cpu_p = 0.0
                    ram_p = 0.0
                    ram_u_gb = 0.0
                    ram_a_gb = 0.0
                    while perf_idx < perf_len - 1 and perf_rows[perf_idx + 1].timestamp <= s.timestamp:
                        perf_idx += 1
                    if perf_len > 0:
                        p = perf_rows[perf_idx]
                        cpu_p = p.cpu_percent or 0.0
                        ram_p = p.memory_percent or 0.0
                        ram_u_gb = round((p.memory_used or 0.0) / (1024 ** 3), 2)
                        ram_a_gb = round((p.memory_free or 0.0) / (1024 ** 3), 2)

                    entry = HistoricalTelemetry(
                        org_id=s.org_id or 1,
                        timestamp_utc=s.timestamp,
                        device_id=s.drive_name or "C:",
                        total_storage_gb=round((s.total_bytes or 0.0) / (1024 ** 3), 2),
                        used_storage_gb=round((s.used_bytes or 0.0) / (1024 ** 3), 2),
                        free_storage_gb=round((s.free_bytes or 0.0) / (1024 ** 3), 2),
                        utilization_percent=s.usage_percent or 0.0,
                        cpu_percent=cpu_p,
                        ram_percent=ram_p,
                        ram_used_gb=ram_u_gb,
                        ram_available_gb=ram_a_gb,
                        disk_read_mb_s=round((s.read_bytes_sec or 0.0) / (1024 * 1024), 2),
                        disk_write_mb_s=round((s.write_bytes_sec or 0.0) / (1024 * 1024), 2),
                        collection_status="VERIFIED"
                    )
                    backfill_entries.append(entry)
                if backfill_entries:
                    db.bulk_save_objects(backfill_entries)
                    logger.info(f"[init_db] Migrated/backfilled {len(backfill_entries)} records into historical_telemetry.")

        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"[Database Init Error] {e}", exc_info=True)
        print(f"[Database Init Error] {e}")
        raise
    finally:
        db.close()

