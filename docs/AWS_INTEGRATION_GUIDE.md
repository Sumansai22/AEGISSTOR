# AEGISSTOR – AWS Cloud Storage Integration Guide

**Date:** November 17, 2026  
**Environment:** Local Python 3.11 Backend + React 18 / Vite Frontend  
**AWS Account ID:** `425178888081`  
**Configured Region:** `ap-southeast-2` (Asia Pacific - Sydney)  
**Target S3 Bucket:** `aegisstor-mon-425178888081-ap-southeast-2-an`  
**AWS CLI Profile:** `aegisstor`  
**Authentication:** Temporary AWS SSO / Browser-based CLI token provider  

---

## 1. Architectural Overview & Security Posture

AEGISSTOR integrates AWS cloud storage surveillance following a **least-privilege, read-only metadata principle**:
- **Zero Resource Mutation:** The application never executes create, update, delete, or policy modification calls on AWS resources.
- **Zero Credential Hardcoding:** No static access keys or secret keys are stored in backend files, configuration databases, or frontend JavaScript bundles.
- **Dynamic Credential Resolution:** Boto3 sessions connect dynamically to the local AWS CLI profile cache (`~/.aws/credentials`, `~/.aws/config`, and `~/.aws/sso/cache`) using the profile name `aegisstor`.
- **Session Expiry Awareness:** The backend transparently identifies expired AWS SSO sessions (`ExpiredToken` / `AccessDenied`) and delivers actionable instructions to the user.

```
+-------------------------------------------------------------------------+
|                  AEGISSTOR Frontend Dashboard (React 18)                |
|  - AWS Cloud Storage Section (Tab: "aws_storage")                       |
|  - S3 Storage Metrics, Object Counts, Encryption & Versioning Posture   |
|  - Recharts CloudWatch Historical Storage Analytics                     |
+------------------------------------+------------------------------------+
                                     | HTTP REST (localhost:8000/api/v1/aws/*)
                                     v
+-------------------------------------------------------------------------+
|                    FastAPI Backend (app/services/aws_service.py)         |
|  - AWSS3Service Modular Provider                                        |
|  - Boto3 Client Factory (Profile: "aegisstor", Region: "ap-southeast-2") |
+------------------------------------+------------------------------------+
                                     | AWS SigV4 (boto3 + botocore[crt])
                                     v
+-------------------------------------------------------------------------+
|                         Amazon Web Services                             |
|  - AWS STS: Caller Identity Verification                                |
|  - Amazon S3: Bucket Metadata, Versioning, Encryption, ListObjectsV2    |
|  - Amazon CloudWatch: BucketSizeBytes & NumberOfObjects Metric Queries   |
+-------------------------------------------------------------------------+
```

---

## 2. Python Environment Requirements & Dependencies

The following packages are installed and active in the local Python environment:
- `boto3` ($\ge 1.44.4$): AWS SDK for Python.
- `botocore[crt]` & `awscrt` ($\ge 0.38.0$): High-performance C-based AWS Common Runtime required for AWS CLI browser-based login and SSO credential providers.

---

## 3. Backend Endpoints Specification

All AWS endpoints are mounted under `/api/v1/aws/` and protected with AEGISSTOR token authentication:

### 3.1 `GET /api/v1/aws/status`
Checks the live connection to AWS STS and reports caller identity.
- **Sample Success Response:**
  ```json
  {
    "success": true,
    "connected": true,
    "account_id": "425178888081",
    "arn": "arn:aws:sts::425178888081:assumed-role/AccountFullAccessRole/...",
    "user_id": "AROAWF7VC66IUV6OOG7LD:...",
    "region": "ap-southeast-2",
    "profile": "aegisstor",
    "message": "AWS connection verified successfully."
  }
  ```
- **Expired Session Response:**
  ```json
  {
    "success": false,
    "connected": false,
    "error": "ExpiredToken",
    "is_expired": true,
    "message": "AWS Error (ExpiredToken): The security token included in the request is expired"
  }
  ```

### 3.2 `GET /api/v1/aws/s3/bucket?bucket_name={name}`
Collects actual S3 bucket configuration, live object sizes, versioning, server-side encryption, and public access blocks.
- **Sample Response:**
  ```json
  {
    "success": true,
    "bucket_name": "aegisstor-mon-425178888081-ap-southeast-2-an",
    "region": "ap-southeast-2",
    "location": "ap-southeast-2",
    "versioning_status": "Enabled",
    "mfa_delete": "Disabled",
    "encryption": {
      "enabled": true,
      "algorithm": "AES256",
      "kms_master_key_id": "None (S3 Managed)",
      "bucket_key_enabled": false
    },
    "object_count": 0,
    "total_size_bytes": 0,
    "total_size_mb": 0.0,
    "public_access_block": {
      "block_public_acls": true,
      "ignore_public_acls": true,
      "block_public_policy": true,
      "restrict_public_buckets": true,
      "is_fully_blocked": true
    }
  }
  ```

### 3.3 `GET /api/v1/aws/s3/metrics?bucket_name={name}&days={days}`
Queries CloudWatch for `AWS/S3` metrics (`BucketSizeBytes` and `NumberOfObjects`).
- **Notice:** AWS calculates S3 metrics once every 24 hours. For newly created buckets, CloudWatch returns empty points until the first daily rollup occurs.

### 3.4 `GET /api/v1/aws/s3/buckets`
Lists accessible S3 buckets in the account and highlights the configured target bucket.

---

## 4. Frontend Dashboard Integration

1. **Navigation:** A new `"AWS Cloud Storage"` tab (icon: `Cloud`) is integrated into the Core Monitoring sidebar section.
2. **Dedicated Dashboard Page (`frontend/src/pages/AWSCloudStorage.tsx`):**
   - Active identity banner displaying role ARN, AWS Account ID, and connection status.
   - 4-metric statistics grid: Allocated Storage (MB/Bytes), Total Objects, SSE Encryption status, and Versioning status.
   - S3 Bucket Configuration card & Public Access Guardrails card.
   - CloudWatch 14-day storage trend chart using Recharts.
   - Zero-cloud local-first safety disclosure banner.

---

## 5. Automated Verification & Test Coverage

The test suite in `tests/test_aws_integration.py` includes 8 automated tests:
1. `test_aws_live_or_fallback_connection`: Probes active CLI profile credentials.
2. `test_aws_bucket_metadata`: Verifies live S3 bucket metadata, AES256 encryption, and versioning.
3. `test_mocked_sts_caller_identity_success`: Validates successful STS caller identity parsing.
4. `test_mocked_expired_token_handling`: Enforces graceful failure when temporary token is expired.
5. `test_mocked_missing_profile`: Enforces error handling when the profile is missing.
6. `test_mocked_s3_bucket_metadata_complete`: Validates paginated object scans, byte aggregation, and public access blocks.
7. `test_mocked_cloudwatch_metrics`: Validates CloudWatch daily metric points parsing.
8. `test_list_all_accessible_buckets`: Validates bucket listing and target identification.

All 48 pytest tests in the repository pass cleanly (100% pass rate).
