"""
AEGISSTOR Validation and Hardening Test Suite
Validates security, cryptography, machine learning, database connectors, and privacy controls.
"""
import sys
import os
import math
import time
from pathlib import Path
from datetime import datetime, timedelta
import pandas as pd
import numpy as np

backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.security.hasher import hash_password, verify_password, needs_rehash
from app.security.crypto import (
    encrypt_credential, decrypt_credential, rotate_credential,
    get_crypto_specifications, _get_raw_256bit_key
)
from app.security.mfa import generate_mfa_secret, verify_totp_code
import pyotp
from app.security.tokens import (
    create_access_token, create_refresh_token, decode_token,
    revoke_token, is_token_revoked
)
from app.security.rbac import UserRole, require_role
from app.ml.engine import ml_engine
from app.connectors.factory import get_connector
from app.privacy.guard import privacy_guard


# =========================================================================
# 1. SECURITY & ACCESS CONTROL VALIDATION
# =========================================================================

def test_argon2id_configuration():
    """Verify Argon2id OWASP memory/time configuration."""
    raw_pass = "EnterpriseSecurePass#2026!"
    hashed = hash_password(raw_pass)
    assert hashed.startswith("$argon2id$")
    assert "m=65536" in hashed  # 64 MiB
    assert "t=2" in hashed      # 2 iterations
    assert "p=4" in hashed      # 4 threads
    assert verify_password(raw_pass, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False
    assert needs_rehash(hashed) is False


def test_jwt_expiry_and_revocation():
    """Verify JWT expiry, token JTI tracking, and immediate revocation."""
    import jwt
    from app.security.tokens import JWT_SECRET_KEY, JWT_ALGORITHM

    # Test valid token
    token = create_access_token(user_id=10, org_id=1, role="ANALYST", email="analyst@tenant.org")
    payload = decode_token(token)
    assert payload is not None
    assert payload["email"] == "analyst@tenant.org"
    assert "jti" in payload

    # Test revocation
    jti = payload["jti"]
    assert not is_token_revoked(jti)
    revoke_token(jti)
    assert is_token_revoked(jti)
    # Once revoked, decode_token must reject it
    assert decode_token(token) is None

    # Test expired token
    expired_payload = {
        "sub": "10",
        "user_id": 10,
        "org_id": 1,
        "type": "access",
        "jti": "expired-jti-123",
        "exp": datetime.utcnow() - timedelta(minutes=5)
    }
    expired_token = jwt.encode(expired_payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    assert decode_token(expired_token) is None


def test_mfa_verification_and_replay_protection():
    """Verify TOTP verification and enforce replay prevention within the valid window."""
    secret = generate_mfa_secret()
    totp = pyotp.TOTP(secret)
    valid_code = totp.now()

    # First verification must succeed
    assert verify_totp_code(secret, valid_code) is True

    # Immediate replay with the exact same code MUST fail
    assert verify_totp_code(secret, valid_code) is False

    # Invalid code must fail
    assert verify_totp_code(secret, "000000") is False
    assert verify_totp_code(secret, "abcdef") is False


def test_rbac_role_hierarchy():
    """Verify RBAC permissions hierarchy and boundary enforcement."""
    # SUPER_ADMIN has access to all roles
    super_admin_guard = require_role([UserRole.SUPER_ADMIN])
    assert super_admin_guard({"role": "SUPER_ADMIN"})["role"] == "SUPER_ADMIN"

    # VIEWER cannot access SUPER_ADMIN or DATABASE_ADMIN endpoints
    from fastapi import HTTPException
    db_admin_guard = require_role([UserRole.SUPER_ADMIN, UserRole.DATABASE_ADMIN])
    try:
        db_admin_guard({"role": "VIEWER"})
        assert False, "Should have raised HTTPException 403"
    except HTTPException as e:
        assert e.status_code == 403

    # ANALYST cannot access DATABASE_ADMIN endpoint
    try:
        db_admin_guard({"role": "ANALYST"})
        assert False, "Should have raised HTTPException 403"
    except HTTPException as e:
        assert e.status_code == 403


def test_sql_injection_resistance():
    """Verify that SQL injection probe strings in database connector fields do not cause syntax errors."""
    injection_strings = [
        "' OR '1'='1",
        "admin'; DROP TABLE users; --",
        "1 UNION SELECT null, username, password FROM users --",
        "' OR 1=1;--"
    ]
    for inj in injection_strings:
        # Connectors must safely accept parameter inputs without raw string formatting
        connector = get_connector(
            db_type="POSTGRESQL",
            host="127.0.0.1",
            port=5432,
            database=inj,
            username=inj,
            password=inj
        )
        # Should attempt connection and safely fail with connection refused or auth error, not unhandled SQL syntax error
        res = connector.test_connection()
        assert res["success"] is False
        assert "is_live" in res
        assert not res["is_live"]


# =========================================================================
# 2. CRYPTOGRAPHY VALIDATION
# =========================================================================

def test_aes256_gcm_encryption_and_integrity():
    """Verify AES-256-GCM encryption, authenticated decryption, and tampering detection."""
    password = "SuperEnterpriseSecretDbPassword#2026"
    encrypted = encrypt_credential(password)
    assert encrypted.startswith("aes256gcm:")

    # Decrypt and verify round-trip
    decrypted = decrypt_credential(encrypted)
    assert decrypted == password

    # Tamper with ciphertext byte (authenticated encryption integrity check)
    raw_b64 = encrypted[len("aes256gcm:"):]
    import base64
    raw_bytes = bytearray(base64.urlsafe_b64decode(raw_b64))
    raw_bytes[-1] ^= 0xFF  # Flip bit in auth tag
    tampered_b64 = base64.urlsafe_b64encode(raw_bytes).decode("utf-8")
    tampered_str = f"aes256gcm:{tampered_b64}"

    # Decrypting tampered payload must fail and return empty string
    assert decrypt_credential(tampered_str) == ""


def test_cryptographic_key_rotation():
    """Verify credential rotation from old key to new key."""
    old_key = os.urandom(32)
    new_key = os.urandom(32)
    password = "DbPasswordToRotate@999"

    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    old_aes = AESGCM(old_key)
    nonce = os.urandom(12)
    cipher = old_aes.encrypt(nonce, password.encode("utf-8"), None)
    import base64
    old_encrypted = f"aes256gcm:{base64.urlsafe_b64encode(nonce + cipher).decode('utf-8')}"

    # Rotate
    rotated = rotate_credential(old_encrypted, old_key, new_key)
    assert rotated.startswith("aes256gcm:")

    # Verify decrypt under new key
    b64_part = rotated[len("aes256gcm:"):]
    payload = base64.urlsafe_b64decode(b64_part)
    new_aes = AESGCM(new_key)
    decrypted = new_aes.decrypt(payload[:12], payload[12:], None).decode("utf-8")
    assert decrypted == password


def test_crypto_specifications():
    """Verify exact technical crypto specifications are documented and returned accurately."""
    specs = get_crypto_specifications()
    assert specs["primary_cipher"] == "AES-256-GCM (Galois/Counter Mode)"
    assert specs["primary_key_size_bits"] == 256
    assert specs["primary_nonce_size_bits"] == 96
    assert specs["primary_auth_tag_size_bits"] == 128
    assert "Fernet (AES-128-CBC" in specs["legacy_cipher_fallback"]
    assert specs["key_rotation_supported"] is True


# =========================================================================
# 3. MACHINE LEARNING VALIDATION
# =========================================================================

def test_ml_chronological_validation_and_models():
    """Verify chronological train/test split, tournament models, and error metrics."""
    # Generate 40 hours of synthetic storage telemetry
    start = datetime(2026, 11, 1, 0, 0, 0)
    timestamps = [start + timedelta(hours=i) for i in range(40)]
    # Linear growth with noise: 200 GB + 0.1 GB/hour + sin noise
    base_bytes = 200 * (1024 ** 3)
    used_bytes = [base_bytes + (i * 0.12 * (1024 ** 3)) + (math.sin(i) * 0.02 * (1024 ** 3)) for i in range(40)]

    df = pd.DataFrame({"timestamp": timestamps, "used_bytes": used_bytes})
    X, y = ml_engine.extract_time_features(df)

    eval_result = ml_engine.evaluate_multi_models(X, y)
    benchmarks = eval_result["benchmarks"]

    assert "LIGHTGBM" in benchmarks
    assert "RANDOM_FOREST" in benchmarks
    assert "LINEAR_REGRESSION" in benchmarks
    assert "MOVING_AVERAGE" in benchmarks

    # Metrics must be non-negative numbers
    for m_name, bm in benchmarks.items():
        assert bm["mae_gb"] >= 0.0
        assert bm["rmse_gb"] >= 0.0
        assert bm["mape_percent"] >= 0.0

    # Best model instance must be trained
    assert eval_result["best_model_instance"] is not None


def test_ml_model_persistence():
    """Verify joblib model saving and loading."""
    from sklearn.linear_model import Ridge
    dummy_model = Ridge().fit([[1, 2], [3, 4]], [10, 20])
    save_path = ml_engine.save_model("C:", "RIDGE_TEST", dummy_model)
    assert Path(save_path).exists()

    loaded = ml_engine.load_model("C:", "RIDGE_TEST")
    assert loaded is not None
    pred = loaded.predict([[2, 3]])
    assert len(pred) == 1


def test_storage_growth_patterns():
    """Test capacity runway under distinct growth patterns: growth, stable, decline."""
    capacity = 500 * (1024 ** 3)
    current_used = 350 * (1024 ** 3)  # 70% used

    # 1. Sudden rapid growth (+5 GB/day)
    rapid_growth = 5 * (1024 ** 3)
    res_growth = ml_engine.calculate_capacity_runway(current_used, capacity, rapid_growth)
    # Days to 80% (400 GB): (400-350)/5 = 10 days
    assert abs(res_growth["threshold_runways"]["days_to_80_percent"] - 10.0) < 0.2
    # Days to 100% (500 GB): (500-350)/5 = 30 days
    assert abs(res_growth["threshold_runways"]["days_to_100_percent"] - 30.0) < 0.2

    # 2. Stable usage (0 growth)
    res_stable = ml_engine.calculate_capacity_runway(current_used, capacity, 0.0)
    assert res_stable["threshold_runways"]["days_to_80_percent"] is None
    assert "Safe" in res_stable["threshold_runways"]["date_80_percent"]

    # 3. Declining usage (-2 GB/day)
    res_decline = ml_engine.calculate_capacity_runway(current_used, capacity, -2 * (1024 ** 3))
    assert res_decline["threshold_runways"]["days_to_80_percent"] is None
    assert res_decline["daily_growth_gb"] < 0.0


def test_insufficient_data_handling():
    """Verify anomaly detection handles short histories safely."""
    # Under 8 samples must return empty anomaly list without crashing
    df_short = pd.DataFrame({
        "timestamp": [datetime.utcnow() + timedelta(minutes=i) for i in range(4)],
        "used_bytes": [1000, 2000, 3000, 4000]
    })
    anomalies = ml_engine.detect_anomalies(df_short, "C:")
    assert anomalies == []


# =========================================================================
# 4. DATABASE CONNECTOR VALIDATION
# =========================================================================

def test_database_connector_failure_accuracy():
    """Verify that connectors accurately report failure when given unreachable targets or bad credentials."""
    for db_type in ["POSTGRESQL", "MYSQL", "SQL_SERVER", "ORACLE"]:
        connector = get_connector(
            db_type=db_type,
            host="192.0.2.1",  # Test-net unroutable IP (guaranteed timeout / connection refused)
            port=5432,
            database="test_db",
            username="invalid_user",
            password="bad_password"
        )
        res = connector.test_connection()
        # MUST report success = False and connected = False
        assert res["success"] is False, f"{db_type} falsely reported success on unreachable host!"
        assert res["connected"] is False
        assert "error" in res or "message" in res
        assert not res.get("is_live", True)


# =========================================================================
# 5. PRIVACY & DATA MINIMIZATION VALIDATION
# =========================================================================

def test_privacy_guard_enforcement():
    """Verify tenant policy retention query logic and data minimization."""
    policy = privacy_guard.get_policy(org_id=1)
    assert policy["data_minimization_mode"] is True
    assert policy["retention_days"] >= 7
    assert policy["status"] == "COMPLIANT"

    # Purge logic execution
    purged = privacy_guard.enforce_retention_purge(org_id=1)
    assert "storage_records" in purged
    assert "database_records" in purged
    assert isinstance(purged["storage_records"], int)
