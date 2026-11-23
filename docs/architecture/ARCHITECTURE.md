# AEGISSTOR – Enterprise Architecture & System Topology

## 1. System Overview

AEGISSTOR is an enterprise-grade predictive storage intelligence and database security platform built specifically for data-intensive and regulated environments such as **hospitals, banking institutions, universities, and enterprise data centres**.

The platform provides a dual-plane telemetry architecture:
1. **Local Windows 11 Storage Engine**: Real hardware monitoring (SSD, NVMe, HDD, USB) via native Windows APIs (`psutil`, Win32 storage management).
2. **Enterprise Database Intelligence Plane**: Direct metadata surveillance across PostgreSQL, MySQL, Microsoft SQL Server, and Oracle Database instances.

```
+-----------------------------------------------------------------------------------------+
|                                     AEGISSTOR UI                                        |
|                          (React 18 + Vite + TypeScript + Recharts)                     |
+--------------------------------------------+--------------------------------------------+
                                             | HTTP / REST (V1 API & Legacy)
+--------------------------------------------v--------------------------------------------+
|                                     FASTAPI SERVER                                      |
|                               (Python 3.11+ / Uvicorn)                                  |
+---------------------+----------------------+---------------------+----------------------+
|   Security Engine   | Telemetry Collectors | Machine Learning    |  Database Connector  |
| - Argon2id Hasher   | - Windows Storage    | - LightGBM Regr.    |  - PostgreSQL        |
| - AES-256 Vault     | - psutil System I/O  | - Random Forest     |  - MySQL             |
| - TOTP RFC 6238 MFA | - Directory Scanner  | - Isolation Forest  |  - SQL Server        |
| - 4-Tier RBAC Guard | - Retention Purge    | - Runway Engine     |  - Oracle Database   |
+---------------------+----------------------+---------------------+----------------------+
                                             | SQLAlchemy ORM
+--------------------------------------------v--------------------------------------------+
|                          LOCAL SOVEREIGN STORAGE & AUDIT                                |
|                        (SQLite Local Dev / PostgreSQL Prod)                             |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Multi-Tenant Isolation Architecture

AEGISSTOR enforces complete multi-tenancy at the data layer through scoped organization identifiers (`org_id`).

- Every database telemetry record, local storage sample, ML forecast, risk alert, and audit log is bound to an `Organization`.
- Security dependencies (`get_current_user`, `require_role`) extract tenant context from cryptographically signed JWT tokens.
- Cross-tenant leakage is strictly prevented through query-level filters:
  ```python
  query = db.query(StorageTelemetry).filter(StorageTelemetry.org_id == current_user.org_id)
  ```

---

## 3. Storage Telemetry Pipeline

The telemetry collection pipeline executes background jobs every 5 seconds (configurable):
1. **Drive Discovery**: Native volume detection identifies partition mounts (`C:\`, `D:\`), filesystem formats (NTFS, FAT32, ReFS, exFAT), total capacity, used bytes, and free bytes.
2. **Hardware Metric Interrogation**: Physical disk bus interrogation identifies NVMe vs SSD vs HDD.
3. **I/O Throughput**: Non-blocking delta calculations track read bytes/sec, write bytes/sec, and disk operation queues.
4. **Historical Persistence**: Time-series records are committed to SQLite with automatic timestamping.

---

## 4. Machine Learning & Forecasting Architecture

The forecasting subsystem features a tournament-style multi-model cross-validation pipeline:
- **Feature Pipeline**: Enriches raw storage time-series with lag variables (`lag_1`, `lag_3`), rolling statistics (`rolling_mean_3`, `rolling_std_3`), hour of day, and day of week.
- **Model Tournament**:
  - **LightGBM Regressor**: Gradient boosting with leaf-wise expansion for complex non-linear growth patterns.
  - **Random Forest**: Ensemble decision trees for robust non-linear trend capture.
  - **Ridge Linear Regression**: L2-regularized linear model for baseline extrapolation.
  - **Moving Average Baseline**: Autoregressive moving average for rolling trends.
- **Chronological Validation**: Time-series data is split temporally without lookahead bias. The algorithm yielding the lowest Mean Absolute Error (MAE) is dynamically selected for production forecasting.
- **Runway Engine**: Computes exact countdown hours and dates to 70%, 80%, 90%, 95%, and 100% capacity limits.
- **Anomaly Detection**: Isolation Forest monitors residuals and growth spikes to flag storage anomalies before disk saturation occurs.

---

## 5. Enterprise Database Surveillance Architecture

AEGISSTOR connects to enterprise databases using read-only catalog queries:
- **PostgreSQL**: Queries `pg_database_size`, `pg_stat_user_tables`, `pg_stat_user_indexes`.
- **MySQL / MariaDB**: Queries `information_schema.tables` and `information_schema.statistics`.
- **Microsoft SQL Server**: Queries `sys.dm_db_partition_stats`, `sys.tables`, and `sys.indexes`.
- **Oracle Database**: Queries `dba_tablespaces`, `all_tables`, and `all_indexes`.

**Data Minimization Principle**:
Under no circumstances does AEGISSTOR inspect row values, medical patient charts, account numbers, or confidential business data. Only administrative byte allocations and bloat indicators are queried.
