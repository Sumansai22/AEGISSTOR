"""
AEGISSTOR Enterprise REST API v1
"""
import os
import json
import psutil
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, UploadFile, File, Form, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.session import get_db, SessionLocal
from app.models.database import (
    Organization, User, UserSession, DatabaseConnection, DatabaseTelemetry,
    StorageTelemetry, PerformanceTelemetry, ScanResult, ForecastResult,
    StorageAnomaly, RiskAlert, OptimizationRecommendation, SimulationResult,
    PrivacyPolicy, ApplicationSetting, AuditLog
)
from app.security.hasher import hash_password, verify_password
from app.security.tokens import (
    create_access_token, create_refresh_token, decode_token, revoke_token
)
from app.security.crypto import (
    encrypt_credential, decrypt_credential, get_crypto_specifications
)
from app.security.mfa import generate_mfa_secret, get_mfa_provisioning_uri, verify_totp_code
from app.security.rbac import get_current_user_token, require_role, UserRole

from app.services.storage_monitor import storage_monitor
from app.services.performance_monitor import performance_monitor
from app.services.storage_scanner import storage_scanner
from app.services.risk_engine import risk_engine
from app.services.optimization_engine import optimization_engine
from app.services.digital_twin import digital_twin_service
from app.services.aws_service import aws_service
from app.services.historical_pipeline import historical_pipeline
from app.services.predictive_forecasting import predictive_forecasting_service
from app.collectors.database_collector import database_collector
from app.connectors.factory import get_connector
from app.ml.engine import ml_engine
from app.privacy.guard import privacy_guard
from app.security.service import security_service

api_v1 = APIRouter()

# --- Schemas ---

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str
    confirm_password: str

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    org_id: Optional[int] = 1
    role: Optional[str] = "VIEWER"

class LoginRequest(BaseModel):
    email: str
    password: str
    totp_code: Optional[str] = None

class MFASetupResponse(BaseModel):
    secret: str
    provisioning_uri: str

class MFAVerifyRequest(BaseModel):
    code: Optional[str] = None
    totp_code: Optional[str] = None

class DatabaseConnectionCreate(BaseModel):
    name: str
    db_type: str  # POSTGRESQL, MYSQL, SQL_SERVER, ORACLE
    host: str
    port: int
    database_name: str
    username: str
    password: str
    ssl_mode: Optional[str] = "prefer"

class SimulationRunRequest(BaseModel):
    drive_name: str
    monthly_growth_rate_percent: Optional[float] = 0.0
    removed_unnecessary_files_gb: Optional[float] = 0.0
    capacity_expansion_gb: Optional[float] = 0.0
    continuation_days: Optional[int] = 90
    scenario_title: Optional[str] = None

class ScanTriggerRequest(BaseModel):
    target_path: str
    max_files: Optional[int] = 30000
    max_depth: Optional[int] = 4

# =========================================================================
# 1. AUTHENTICATION & IDENTITY (/api/v1/auth)
# =========================================================================

@api_v1.post("/auth/register")
def register_user(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email.strip().lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="A user with this email address already exists.")

    new_user = User(
        org_id=payload.org_id or 1,
        email=payload.email.strip().lower(),
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        role=payload.role if payload.role in [r.value for r in UserRole] else UserRole.VIEWER.value,
        is_active=True
    )
    db.add(new_user)
    db.add(AuditLog(
        org_id=payload.org_id or 1,
        action_type="USER_REGISTER",
        resource="Auth",
        description=f"User {new_user.email} registered with role {new_user.role}",
        status="SUCCESS"
    ))
    db.commit()
    db.refresh(new_user)

    access_token = create_access_token(new_user.id, new_user.org_id, new_user.role, new_user.email)
    refresh_token = create_refresh_token(new_user.id, new_user.org_id)
    return {
        "status": "SUCCESS",
        "user_id": new_user.id,
        "email": new_user.email,
        "role": new_user.role,
        "access_token": access_token,
        "refresh_token": refresh_token
    }

@api_v1.post("/auth/login")
def login_user(payload: LoginRequest, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()

    if not user or not verify_password(payload.password, user.password_hash):
        if user:
            user.failed_login_attempts += 1
            db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated. Contact administrator.")

    # MFA Verification if enabled
    if user.mfa_enabled and user.mfa_secret:
        if not payload.totp_code or not verify_totp_code(user.mfa_secret, payload.totp_code):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Valid 6-digit MFA code required.")

    user.failed_login_attempts = 0
    user.last_login_at = datetime.utcnow()

    # Check if default administrator password is still in use
    is_default_admin_pwd = (
        user.email == "admin@aegisstor.internal" and 
        verify_password("AdminPassword@2026!", user.password_hash)
    )
    must_change = bool(user.must_change_password or is_default_admin_pwd)

    access_token = create_access_token(user.id, user.org_id, user.role, user.email)
    refresh_token = create_refresh_token(user.id, user.org_id)

    # Record active session with token JTI
    decoded_access = decode_token(access_token, check_revocation=False)
    jti = decoded_access.get("jti") if decoded_access else None
    if jti:
        session_rec = UserSession(
            user_id=user.id,
            token_jti=jti,
            expires_at=datetime.utcnow() + timedelta(minutes=60),
            is_revoked=False
        )
        db.add(session_rec)

    db.add(AuditLog(
        org_id=user.org_id,
        user_id=user.id,
        user_email=user.email,
        action_type="AUTH_LOGIN",
        resource="Auth",
        description=f"User logged in successfully (Role: {user.role})",
        status="SUCCESS"
    ))
    db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "must_change_password": must_change,
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "org_id": user.org_id,
            "mfa_enabled": user.mfa_enabled,
            "must_change_password": must_change
        }
    }

@api_v1.post("/auth/change-password")
def change_password(
    payload: ChangePasswordRequest,
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_token["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(payload.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password verification failed.")

    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="New password and confirmation do not match.")

    # Complexity validation: >= 10 chars, upper, lower, digit, special
    new_pwd = payload.new_password
    if len(new_pwd) < 10:
        raise HTTPException(status_code=400, detail="New password must be at least 10 characters long.")
    if not any(c.isupper() for c in new_pwd):
        raise HTTPException(status_code=400, detail="New password must include at least one uppercase letter.")
    if not any(c.islower() for c in new_pwd):
        raise HTTPException(status_code=400, detail="New password must include at least one lowercase letter.")
    if not any(c.isdigit() for c in new_pwd):
        raise HTTPException(status_code=400, detail="New password must include at least one number.")
    special_chars = set("!@#$%^&*()_+-=[]{}|;:,.<>?")
    if not any(c in special_chars for c in new_pwd):
        raise HTTPException(status_code=400, detail="New password must include at least one special character.")

    if new_pwd == "AdminPassword@2026!":
        raise HTTPException(status_code=400, detail="Cannot reuse the default installation password.")

    # Apply new hash using Argon2id
    user.password_hash = hash_password(new_pwd)
    user.must_change_password = False

    # Revoke current token and all existing user sessions
    revoke_token(user_token.get("jti"))
    active_sessions = db.query(UserSession).filter(UserSession.user_id == user.id).all()
    for s in active_sessions:
        s.is_revoked = True
        if s.token_jti:
            revoke_token(s.token_jti)

    # Generate fresh rotated tokens
    new_access = create_access_token(user.id, user.org_id, user.role, user.email)
    new_refresh = create_refresh_token(user.id, user.org_id)

    db.add(AuditLog(
        org_id=user.org_id,
        user_id=user.id,
        user_email=user.email,
        action_type="PASSWORD_CHANGE",
        resource="Auth",
        description="Password updated and old sessions invalidated.",
        status="SUCCESS"
    ))
    db.commit()

    return {
        "status": "SUCCESS",
        "message": "Password changed successfully. Default credentials invalidated.",
        "access_token": new_access,
        "refresh_token": new_refresh
    }

