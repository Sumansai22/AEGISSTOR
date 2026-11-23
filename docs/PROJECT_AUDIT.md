# AEGISSTOR – Repository Architecture & System Audit

**Audit Date:** November 2026  
**Auditor:** Senior Software Architect, Database Administrator & Cybersecurity Engineer  
**Scope:** Complete Codebase Review, Architecture Assessment, and Enterprise Extension Strategy  
**Repository Location:** `C:\Users\Sumanth\.gemini\antigravity\scratch\aegisstor`

---

## 1. Executive Summary

AEGISSTOR was initially constructed as a localized Windows 11 storage monitoring, basic machine learning forecasting, and digital twin simulation application. The application possesses a solid foundation for physical drive detection (`psutil` + PowerShell `Get-PhysicalDisk`), local continuous telemetry into SQLite, basic LightGBM / baseline linear regression forecasting, and a 10-page React 18/TypeScript/Vite frontend.

However, to evolve into an **Enterprise-Grade Predictive Storage Intelligence and Database Security Platform** suitable for hospitals, universities, banks, financial institutions, and multi-tenant data centers, the system requires architectural maturation:
1. **Multi-Tenant Isolation**: Local storage currently assumes single-user desktop operation. Enterprise deployment mandates tenant isolation (`organizations` table and tenant scoped queries).
2. **Enterprise Database Monitoring**: While host filesystem telemetry exists, monitoring enterprise database engines (PostgreSQL, MySQL, SQL Server, Oracle) is needed, requiring dedicated read-only connectors collecting allocated, logical, table, index, and query latency metadata without accessing confidential records.
3. **Enterprise Security & Privacy Guard**: Adding Argon2id password hashing, TOTP-based Multi-Factor Authentication (MFA), 4-tier Role-Based Access Control (SUPER_ADMIN, DATABASE_ADMIN, ANALYST, VIEWER), token rotation, Fernet credential encryption, and metadata-only privacy guardrails.
4. **Machine Learning Anomaly Detection & Multi-Model Engine**: Augmenting the current LightGBM model with an ensemble comparison framework (Linear Regression, Random Forest, LightGBM, Moving Average baseline) and Isolation Forest anomaly detection for abnormal growth spikes and I/O saturation.
5. **REST API Versioning (`/api/v1/`)**: Transitioning from unversioned `/api/*` to a modular, versioned REST architecture under `/api/v1/` with permission dependencies, token middleware, and Pydantic v2 schemas.
6. **14 Enterprise Dashboard Pages**: Expanding from 10 to 14 dedicated enterprise pages including Database Intelligence, Capacity Analytics, Performance Center, Security Center, Privacy Guard, and User Management.

---

## 2. Existing Repository Architecture & Stack Discovery

### Frontend Architecture
- **Framework:** React 18.2 with TypeScript, bundled using Vite 8.3.
- **Styling:** Custom Enterprise Dark Theme (`index.css`) with deep navy palette (`#070b14`, `#0b1120`, `#0f172a`), cyan/blue accents, responsive cards, and clean typography.
- **Charting & Icons:** Recharts 2.x and Lucide React.
- **Current Page Count:** 10 working pages (`OverviewDashboard`, `StorageMonitoring`, `StorageAnalyzer`, `MLForecasting`, `RiskManagement`, `SystemPerformance`, `OptimizationRecommendations`, `DigitalTwinSimulation`, `HistoricalReports`, `SettingsPage`).
- **Communication:** Native `fetch` HTTP client in `services/api.ts` connecting to `http://127.0.0.1:8000/api`.

### Backend Architecture
- **Framework:** Python 3.11 with FastAPI 0.100+ and Uvicorn.
- **Database & ORM:** SQLite (`data/aegisstor.db`) managed via SQLAlchemy 2.0 ORM with declarative models.
- **System Telemetry:** `psutil` + PowerShell `Get-PhysicalDisk` subprocesses for hardware media type (NVMe SSD, SATA, USB) and I/O rates.
- **Background Worker:** Daemon thread in `main.py` sampling telemetry every 5 seconds into SQLite.
- **Desktop Shell:** Electron 28+ wrapper in `desktop/main.js` and `preload.js` with secure context isolation.

---

## 3. Inventory of Existing Working Features

| Feature | Implementation File | Status | Notes |
|---|---|---|---|
| Physical Drive & Media Type Detection | `device_detector.py` | Working | Accurately detected Samsung NVMe SSD 512GB (`SAMSUNG MZVL8512HFLU-00BH1`) |
| Real-time Partition & IOPS Telemetry | `storage_monitor.py` | Working | Differential counters calculating read/write MB/s and IOPS |
| Background Telemetry Sampling (5s) | `main.py` | Working | Saves continuous samples into `storage_telemetry` table |
| Filesystem Scanner & Space Hogs | `storage_scanner.py` | Working | Gathers largest files, largest folders, categories |
| SHA-256 Duplicate File Detection | `storage_scanner.py` | Working | Multi-block SHA-256 hashing on identical size candidates |
| Multi-Horizon Forecast (24h/7d/30d/90d) | `forecasting_service.py` | Working | LightGBM regression with time-ordered split, baseline extrapolation |
| Capacity Runway Estimator | `forecasting_service.py` | Working | Calculates daily growth (GB/d) and hours to 80%, 90%, 95% |
| Storage Risk Engine (LOW/MOD/HIGH/CRIT) | `risk_engine.py` | Working | Multi-factor risk based on % usage, paging headroom (<15GB), I/O load |
| Process Resource Observability | `performance_monitor.py`| Working | CPU %, RAM %, memory MB per PID, and network throughput |
| Digital Twin Scenario Simulator | `digital_twin.py` | Working | What-if simulations (Growth surge, File purge, Expansion, Baseline) |
| Safe Optimization Center | `optimization_engine.py`| Working | User-confirmed cleanup with protected system boundaries |
| Settings & Audit Logging | `session.py` / `routes.py` | Working | SQLite-backed configuration and immutable audit log |

