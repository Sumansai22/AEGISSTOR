# AEGISSTOR – Enterprise Architecture & Operational Documentation

**Date:** November 17, 2026  
**Environment:** Windows 11 Enterprise / Python 3.11 FastAPI / React 18 + Vite / AWS `ap-southeast-2`  
**AWS Account ID:** `425178888081`  
**Configured Profile:** `aegisstor`  
**Bucket:** `aegisstor-mon-425178888081-ap-southeast-2-an`  

---

## 1. System Overview & Architecture

AEGISSTOR combines real-time Windows hardware storage monitoring, multi-model time-series forecasting, historical telemetry persistence, least-privilege enterprise database surveillance, and read-only AWS S3 cloud monitoring.

```
+----------------------------------------------------------------------------------------------------+
|                                    AEGISSTOR DESKTOP DASHBOARD                                     |
|  - Storage & Hardware Observability (Live 475.77 GB Total, 297.00 GB Used, 178.76 GB Free)         |
|  - AWS Cloud Storage (SSE-S3 AES-256 Enabled, Versioning Enabled, BucketOwnerEnforced, BlockPublic)|
|  - AI Capacity Forecasting (Tournament across 6 models, 1d, 7d, 14d, 30d, 60d, 90d Horizons)       |
|  - Capacity Runway Countdown (70%, 80%, 90%, 95%, 100% Thresholds)                                |
|  - Digital Twin Scenario Simulation & Risk Intelligence                                           |
+-------------------------------------------------+--------------------------------------------------+
                                                  | REST APIs (/api/v1/* & /api/*)
                                                  v
+----------------------------------------------------------------------------------------------------+
|                                      FASTAPI BACKEND CORE ENGINE                                   |
+----------------------------------------------------------------------------------------------------+
| 1. Win32 & psutil Fast Telemetry Engine:                                                           |
|    - Direct Win32 GetDiskFreeSpaceExW kernel call (instant microsecond retrieval)                  |
|    - Avoids synchronous PowerShell process spawning or subshell timeouts                           |
| 2. AWS S3 & CloudWatch Service (app/services/aws_service.py):                                       |
|    - Dynamic Boto3 session from AWS CLI profile 'aegisstor'                                        |
|    - Discrepancy-free mapping: get_bucket_versioning, get_bucket_encryption,                       |
|      get_bucket_ownership_controls, get_public_access_block, list_objects_v2                       |
| 3. Historical Telemetry Database Pipeline (app/services/historical_pipeline.py):                   |
|    - Consolidated time-series table historical_storage_telemetry with resource_type and quality tags|
| 4. Predictive Intelligence Tournament Engine (app/services/predictive_forecasting.py):             |
|    - 6 models: Seasonal Naive, Moving Average, Linear, Ridge, Random Forest, LightGBM              |
|    - Chronological 80/20 train/test split (no data leakage)                                        |
|    - Dynamic uncertainty intervals (+/- 1.96 * sigma * sqrt(days))                                 |
+-------------------------------------------------+--------------------------------------------------+
                                                  | Local SQLite Engine
                                                  v
+----------------------------------------------------------------------------------------------------+
|                                   DATABASE: data/aegisstor.db                                      |
|  - AES-256-GCM Encrypted Credentials & Secrets                                                     |
|  - Argon2id Password Storage & RFC 6238 TOTP Replay Prevention Cache                               |
|  - Multi-tenant Historical Storage & Database Telemetry Series                                     |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Telemetry & Hardware Integration Details

### Local Storage Pipeline
- **API Endpoint:** `GET /api/storage/summary`, `GET /api/storage/drives`
- **Driver:** Native Windows Win32 API (`GetDiskFreeSpaceExW` / `GetLogicalDrives`) alongside `psutil.disk_partitions(all=False)`.
- **Output:**
  - Total Storage: `475.77 GB`
  - Used Storage: `297.00 GB`
  - Free Headroom: `178.76 GB`
  - Utilization: `62.43%`
  - Status: `AUTHENTIC_HARDWARE_COLLECTION` (Zero fake zero measurements).

### AWS S3 Cloud Telemetry
- **API Endpoint:** `GET /api/v1/aws/s3/bucket`, `GET /api/v1/aws/status`, `GET /api/v1/aws/s3/metrics`
- **Verified Statuses:**
  - `encryption.status`: **Enabled** (`AES256` SSE-S3 managed key)
  - `versioning_status`: **Enabled**
  - `ownership_controls.status`: **Enabled** (`BucketOwnerEnforced`, ACLs Disabled)
  - `public_access_block.status`: **Enabled** (`is_fully_blocked = True`)

---

## 3. Machine Learning Methodology

### Model Evaluation Tournament
Every training cycle evaluates 6 distinct models on time-ordered historical partitions:
1. **Seasonal / Last Observed Naive Baseline:** Projects the last observed capacity point.
2. **Moving Average Baseline:** 3-point rolling average trend.
3. **Linear Regression:** Standard least-squares linear trend.
4. **Ridge Regression:** L2 regularized regression model.
5. **Random Forest Regressor:** Ensemble of decision trees ($n=30$, depth=5).
6. **LightGBM Regressor:** Gradient boosted decision tree regressor ($n=35$, leaves=12).

### Forecast Horizons & Runway Calculations
- **Horizons:** 1 day, 7 days, 14 days, 30 days, 60 days, and 90 days.
- **Uncertainty Bounds:** $\hat{y} \pm 1.96 \cdot \sigma \cdot \sqrt{\Delta t}$ where $\sigma = \max(\text{RMSE}, \text{current\_used} \cdot 0.02)$.
- **Threshold Runways:** Days and projected calendar dates to reach 70%, 80%, 90%, 95%, and 100% capacity. If growth is negative or zero, status is clearly reported as `STABLE` without invalid exhaustion dates.

---

## 4. Startup & Execution Instructions (Windows 11)

### 1. Launch FastAPI Backend
```powershell
Set-Location "C:\Users\Sumanth\.gemini\antigravity\scratch\aegisstor"
$env:PYTHONPATH = "backend"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Launch Vite Frontend
```powershell
Set-Location "C:\Users\Sumanth\.gemini\antigravity\scratch\aegisstor\frontend"
npm run dev
```

### 3. AWS Temporary CLI Authentication
When your AWS temporary browser-based session expires:
```powershell
aws login --profile aegisstor
```
AEGISSTOR will automatically detect the refreshed credentials upon the next background sync.