@api_v1.post("/auth/refresh")
def refresh_access_token(payload: RefreshTokenRequest, db: Session = Depends(get_db)):
    decoded = decode_token(payload.refresh_token)
    if not decoded or decoded.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token.")

    user = db.query(User).filter(User.id == decoded["user_id"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account is inactive.")

    # Refresh Token Rotation: Revoke the presented refresh token
    old_jti = decoded.get("jti")
    if old_jti:
        revoke_token(old_jti)

    new_access = create_access_token(user.id, user.org_id, user.role, user.email)
    new_refresh = create_refresh_token(user.id, user.org_id)

    return {
        "access_token": new_access,
        "refresh_token": new_refresh,
        "token_type": "bearer"
    }

@api_v1.post("/auth/logout")
def logout_user(user_token: dict = Depends(get_current_user_token), db: Session = Depends(get_db)):
    jti = user_token.get("jti")
    if jti:
        revoke_token(jti)
        session_rec = db.query(UserSession).filter(UserSession.token_jti == jti).first()
        if session_rec:
            session_rec.is_revoked = True

    db.add(AuditLog(
        org_id=user_token.get("org_id", 1),
        user_id=user_token.get("user_id"),
        user_email=user_token.get("email"),
        action_type="AUTH_LOGOUT",
        resource="Auth",
        description="User logged out; active token revoked.",
        status="SUCCESS"
    ))
    db.commit()
    return {"status": "SUCCESS", "message": "Successfully logged out."}

@api_v1.get("/crypto/specifications")
def get_crypto_specs(user_token: dict = Depends(get_current_user_token)):
    return get_crypto_specifications()


@api_v1.post("/auth/mfa/setup")
def setup_mfa(user_token: dict = Depends(get_current_user_token), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_token["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    secret = generate_mfa_secret()
    user.mfa_secret = secret
    db.commit()

    uri = get_mfa_provisioning_uri(secret, user.email)
    return {"secret": secret, "provisioning_uri": uri}

@api_v1.post("/auth/mfa/enable")
@api_v1.post("/auth/mfa/verify")
def enable_mfa(payload: MFAVerifyRequest, user_token: dict = Depends(get_current_user_token), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_token["user_id"]).first()
    if not user or not user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA setup has not been initiated.")

    token_code = payload.totp_code or payload.code
    if not token_code:
        raise HTTPException(status_code=400, detail="Missing TOTP verification code.")

    if not verify_totp_code(user.mfa_secret, token_code):
        security_service.record_security_event(
            event_type="AUTH_FAILURE",
            action="MFA_VERIFY",
            result="FAILED",
            severity="HIGH",
            user_identifier=user.email,
            org_id=user.org_id
        )
        raise HTTPException(status_code=400, detail="Invalid verification code. Could not verify TOTP token.")

    user.mfa_enabled = True
    db.commit()

    security_service.record_security_event(
        event_type="AUTH_SUCCESS",
        action="MFA_ACTIVATED",
        result="SUCCESS",
        severity="INFO",
        user_identifier=user.email,
        org_id=user.org_id
    )
    return {"status": "SUCCESS", "message": "Multi-Factor Authentication verified and enabled successfully."}

@api_v1.post("/auth/logout")
def logout_user(user_token: dict = Depends(get_current_user_token)):
    jti = user_token.get("jti")
    if jti:
        revoke_token(jti)
    security_service.record_security_event(
        event_type="AUTH_LOGOUT",
        action="USER_LOGOUT",
        result="SUCCESS",
        user_identifier=user_token.get("email", "unknown"),
        org_id=user_token.get("org_id", 1)
    )
    return {"status": "SUCCESS", "message": "User session terminated and token revoked successfully."}

@api_v1.get("/auth/me")
def get_current_profile(user_token: dict = Depends(get_current_user_token), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_token["user_id"]).first()
    if not user:
        return user_token
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "org_id": user.org_id,
        "mfa_enabled": user.mfa_enabled,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None
    }

# =========================================================================
# 2. USER & TENANT GOVERNANCE (/api/v1/users & /api/v1/organizations)
# =========================================================================

@api_v1.get("/users")
@api_v1.get("/users/")
def list_organization_users(
    user_token: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.DATABASE_ADMIN])),
    db: Session = Depends(get_db)
):
    users = db.query(User).filter(User.org_id == user_token["org_id"]).all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "mfa_enabled": u.mfa_enabled,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None
        }
        for u in users
    ]

