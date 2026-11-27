"""
AEGISSTOR Enterprise Security Center & Privacy Guard Test Suite
Tests security checks, status calculation, RBAC authorization, token revocation,
audit logging, sensitive data detection, PII masking, retention preview/purge,
and security headers middleware.
"""
import pytest
import sys
from pathlib import Path
from datetime import datetime, timedelta

backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from fastapi.testclient import TestClient
from app.main import app
from app.models.database import (
    Base, User, AuditLog, SecurityEvent, PrivacyEvent,
    PrivacyPolicy, SecurityScanResult, PrivacyScanResult
)
from app.database.session import SessionLocal
from app.security.service import security_service
from app.privacy.guard import (
    privacy_guard, mask_email, mask_phone, mask_ip,
    mask_aws_key, mask_credential, mask_sensitive_text
)
from app.security.tokens import create_access_token, decode_token, revoke_token
from app.security.hasher import hash_password, verify_password

client = TestClient(app)

def test_security_status_calculation():
    """Verify security status and score are computed from actual checks."""
    res = client.get("/api/v1/security/status")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "overall_status" in data
    assert "security_score" in data
    assert isinstance(data["security_score"], (int, float))
    assert 0.0 <= data["security_score"] <= 100.0
    assert "latest_scan" in data
    assert data["latest_scan"]["total_checks"] >= 10

def test_security_check_execution():
    """Test individual security check verification."""
    checks = security_service.get_security_checks()
    assert len(checks) >= 10
    check_ids = [c["id"] for c in checks]
    assert "SEC-01" in check_ids  # Argon2id
    assert "SEC-02" in check_ids  # TOTP
    assert "SEC-03" in check_ids  # RBAC
    assert "SEC-04" in check_ids  # Tokens
    assert "SEC-05" in check_ids  # AES-256 Vault
    assert "SEC-06" in check_ids  # Database
    assert "SEC-07" in check_ids  # AWS
    assert "SEC-08" in check_ids  # Secret Hygiene
    assert "SEC-09" in check_ids  # CORS/Headers
    assert "SEC-10" in check_ids  # Supply Chain

    for c in checks:
        assert c["status"] in ("PASS", "WARNING", "FAILED", "UNKNOWN")
        assert c["severity"] in ("INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL")
        assert len(c["details"]) > 0
        assert len(c["remediation"]) > 0

def test_security_scan_run_and_persistence():
    """Test manual execution of security scan and database persistence."""
    res = client.post("/api/v1/security/checks/run")
    assert res.status_code == 200
    data = res.json()
    assert "scan_id" in data
    assert data["scan_id"].startswith("sec-scan-")
    assert data["total_checks"] >= 10

    # Verify DB persistence
    db = SessionLocal()
    try:
        rec = db.query(SecurityScanResult).filter(SecurityScanResult.scan_id == data["scan_id"]).first()
        assert rec is not None
        assert rec.overall_score == data["overall_score"]
    finally:
        db.close()

def test_security_events_tracking():
    """Test security event logging and querying."""
    evt = security_service.record_security_event(
        event_type="AUTH_SUCCESS",
        action="USER_LOGIN",
        result="SUCCESS",
        severity="INFO",
        user_identifier="testuser@aegisstor.internal",
        safe_metadata={"ip": "127.0.0.1", "auth_method": "ARGON2ID"}
    )
    assert evt is not None
    assert evt.event_id.startswith("sec-evt-")

    # Fetch via API
    res = client.get("/api/v1/security/events?limit=10")
    assert res.status_code == 200
    events = res.json()
    assert isinstance(events, list)
    assert any(e["event_id"] == evt.event_id for e in events)

def test_authentication_and_password_hashing():
    """Verify Argon2id password hashing and JWT token creation/verification."""
    raw_pass = "TestPassword@2026!Secret"
    hashed = hash_password(raw_pass)
    assert "$argon2id$" in hashed
    assert verify_password(raw_pass, hashed)
    assert not verify_password("WrongPassword!", hashed)

    # JWT Token
    token = create_access_token(user_id=99, org_id=1, role="VIEWER", email="viewer@aegisstor.internal", jti="test-jti-123")
    decoded = decode_token(token)
    assert decoded is not None
    assert decoded["email"] == "viewer@aegisstor.internal"
    assert decoded["role"] == "VIEWER"

def test_token_revocation_logout():
    """Test token revocation blacklist."""
    token = create_access_token(user_id=101, org_id=1, role="ANALYST", email="analyst@aegisstor.internal", jti="revoke-test-jti-456")
    assert decode_token(token) is not None

    # Revoke JTI
    revoke_token("revoke-test-jti-456")
    assert decode_token(token) is None

