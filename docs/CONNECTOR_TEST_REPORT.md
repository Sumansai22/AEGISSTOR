# AEGISSTOR – Enterprise Database Connector Validation Report

**Date:** November 17, 2026  
**Auditor:** Senior Database Administrator & Integration Specialist  
**Connectors Evaluated:** PostgreSQL, MySQL, Microsoft SQL Server, Oracle Database  
**Drivers Installed:** `psycopg2` (v2.9.11), `pymysql` (v1.1.2), `pymssql` (v2.4.6), `oracledb` (v3.4.2)  
**Status:** PASS – Validated Truthful Reporting & Read-Only Least Privilege

---

## 1. Connector Architecture & Driver Verification

All connectors implement the abstract interface defined in `backend/app/connectors/base.py`:
- `test_connection()`: Probes connectivity and authentication.
- `collect_storage_metadata()`: Gathers storage, tablespace, and table sizes using read-only catalog queries.
- `execute_read_query()`: Executes strictly parameterized read-only queries.

```
                        +----------------------------+
                        |  Abstract BaseConnector   |
                        +--------------+-------------+
                                       |
          +----------------------------+----------------------------+
          |                            |                            |
          v                            v                            v
+--------------------+       +--------------------+       +--------------------+
| PostgresConnector  |       |   MySQLConnector   |       | SQLServerConnector |
| Driver: psycopg2   |       |  Driver: pymysql   |       |  Driver: pymssql   |
| Default Port: 5432 |       | Default Port: 3306 |       | Default Port: 1433 |
+--------------------+       +--------------------+       +--------------------+
                                       |
                                       v
                             +--------------------+
                             |  OracleConnector   |
                             |  Driver: oracledb  |
                             | Default Port: 1521 |
                             +--------------------+
```

### Driver Availability in Environment
All four DB-API 2.0 driver libraries were checked and verified active in the Python 3.11 environment:
- `psycopg2` v2.9.11 (Native C-extension for PostgreSQL)
- `pymysql` v1.1.2 (Pure-Python MySQL driver)
- `pymssql` v2.4.6 (FreeTDS-based Microsoft SQL Server driver)
- `oracledb` v3.4.2 (Thin-mode & Thick-mode Oracle driver)

---

## 2. Truthful Reporting & Failure Accuracy Policy

### 2.1 The Principle
Prior implementations caught network or authentication errors and returned fallback dummy objects with `success: True`. This created deceptive dashboards where unavailable databases were reported as connected.

### 2.2 Hardened Implementation
In `backend/app/connectors/`:
- If an endpoint is offline, unreachable, rejected by firewall, or given invalid credentials:
  - `test_connection()` **MUST** return:
    ```json
    {
      "success": false,
      "connected": false,
      "is_live": false,
      "error": "Connection to 192.0.2.1:5432 failed: Connection refused"
    }
    ```
  - `collect_storage_metadata()` returns baseline telemetry clearly identified with:
    ```json
    {
      "status": "OFFLINE_BASELINE",
      "is_live": false,
      "total_size_bytes": 0,
      "data_files_bytes": 0,
      "top_tables": []
    }
    ```
- Verified in `test_database_connector_failure_accuracy`: all four connectors correctly report `success: false` and `connected: false` when pointed at unreachable or unauthenticated targets.

---

## 3. Least-Privilege Read-Only Catalog Queries

All SQL queries executed by the connectors access system catalogs only. They contain no `INSERT`, `UPDATE`, `DELETE`, `DROP`, or `ALTER` statements, and require only minimal read-only permissions:

### 3.1 PostgreSQL Catalog Queries
- **Database Size:**
  ```sql
  SELECT pg_database_size(current_database()) AS db_size;
  ```
- **Table Sizes (Top 10):**
  ```sql
  SELECT relname, pg_total_relation_size(c.oid) AS total_bytes
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE nspname NOT IN ('pg_catalog', 'information_schema')
    AND c.relkind = 'r'
  ORDER BY total_bytes DESC
  LIMIT 10;
  ```
- **Permissions Required:** Standard `CONNECT` privilege on database and read access to `pg_class`.

### 3.2 MySQL Catalog Queries
- **Database Size:**
  ```sql
  SELECT SUM(data_length + index_length) AS db_size,
         SUM(data_length) AS data_size,
         SUM(index_length) AS index_size
  FROM information_schema.tables
  WHERE table_schema = %s;
  ```
- **Permissions Required:** `SELECT` privilege on `information_schema.tables`.

### 3.3 Microsoft SQL Server Catalog Queries
- **Database File Allocation:**
  ```sql
  SELECT name, type_desc, (size * 8 * 1024) AS size_bytes
  FROM sys.database_files;
  ```
- **Permissions Required:** `VIEW DATABASE STATE` or standard database read access.

### 3.4 Oracle Database Catalog Queries
- **Tablespace Allocation:**
  ```sql
  SELECT tablespace_name, SUM(bytes) AS total_bytes
  FROM user_segments
  GROUP BY tablespace_name;
  ```
- **Permissions Required:** Standard `CONNECT` and `RESOURCE` roles or read access to `user_segments`.

---

## 4. Privacy Guard Compliance

To verify zero data leakage during database telemetry collection:
- Connectors gather solely mathematical storage allocations, byte totals, and table names.
- Zero column content, user records, customer identities, or patient records are queried or stored.
- All database passwords are encrypted at rest with AES-256-GCM and masked in all UI endpoints.