@api_v1.get("/organizations")
def list_organizations(
    user_token: dict = Depends(require_role([UserRole.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    orgs = db.query(Organization).all()
    return [
        {
            "id": o.id,
            "name": o.name,
            "slug": o.slug,
            "industry_type": o.industry_type,
            "status": o.status
        }
        for o in orgs
    ]

# =========================================================================
# 3. ENTERPRISE DATABASE INTELLIGENCE (/api/v1/databases)
# =========================================================================

@api_v1.get("/databases")
@api_v1.get("/databases/")
def list_database_connections(
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    conns = db.query(DatabaseConnection).filter(DatabaseConnection.org_id == user_token["org_id"]).all()
    if not conns:
        # Auto-register local SQLite engine if no connection exists
        sqlite_conn = DatabaseConnection(
            org_id=user_token["org_id"],
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
        db.commit()
        db.refresh(sqlite_conn)
        conns = [sqlite_conn]

    return [
        {
            "id": c.id,
            "name": c.name,
            "db_type": c.db_type,
            "host": c.host,
            "port": c.port,
            "database_name": c.database_name,
            "username": c.username,
            "is_active": c.is_active,
            "last_sync_at": c.last_sync_at.isoformat() if c.last_sync_at else None,
            "status_message": c.status_message
        }
        for c in conns
    ]

@api_v1.post("/databases")
@api_v1.post("/databases/")
def create_database_connection(
    payload: DatabaseConnectionCreate,
    user_token: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.DATABASE_ADMIN])),
    db: Session = Depends(get_db)
):
    encrypted_pw = encrypt_credential(payload.password or "none")
    new_conn = DatabaseConnection(
        org_id=user_token["org_id"],
        name=payload.name.strip(),
        db_type=payload.db_type.upper().strip(),
        host=payload.host.strip(),
        port=payload.port or 0,
        database_name=payload.database_name.strip(),
        username=payload.username.strip(),
        encrypted_password=encrypted_pw,
        ssl_mode=payload.ssl_mode or "prefer",
        is_active=True,
        status_message="Registered (Pending Verification)"
    )
    db.add(new_conn)
    db.add(AuditLog(
        org_id=user_token["org_id"],
        user_id=user_token["user_id"],
        action_type="DB_CONNECTION_CREATE",
        resource=f"{payload.db_type}://{payload.host}:{payload.port}/{payload.database_name}",
        description=f"Created enterprise database connector: {payload.name}",
        status="SUCCESS"
    ))
    db.commit()
    db.refresh(new_conn)
    return {"status": "SUCCESS", "connection_id": new_conn.id, "name": new_conn.name}

@api_v1.post("/databases/{conn_id}/test")
def test_database_connection(
    conn_id: int,
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    conn = db.query(DatabaseConnection).filter(
        DatabaseConnection.id == conn_id,
        DatabaseConnection.org_id == user_token["org_id"]
    ).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Database connection record not found")

    plain_pw = decrypt_credential(conn.encrypted_password)
    connector = get_connector(conn.db_type, conn.host, conn.port, conn.database_name, conn.username, plain_pw, conn.ssl_mode)
    res = connector.test_connection()
    conn.status_message = "Connected (Live)" if res.get("connected") else "Connection Failed"
    conn.last_sync_at = datetime.utcnow()
    db.commit()
    return res

@api_v1.post("/databases/{conn_id}/sync")
def sync_database_connection(
    conn_id: int,
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    conn = db.query(DatabaseConnection).filter(
        DatabaseConnection.id == conn_id,
        DatabaseConnection.org_id == user_token["org_id"]
    ).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Database connection record not found")

    plain_pw = decrypt_credential(conn.encrypted_password)
    connector = get_connector(conn.db_type, conn.host, conn.port, conn.database_name, conn.username, plain_pw, conn.ssl_mode)
    storage_meta = connector.collect_storage_metadata()
    perf_meta = connector.collect_performance_metadata()

    prev_rec = (
        db.query(DatabaseTelemetry)
        .filter(DatabaseTelemetry.db_connection_id == conn.id)
        .order_by(DatabaseTelemetry.timestamp.desc())
        .first()
    )
    growth_rate = 0.0
    if prev_rec:
        time_diff = (datetime.utcnow() - prev_rec.timestamp).total_seconds()
        if time_diff > 0:
            growth_rate = max(0.0, (storage_meta["total_size_bytes"] - prev_rec.total_size_bytes) / (time_diff / 86400.0))

    telemetry_entry = DatabaseTelemetry(
        org_id=conn.org_id,
        db_connection_id=conn.id,
        timestamp=datetime.utcnow(),
        total_size_bytes=storage_meta["total_size_bytes"],
        data_size_bytes=storage_meta["data_size_bytes"],
        index_size_bytes=storage_meta["index_size_bytes"],
        table_count=storage_meta["table_count"],
        active_connections=perf_meta["active_connections"],
        query_latency_ms=perf_meta["query_latency_ms"],
        read_throughput_mb_s=perf_meta["read_throughput_mb_s"],
        write_throughput_mb_s=perf_meta["write_throughput_mb_s"],
        growth_rate_daily_bytes=growth_rate,
        top_tables_json=json.dumps(storage_meta.get("top_tables", []))
    )
    db.add(telemetry_entry)
    conn.last_sync_at = datetime.utcnow()
    conn.status_message = "Connected (Live Telemetry Synced)"
    db.commit()

    return {
        "status": "SUCCESS",
        "message": f"Successfully synced telemetry for {conn.name}",
        "total_size_gb": round(storage_meta["total_size_bytes"] / (1024 ** 3), 2),
        "data_size_gb": round(storage_meta["data_size_bytes"] / (1024 ** 3), 2),
        "index_size_gb": round(storage_meta["index_size_bytes"] / (1024 ** 3), 2),
        "total_bytes": storage_meta["total_size_bytes"],
        "data_bytes": storage_meta["data_size_bytes"],
        "index_bytes": storage_meta["index_size_bytes"],
        "table_count": storage_meta["table_count"],
        "query_latency_ms": perf_meta["query_latency_ms"]
    }

@api_v1.post("/databases/sync-all")
def trigger_all_database_sync(
    user_token: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.DATABASE_ADMIN]))
):
    results = database_collector.collect_all_active_databases(org_id=user_token["org_id"])
    return {"status": "COMPLETED", "sync_results": results}

@api_v1.get("/databases/{conn_id}/telemetry")
def get_database_telemetry(
    conn_id: int,
    limit: int = 30,
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    records = (
        db.query(DatabaseTelemetry)
        .filter(DatabaseTelemetry.db_connection_id == conn_id, DatabaseTelemetry.org_id == user_token["org_id"])
        .order_by(DatabaseTelemetry.timestamp.desc())
        .limit(limit)
        .all()
    )
    # If no records exist, auto-sync once on the fly
    if not records:
        conn = db.query(DatabaseConnection).filter(
            DatabaseConnection.id == conn_id,
            DatabaseConnection.org_id == user_token["org_id"]
        ).first()
        if conn:
            plain_pw = decrypt_credential(conn.encrypted_password)
            connector = get_connector(conn.db_type, conn.host, conn.port, conn.database_name, conn.username, plain_pw, conn.ssl_mode)
            storage_meta = connector.collect_storage_metadata()
            perf_meta = connector.collect_performance_metadata()
            entry = DatabaseTelemetry(
                org_id=conn.org_id,
                db_connection_id=conn.id,
                timestamp=datetime.utcnow(),
                total_size_bytes=storage_meta["total_size_bytes"],
                data_size_bytes=storage_meta["data_size_bytes"],
                index_size_bytes=storage_meta["index_size_bytes"],
                table_count=storage_meta["table_count"],
                active_connections=perf_meta["active_connections"],
                query_latency_ms=perf_meta["query_latency_ms"],
                read_throughput_mb_s=perf_meta["read_throughput_mb_s"],
                write_throughput_mb_s=perf_meta["write_throughput_mb_s"],
                growth_rate_daily_bytes=0.0,
                top_tables_json=json.dumps(storage_meta.get("top_tables", []))
            )
            db.add(entry)
            conn.last_sync_at = datetime.utcnow()
            conn.status_message = "Connected (Live)"
            db.commit()
            records = [entry]

    return [
        {
            "id": r.id,
            "timestamp": r.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            "total_size_gb": round(r.total_size_bytes / (1024 ** 3), 2),
            "data_size_gb": round(r.data_size_bytes / (1024 ** 3), 2),
            "index_size_gb": round(r.index_size_bytes / (1024 ** 3), 2),
            "total_bytes": r.total_size_bytes,
            "data_bytes": r.data_size_bytes,
            "index_bytes": r.index_size_bytes,
            "table_count": r.table_count,
            "active_connections": r.active_connections,
            "query_latency_ms": r.query_latency_ms,
            "read_throughput_mb_s": r.read_throughput_mb_s,
            "write_throughput_mb_s": r.write_throughput_mb_s,
            "growth_rate_daily_bytes": r.growth_rate_daily_bytes,
            "top_tables": json.loads(r.top_tables_json or "[]")
        }
        for r in reversed(records)
    ]

# =========================================================================
# 4. STORAGE MONITORING & ANALYZER (/api/v1/storage)
# =========================================================================

@api_v1.get("/storage/drives")
def get_storage_drives(user_token: dict = Depends(get_current_user_token)):
    return storage_monitor.get_all_drives()

@api_v1.get("/storage/summary")
def get_storage_summary(user_token: dict = Depends(get_current_user_token)):
    return storage_monitor.get_storage_summary()

@api_v1.post("/storage/scan")
def trigger_storage_scan(
    payload: ScanTriggerRequest,
    background_tasks: BackgroundTasks,
    user_token: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.DATABASE_ADMIN]))
):
    if storage_scanner.is_scanning:
        return {"status": "ALREADY_RUNNING", "message": "Scan already in progress."}

    path = payload.target_path.strip()
    if not os.path.exists(path):
        raise HTTPException(status_code=400, detail=f"Directory '{path}' does not exist on host.")

    background_tasks.add_task(
        storage_scanner.scan_directory,
        target_path=path,
        max_files=payload.max_files or 30000,
        max_depth=payload.max_depth or 4
    )
    return {"status": "STARTED", "target_path": path, "message": f"Scan initiated for {path}."}

@api_v1.get("/storage/scan/status")
def get_scan_status(user_token: dict = Depends(get_current_user_token)):
    return {
        "is_scanning": storage_scanner.is_scanning,
        "current_scan_path": storage_scanner.current_scan_path,
        "progress": storage_scanner.progress
    }