---

## 4. Incomplete & Missing Enterprise Capabilities

1. **Enterprise Database Monitoring (CRITICAL GAP)**:
   - Zero database connectors currently exist.
   - No metadata collection for PostgreSQL, MySQL, SQL Server, or Oracle databases.
2. **Enterprise Authentication, MFA & RBAC (CRITICAL GAP)**:
   - Currently, API endpoints are open without authentication.
   - Missing Argon2id password hashing, JWT access/refresh token rotation, TOTP MFA verification, and 4-tier Role-Based Access Control (SUPER_ADMIN, DATABASE_ADMIN, ANALYST, VIEWER).
3. **Multi-Tenancy & Privacy Guard (CRITICAL GAP)**:
   - No organization / tenant abstraction.
   - No privacy guard engine enforcing metadata-only collection, tenant isolation, and credential encryption.
4. **Machine Learning Anomaly Detection & Model Comparison**:
   - Only a single model (LightGBM) is trained. Missing multi-model comparison (Linear Regression, Random Forest, LightGBM, Moving Average) and Isolation Forest for detecting abnormal storage spikes and sudden I/O anomalies.
5. **API Versioning**:
   - Routes are currently unversioned under `/api/*`. Must be upgraded to `/api/v1/*` with full schema validation and permission enforcement.
6. **Frontend Expansion**:
   - The UI needs to be upgraded from 10 pages to the required 14 enterprise dashboard pages.

---

## 5. Technical Issues & Security Vulnerabilities Identified

1. **Unprotected Endpoints**: API endpoints have no authorization header checks or tenant scoping.
2. **Single-Drive Assumption**: The baseline forecasting logic defaulted to primary drive `C:` if unselected. Must support arbitrary local partitions and multiple database instances independently.
3. **Synchronous Subprocess Calls**: `Get-PhysicalDisk` PowerShell queries must remain cached or asynchronous to prevent any latency during telemetry loops.
4. **Credential Storage**: Database connector credentials (host, port, user, password) cannot be stored in plaintext. AES-256 / Fernet key encryption backed by an application secret key is required.

---

## 6. Database Migration Requirements

The current SQLite database schema must be upgraded to support enterprise entities while preserving all existing tables and historical telemetry:

### Existing Tables Preserved:
- `storage_telemetry`
- `performance_telemetry`
- `scan_results`
- `forecast_results`
- `risk_alerts`
- `optimization_recommendations`
- `simulation_results`
- `application_settings`
- `audit_logs`

### New Enterprise Tables to Create:
1. `organizations` (id, name, slug, created_at, status)
2. `users` (id, org_id, email, full_name, password_hash, role, mfa_secret, mfa_enabled, is_active, created_at)
3. `sessions` (id, user_id, token_hash, ip_address, user_agent, expires_at, created_at)
4. `database_connections` (id, org_id, name, db_type, host, port, database_name, username, encrypted_password, ssl_mode, is_active, created_at)
5. `database_telemetry` (id, org_id, db_connection_id, timestamp, total_size_bytes, data_size_bytes, index_size_bytes, table_count, active_connections, query_latency_ms, growth_rate_daily_bytes)
6. `storage_anomalies` (id, org_id, resource_type, resource_id, timestamp, anomaly_score, severity, metric_name, expected_value, actual_value, description)
7. `privacy_policies` (id, org_id, data_minimization_mode, metadata_only, retention_days, audit_level, updated_at)

---

## 7. Implementation Plan

- **Phase 1:** Complete project audit & architecture blueprint. (DONE)
- **Phase 2:** Implement Local Storage improvements & Enterprise Database Connectors (`PostgresConnector`, `MySQLConnector`, `SQLServerConnector`, `OracleConnector`) with mock/test modes.
- **Phase 3:** Enhanced historical storage and database metric collection engine with hourly/daily rollups.
- **Phase 4:** ML Multi-Model Forecasting Engine (Linear, RF, LightGBM, Moving Average) + Isolation Forest Anomaly Detection.
- **Phase 5:** Capacity Runway Calculator (7d, 15d, 30d, 60d, 90d) and Performance Analytics.
- **Phase 6:** Enterprise Security Layer (Argon2id, JWT with rotation, TOTP MFA, 4-tier RBAC, Fernet credential encryption).
- **Phase 7:** Multi-Tenant Isolation, Privacy Guard & Secure Audit Management.
- **Phase 8:** Versioned REST API (`/api/v1/*`) and 14-page Enterprise Dashboard Integration.
- **Phase 9:** Digital Twin Enterprise Simulation & Recommendation Engine.
- **Phase 10:** Automated Verification Test Suite (Functional, ML, Security, API).
- **Phase 11:** Documentation, Architecture Guides, and Windows 11 Execution Manual.