def test_authorization_restrictions():
    """Verify RBAC denies unauthorized users from executing super-admin endpoints."""
    # Create viewer token
    viewer_token = create_access_token(user_id=102, org_id=1, role="VIEWER", email="viewer@aegisstor.internal")
    
    # Attempt to update privacy policy (requires SUPER_ADMIN)
    res = client.post(
        "/api/v1/privacy/settings",
        json={"retention_days": 15},
        headers={"Authorization": f"Bearer {viewer_token}"}
    )
    assert res.status_code == 403
    assert "Access denied" in res.json().get("detail", "")

def test_audit_logs_search_and_export():
    """Test audit log search, severity filter, and CSV export."""
    db = SessionLocal()
    try:
        db.add(AuditLog(
            org_id=1,
            user_email="auditor@aegisstor.internal",
            action_type="CONFIG_MODIFICATION",
            resource="SecurityVault",
            description="Modified encryption key rotation schedule",
            status="SUCCESS"
        ))
        db.commit()
    finally:
        db.close()

    # Search audit logs
    res = client.get("/api/v1/security/audit-logs?search=rotation")
    assert res.status_code == 200
    data = res.json()
    items = data.get("items", data) if isinstance(data, dict) else data
    assert any("rotation" in i.get("description", "").lower() for i in items)

    # Export CSV
    export_res = client.get("/api/v1/security/audit-logs/export")
    assert export_res.status_code == 200
    assert "text/csv" in export_res.headers.get("content-type", "")
    assert "Action Type" in export_res.text

def test_data_masking_utilities():
    """Test comprehensive data masking and redaction utilities."""
    assert mask_email("john.doe@enterprise.com") == "j***@enterprise.com"
    assert mask_phone("9876543210") == "******3210"
    assert mask_phone("+1 (555) 234-5678") == "******5678"
    assert mask_ip("192.168.1.105") == "192.168.***.***"
    assert mask_aws_key("AKIAIOSFODNN7EXAMPLE") == "AKIA************MPLE"
    assert mask_credential("SuperSecretPassword123") == "[REDACTED]"

    sample_text = "Contact support at alice@example.com or call 555-123-4567 using AKIA1234567890ABCDEF."
    masked_out = mask_sensitive_text(sample_text)
    assert "alice@example.com" not in masked_out
    assert "a***@example.com" in masked_out
    assert "AKIA************CDEF" in masked_out

def test_privacy_sensitive_data_scan():
    """Test privacy scan detecting sensitive items without exposing plaintext."""
    findings = privacy_guard.scan_text_for_sensitive_data(
        "User email: contact@company.com with phone 9876543210 and key AKIA9876543210ZYXWVU",
        "TestLocation"
    )
    assert len(findings) >= 3
    categories = [f["category"] for f in findings]
    assert "EMAIL" in categories
    assert "PHONE" in categories
    assert "AWS_KEY" in categories

    for f in findings:
        assert not f["masked_value"].startswith("contact@company.com")
        assert len(f["recommendation"]) > 0

def test_privacy_settings_persistence():
    """Test privacy settings update and retrieval."""
    res = client.get("/api/v1/privacy/settings")
    assert res.status_code == 200
    data = res.json()
    assert "retention_days" in data
    assert "data_minimization_mode" in data

    # Update settings
    put_res = client.put(
        "/api/v1/privacy/settings",
        json={"retention_days": 45, "mask_identifiers": True}
    )
    assert put_res.status_code == 200
    updated = put_res.json()
    assert updated["retention_days"] == 45
    assert updated["mask_identifiers"] is True

def test_retention_preview_and_purge():
    """Test retention purge preview and execution."""
    preview = client.get("/api/v1/privacy/retention/preview?retention_days=60")
    assert preview.status_code == 200
    p_data = preview.json()
    assert "preview_counts" in p_data
    assert "storage_telemetry_records" in p_data["preview_counts"]

    # Purge execution
    purge = client.post("/api/v1/privacy/purge?retention_days=180")
    assert purge.status_code == 200
    purge_data = purge.json()
    assert purge_data["success"] is True
    assert "purged_telemetry_records" in purge_data

def test_security_headers_middleware():
    """Verify that HTTP response includes enterprise security headers."""
    res = client.get("/health")
    assert res.status_code == 200
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("x-frame-options") == "DENY"
    assert "1" in res.headers.get("x-xss-protection", "")