@api_v1.get("/storage/scan/latest")
def get_latest_scan_result(user_token: dict = Depends(get_current_user_token), db: Session = Depends(get_db)):
    if storage_scanner.last_result:
        return storage_scanner.last_result

    latest = db.query(ScanResult).order_by(ScanResult.timestamp.desc()).first()
    if latest and latest.summary_json:
        res = json.loads(latest.summary_json)
        res["id"] = latest.id
        return res

    return {
        "target_path": os.path.expanduser("~"),
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

# =========================================================================
# 5. ML PREDICTIVE FORECASTING & RUNWAY (/api/v1/predictions)
# =========================================================================

@api_v1.get("/predictions")
def get_predictions(
    resource_type: str = "LOCAL_DISK",
    resource_id: Optional[str] = None,
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    """
    Generate predictions for 7, 15, 30, 60, 90 day horizons with model comparison benchmarks.
    """
    target = resource_id or "C:"
    drives = storage_monitor.get_all_drives()
    matched = next((d for d in drives if target in d["device"] or target in d["mountpoint"]), None)
    if not matched and drives:
        matched = drives[0]

    current_used = matched["used_bytes"] if matched else 100 * (1024 ** 3)
    total_cap = matched["total_bytes"] if matched else 512 * (1024 ** 3)

    # Fetch history
    records = (
        db.query(StorageTelemetry)
        .order_by(StorageTelemetry.timestamp.asc())
        .limit(100)
        .all()
    )

    data = [{"timestamp": r.timestamp, "used_bytes": r.used_bytes} for r in records]
    df = pd.DataFrame(data)

    if len(df) < 6:
        # Fallback baseline when observations are accumulating
        daily_growth = 0.05 * (1024 ** 3)
        runway = ml_engine.calculate_capacity_runway(current_used, total_cap, daily_growth)
        horizons = ml_engine.predict_multi_horizon(target, current_used, total_cap, None, 0.0, daily_growth, 0.02 * (1024 ** 3))
        return {
            "resource_id": target,
            "resource_type": resource_type,
            "sufficient_data": False,
            "samples_collected": len(df),
            "min_required_samples": 20,
            "status_message": f"Baseline Mode: Collecting telemetry ({len(df)}/20 observations).",
            "best_model_name": "BASELINE_TREND",
            "model_benchmarks": {},
            "runway": runway,
            "forecast_horizons": horizons,
            "anomalies": []
        }

    # Time feature extraction & multi-model evaluation
    X, y = ml_engine.extract_time_features(df, target_col="used_bytes")
    eval_result = ml_engine.evaluate_multi_models(X, y)
    anomalies = ml_engine.detect_anomalies(df, resource_id=target)

    # Calculate growth rate
    time_span_days = max((df["timestamp"].iloc[-1] - df["timestamp"].iloc[0]).total_seconds() / 86400.0, 0.1)
    daily_growth = max(0.0, (df["used_bytes"].iloc[-1] - df["used_bytes"].iloc[0]) / time_span_days)
    if daily_growth < 1024 * 1024:
        daily_growth = 0.05 * (1024 ** 3)  # default conservative ~50MB/day

    runway = ml_engine.calculate_capacity_runway(current_used, total_cap, daily_growth)
    best_instance = eval_result.get("best_model_instance")
    last_hours = X["time_index"].iloc[-1]
    rmse_bytes = eval_result["benchmarks"].get(eval_result["best_model_name"], {}).get("rmse_gb", 0.02) * (1024 ** 3)

    horizons = ml_engine.predict_multi_horizon(
        target, current_used, total_cap, best_instance, last_hours, daily_growth, rmse_bytes
    )

    return {
        "resource_id": target,
        "resource_type": resource_type,
        "sufficient_data": True,
        "samples_collected": len(df),
        "min_required_samples": 20,
        "status_message": f"ML Engine Active. Best model selected: {eval_result['best_model_name']}",
        "best_model_name": eval_result["best_model_name"],
        "model_benchmarks": eval_result["benchmarks"],
        "runway": runway,
        "forecast_horizons": horizons,
        "anomalies": anomalies
    }

@api_v1.get("/predictions/benchmarks")
def get_prediction_benchmarks(drive: str = "C:"):
    """
    Returns authentic algorithm benchmark matrix comparing all 6 evaluated models
    with real MAE, RMSE, MAPE, and R2 score for CapacityAnalytics.
    """
    forecast = predictive_forecasting_service.get_complete_forecast(drive)
    raw_benchmarks = forecast.get("model_benchmarks", {})
    benchmarks_list = []
    for model_key, b in raw_benchmarks.items():
        benchmarks_list.append({
            "model_name": b.get("description") or model_key.replace("_", " ").title(),
            "mae_gb": round(b.get("mae_gb", 0.0), 4),
            "rmse_gb": round(b.get("rmse_gb", 0.0), 4),
            "mape_percent": round(b.get("smape_percent", 0.0), 2),
            "r2_score": round(b.get("r2_score", 0.0), 4),
            "selected_for_forecast": b.get("is_selected", False)
        })
    return {"resource_id": drive, "benchmarks": benchmarks_list}

@api_v1.get("/predictions/multi-horizon")
def get_multi_horizon_predictions(drive: str = "C:"):
    """
    Returns verified multi-horizon forecast projections and runway metrics.
    """
    forecast = predictive_forecasting_service.get_complete_forecast(drive)
    return {
        "resource_id": drive,
        "projections": forecast.get("projections", []),
        "runway": forecast.get("capacity_runway", {})
    }

# =========================================================================
# 6. PERFORMANCE OBSERVABILITY & PROCESSES (/api/v1/performance)
# =========================================================================

@api_v1.get("/performance")
def get_performance_current(user_token: dict = Depends(get_current_user_token)):
    return performance_monitor.get_current_metrics()

@api_v1.get("/performance/history")
def get_performance_history(limit: int = 50, user_token: dict = Depends(get_current_user_token), db: Session = Depends(get_db)):
    records = db.query(PerformanceTelemetry).order_by(PerformanceTelemetry.timestamp.desc()).limit(limit).all()
    return [
        {
            "timestamp": r.timestamp.strftime("%H:%M:%S"),
            "cpu_percent": r.cpu_percent,
            "memory_percent": r.memory_percent,
            "memory_used_gb": round(r.memory_used / (1024 ** 3), 2),
            "running_processes": r.running_processes_count
        }
        for r in reversed(records)
    ]

# =========================================================================
# 7. ANOMALIES & RISK MANAGEMENT (/api/v1/anomalies & /api/v1/alerts)
# =========================================================================

@api_v1.get("/alerts")
def get_risk_alerts(user_token: dict = Depends(get_current_user_token)):
    return risk_engine.evaluate_risks()

@api_v1.get("/anomalies")
def get_detected_anomalies(user_token: dict = Depends(get_current_user_token), db: Session = Depends(get_db)):
    anomalies = db.query(StorageAnomaly).order_by(StorageAnomaly.timestamp.desc()).limit(30).all()
    return [
        {
            "id": a.id,
            "timestamp": a.timestamp.isoformat(),
            "resource_type": a.resource_type,
            "resource_id": a.resource_id,
            "metric_name": a.metric_name,
            "severity": a.severity,
            "anomaly_score": a.anomaly_score,
            "description": a.description
        }
        for a in anomalies
    ]

# =========================================================================
# 8. PRIVACY GUARD & SECURITY AUDITING (/api/v1/privacy & /api/v1/security)
# =========================================================================

# --- Security Center Endpoints ---

@api_v1.get("/security/status")
@api_v1.get("/security/dashboard")
def get_security_dashboard(user_token: dict = Depends(get_current_user_token)):
    """Retrieve comprehensive security posture, metrics, active alerts, and latest scan."""
    return security_service.get_security_dashboard(org_id=user_token["org_id"])

@api_v1.get("/security/checks")
def get_security_checks(user_token: dict = Depends(get_current_user_token)):
    """Retrieve results of all 10 verified security checks."""
    return security_service.get_security_checks()

@api_v1.post("/security/checks/run")
@api_v1.post("/security/scan")
def run_security_scan(user_token: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.DATABASE_ADMIN]))):
    """Trigger live enterprise security assessment, persist results, and record security event."""
    return security_service.run_security_scan(org_id=user_token["org_id"])

@api_v1.get("/security/events")
def get_security_events(
    event_type: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 50,
    user_token: dict = Depends(get_current_user_token)
):
    """Retrieve security events history with optional type/severity filters."""
    return security_service.get_security_events(
        event_type=event_type,
        severity=severity,
        limit=limit,
        org_id=user_token["org_id"]
    )

@api_v1.get("/security/alerts")
def get_security_alerts(user_token: dict = Depends(get_current_user_token)):
    """Retrieve active security alerts based on high/critical events and scan findings."""
    dash = security_service.get_security_dashboard(org_id=user_token["org_id"])
    return {
        "active_alerts_count": dash.get("active_alerts_count", 0),
        "overall_status": dash.get("overall_status"),
        "failed_checks": [c for c in dash.get("latest_scan", {}).get("checks", []) if c.get("status") in ("FAILED", "WARNING")],
        "recent_critical_events": [e for e in dash.get("recent_events", []) if e.get("severity") in ("HIGH", "CRITICAL")]
    }

@api_v1.get("/security/audit-logs")
def get_audit_trail(
    search: Optional[str] = None,
    severity: Optional[str] = None,
    action_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    user_token: dict = Depends(get_current_user_token)
):
    """Search and filter tamper-evident audit logs with pagination."""
    res = security_service.get_audit_logs(
        search=search,
        severity=severity,
        action_type=action_type,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
        org_id=user_token["org_id"]
    )
    # Maintain backward compatibility for arrays if no pagination was requested
    if search is None and severity is None and action_type is None and start_date is None and end_date is None and offset == 0:
        return res["items"]
    return res

