# AEGISSTOR – Security Test and Hardening Report

**Date:** November 17, 2026  
**Auditor:** Senior Security Architect & Penetration Tester  
**Scope:** Authentication, Cryptography, Token Lifecycle, Session Invalidation, RBAC, Multi-tenancy, and SQL Injection Resistance  
**Status:** PASS – All Hardening Gates Cleared

---

## 1. Password Security & Argon2id Verification

### 1.1 OWASP Standard Compliance
AEGISSTOR employs Argon2id for password hashing using parameters meeting and exceeding OWASP Password Storage Cheat Sheet recommendations:
- **Variant:** Argon2id (`$argon2id$`)
- **Memory Cost ($m$):** 65,536 KiB (64 MiB)
- **Time Cost ($t$):** 2 iterations
- **Parallelism ($p$):** 4 threads
- **Salt:** 16 bytes cryptographically generated via `os.urandom(16)`
- **Hash Length:** 32 bytes

### 1.2 Default Password Invalidation & Forced Change
- Default administrator password (`AdminPassword@2026!`) was flagged with `must_change_password = True` in the database schema.
- Added endpoint `POST /api/v1/auth/change-password` requiring:
  - Minimum 10 characters length
  - At least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special symbol
  - Rejection of standard/default passwords
  - Password mismatch verification
- Verified in `test_argon2id_configuration`: hashes produce correct `$argon2id$v=19$m=65536,t=2,p=4$` format and accurately verify matching and non-matching passwords.

---

## 2. Token Governance & Session Security

### 2.1 JWT Claims and JTI Tracking
Tokens are signed with `HS256` using an enterprise secret key (`JWT_SECRET_KEY`).
- Access Token Lifetime: 30 minutes
- Refresh Token Lifetime: 7 days
- Token Payload includes: `user_id`, `org_id`, `role`, `email`, `type`, and a cryptographically unique `jti` (UUID4).

### 2.2 Token Revocation & Refresh Rotation
- **In-Memory Revocation Blacklist:** Implemented in `backend/app/security/tokens.py` with `revoke_token(jti)` and `is_token_revoked(jti)`.
- **Refresh Token Rotation:** Implemented via `POST /api/v1/auth/refresh`. When a refresh token is presented, its `jti` is immediately revoked, and an entirely new `(access_token, refresh_token)` pair is returned.
- **Session Logout:** Implemented via `POST /api/v1/auth/logout`, revoking both access and refresh tokens.
- Verified in `test_jwt_expiry_and_revocation`: revoked tokens and expired tokens return `None` upon decoding and reject subsequent requests.

---

## 3. Multi-Factor Authentication (MFA) Replay Protection

### 3.1 RFC 6238 Compliance
- MFA utilizes standard Time-Based One-Time Passwords (TOTP) compliant with RFC 6238.
- 32-character Base32 secret generated via `pyotp.random_base32()`.
- Supports Google Authenticator, Microsoft Authenticator, and standard TOTP hardware tokens.

### 3.2 Replay Protection (RFC 6238 §7.3)
- An in-memory cache with TTL (`_VERIFIED_CODES`) stores SHA-256 hashes of `(secret, code)`.
- Once a code is validated within its active window ($\pm 1$ step, $\pm 30$ seconds), replaying the identical code fails with:
  `"TOTP code has already been consumed (replay prevention)"`
- Verified in `test_mfa_verification_and_replay_protection`: valid token succeeds initially, but second consecutive verification within the same window returns `False`.

---

## 4. Role-Based Access Control (RBAC) Hardening

### 4.1 Strict Hierarchy Definition
Access is governed by a strict hierarchy:
```
SUPER_ADMIN > DATABASE_ADMIN > SECURITY_AUDITOR > ANALYST > VIEWER
```

### 4.2 Permission Mapping (`USER_ROLE_PERMISSIONS`)
```python
USER_ROLE_PERMISSIONS = {
    UserRole.SUPER_ADMIN: {
        UserRole.SUPER_ADMIN, UserRole.DATABASE_ADMIN,
        UserRole.SECURITY_AUDITOR, UserRole.ANALYST, UserRole.VIEWER
    },
    UserRole.DATABASE_ADMIN: {
        UserRole.DATABASE_ADMIN, UserRole.ANALYST, UserRole.VIEWER
    },
    UserRole.SECURITY_AUDITOR: {
        UserRole.SECURITY_AUDITOR, UserRole.VIEWER
    },
    UserRole.ANALYST: {
        UserRole.ANALYST, UserRole.VIEWER
    },
    UserRole.VIEWER: {
        UserRole.VIEWER
    }
}
```

### 4.3 Validation Results
- Callers without a valid bearer token receive `HTTP 401 Unauthorized`.
- Callers with roles lesser than the endpoint requirements receive `HTTP 403 Forbidden`.
- Verified in `test_rbac_role_hierarchy`: `VIEWER` and `ANALYST` users were strictly blocked from `DATABASE_ADMIN` actions.

---

## 5. SQL Injection & Cross-Tenant Boundary Testing

### 5.1 Injection Resistance
Database connector configuration inputs (`database`, `username`, `password`, `host`) were tested with common SQL injection payloads:
- `' OR '1'='1`
- `admin'; DROP TABLE users; --`
- `1 UNION SELECT null, username, password FROM users --`
- `' OR 1=1;--`

**Result:** All connector drivers utilize parameterization. Connector connection attempts safely failed at driver network level or authentication level without syntax errors or unhandled SQL execution.

### 5.2 Cross-Tenant Isolation
- All database operations in `session.py` filter queries by `tenant_id` or `org_id`.
- JWT tokens carry the immutable `org_id` claim, preventing tenants from reading or modifying storage telemetry or database credentials belonging to other tenants.

---

## 6. Audit Logging & Secret Masking

- Passwords, decryption keys, and database passwords are automatically masked (`***`) before logging.
- `GET /api/v1/database-connectors/list` masks credentials.
- Security-relevant events (login, failed login, token revocation, policy modification) generate immutable records in the `audit_logs` table.
