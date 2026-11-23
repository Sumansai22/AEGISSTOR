# AEGISSTOR – API Reference Manual

AEGISSTOR exposes a dual API architecture:
1. `/api/v1/*`: Enterprise REST API with JWT bearer authentication, multi-tenant scoping, and role enforcement.
2. `/api/*`: Backward-compatible local dashboard endpoints for core telemetry widgets.

---

## 1. Authentication & User Management

### `POST /api/v1/auth/login`
Authenticates a user using email and password, with optional TOTP MFA code.

**Request Body:**
```json
{
  "email": "admin@aegisstor.internal",
  "password": "AdminPassword@2026!",
  "totp_code": "123456"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOi...",
  "refresh_token": "eyJhbGciOi...",
  "token_type": "bearer",
  "expires_in_minutes": 60,
  "user": {
    "id": 1,
    "email": "admin@aegisstor.internal",
    "full_name": "AEGISSTOR Enterprise Administrator",
    "role": "SUPER_ADMIN",
    "org_id": 1,
    "mfa_enabled": false
  }
}
```

### `GET /api/v1/auth/me`
Returns the currently authenticated user's profile and active role.

### `POST /api/v1/auth/mfa/setup`
Initializes a new RFC 6238 TOTP cryptographic secret and URI.

**Response:**
```json
{
  "secret": "JBSWY3DPEHPK3PXP...",
  "otpauth_uri": "otpauth://totp/AEGISSTOR:admin@aegisstor.internal?secret=...&issuer=AEGISSTOR"
}
```

### `POST /api/v1/auth/mfa/verify`
Verifies a 6-digit TOTP code and activates two-factor authentication on the user account.

### `GET /api/v1/users/`
*(Requires `SUPER_ADMIN` role)* Lists all registered enterprise users in the organization.

### `POST /api/v1/users/`
*(Requires `SUPER_ADMIN` role)* Creates a new enterprise user.

---

## 2. Enterprise Database Connectors

### `GET /api/v1/databases/`
Lists all registered database connections within the tenant organization.

### `POST /api/v1/databases/`
*(Requires `SUPER_ADMIN` or `DATABASE_ADMIN` role)* Registers an enterprise database. Passwords are automatically encrypted via AES-256 Fernet before database storage.

**Request Body:**
```json
{
  "name": "Production PostgreSQL Cluster",
  "db_type": "POSTGRESQL",
  "host": "postgres-prod.internal",
  "port": 5432,
  "database_name": "billing_db",
  "username": "aegis_monitor",
  "password": "SecurePassword123"
}
```

### `POST /api/v1/databases/{id}/test`
Tests network and authentication reachability for the registered database.

**Response:**
```json
{
  "connected": true,
  "database_name": "billing_db",
  "latency_ms": 14.2
}
```

### `POST /api/v1/databases/{id}/sync`
Triggers an immediate metadata telemetry sync (database byte footprint, tablespace allocation, table/index bloat).

---

## 3. Machine Learning & Capacity Analytics

### `GET /api/v1/predictions/benchmarks?drive=C:`
Executes a chronological multi-model tournament (LightGBM, Random Forest, Ridge Linear, Moving Average) and returns evaluation metrics.

**Response:**
```json
{
  "drive": "C:",
  "best_model": "LightGBM Regressor",
  "benchmarks": [
    {
      "model_name": "LightGBM Regressor",
      "mae_gb": 0.0412,
      "rmse_gb": 0.0581,
      "mape_percent": 0.12,
      "r2_score": 0.9841,
      "selected_for_forecast": true
    },
    {
      "model_name": "Random Forest Regressor",
      "mae_gb": 0.0495,
      "rmse_gb": 0.0632,
      "mape_percent": 0.14,
      "r2_score": 0.9782,
      "selected_for_forecast": false
    }
  ]
}
```

### `GET /api/v1/predictions/multi-horizon?drive=C:`
Generates multi-horizon capacity forecasts across 7-day, 15-day, 30-day, 60-day, and 90-day time horizons with 95% confidence intervals and capacity runway calculations.

### `GET /api/v1/anomalies/`
Lists all detected storage and database capacity anomalies identified by the Isolation Forest engine.

### `POST /api/v1/anomalies/{id}/acknowledge`
Marks an identified anomaly as reviewed and acknowledged by an administrator.

---

## 4. Privacy Guard & Data Lifecycle

### `GET /api/v1/privacy/policy`
Retrieves tenant privacy policy settings (metadata-only mode, identifier masking, retention days).

### `POST /api/v1/privacy/policy`
*(Requires `SUPER_ADMIN` role)* Updates tenant privacy rules and telemetry retention limits.

### `POST /api/v1/privacy/purge`
*(Requires `SUPER_ADMIN` role)* Manually triggers a cryptographic retention purge, safely removing historical telemetry older than the configured retention threshold.

---

## 5. Storage Optimization & Safety Actions

### `POST /api/recommendations/apply`
*(Requires explicit user confirmation)* Executes a safe file cleanup operation. Protected Windows operating system directories (`C:\Windows`, `WinSxS`, system volume directories) are strictly blocked from modification.

**Request Body:**
```json
{
  "recommendation_id": 1,
  "confirmed": true,
  "delete_file_paths": [
    "C:\\Users\\Sumanth\\AppData\\Local\\Temp\\sample_cache.tmp"
  ]
}
```