@api_v1.get("/security/audit-logs/export")
def export_audit_logs_csv(
    search: Optional[str] = None,
    severity: Optional[str] = None,
    action_type: Optional[str] = None,
    user_token: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.DATABASE_ADMIN]))
):
    """Export filtered audit logs as RFC 4180 CSV."""
    import csv
    import io
    from fastapi.responses import Response

    data = security_service.get_audit_logs(
        search=search,
        severity=severity,
        action_type=action_type,
        limit=1000,
        org_id=user_token["org_id"]
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Timestamp UTC", "Action Type", "User Email", "Resource", "Description", "Status", "Request ID"])
    for item in data.get("items", []):
        writer.writerow([
            item.get("id"),
            item.get("timestamp"),
            item.get("action_type"),
            item.get("user_email"),
            item.get("resource"),
            item.get("description"),
            item.get("status"),
            item.get("request_id")
        ])
    
    csv_bytes = output.getvalue().encode("utf-8")
    filename = f"aegisstor_audit_logs_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""}
    )

# --- Privacy Guard Endpoints ---

@api_v1.get("/privacy/status")
@api_v1.get("/privacy/dashboard")
def get_privacy_dashboard(user_token: dict = Depends(get_current_user_token)):
    """Retrieve real-time privacy status, sensitive data detection status, and latest privacy scan."""
    return privacy_guard.get_privacy_dashboard(org_id=user_token["org_id"])

@api_v1.get("/privacy/settings")
@api_v1.get("/privacy/policy")
def get_privacy_settings(user_token: dict = Depends(get_current_user_token)):
    """Retrieve active privacy and retention policy settings."""
    return privacy_guard.get_policy(org_id=user_token["org_id"])

@api_v1.put("/privacy/settings")
@api_v1.post("/privacy/settings")
@api_v1.post("/privacy/policy")
def update_privacy_settings(
    updates: Dict[str, Any],
    user_token: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Update privacy settings and data lifecycle configuration."""
    return privacy_guard.update_policy(org_id=user_token["org_id"], updates=updates)

@api_v1.post("/privacy/scan")
def trigger_privacy_scan(
    user_token: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.DATABASE_ADMIN]))
):
    """Trigger sensitive data and compliance scan across permitted metadata targets."""
    return privacy_guard.start_privacy_scan(org_id=user_token["org_id"])

@api_v1.get("/privacy/scan-history")
def get_privacy_scan_history(
    limit: int = 20,
    user_token: dict = Depends(get_current_user_token)
):
    """Retrieve privacy scan history."""
    return privacy_guard.get_privacy_scan_history(limit=limit, org_id=user_token["org_id"])

@api_v1.get("/privacy/events")
def get_privacy_events(
    limit: int = 50,
    user_token: dict = Depends(get_current_user_token)
):
    """Retrieve privacy lifecycle events."""
    return privacy_guard.get_privacy_events(limit=limit, org_id=user_token["org_id"])

@api_v1.get("/privacy/retention/preview")
@api_v1.post("/privacy/retention/preview")
def preview_retention_purge(
    retention_days: Optional[int] = None,
    user_token: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Preview records affected by retention cutoff without destructive modification."""
    return privacy_guard.preview_retention_purge(retention_days=retention_days, org_id=user_token["org_id"])

@api_v1.post("/privacy/purge")
@api_v1.post("/privacy/purge-retention")
def trigger_retention_purge(
    retention_days: Optional[int] = None,
    user_token: dict = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """Execute authorized data retention purge."""
    return privacy_guard.enforce_retention_purge(retention_days=retention_days, org_id=user_token["org_id"])

# =========================================================================
# 9. DIGITAL TWIN SIMULATION (/api/v1/simulation)
# =========================================================================

@api_v1.post("/simulation/run")
def run_simulation(payload: SimulationRunRequest, user_token: dict = Depends(get_current_user_token)):
    return digital_twin_service.run_simulation(
        drive_name=payload.drive_name,
        monthly_growth_rate_percent=payload.monthly_growth_rate_percent or 0.0,
        removed_unnecessary_files_gb=payload.removed_unnecessary_files_gb or 0.0,
        capacity_expansion_gb=payload.capacity_expansion_gb or 0.0,
        continuation_days=payload.continuation_days or 90,
        scenario_title=payload.scenario_title
    )

# =========================================================================
# 10. OPTIMIZATION RECOMMENDATIONS (/api/v1/recommendations)
# =========================================================================

@api_v1.get("/recommendations")
def get_recommendations(user_token: dict = Depends(get_current_user_token)):
    return optimization_engine.generate_recommendations()

@api_v1.post("/recommendations/{rec_id}/apply")
def execute_recommendation(
    rec_id: int,
    confirmed: bool,
    user_token: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.DATABASE_ADMIN]))
):
    return optimization_engine.execute_safe_cleanup(recommendation_id=rec_id, confirmed=confirmed)

# =========================================================================
# 11. AWS CLOUD STORAGE INTEGRATION (/api/v1/aws)
# =========================================================================

@api_v1.get("/aws/status")
def get_aws_connection_status(
    force_refresh: bool = False,
    user_token: dict = Depends(get_current_user_token)
):
    """Check AWS CLI session status and caller identity with high-performance caching."""
    return aws_service.verify_connection(force_refresh=force_refresh)

@api_v1.get("/aws/s3/bucket")
def get_aws_s3_bucket_details(
    bucket_name: Optional[str] = None,
    force_refresh: bool = False,
    user_token: dict = Depends(get_current_user_token)
):
    """Retrieve actual S3 bucket metadata, versioning, encryption, and object usage."""
    return aws_service.get_bucket_metadata(bucket_name=bucket_name, force_refresh=force_refresh)

@api_v1.get("/aws/s3/metrics")
def get_aws_cloudwatch_metrics(
    bucket_name: Optional[str] = None,
    days: int = 7,
    user_token: dict = Depends(get_current_user_token)
):
    """Retrieve available CloudWatch storage metrics for the S3 bucket."""
    return aws_service.get_cloudwatch_metrics(bucket_name=bucket_name, days=days)

@api_v1.get("/aws/s3/buckets")
def list_aws_buckets(user_token: dict = Depends(get_current_user_token)):
    """List accessible S3 buckets under the configured AWS profile."""
    return aws_service.list_all_accessible_buckets()

@api_v1.get("/aws/s3/object")
def get_aws_s3_object_details(
    key: str = "test-storage.txt",
    bucket_name: Optional[str] = None,
    force_refresh: bool = False,
    user_token: dict = Depends(get_current_user_token)
):
    """Retrieve verified metadata for a specific S3 object (e.g. test-storage.txt)."""
    return aws_service.get_object_metadata(key=key, bucket_name=bucket_name, force_refresh=force_refresh)

@api_v1.post("/aws/s3/upload")
async def upload_aws_s3_file(
    file: UploadFile = File(...),
    bucket_name: Optional[str] = Form(None),
    user_token: dict = Depends(get_current_user_token)
):
    """Upload a real file to the designated S3 bucket."""
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Cannot upload an empty file.")
    res = aws_service.upload_file(
        file_bytes=content,
        filename=file.filename or "upload.bin",
        content_type=file.content_type or "application/octet-stream",
        bucket_name=bucket_name
    )
    if not res.get("success"):
        raise HTTPException(status_code=502 if res.get("status") != "DISCONNECTED" else 503, detail=res.get("message", "S3 Upload failed."))
    return res

@api_v1.get("/aws/s3/download")
def download_aws_s3_file(
    key: str,
    bucket_name: Optional[str] = None,
    user_token: dict = Depends(get_current_user_token)
):
    """Download an authentic file payload from the designated S3 bucket."""
    res = aws_service.download_file(filename=key, bucket_name=bucket_name)
    if not res.get("success"):
        raise HTTPException(status_code=404 if "NotFound" in res.get("error", "") else 502, detail=res.get("message", "S3 Download failed."))
    
    return Response(
        content=res["data"],
        media_type=res.get("content_type", "application/octet-stream"),
        headers={
            "Content-Disposition": f'attachment; filename="{res.get("filename", key)}"',
            "Content-Length": str(res.get("content_length", len(res["data"])))
        }
    )

