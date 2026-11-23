# AEGISSTOR
## Predictive Storage Intelligence and Enterprise Database Security Platform

[![Platform](https://img.shields.io/badge/Platform-Windows%2011%20Local-0078D4.svg)](https://microsoft.com)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB.svg)](https://python.org)
[![React](https://img.shields.io/badge/Frontend-React%2018%20%7C%20TypeScript%20%7C%20Vite-61DAFB.svg)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI%20%7C%20Uvicorn-009688.svg)](https://fastapi.tiangolo.com)
[![Cryptography](https://img.shields.io/badge/Security-Argon2id%20%7C%20AES--256%20%7C%20TOTP-10B981.svg)](#security-and-governance)
[![Machine Learning](https://img.shields.io/badge/ML-LightGBM%20%7C%20Random%20Forest%20%7C%20Isolation%20Forest-FFA500.svg)](https://lightgbm.readthedocs.io)
[![Tests](https://img.shields.io/badge/Tests-26%2F26%20Passed%20(100%25)-44CC11.svg)](#testing-and-validation)

---

## 1. Executive Summary & Enterprise Vision

**AEGISSTOR** is an enterprise-grade predictive storage intelligence, capacity forecasting, and database security governance platform designed specifically for highly regulated and data-intensive environments such as:
- **Hospitals & Healthcare Systems** (HIPAA compliant, zero-PHI data minimization)
- **Banks & Financial Institutions** (SOX / PCI-DSS metadata separation, AES-256 credential vault)
- **Colleges & Universities** (High-throughput file servers & research cluster storage)
- **Enterprise Data Centers & Corporate Companies** (PostgreSQL, MySQL, SQL Server, Oracle surveillance)

AEGISSTOR executes **100% locally on Windows 11**, without external cloud dependencies, subscription gateways, or third-party cloud data egress.

---

## 2. Platform Architecture

```
+---------------------------------------------------------------------------------------------------+
|                                        AEGISSTOR DESKTOP UI                                       |
|                       14 Dashboard Modules | React 18 | TypeScript | Vite | Recharts             |
+-------------------------------------------------+-------------------------------------------------+
                                                  | REST API (V1 & Legacy)
+-------------------------------------------------v-------------------------------------------------+
|                                        FASTAPI SERVER CORE                                        |
|                                       Python 3.11+ / Uvicorn                                      |
+-----------------------+-------------------------+------------------------+------------------------+
|    Security Plane     |   Enterprise DB Plane   |   Local Storage Engine |    Machine Learning    |
| - Argon2id Hasher     | - PostgreSQL Metadata   | - Win32 Volume APIs    | - LightGBM Regressor   |
| - AES-256 Fernet      | - MySQL / MariaDB       | - psutil Telemetry     | - Random Forest        |
| - TOTP RFC 6238 MFA   | - Microsoft SQL Server  | - SHA-256 Deduplication| - Ridge Linear         |
| - 4-Tier RBAC Guard   | - Oracle Database       | - Differential IOPS    | - Isolation Forest     |
| - Tenant Isolation    | - Index Bloat Monitor   | - Paging Pressure      | - Capacity Runway Calc |
+-----------------------+-------------------------+------------------------+------------------------+
                                                  | SQLAlchemy ORM
+-------------------------------------------------v-------------------------------------------------+
|                                 SOVEREIGN LOCAL PERSISTENCE                                       |
|                           SQLite (Dev) / PostgreSQL (Enterprise Prod)                             |
+---------------------------------------------------------------------------------------------------+
```

---

## 3. 14 Working Dashboard Pages

AEGISSTOR delivers 14 production-quality dashboard modules:

| # | Page Name | Primary Capability |
|---|---|---|
| 1 | **Overview Dashboard** | Executive summary cards, capacity comparison charts, differential I/O graphs, active risk banner. |
| 2 | **Storage Monitoring** | Detailed cards for every attached drive: media type (NVMe SSD), mount options, read/write MB/s, IOPS, and health. |
| 3 | **Storage Analyzer** | Multi-faceted scanner: Largest Files, Largest Folders, Duplicate Files (SHA-256), File Categories, and Temporary Clutter. |
| 4 | **AI Forecasting** | Machine Learning storage projection across 7d, 15d, 30d, 60d, 90d with confidence bounds and error metrics. |
| 5 | **Capacity Runway** | Interactive runway calculator for 70%, 80%, 90%, 95%, 100% capacity thresholds and chronological ML benchmark matrix. |
| 6 | **System Performance** | Real-time CPU % & cores, RAM % & GB, network I/O, and searchable running processes. |
| 7 | **Database Intelligence** | Live metadata surveillance for PostgreSQL, MySQL, SQL Server, Oracle: tablespace allocations, index bloat alerts. |
| 8 | **Security Center** | Enterprise security status, RFC 6238 TOTP two-factor setup widget, 4-tier RBAC matrix, and tamper-evident audit logs. |
| 9 | **Privacy Guard** | Zero-cloud guarantee, data minimization enforcement, identifier masking, and configurable retention purge. |
| 10 | **Optimization Center** | Rule-verified cleanup proposals with guaranteed OS preservation, interactive confirmation modal, and audit trail. |
| 11 | **Digital Twin Simulation** | What-if scenarios (Surge, File Purge, Volume Expansion, Baseline continuation) with interactive sliders. |
| 12 | **Risk Management** | Multi-factor risk engine displaying LOW, MODERATE, HIGH, CRITICAL alerts, reasons, and remediation steps. |
| 13 | **Historical Reports** | Telemetry trends over 1h, 24h, 7d, 30d with one-click CSV and JSON data export. |
| 14 | **Settings** | User-configurable monitoring frequency, risk thresholds (80%/90%), safety exclusion paths, and retention days. |

---

## 4. Enterprise Security & Governance

- **Argon2id Password Hashing**: 64 MiB memory cost, 3 iterations, 4 parallelism threads. Protects against GPU/ASIC brute-force cracking.
- **Two-Factor Authentication (MFA)**: RFC 6238 TOTP with Google Authenticator and 1Password support.
- **AES-256 Vault Encryption**: Database passwords and credentials encrypted at rest via AES-128-CBC + HMAC-SHA256 (Fernet).
- **4-Tier Role-Based Access Control**:
  - `SUPER_ADMIN`: Complete governance, user management, and optimization authorization.
  - `DATABASE_ADMIN`: Database surveillance, telemetry sync, bloat analysis. Restricted from OS disk modification.
  - `ANALYST`: Predictive forecasting, capacity runway analysis, what-if simulations.
  - `VIEWER`: Read-only access to high-level dashboards.
- **Privacy Guard & Data Minimization**:
  - Zero Personal Health Information (PHI) or customer financial records are read or stored.
  - Database queries target exclusively dictionary catalogs (`pg_tables`, `sys.dm_db_index_usage_stats`, `dba_tablespaces`).
- **Strict Windows Safety Guardrails**:
  - `C:\Windows`, `WinSxS`, `$Recycle.Bin`, `System Volume Information`, `pagefile.sys`, and `hiberfil.sys` are permanently blocked from alteration.
  - Deletions require explicit human confirmation via an interactive modal review. Process termination is completely disabled.

---

## 5. Machine Learning & Anomaly Engine

1. **Tournament Model Selection**:
   - LightGBM Regressor
   - Random Forest Regressor
   - Ridge Linear Regression
   - Moving Average Baseline
2. **Chronological Time-Series Validation**: Evaluated strictly on temporal splits without lookahead bias. The algorithm with the lowest MAE is selected automatically.
3. **Threshold Runway Calculator**: Solves for exact countdown days to 70%, 80%, 90%, 95%, and 100% capacity exhaustion:
   $$\text{Runway (Days)} = \frac{\text{Target Threshold Bytes} - \text{Current Used Bytes}}{\text{Daily Growth Velocity (Bytes/Day)}}$$
4. **Isolation Forest Anomaly Detection**: Unsupervised outlier detection flagging sudden storage surges, unexpected drops, and index bloat.

---

## 6. Default Administrative Credentials

On initial startup, AEGISSTOR automatically provisions the default tenant organization and Super Administrator account:

| Attribute | Value |
| :--- | :--- |
| **Email** | `admin@aegisstor.internal` |
| **Password** | `AdminPassword@2026!` |
| **Role** | `SUPER_ADMIN` |
| **Organization** | Default Enterprise Tenant (`org_id: 1`) |

*(Administrators can update credentials and configure TOTP MFA immediately via the Security Center page.)*

---

## 7. Quick Installation & Launch

### Prerequisites
- Windows 10 or Windows 11 (64-bit)
- Python 3.11+
- Node.js 18+

### Method 1: One-Click Startup (Recommended)
Double-click `start_aegisstor.bat` in the project root:
```cmd
start_aegisstor.bat
```
This automatically verifies dependencies, initializes database migrations, boots the FastAPI backend on `http://127.0.0.1:8000`, starts the Vite frontend on `http://localhost:5173`, and opens the dashboard in your default browser!

### Method 2: Manual Terminal Execution

**Terminal 1 (Backend):**
```cmd
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**Terminal 2 (Frontend):**
```cmd
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 8. Testing and Validation

Execute all 26 verification tests across the test suites:
```cmd
pytest tests/ -v
```

### Test Coverage Summary:
- `tests/test_api.py`: 9 passed (Health, System Info, Storage Drives, Summary, Performance, Risks, Recommendations, Forecast, Settings).
- `tests/test_backend.py`: 10 passed (Physical Drive Detection, Capacity Math, Disk I/O Delta, Performance, SHA-256 Deduplication, Risk Classification, Digital Twin, ML Pipeline, Safety Guardrails, Helpers).
- `tests/test_enterprise.py`: 7 passed (Argon2id Hashing, AES-256 Fernet Encryption, RFC 6238 TOTP MFA, JWT Token Rotation, Database Connectors, Capacity Runway Math, Privacy Guard Policy).

**Result: 26 passed, 0 failed (100% pass rate).**

---

## 9. Comprehensive Documentation

- **[System Architecture](file:///docs/architecture/ARCHITECTURE.md)**: System topology, multi-tenant isolation, data flow.
- **[Security & Governance](file:///docs/security/SECURITY.md)**: Argon2id, TOTP RFC 6238, AES-256 vault, 4-tier RBAC, audit log.
- **[Database Schema](file:///docs/database/DATABASE_SCHEMA.md)**: ERD, table definitions, PostgreSQL compatibility.
- **[API Reference](file:///docs/api/API_REFERENCE.md)**: Full REST API endpoint reference and payload specifications.
- **[Project Audit](file:///docs/PROJECT_AUDIT.md)**: Complete audit of initial code and enterprise enhancement roadmap.
