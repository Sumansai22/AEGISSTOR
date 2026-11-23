"""
Enterprise Security, Database Connectors & ML Validation Tests
"""
import sys
from pathlib import Path
import pytest

backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.security.hasher import hash_password, verify_password
from app.security.crypto import encrypt_credential, decrypt_credential
from app.security.mfa import generate_mfa_secret, verify_totp_code
from app.security.tokens import create_access_token, decode_token
from app.connectors.factory import get_connector
from app.ml.engine import ml_engine
from app.privacy.guard import privacy_guard

def test_argon2id_hashing():
    """Verify Argon2id password hashing and validation."""
    pwd = "EnterpriseSecretPassword@2026!"
    hashed = hash_password(pwd)
    assert hashed.startswith("$argon2id$")
    assert verify_password(pwd, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False

def test_credential_encryption():
    """Verify AES-256 / Fernet credential encryption and decryption."""
    raw_secret = "PgSuperSecretPassword123$"
    encrypted = encrypt_credential(raw_secret)
    assert encrypted != raw_secret
    decrypted = decrypt_credential(encrypted)
    assert decrypted == raw_secret

def test_mfa_totp():
    """Verify TOTP secret generation and validation."""
    import pyotp
    secret = generate_mfa_secret()
    assert len(secret) == 32
    totp = pyotp.TOTP(secret)
    current_code = totp.now()
    assert verify_totp_code(secret, current_code) is True
    assert verify_totp_code(secret, "000000") is False

def test_jwt_token_handling():
    """Verify signed access tokens and payload decoding."""
    token = create_access_token(user_id=42, org_id=1, role="SUPER_ADMIN", email="admin@test.com")
    payload = decode_token(token)
    assert payload is not None
    assert payload["user_id"] == 42
    assert payload["role"] == "SUPER_ADMIN"
    assert payload["type"] == "access"

def test_database_connectors():
    """Verify modular database connectors for Postgres, MySQL, SQL Server, and Oracle."""
    pg = get_connector("POSTGRESQL", "127.0.0.1", 5432, "testdb", "user", "pass")
    meta_pg = pg.collect_storage_metadata()
    assert meta_pg["total_size_bytes"] > 0
    assert "top_tables" in meta_pg

    mysql = get_connector("MYSQL", "127.0.0.1", 3306, "testdb", "user", "pass")
    meta_mysql = mysql.collect_storage_metadata()
    assert meta_mysql["total_size_bytes"] > 0

    mssql = get_connector("SQL_SERVER", "127.0.0.1", 1433, "master", "sa", "pass")
    meta_mssql = mssql.collect_storage_metadata()
    assert meta_mssql["total_size_bytes"] > 0

    oracle = get_connector("ORACLE", "127.0.0.1", 1521, "ORCL", "system", "pass")
    meta_oracle = oracle.collect_storage_metadata()
    assert meta_oracle["total_size_bytes"] > 0

def test_capacity_runway_calculations():
    """Verify runway threshold calculations for 70%, 80%, 90%, 95%, 100%."""
    total = 500 * (1024 ** 3)
    used = 350 * (1024 ** 3)  # 70% used
    daily_growth = 2 * (1024 ** 3)  # 2 GB / day

    runway = ml_engine.calculate_capacity_runway(used, total, daily_growth)
    assert runway["daily_growth_gb"] == 2.0
    assert runway["monthly_growth_gb"] == 60.0
    assert "days_to_80_percent" in runway["threshold_runways"]
    assert "days_to_90_percent" in runway["threshold_runways"]
    # 80% is 400 GB -> remaining 50 GB / 2 GB/d = 25 days
    assert runway["threshold_runways"]["days_to_80_percent"] == 25.0

def test_privacy_guard_policy():
    """Verify privacy guard policy retrieval and minimization."""
    policy = privacy_guard.get_policy(org_id=1)
    assert policy["data_minimization_mode"] is True
    assert policy["credential_encryption_active"] is True
    assert policy["status"] == "COMPLIANT"