@api_v1.delete("/aws/s3/object")
def delete_aws_s3_file(
    key: str,
    version_id: Optional[str] = None,
    bucket_name: Optional[str] = None,
    user_token: dict = Depends(get_current_user_token)
):
    """Permanently delete an object or version from the designated S3 bucket."""
    res = aws_service.delete_object(filename=key, version_id=version_id, bucket_name=bucket_name)
    if not res.get("success"):
        raise HTTPException(status_code=502, detail=res.get("message", "S3 Delete failed."))
    return res

@api_v1.get("/aws/s3/versions")
def list_aws_s3_versions(
    bucket_name: Optional[str] = None,
    prefix: Optional[str] = None,
    user_token: dict = Depends(get_current_user_token)
):
    """List actual object version history and delete markers for the S3 bucket."""
    return aws_service.list_object_versions(bucket_name=bucket_name, prefix=prefix)

# =========================================================================
# 12. ADVANCED PREDICTIVE INTELLIGENCE & HISTORICAL PIPELINE
# =========================================================================

@api_v1.get("/forecasting/predictive")
def get_advanced_forecast(
    resource_id: str = "C:",
    user_token: dict = Depends(get_current_user_token)
):
    """Retrieve multi-horizon predictive forecasts, model tournament benchmarks, and runway math."""
    return predictive_forecasting_service.get_complete_forecast(resource_id=resource_id)

@api_v1.get("/telemetry/history")
def get_historical_telemetry_series(
    resource_id: str = "C:",
    hours: int = 72,
    user_token: dict = Depends(get_current_user_token)
):
    """Retrieve verified historical telemetry time-series points."""
    return historical_pipeline.get_resource_history(resource_id=resource_id, hours=hours, org_id=user_token.get("org_id", 1))

@api_v1.get("/reports/historical")
def get_v1_historical_reports(
    range: str = "24h",
    device_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    interval: Optional[str] = None,
    user_token: Optional[dict] = None
):
    """Retrieve structured historical telemetry report with aggregation and summary math."""
    org_id = user_token.get("org_id", 1) if user_token else 1
    return historical_pipeline.get_historical_report(
        range_str=range,
        device_id=device_id,
        start_date=start_date,
        end_date=end_date,
        interval=interval,
        org_id=org_id
    )

