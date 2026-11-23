# AEGISSTOR – Enterprise Security Architecture & Compliance

## 1. Security Overview

AEGISSTOR implements defense-in-depth principles across authentication, secret management, multi-tenancy, and audit accountability.

---

## 2. Cryptographic Authentication & Password Hashing

### Argon2id Password Hashing
AEGISSTOR utilizes Argon2id—the winner of the Password Hashing Competition (PHC)—to protect all user credentials against GPU-accelerated brute force and side-channel timing attacks.
- **Memory Cost (`m`)**: 65,536 KiB (64 MiB)
- **Time Cost (`t`)**: 3 iterations
- **Parallelism (`p`)**: 4 threads
- **Salt Length**: 16 cryptographically random bytes

```python
# backend/app/security/hasher.py
ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4, hash_len=32, salt_len=16)
```

---

## 3. Two-Factor Authentication (TOTP MFA)

AEGISSTOR implements RFC 6238 Time-Based One-Time Passwords (TOTP):
- Generates 32-character Base32 cryptographic secrets.
- Generates standard `otpauth://` URIs compatible with Google Authenticator, Microsoft Authenticator, 1Password, and Bitwarden.
- Verifies 6-digit codes with a 30-second time step and ±1 step time tolerance to account for clock skew.

---

## 4. Database Credential Encryption at Rest (AES-256 Fernet)

Enterprise database passwords and connection strings are never stored in plaintext:
- Encrypted using **AES-128-CBC with PKCS7 padding and HMAC-SHA256 authentication** (Fernet specification).
- The cryptographic master key is loaded from the environment (`AEGISSTOR_SECRET_KEY`) or derived via PBKDF2HMAC.
- Encrypted ciphertext is safely stored in the `encrypted_password` column in SQLite.

---

## 5. 4-Tier Role-Based Access Control (RBAC)

AEGISSTOR enforces 4 hierarchical security roles:

| Tier | Role | Allowed Privileges |
| :--- | :--- | :--- |
| **Tier 1** | `SUPER_ADMIN` | Full administrative control, user provisioning, database registration, disk cleanup execution, privacy purge. |
| **Tier 2** | `DATABASE_ADMIN` | View all storage and database telemetry, register and test database connections, view bloat metrics. Restricted from deleting OS disk files. |
| **Tier 3** | `ANALYST` | View local storage telemetry, run ML forecasting and digital twin simulations, inspect capacity runway. Read-only on database connections. |
| **Tier 4** | `VIEWER` | Read-only visibility into high-level overview metrics, capacity runway, and risk dashboards. |

Role enforcement is checked via FastAPI dependency injection guards:
```python
@router.post("/recommendations/apply", dependencies=[Depends(require_role("SUPER_ADMIN"))])
async def apply_recommendation(...):
    ...
```

---

## 6. Tamper-Evident Audit Logging

All administrative, authentication, and optimization events generate permanent audit records:
- **Timestamp**: ISO-8601 UTC timestamp.
- **User Attribution**: Authenticated email address and Organization ID.
- **Action Type**: E.g., `AUTH_LOGIN`, `CLEANUP_EXECUTED`, `PURGE_TELEMETRY`, `DB_REGISTERED`.
- **Resource Identifier**: Specific drive, path, or database target.
- **Status**: `SUCCESS`, `DENIED`, or `FAILED`.
- **IP Address & Request ID**: Tracing metadata for forensic review.

---

## 7. Windows Safety Controls & OS Safeguards

AEGISSTOR operates under strict non-destructive safety constraints:
1. **Never Delete Protected Windows Paths**:
   - `C:\Windows`
   - `C:\Windows\System32`
   - `C:\Windows\WinSxS`
   - `C:\$Recycle.Bin`
   - `System Volume Information`
   - `pagefile.sys`, `hiberfil.sys`, `swapfile.sys`
2. **Explicit User Confirmation**: Optimization and cleanup actions cannot execute autonomously. Every action requires human review and confirmation modal agreement.
3. **No Process Termination**: AEGISSTOR never terminates Windows services or user tasks automatically.