@api_v1.post("/telemetry/collect-sample")
def trigger_telemetry_sample(user_token: dict = Depends(get_current_user_token)):
    """Trigger an immediate verified observation sample for local, cloud, and database storage."""
    local_res = historical_pipeline.record_local_storage_sample(org_id=user_token.get("org_id", 1))
    s3_res = historical_pipeline.record_s3_storage_sample(org_id=user_token.get("org_id", 1))
    db_res = historical_pipeline.record_database_storage_sample(org_id=user_token.get("org_id", 1))
    return {
        "success": True,
        "local_samples": local_res,
        "s3_sample": s3_res,
        "db_sample": db_res,
        "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    }

# =========================================================================
# 13. ENTERPRISE NOTIFICATIONS, ALERT RULES & INCIDENT MANAGEMENT
# =========================================================================

from app.models.database import (
    Notification, Incident, IncidentAcknowledgement, AlertRule, AlertEvent,
    NotificationPreference, NotificationDeliveryLog, NotificationSubscription, SystemAnnouncement
)
from app.notifications.dispatcher import dispatcher
from app.notifications.preferences import preferences_manager
from app.schemas.all_schemas import (
    IncidentActionRequest, AlertRuleCreateRequest, NotificationPreferenceUpdateRequest,
    TestNotificationRequest, SystemAnnouncementCreateRequest, PushSubscriptionRequest
)

@api_v1.get("/notifications")
def get_notifications(
    category: Optional[str] = None,
    severity: Optional[str] = None,
    is_read: Optional[bool] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    """Retrieve filtered notification history."""
    query = db.query(Notification).filter(
        Notification.org_id == user_token.get("org_id", 1),
        Notification.is_archived == False
    )
    if category:
        query = query.filter(Notification.category == category.upper())
    if severity:
        query = query.filter(Notification.severity == severity.upper())
    if is_read is not None:
        query = query.filter(Notification.is_read == is_read)
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (Notification.title.ilike(search_pattern)) |
            (Notification.message.ilike(search_pattern)) |
            (Notification.resource.ilike(search_pattern))
        )

    total_count = query.count()
    items = query.order_by(Notification.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "total": total_count,
        "items": [
            {
                "id": n.id,
                "event_id": n.event_id,
                "incident_id": n.incident_id,
                "title": n.title,
                "message": n.message,
                "category": n.category,
                "severity": n.severity,
                "source": n.source,
                "resource": n.resource,
                "details_json": n.details_json,
                "is_read": n.is_read,
                "read_at": n.read_at.strftime("%Y-%m-%d %H:%M:%S UTC") if n.read_at else None,
                "created_at": n.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")
            } for n in items
        ]
    }

@api_v1.get("/notifications/unread-count")
def get_unread_notification_count(
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    """Return count of unread notifications for navbar bell badge."""
    count = db.query(Notification).filter(
        Notification.org_id == user_token.get("org_id", 1),
        Notification.is_read == False,
        Notification.is_archived == False
    ).count()
    return {"unread_count": count}

@api_v1.patch("/notifications/{notif_id}/read")
def mark_notification_read(
    notif_id: int,
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    """Mark a specific notification as read."""
    notif = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.org_id == user_token.get("org_id", 1)
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    notif.is_read = True
    notif.read_at = datetime.utcnow()
    db.commit()
    return {"success": True, "id": notif_id, "is_read": True}

@api_v1.post("/notifications/read-all")
def mark_all_notifications_read(
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    """Mark all unread notifications as read."""
    now = datetime.utcnow()
    updated = db.query(Notification).filter(
        Notification.org_id == user_token.get("org_id", 1),
        Notification.is_read == False
    ).update({"is_read": True, "read_at": now}, synchronize_session=False)
    db.commit()
    return {"success": True, "marked_count": updated}

@api_v1.patch("/notifications/{notif_id}/archive")
def archive_notification(
    notif_id: int,
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    """Archive a notification from active view."""
    notif = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.org_id == user_token.get("org_id", 1)
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    notif.is_archived = True
    db.commit()
    return {"success": True, "id": notif_id, "is_archived": True}

# --- Incident Management Endpoints ---

@api_v1.get("/incidents")
def list_incidents(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    """List tracked operational and security incidents."""
    query = db.query(Incident).filter(Incident.org_id == user_token.get("org_id", 1))

    if status:
        query = query.filter(Incident.status == status.upper())
    if severity:
        query = query.filter(Incident.severity == severity.upper())
    if category:
        query = query.filter(Incident.category == category.upper())
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (Incident.title.ilike(search_pattern)) |
            (Incident.incident_number.ilike(search_pattern)) |
            (Incident.resource.ilike(search_pattern))
        )

    total_count = query.count()
    incidents = query.order_by(Incident.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "total": total_count,
        "items": [
            {
                "id": inc.id,
                "incident_number": inc.incident_number,
                "title": inc.title,
                "category": inc.category,
                "severity": inc.severity,
                "status": inc.status,
                "resource": inc.resource,
                "escalation_level": inc.escalation_level,
                "created_at": inc.created_at.strftime("%Y-%m-%d %H:%M:%S UTC"),
                "acknowledged_at": inc.acknowledged_at.strftime("%Y-%m-%d %H:%M:%S UTC") if inc.acknowledged_at else None,
                "resolved_at": inc.resolved_at.strftime("%Y-%m-%d %H:%M:%S UTC") if inc.resolved_at else None
            } for inc in incidents
        ]
    }

@api_v1.get("/incidents/stats")
def get_incident_statistics(
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    """Calculate KPI metrics: Total, Open, Critical, MTTA, MTTR, and trends."""
    org_id = user_token.get("org_id", 1)
    all_incidents = db.query(Incident).filter(Incident.org_id == org_id).all()

    total = len(all_incidents)
    open_count = sum(1 for i in all_incidents if i.status in ("OPEN", "ESCALATED"))
    critical_count = sum(1 for i in all_incidents if i.severity == "CRITICAL" and i.status != "RESOLVED")
    emergency_count = sum(1 for i in all_incidents if i.severity == "EMERGENCY" and i.status != "RESOLVED")
    acknowledged_count = sum(1 for i in all_incidents if i.status == "ACKNOWLEDGED")
    resolved_count = sum(1 for i in all_incidents if i.status == "RESOLVED")

    # Mean Time to Acknowledge (MTTA)
    mtta_deltas = [
        (i.acknowledged_at - i.created_at).total_seconds() / 60.0
        for i in all_incidents if i.acknowledged_at and i.acknowledged_at >= i.created_at
    ]
    mtta_minutes = round(sum(mtta_deltas) / len(mtta_deltas), 1) if mtta_deltas else 0.0

    # Mean Time to Resolve (MTTR)
    mttr_deltas = [
        (i.resolved_at - i.created_at).total_seconds() / 60.0
        for i in all_incidents if i.resolved_at and i.resolved_at >= i.created_at
    ]
    mttr_minutes = round(sum(mttr_deltas) / len(mttr_deltas), 1) if mttr_deltas else 0.0

    # 7-day trend breakdown
    now = datetime.utcnow()
    trends = []
    for d in range(6, -1, -1):
        day_date = (now - timedelta(days=d)).date()
        day_label = day_date.strftime("%b %d")
        day_incidents = [i for i in all_incidents if i.created_at.date() == day_date]
        trends.append({
            "date": day_label,
            "warning": sum(1 for i in day_incidents if i.severity == "WARNING"),
            "critical": sum(1 for i in day_incidents if i.severity == "CRITICAL"),
            "emergency": sum(1 for i in day_incidents if i.severity == "EMERGENCY")
        })

    return {
        "total_incidents": total,
        "open_incidents": open_count,
        "critical_incidents": critical_count,
        "emergency_incidents": emergency_count,
        "acknowledged_incidents": acknowledged_count,
        "resolved_incidents": resolved_count,
        "mtta_minutes": mtta_minutes,
        "mttr_minutes": mttr_minutes,
        "trends": trends
    }

@api_v1.get("/incidents/{inc_id}")
def get_incident_details(
    inc_id: int,
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    """Retrieve full incident dossier with root-cause evidence, telemetry, and delivery logs."""
    inc = db.query(Incident).filter(
        Incident.id == inc_id,
        Incident.org_id == user_token.get("org_id", 1)
    ).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    # Delivery logs for notifications tied to this incident
    notif_ids = [n.id for n in inc.notifications]
    delivery_logs = []
    if notif_ids:
        logs = db.query(NotificationDeliveryLog).filter(
            NotificationDeliveryLog.notification_id.in_(notif_ids)
        ).order_by(NotificationDeliveryLog.created_at.desc()).all()
        delivery_logs = [
            {
                "channel": l.channel,
                "recipient": l.recipient,
                "status": l.status,
                "attempt_count": l.attempt_count,
                "provider_response": l.provider_response,
                "error_message": l.error_message,
                "delivered_at": l.delivered_at.strftime("%Y-%m-%d %H:%M:%S UTC") if l.delivered_at else None
            } for l in logs
        ]

    # Acknowledgement / action history
    acks = db.query(IncidentAcknowledgement).filter(
        IncidentAcknowledgement.incident_id == inc.id
    ).order_by(IncidentAcknowledgement.timestamp.desc()).all()

    return {
        "id": inc.id,
        "incident_number": inc.incident_number,
        "title": inc.title,
        "category": inc.category,
        "severity": inc.severity,
        "status": inc.status,
        "resource": inc.resource,
        "root_cause_evidence": inc.root_cause_evidence,
        "recommended_action": inc.recommended_action,
        "related_telemetry_json": inc.related_telemetry_json,
        "escalation_level": inc.escalation_level,
        "escalated_at": inc.escalated_at.strftime("%Y-%m-%d %H:%M:%S UTC") if inc.escalated_at else None,
        "created_at": inc.created_at.strftime("%Y-%m-%d %H:%M:%S UTC"),
        "acknowledged_at": inc.acknowledged_at.strftime("%Y-%m-%d %H:%M:%S UTC") if inc.acknowledged_at else None,
        "resolved_at": inc.resolved_at.strftime("%Y-%m-%d %H:%M:%S UTC") if inc.resolved_at else None,
        "resolution_notes": inc.resolution_notes,
        "delivery_logs": delivery_logs,
        "acknowledgement_history": [
            {
                "user_email": a.user_email,
                "action_type": a.action_type,
                "comment": a.comment,
                "timestamp": a.timestamp.strftime("%Y-%m-%d %H:%M:%S UTC")
            } for a in acks
        ]
    }

@api_v1.post("/incidents/{inc_id}/acknowledge")
def acknowledge_incident(
    inc_id: int,
    payload: IncidentActionRequest,
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    """Administrator acknowledges an incident ticket."""
    inc = db.query(Incident).filter(
        Incident.id == inc_id,
        Incident.org_id == user_token.get("org_id", 1)
    ).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    now = datetime.utcnow()
    inc.status = "ACKNOWLEDGED"
    inc.acknowledged_at = now

    ack = IncidentAcknowledgement(
        incident_id=inc.id,
        user_id=user_token.get("user_id"),
        user_email=user_token.get("email", "admin@aegisstor.local"),
        action_type="ACKNOWLEDGE",
        comment=payload.comment or "Incident acknowledged by administrator.",
        timestamp=now
    )
    db.add(ack)
    db.commit()
    return {"success": True, "incident_number": inc.incident_number, "status": "ACKNOWLEDGED"}

@api_v1.post("/incidents/{inc_id}/resolve")
def resolve_incident(
    inc_id: int,
    payload: IncidentActionRequest,
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    """Administrator resolves an incident with resolution notes."""
    inc = db.query(Incident).filter(
        Incident.id == inc_id,
        Incident.org_id == user_token.get("org_id", 1)
    ).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    now = datetime.utcnow()
    inc.status = "RESOLVED"
    inc.resolved_at = now
    inc.resolution_notes = payload.comment or "Incident investigated and resolved by administrator."

    ack = IncidentAcknowledgement(
        incident_id=inc.id,
        user_id=user_token.get("user_id"),
        user_email=user_token.get("email", "admin@aegisstor.local"),
        action_type="RESOLVE",
        comment=inc.resolution_notes,
        timestamp=now
    )
    db.add(ack)
    db.commit()
    return {"success": True, "incident_number": inc.incident_number, "status": "RESOLVED"}

@api_v1.post("/incidents/{inc_id}/assign")
def assign_incident(
    inc_id: int,
    payload: IncidentActionRequest,
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    """Administrator assigns an incident to an operator or engineer."""
    inc = db.query(Incident).filter(
        Incident.id == inc_id,
        Incident.org_id == user_token.get("org_id", 1)
    ).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    assigned_target = payload.comment or user_token.get("email", "admin@aegisstor.local")
    inc.assigned_to = assigned_target
    ack = IncidentAcknowledgement(
        incident_id=inc.id,
        user_id=user_token.get("user_id"),
        user_email=user_token.get("email", "admin@aegisstor.local"),
        action_type="ASSIGN",
        comment=f"Assigned to {assigned_target}",
        timestamp=datetime.utcnow()
    )
    db.add(ack)
    db.commit()
    return {"success": True, "incident_number": inc.incident_number, "assigned_to": inc.assigned_to}

@api_v1.get("/reports/storage-csv")
def export_storage_telemetry_csv(hours: int = 72, db: Session = Depends(get_db)):
    """Export verified historical storage telemetry as formatted CSV."""
    import io
    import csv
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    records = (
        db.query(StorageTelemetry)
        .filter(StorageTelemetry.timestamp >= cutoff)
        .order_by(StorageTelemetry.timestamp.desc())
        .limit(2000)
        .all()
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Timestamp", "Drive", "Mountpoint", "Filesystem", "Total_GB", "Used_GB", "Free_GB", "Usage_Percent", "Read_MB_s", "Write_MB_s"])
    for r in records:
        writer.writerow([
            r.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            r.drive_name,
            r.mount_point,
            r.filesystem,
            round(r.total_bytes / (1024 ** 3), 2),
            round(r.used_bytes / (1024 ** 3), 2),
            round(r.free_bytes / (1024 ** 3), 2),
            round(r.usage_percent, 2),
            round(r.read_bytes_sec / (1024 * 1024), 2),
            round(r.write_bytes_sec / (1024 * 1024), 2)
        ])
    return Response(
        content=output.getvalue().encode("utf-8"),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=AEGISSTOR_telemetry_{hours}h.csv"}
    )

# --- Alert Rules Endpoints ---

@api_v1.get("/alert-rules")
def get_alert_rules(
    category: Optional[str] = None,
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    """List all configured alert rules."""
    query = db.query(AlertRule).filter(AlertRule.org_id == user_token.get("org_id", 1))
    if category:
        query = query.filter(AlertRule.category == category.upper())
    rules = query.order_by(AlertRule.category, AlertRule.name).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "category": r.category,
            "metric_key": r.metric_key,
            "operator": r.operator,
            "warning_threshold": r.warning_threshold,
            "critical_threshold": r.critical_threshold,
            "emergency_threshold": r.emergency_threshold,
            "is_enabled": r.is_enabled,
            "cooldown_minutes": r.cooldown_minutes,
            "auto_resolve": r.auto_resolve,
            "description": r.description
        } for r in rules
    ]

@api_v1.post("/alert-rules")
def create_alert_rule(
    payload: AlertRuleCreateRequest,
    user_token: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.DATABASE_ADMIN])),
    db: Session = Depends(get_db)
):
    """Create a new custom alert rule."""
    rule = AlertRule(
        org_id=user_token.get("org_id", 1),
        name=payload.name,
        category=payload.category.upper(),
        metric_key=payload.metric_key,
        operator=payload.operator,
        warning_threshold=payload.warning_threshold,
        critical_threshold=payload.critical_threshold,
        emergency_threshold=payload.emergency_threshold,
        is_enabled=payload.is_enabled,
        cooldown_minutes=payload.cooldown_minutes,
        auto_resolve=payload.auto_resolve,
        description=payload.description
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return {"success": True, "id": rule.id, "name": rule.name}

@api_v1.put("/alert-rules/{rule_id}")
def update_alert_rule(
    rule_id: int,
    payload: AlertRuleCreateRequest,
    user_token: dict = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.DATABASE_ADMIN])),
    db: Session = Depends(get_db)
):
    """Update existing alert rule thresholds."""
    rule = db.query(AlertRule).filter(
        AlertRule.id == rule_id,
        AlertRule.org_id == user_token.get("org_id", 1)
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    rule.name = payload.name
    rule.warning_threshold = payload.warning_threshold
    rule.critical_threshold = payload.critical_threshold
    rule.emergency_threshold = payload.emergency_threshold
    rule.is_enabled = payload.is_enabled
    rule.cooldown_minutes = payload.cooldown_minutes
    rule.auto_resolve = payload.auto_resolve
    rule.description = payload.description
    rule.updated_at = datetime.utcnow()
    db.commit()
    return {"success": True, "id": rule.id}

@api_v1.delete("/alert-rules/{rule_id}")
def delete_alert_rule(
    rule_id: int,
    user_token: dict = Depends(require_role([UserRole.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    """Delete an alert rule."""
    rule = db.query(AlertRule).filter(
        AlertRule.id == rule_id,
        AlertRule.org_id == user_token.get("org_id", 1)
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    db.delete(rule)
    db.commit()
    return {"success": True, "id": rule_id}

# --- Notification Preferences Endpoints ---

@api_v1.get("/notification-preferences")
def get_user_notification_preferences(
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    """Retrieve current user's notification preferences."""
    pref = preferences_manager.get_or_create_user_preferences(
        db, user_id=user_token.get("user_id", 1), org_id=user_token.get("org_id", 1)
    )
    return {
        "email_enabled": pref.email_enabled,
        "in_app_enabled": pref.in_app_enabled,
        "web_push_enabled": pref.web_push_enabled,
        "sms_enabled": pref.sms_enabled,
        "aws_sns_enabled": pref.aws_sns_enabled,
        "notification_email": pref.notification_email,
        "notification_phone": pref.notification_phone,
        "aws_sns_topic_arn": pref.aws_sns_topic_arn,
        "min_severity_email": pref.min_severity_email,
        "min_severity_in_app": pref.min_severity_in_app,
        "min_severity_web_push": pref.min_severity_web_push,
        "min_severity_sms": pref.min_severity_sms,
        "min_severity_aws_sns": pref.min_severity_aws_sns,
        "storage_warning_percent": pref.storage_warning_percent,
        "storage_critical_percent": pref.storage_critical_percent,
        "cpu_critical_percent": pref.cpu_critical_percent,
        "ram_critical_percent": pref.ram_critical_percent,
        "quiet_hours_enabled": pref.quiet_hours_enabled,
        "quiet_hours_start": pref.quiet_hours_start,
        "quiet_hours_end": pref.quiet_hours_end,
        "retention_days": pref.retention_days
    }

@api_v1.put("/notification-preferences")
def update_user_notification_preferences(
    payload: NotificationPreferenceUpdateRequest,
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    """Update notification preferences for the active user."""
    pref = preferences_manager.get_or_create_user_preferences(
        db, user_id=user_token.get("user_id", 1), org_id=user_token.get("org_id", 1)
    )
    update_data = payload.dict(exclude_unset=True)
    for field, val in update_data.items():
        if val is not None:
            setattr(pref, field, val)
    pref.updated_at = datetime.utcnow()
    db.commit()
    return {"success": True, "message": "Notification preferences updated successfully"}

@api_v1.post("/notifications/test")
def trigger_diagnostic_test_notification(
    payload: TestNotificationRequest,
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    """Trigger a verified test notification to test delivery channel connectivity."""
    recipient = payload.recipient
    if not recipient and payload.channel.upper() == "EMAIL":
        recipient = user_token.get("email", "admin@aegisstor.local")

    res = dispatcher.send_test_notification(
        db=db,
        channel=payload.channel,
        recipient=recipient or "desktop_user",
        severity=payload.severity
    )
    return res

# --- System Updates & Announcements (Phase 8) ---

@api_v1.get("/system-updates")
def get_system_announcements(
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    """Retrieve verified software releases and system announcements."""
    announcements = db.query(SystemAnnouncement).filter(
        SystemAnnouncement.org_id == user_token.get("org_id", 1),
        SystemAnnouncement.is_active == True
    ).order_by(SystemAnnouncement.created_at.desc()).all()

    return [
        {
            "id": a.id,
            "version": a.version,
            "title": a.title,
            "description": a.description,
            "category": a.category,
            "impact": a.impact,
            "created_at": a.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")
        } for a in announcements
    ]

@api_v1.post("/system-updates")
def create_system_announcement(
    payload: SystemAnnouncementCreateRequest,
    user_token: dict = Depends(require_role([UserRole.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    """Admin creates a verified announcement or maintenance notice."""
    ann = SystemAnnouncement(
        org_id=user_token.get("org_id", 1),
        version=payload.version,
        title=payload.title,
        description=payload.description,
        category=payload.category.upper(),
        impact=payload.impact.upper(),
        created_by_user=user_token.get("email", "admin@aegisstor.local")
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return {"success": True, "id": ann.id, "title": ann.title}

# --- Web Push Subscription Registration ---

@api_v1.post("/notifications/subscriptions")
def register_push_subscription(
    payload: PushSubscriptionRequest,
    user_token: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    """Register browser Web Push subscription endpoint."""
    user_id = user_token.get("user_id", 1)
    sub = db.query(NotificationSubscription).filter(
        NotificationSubscription.user_id == user_id,
        NotificationSubscription.endpoint == payload.endpoint
    ).first()
    if not sub:
        sub = NotificationSubscription(
            user_id=user_id,
            endpoint=payload.endpoint,
            p256dh=payload.p256dh,
            auth_key=payload.auth,
            user_agent="Desktop Browser"
        )
        db.add(sub)
        db.commit()
    return {"success": True, "status": "REGISTERED"}

