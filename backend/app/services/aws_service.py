"""
AEGISSTOR AWS Cloud Storage Integration Service
Interacts with AWS using temporary CLI profile credentials without hardcoded secrets.
Accurately maps S3 Bucket Versioning, Server-Side Encryption (SSE-S3),
Bucket Owner Enforced, and Block Public Access controls.
"""
import os
import time
import logging
import threading
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta

import boto3
from botocore.config import Config
from botocore.exceptions import (
    BotoCoreError,
    ClientError,
    ProfileNotFound,
    NoCredentialsError,
    CredentialRetrievalError
)

logger = logging.getLogger("aegisstor.aws")

DEFAULT_PROFILE = "aegisstor"
DEFAULT_REGION = "ap-southeast-2"
DEFAULT_BUCKET = "aegisstor-mon-425178888081-ap-southeast-2-an"
DEFAULT_ACCOUNT_ID = "425178888081"

# Exponential backoff retry strategy with fast 5s connect timeout and 10s read timeout
BOTO_CONFIG = Config(
    connect_timeout=5,
    read_timeout=10,
    retries={"max_attempts": 3, "mode": "standard"}
)


class AWSS3Service:
    """Modular integration service for AWS Cloud Storage telemetry and S3 monitoring."""

    def __init__(
        self,
        profile_name: str = DEFAULT_PROFILE,
        region_name: str = DEFAULT_REGION,
        default_bucket: str = DEFAULT_BUCKET,
    ):
        self.profile_name = profile_name
        self.region_name = region_name
        self.default_bucket = default_bucket

        # Cached Boto3 session & clients
        self._session: Optional[boto3.Session] = None
        self._sts_client = None
        self._s3_client = None
        self._cw_client = None
        self._client_lock = threading.RLock()

        # Concurrency locks to prevent stampedes (RLock prevents self-deadlocks)
        self._verify_lock = threading.RLock()
        self._bucket_lock = threading.RLock()

        # Telemetry & Status Caches
        self._cached_connection: Optional[Dict[str, Any]] = None
        self._cached_conn_time: float = 0.0
        self._cached_bucket_metadata: Dict[str, Any] = {}
        self._cached_bucket_time: Dict[str, float] = {}
        self._cached_object_metadata: Dict[str, Any] = {}
        self._cached_object_time: Dict[str, float] = {}

        # Optimized TTLs: 45s for STS caller identity, 300s (5m) for S3 bucket details
        self._conn_cache_ttl: float = 45.0
        self._bucket_cache_ttl: float = 300.0
        self._object_cache_ttl: float = 60.0

    def get_session(self) -> boto3.Session:
        """Create or return cached boto3 session from AWS CLI credentials profile."""
        if self._session is None:
            with self._client_lock:
                if self._session is None:
                    try:
                        self._session = boto3.Session(profile_name=self.profile_name, region_name=self.region_name)
                    except ProfileNotFound:
                        logger.error(f"[AWS Diagnostic] AWS CLI profile '{self.profile_name}' not found.")
                        raise
                    except Exception as e:
                        logger.warning(f"[AWS Diagnostic] Error initializing session for profile '{self.profile_name}': {type(e).__name__}: {e}")
                        raise
        return self._session

    def reset_clients(self):
        """Reset cached session and clients on credential expiry or reauthentication."""
        with self._client_lock:
            self._session = None
            self._sts_client = None
            self._s3_client = None
            self._cw_client = None

    def get_sts_client(self):
        """Get or initialize cached STS client with timeout config."""
        if self._sts_client is None:
            with self._client_lock:
                if self._sts_client is None:
                    session = self.get_session()
                    self._sts_client = session.client("sts", config=BOTO_CONFIG)
        return self._sts_client

    def get_s3_client(self):
        """Get or initialize cached S3 client with timeout config."""
        if self._s3_client is None:
            with self._client_lock:
                if self._s3_client is None:
                    session = self.get_session()
                    self._s3_client = session.client("s3", config=BOTO_CONFIG)
        return self._s3_client

    def get_cloudwatch_client(self):
        """Get or initialize cached CloudWatch client with timeout config."""
        if self._cw_client is None:
            with self._client_lock:
                if self._cw_client is None:
                    session = self.get_session()
                    self._cw_client = session.client("cloudwatch", config=BOTO_CONFIG)
        return self._cw_client

    def verify_connection(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Verify connection and check caller identity with high-performance 45s TTL cache.
        Uses in-flight locking to prevent duplicate concurrent verification storms.
        Detects active sessions, expired sessions, invalid profiles, or missing credentials.
        Excludes credentials, secrets, or tokens from diagnostic outputs.
        """
        now = time.time()
        if not force_refresh and self._cached_connection and (now - self._cached_conn_time) < self._conn_cache_ttl:
            return self._cached_connection

        with self._verify_lock:
            # Re-check cache inside lock
            now = time.time()
            if not force_refresh and self._cached_connection and (now - self._cached_conn_time) < self._conn_cache_ttl:
                return self._cached_connection

            detected_envs = [
                k for k in ["AWS_PROFILE", "AWS_DEFAULT_PROFILE", "AWS_CONFIG_FILE", "AWS_SHARED_CREDENTIALS_FILE", "AWS_ACCESS_KEY_ID"]
                if k in os.environ
            ]
            logger.info(f"[AWS Diagnostic] Probing AWS identity with profile='{self.profile_name}', region='{self.region_name}'. Set envs: {detected_envs}")

            try:
                sts = self.get_sts_client()
                identity = sts.get_caller_identity()
                account_id = identity.get("Account")
                arn = identity.get("Arn")
                user_id = identity.get("UserId")
                now_utc = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
                logger.info(f"[AWS Diagnostic] STS verification successful. Account={account_id}, ARN={arn}")
                res = {
                    "success": True,
                    "connected": True,
                    "status": "CONNECTED",
                    "account_id": account_id,
                    "arn": arn,
                    "user_id": user_id,
                    "region": self.region_name,
                    "profile": self.profile_name,
                    "verified_at": now_utc,
                    "checked_at": now_utc,
                    "data_source": "AWS STS get_caller_identity",
                    "message": "AWS connection verified successfully."
                }
                self._cached_connection = res
                self._cached_conn_time = now
                return res
            except (NoCredentialsError, ProfileNotFound) as e:
                self.reset_clients()
                err_utc = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
                logger.warning(f"[AWS Diagnostic] Profile or credentials missing: {type(e).__name__}: {e}")
                res = {
                    "success": False,
                    "connected": False,
                    "status": "DISCONNECTED",
                    "error": "PROFILE_OR_CREDENTIALS_MISSING",
                    "checked_at": err_utc,
                    "message": f"AWS CLI profile '{self.profile_name}' not configured or missing credentials: {str(e)}",
                    "remedy": f"aws login --profile {self.profile_name}"
                }
                self._cached_connection = res
                self._cached_conn_time = now
                return res
            except ClientError as e:
                code = e.response.get("Error", {}).get("Code", "ClientError")
                msg = e.response.get("Error", {}).get("Message", str(e))
                is_expired = any(term in code or term in msg for term in ["Expired", "Token", "expired", "token", "AccessDenied"])
                if is_expired:
                    self.reset_clients()
                err_utc = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
                logger.warning(f"[AWS Diagnostic] ClientError ({code}): {msg}")
                res = {
                    "success": False,
                    "connected": False,
                    "status": "EXPIRED" if is_expired else "ACCESS_DENIED",
                    "error": code,
                    "is_expired": is_expired,
                    "checked_at": err_utc,
                    "remedy": "aws login",
                    "message": f"AWS Error ({code}): {msg}. Run 'aws login' to reauthenticate."
                }
                self._cached_connection = res
                self._cached_conn_time = now
                return res
            except BotoCoreError as e:
                err_name = type(e).__name__
                msg = str(e)
                is_expired = any(term in err_name.lower() or term in msg.lower() for term in ["expired", "refresh", "login", "token", "unauthorized"])
                if is_expired:
                    self.reset_clients()
                err_utc = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
                logger.warning(f"[AWS Diagnostic] BotoCoreError ({err_name}): {msg}")
                res = {
                    "success": False,
                    "connected": False,
                    "status": "EXPIRED" if is_expired else "BOTOCRE_ERROR",
                    "error": err_name,
                    "is_expired": is_expired,
                    "checked_at": err_utc,
                    "remedy": "aws login",
                    "message": f"AWS Session Error ({err_name}): {msg}. Run 'aws login' to reauthenticate."
                }
                self._cached_connection = res
                self._cached_conn_time = now
                return res
            except Exception as e:
                err_name = type(e).__name__
                msg = str(e)
                is_expired = any(term in err_name.lower() or term in msg.lower() for term in ["expired", "refresh", "login", "token"])
                if is_expired:
                    self.reset_clients()
                err_utc = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
                logger.error(f"[AWS Diagnostic] Unexpected error: {err_name}: {msg}")
                res = {
                    "success": False,
                    "connected": False,
                    "status": "EXPIRED" if is_expired else "UNAVAILABLE",
                    "error": err_name,
                    "is_expired": is_expired,
                    "checked_at": err_utc,
                    "remedy": "aws login" if is_expired else None,
                    "message": f"Unexpected error connecting to AWS ({err_name}): {msg}"
                }
                self._cached_connection = res
                self._cached_conn_time = now
                return res

    def get_bucket_metadata(self, bucket_name: Optional[str] = None, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Retrieve actual S3 bucket information using official AWS APIs with 5-minute (300s) TTL caching:
        - get_bucket_location
        - get_bucket_versioning
        - get_bucket_encryption
        - get_bucket_ownership_controls
        - get_public_access_block
        - list_objects_v2
        
        Accurately distinguishes: Enabled, Disabled, Not configured, Access denied, Unknown, Unavailable.
        Never reports disabled if the API confirms enabled.
        """
        target_bucket = bucket_name or self.default_bucket
        now = time.time()
        if not force_refresh and target_bucket in self._cached_bucket_metadata and (now - self._cached_bucket_time.get(target_bucket, 0)) < self._bucket_cache_ttl:
            return self._cached_bucket_metadata[target_bucket]

        with self._bucket_lock:
            return self._sync_get_bucket_metadata(target_bucket, force_refresh)

    def _sync_get_bucket_metadata(self, target_bucket: str, force_refresh: bool) -> Dict[str, Any]:
        now = time.time()
        if not force_refresh and target_bucket in self._cached_bucket_metadata and (now - self._cached_bucket_time.get(target_bucket, 0)) < self._bucket_cache_ttl:
            return self._cached_bucket_metadata[target_bucket]

        conn = self.verify_connection(force_refresh=force_refresh)
        if not conn.get("connected"):
            return {
                "success": False,
                "bucket_name": target_bucket,
                "status": conn.get("status", "DISCONNECTED"),
                "error": conn.get("error"),
                "is_expired": conn.get("is_expired", False),
                "remedy": conn.get("remedy"),
                "message": conn.get("message")
            }

        s3 = self.get_s3_client()

        metadata: Dict[str, Any] = {
            "success": True,
            "bucket_name": target_bucket,
            "region": self.region_name,
            "profile": self.profile_name,
            "status": "ACTIVE",
            "retrieved_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        }

        # 1. Location Constraint
        try:
            loc_res = s3.get_bucket_location(Bucket=target_bucket)
            loc = loc_res.get("LocationConstraint") or "us-east-1"
            metadata["location"] = loc
        except ClientError as e:
            metadata["location"] = self.region_name
            metadata["location_error"] = e.response.get("Error", {}).get("Code", str(e))

        # 2. Bucket Versioning
        try:
            ver_res = s3.get_bucket_versioning(Bucket=target_bucket)
            raw_v_status = ver_res.get("Status")
            if raw_v_status == "Enabled":
                metadata["versioning_status"] = "Enabled"
            elif raw_v_status == "Suspended":
                metadata["versioning_status"] = "Suspended"
            else:
                metadata["versioning_status"] = "Disabled"
            metadata["mfa_delete"] = ver_res.get("MFADelete", "Disabled")
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "ClientError")
            if "AccessDenied" in code:
                metadata["versioning_status"] = "Access denied"
            else:
                metadata["versioning_status"] = "Unavailable"

        # 3. Server-Side Encryption (SSE-S3 / SSE-KMS)
        try:
            enc_res = s3.get_bucket_encryption(Bucket=target_bucket)
            rules = enc_res.get("ServerSideEncryptionConfiguration", {}).get("Rules", [])
            if rules:
                rule = rules[0]
                def_enc = rule.get("ApplyServerSideEncryptionByDefault", {})
                algo = def_enc.get("SSEAlgorithm", "AES256")
                kms_key = def_enc.get("KMSMasterKeyId")
                metadata["encryption"] = {
                    "status": "Enabled",
                    "enabled": True,
                    "algorithm": algo,
                    "kms_master_key_id": kms_key if kms_key else "None (SSE-S3 Managed)",
                    "bucket_key_enabled": rule.get("BucketKeyEnabled", False)
                }
            else:
                metadata["encryption"] = {
                    "status": "Not configured",
                    "enabled": False,
                    "algorithm": "None"
                }
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "ClientError")
            if code == "ServerSideEncryptionConfigurationNotFoundError":
                metadata["encryption"] = {
                    "status": "Disabled",
                    "enabled": False,
                    "algorithm": "None"
                }
            elif "AccessDenied" in code:
                metadata["encryption"] = {
                    "status": "Access denied",
                    "enabled": False,
                    "error": "Access denied querying encryption"
                }
            else:
                metadata["encryption"] = {
                    "status": "Unavailable",
                    "enabled": False,
                    "error": str(e)
                }

        # 4. Bucket Ownership Controls & ACL Status
        try:
            oc_res = s3.get_bucket_ownership_controls(Bucket=target_bucket)
            rules = oc_res.get("OwnershipControls", {}).get("Rules", [])
            ownership = rules[0].get("ObjectOwnership") if rules else "ObjectWriter"
            metadata["ownership_controls"] = {
                "status": "Enabled" if ownership == "BucketOwnerEnforced" else "Configured",
                "object_ownership": ownership,
                "acls_disabled": ownership == "BucketOwnerEnforced"
            }
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "ClientError")
            if code == "OwnershipControlsNotFoundError":
                metadata["ownership_controls"] = {
                    "status": "Not configured",
                    "object_ownership": "ObjectWriter",
                    "acls_disabled": False
                }
            elif "AccessDenied" in code:
                metadata["ownership_controls"] = {
                    "status": "Access denied",
                    "object_ownership": "Unknown",
                    "acls_disabled": False
                }
            else:
                metadata["ownership_controls"] = {
                    "status": "Unavailable",
                    "object_ownership": "Unknown",
                    "acls_disabled": False
                }

        # 5. Public Access Block Configuration
        try:
            pab_res = s3.get_public_access_block(Bucket=target_bucket)
            conf = pab_res.get("PublicAccessBlockConfiguration", {})
            b_acls = conf.get("BlockPublicAcls", False)
            i_acls = conf.get("IgnorePublicAcls", False)
            b_pol = conf.get("BlockPublicPolicy", False)
            r_buck = conf.get("RestrictPublicBuckets", False)
            is_all_blocked = all([b_acls, i_acls, b_pol, r_buck])

            metadata["public_access_block"] = {
                "status": "Enabled" if is_all_blocked else ("Partially Configured" if any([b_acls, i_acls, b_pol, r_buck]) else "Disabled"),
                "is_fully_blocked": is_all_blocked,
                "block_public_acls": b_acls,
                "ignore_public_acls": i_acls,
                "block_public_policy": b_pol,
                "restrict_public_buckets": r_buck
            }
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "ClientError")
            if code == "NoSuchPublicAccessBlockConfiguration":
                metadata["public_access_block"] = {
                    "status": "Not configured",
                    "is_fully_blocked": False,
                    "block_public_acls": False,
                    "ignore_public_acls": False,
                    "block_public_policy": False,
                    "restrict_public_buckets": False
                }
            elif "AccessDenied" in code:
                metadata["public_access_block"] = {
                    "status": "Access denied",
                    "is_fully_blocked": False
                }
            else:
                metadata["public_access_block"] = {
                    "status": "Unavailable",
                    "is_fully_blocked": False
                }

        # 6. Object Count & Total Allocated Bytes (list_objects_v2)
        try:
            paginator = s3.get_paginator("list_objects_v2")
            total_objects = 0
            total_size_bytes = 0
            storage_classes: Dict[str, int] = {}
            latest_modified = None
            sample_objects = []

            for page in paginator.paginate(Bucket=target_bucket):
                for obj in page.get("Contents", []):
                    total_objects += 1
                    sz = obj.get("Size", 0)
                    total_size_bytes += sz
                    st_class = obj.get("StorageClass", "STANDARD")
                    storage_classes[st_class] = storage_classes.get(st_class, 0) + sz

                    m_time = obj.get("LastModified")
                    if m_time and (latest_modified is None or m_time > latest_modified):
                        latest_modified = m_time

                    if len(sample_objects) < 25:
                        sample_objects.append({
                            "key": obj.get("Key"),
                            "size_bytes": sz,
                            "storage_class": st_class,
                            "etag": obj.get("ETag"),
                            "last_modified": m_time.strftime("%Y-%m-%d %H:%M:%S UTC") if m_time else None
                        })

            metadata["object_count"] = total_objects
            metadata["total_size_bytes"] = total_size_bytes
            metadata["total_size_kb"] = round(total_size_bytes / 1024, 2)
            metadata["total_size_mb"] = round(total_size_bytes / (1024 ** 2), 4)
            metadata["total_size_gb"] = round(total_size_bytes / (1024 ** 3), 6)
            metadata["storage_class_breakdown"] = storage_classes
            metadata["latest_modified"] = latest_modified.strftime("%Y-%m-%d %H:%M:%S UTC") if latest_modified else None
            metadata["sample_objects"] = sample_objects
            metadata["data_source"] = "AWS S3 Official API (boto3 / ap-southeast-2)"
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "ClientError")
            metadata["object_count"] = 0
            metadata["total_size_bytes"] = 0
            metadata["list_status"] = "Access denied" if "AccessDenied" in code else "Unavailable"
            metadata["data_source"] = "AWS S3 Official API (boto3 / ap-southeast-2)"

        self._cached_bucket_metadata[target_bucket] = metadata
        self._cached_bucket_time[target_bucket] = now
        return metadata

    def get_object_metadata(self, key: str = "test-storage.txt", bucket_name: Optional[str] = None, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Retrieve authentic object metadata using official S3 head_object API with 30s caching.
        Never alters object contents or uploads new resources.
        """
        target_bucket = bucket_name or self.default_bucket
        cache_key = f"{target_bucket}/{key}"
        now = time.time()
        if not force_refresh and cache_key in self._cached_object_metadata and (now - self._cached_object_time.get(cache_key, 0)) < self._object_cache_ttl:
            return self._cached_object_metadata[cache_key]

        conn = self.verify_connection(force_refresh=force_refresh)
        if not conn.get("connected"):
            return {
                "success": False,
                "bucket_name": target_bucket,
                "key": key,
                "status": conn.get("status", "DISCONNECTED"),
                "error": conn.get("error"),
                "message": conn.get("message"),
                "data_source": "AWS S3 head_object API",
                "retrieved_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
            }

        s3 = self.get_s3_client()
        try:
            head_res = s3.head_object(Bucket=target_bucket, Key=key)
            obj_res = {
                "success": True,
                "bucket_name": target_bucket,
                "key": key,
                "status": "EXISTS",
                "content_length": head_res.get("ContentLength"),
                "content_type": head_res.get("ContentType"),
                "etag": head_res.get("ETag"),
                "last_modified": head_res.get("LastModified").strftime("%Y-%m-%d %H:%M:%S UTC") if head_res.get("LastModified") else None,
                "server_side_encryption": head_res.get("ServerSideEncryption", "None"),
                "version_id": head_res.get("VersionId"),
                "storage_class": head_res.get("StorageClass", "STANDARD"),
                "metadata": head_res.get("Metadata", {}),
                "data_source": "AWS S3 head_object API (ap-southeast-2)",
                "retrieved_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
            }
            self._cached_object_metadata[cache_key] = obj_res
            self._cached_object_time[cache_key] = now
            return obj_res
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "ClientError")
            is_404 = code in ["404", "NoSuchKey", "NotFound"]
            err_res = {
                "success": False,
                "bucket_name": target_bucket,
                "key": key,
                "status": "NOT_FOUND" if is_404 else "ERROR",
                "error": code,
                "message": str(e),
                "data_source": "AWS S3 head_object API (ap-southeast-2)",
                "retrieved_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
            }
            if is_404:
                self._cached_object_metadata[cache_key] = err_res
                self._cached_object_time[cache_key] = now
            return err_res

    def get_cloudwatch_metrics(
        self,
        bucket_name: Optional[str] = None,
        days: int = 7
    ) -> Dict[str, Any]:
        """
        Retrieve daily CloudWatch storage metrics for S3.
        Accounts for S3 once-per-day metric publication.
        """
        target_bucket = bucket_name or self.default_bucket
        cw = self.get_cloudwatch_client()

        end_time = datetime.utcnow()
        start_time = end_time - timedelta(days=days)

        metric_queries = [
            {
                "Id": "size_bytes",
                "MetricStat": {
                    "Metric": {
                        "Namespace": "AWS/S3",
                        "MetricName": "BucketSizeBytes",
                        "Dimensions": [
                            {"Name": "BucketName", "Value": target_bucket},
                            {"Name": "StorageType", "Value": "StandardStorage"}
                        ]
                    },
                    "Period": 86400,
                    "Stat": "Average"
                },
                "ReturnData": True
            },
            {
                "Id": "num_objects",
                "MetricStat": {
                    "Metric": {
                        "Namespace": "AWS/S3",
                        "MetricName": "NumberOfObjects",
                        "Dimensions": [
                            {"Name": "BucketName", "Value": target_bucket},
                            {"Name": "StorageType", "Value": "AllStorageTypes"}
                        ]
                    },
                    "Period": 86400,
                    "Stat": "Average"
                },
                "ReturnData": True
            }
        ]

        try:
            res = cw.get_metric_data(
                MetricDataQueries=metric_queries,
                StartTime=start_time,
                EndTime=end_time,
                ScanBy="TimestampAscending"
            )

            results: Dict[str, List[Dict[str, Any]]] = {
                "size_history": [],
                "object_history": []
            }

            for series in res.get("MetricDataResults", []):
                q_id = series.get("Id")
                timestamps = series.get("Timestamps", [])
                values = series.get("Values", [])

                datapoints = [
                    {
                        "timestamp": ts.strftime("%Y-%m-%d"),
                        "value": val
                    }
                    for ts, val in zip(timestamps, values)
                ]

                if q_id == "size_bytes":
                    results["size_history"] = datapoints
                elif q_id == "num_objects":
                    results["object_history"] = datapoints

            has_data = bool(results["size_history"] or results["object_history"])
            return {
                "success": True,
                "status": "SUCCESS",
                "metric_status": "AVAILABLE" if has_data else "UNAVAILABLE",
                "bucket_name": target_bucket,
                "days_requested": days,
                "has_cloudwatch_data": has_data,
                "size_history": results["size_history"],
                "object_history": results["object_history"],
                "data_source": "Amazon CloudWatch Metrics API (AWS/S3 Namespace)",
                "retrieved_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
                "notice": "CloudWatch S3 storage metrics are collected daily by AWS. Empty responses indicate that metric datapoints are currently unavailable pending the next AWS daily rollup cycle, not zero or an integration failure."
            }
        except ClientError as e:
            return {
                "success": False,
                "bucket_name": target_bucket,
                "error": str(e),
                "size_history": [],
                "object_history": [],
                "notice": "CloudWatch query failed or permissions restricted."
            }
        except Exception as e:
            return {
                "success": False,
                "bucket_name": target_bucket,
                "error": str(e),
                "size_history": [],
                "object_history": []
            }

    def list_all_accessible_buckets(self) -> Dict[str, Any]:
        """List accessible buckets for the current profile identity."""
        conn = self.verify_connection()
        if not conn.get("connected"):
            return {
                "success": False,
                "buckets": [],
                "error": conn.get("error"),
                "message": conn.get("message")
            }

        try:
            s3 = self.get_s3_client()
            response = s3.list_buckets()
            buckets = [
                {
                    "name": b.get("Name"),
                    "creation_date": b.get("CreationDate").strftime("%Y-%m-%d %H:%M:%S") if b.get("CreationDate") else None,
                    "is_target": b.get("Name") == self.default_bucket
                }
                for b in response.get("Buckets", [])
            ]
            return {
                "success": True,
                "owner": response.get("Owner", {}).get("DisplayName", "AWS Account"),
                "total_buckets": len(buckets),
                "buckets": buckets
            }
        except ClientError as e:
            return {
                "success": False,
                "buckets": [],
                "error": str(e)
            }

    def _record_aws_audit(self, action: str, resource: str, description: str, status: str = "SUCCESS", details: Optional[Dict[str, Any]] = None):
        """Helper to write AWS audit log entries to SQLite database with retry."""
        try:
            import json
            from app.database.session import SessionLocal, execute_with_db_retry
            from app.models.database import AuditLog

            def _write():
                db = SessionLocal()
                try:
                    entry = AuditLog(
                        action_type=action,
                        resource=resource,
                        description=description,
                        status=status,
                        user_email="operator@aegisstor.internal",
                        details_json=json.dumps(details or {})
                    )
                    db.add(entry)
                    db.commit()
                except Exception:
                    db.rollback()
                    raise
                finally:
                    db.close()

            execute_with_db_retry(_write)
        except Exception as e:
            logger.warning(f"[AWSS3Service] Could not persist audit log: {e}")

    def upload_file(
        self,
        file_bytes: bytes,
        filename: str,
        content_type: str = "application/octet-stream",
        bucket_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Upload file content directly to Amazon S3 bucket with audit logging."""
        target_bucket = bucket_name or self.default_bucket
        conn = self.verify_connection()
        if not conn.get("connected"):
            return {
                "success": False,
                "error": conn.get("error", "AWS_DISCONNECTED"),
                "status": conn.get("status", "DISCONNECTED"),
                "message": conn.get("message", "Cannot upload: AWS is disconnected.")
            }

        try:
            s3 = self.get_s3_client()
            put_res = s3.put_object(
                Bucket=target_bucket,
                Key=filename,
                Body=file_bytes,
                ContentType=content_type
            )
            # Invalidate bucket and object cache
            self._cached_bucket_metadata.pop(target_bucket, None)
            cache_key = f"{target_bucket}/{filename}"
            self._cached_object_metadata.pop(cache_key, None)

            # Record audit log
            self._record_aws_audit(
                action="AWS_S3_UPLOAD",
                resource=f"s3://{target_bucket}/{filename}",
                description=f"Uploaded {len(file_bytes)} bytes to s3://{target_bucket}/{filename} (ContentType: {content_type})",
                status="SUCCESS",
                details={
                    "bucket": target_bucket,
                    "key": filename,
                    "size_bytes": len(file_bytes),
                    "etag": put_res.get("ETag"),
                    "version_id": put_res.get("VersionId")
                }
            )

            return {
                "success": True,
                "bucket": target_bucket,
                "key": filename,
                "size_bytes": len(file_bytes),
                "etag": put_res.get("ETag"),
                "version_id": put_res.get("VersionId"),
                "uploaded_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
                "message": f"Successfully uploaded '{filename}' ({len(file_bytes)} bytes) to S3."
            }
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "ClientError")
            msg = e.response.get("Error", {}).get("Message", str(e))
            logger.error(f"[AWSS3Service] Upload error for {filename}: {code} - {msg}")
            return {
                "success": False,
                "error": code,
                "message": f"S3 Upload Error ({code}): {msg}"
            }
        except Exception as e:
            logger.error(f"[AWSS3Service] Unexpected upload error: {e}")
            return {
                "success": False,
                "error": type(e).__name__,
                "message": str(e)
            }

    def download_file(
        self,
        filename: str,
        bucket_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Download raw object bytes and metadata from Amazon S3."""
        target_bucket = bucket_name or self.default_bucket
        conn = self.verify_connection()
        if not conn.get("connected"):
            return {
                "success": False,
                "error": conn.get("error", "AWS_DISCONNECTED"),
                "message": conn.get("message", "Cannot download: AWS is disconnected.")
            }

        try:
            s3 = self.get_s3_client()
            res = s3.get_object(Bucket=target_bucket, Key=filename)
            body_bytes = res["Body"].read()
            content_type = res.get("ContentType", "application/octet-stream")

            # Record audit log
            self._record_aws_audit(
                action="AWS_S3_DOWNLOAD",
                resource=f"s3://{target_bucket}/{filename}",
                description=f"Downloaded {len(body_bytes)} bytes from s3://{target_bucket}/{filename}",
                status="SUCCESS",
                details={
                    "bucket": target_bucket,
                    "key": filename,
                    "size_bytes": len(body_bytes),
                    "etag": res.get("ETag")
                }
            )

            return {
                "success": True,
                "data": body_bytes,
                "content_type": content_type,
                "content_length": len(body_bytes),
                "etag": res.get("ETag"),
                "version_id": res.get("VersionId"),
                "last_modified": res.get("LastModified").strftime("%Y-%m-%d %H:%M:%S UTC") if res.get("LastModified") else None,
                "filename": filename
            }
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "ClientError")
            msg = e.response.get("Error", {}).get("Message", str(e))
            return {
                "success": False,
                "error": code,
                "message": f"S3 Download Error ({code}): {msg}"
            }
        except Exception as e:
            return {
                "success": False,
                "error": type(e).__name__,
                "message": str(e)
            }

    def delete_object(
        self,
        filename: str,
        version_id: Optional[str] = None,
        bucket_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Delete an object or specific version from Amazon S3 bucket with confirmation record."""
        target_bucket = bucket_name or self.default_bucket
        conn = self.verify_connection()
        if not conn.get("connected"):
            return {
                "success": False,
                "error": conn.get("error", "AWS_DISCONNECTED"),
                "message": conn.get("message", "Cannot delete: AWS is disconnected.")
            }

        try:
            s3 = self.get_s3_client()
            params: Dict[str, Any] = {"Bucket": target_bucket, "Key": filename}
            if version_id:
                params["VersionId"] = version_id

            del_res = s3.delete_object(**params)
            # Invalidate bucket and object cache
            self._cached_bucket_metadata.pop(target_bucket, None)
            cache_key = f"{target_bucket}/{filename}"
            self._cached_object_metadata.pop(cache_key, None)

            # Record audit log
            self._record_aws_audit(
                action="AWS_S3_DELETE",
                resource=f"s3://{target_bucket}/{filename}",
                description=f"Deleted object s3://{target_bucket}/{filename}" + (f" (version {version_id})" if version_id else ""),
                status="SUCCESS",
                details={
                    "bucket": target_bucket,
                    "key": filename,
                    "version_id": version_id,
                    "delete_marker": del_res.get("DeleteMarker", False)
                }
            )

            return {
                "success": True,
                "bucket": target_bucket,
                "key": filename,
                "version_id": version_id,
                "delete_marker": del_res.get("DeleteMarker", False),
                "deleted_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
                "message": f"Successfully deleted '{filename}' from s3://{target_bucket}."
            }
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "ClientError")
            msg = e.response.get("Error", {}).get("Message", str(e))
            return {
                "success": False,
                "error": code,
                "message": f"S3 Delete Error ({code}): {msg}"
            }
        except Exception as e:
            return {
                "success": False,
                "error": type(e).__name__,
                "message": str(e)
            }

    def list_object_versions(
        self,
        bucket_name: Optional[str] = None,
        prefix: Optional[str] = None
    ) -> Dict[str, Any]:
        """Retrieve real version history for objects in the S3 bucket."""
        target_bucket = bucket_name or self.default_bucket
        conn = self.verify_connection()
        if not conn.get("connected"):
            return {
                "success": False,
                "bucket": target_bucket,
                "versions": [],
                "error": conn.get("error", "AWS_DISCONNECTED"),
                "message": conn.get("message", "AWS is disconnected.")
            }

        try:
            s3 = self.get_s3_client()
            params: Dict[str, Any] = {"Bucket": target_bucket, "MaxKeys": 100}
            if prefix:
                params["Prefix"] = prefix

            res = s3.list_object_versions(**params)
            versions = [
                {
                    "key": v.get("Key"),
                    "version_id": v.get("VersionId"),
                    "is_latest": v.get("IsLatest", False),
                    "last_modified": v.get("LastModified").strftime("%Y-%m-%d %H:%M:%S UTC") if v.get("LastModified") else None,
                    "size_bytes": v.get("Size", 0),
                    "etag": v.get("ETag"),
                    "storage_class": v.get("StorageClass", "STANDARD")
                }
                for v in res.get("Versions", [])
            ]
            delete_markers = [
                {
                    "key": dm.get("Key"),
                    "version_id": dm.get("VersionId"),
                    "is_latest": dm.get("IsLatest", False),
                    "last_modified": dm.get("LastModified").strftime("%Y-%m-%d %H:%M:%S UTC") if dm.get("LastModified") else None
                }
                for dm in res.get("DeleteMarkers", [])
            ]

            return {
                "success": True,
                "bucket": target_bucket,
                "total_versions": len(versions),
                "total_delete_markers": len(delete_markers),
                "versions": versions,
                "delete_markers": delete_markers,
                "retrieved_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
            }
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "ClientError")
            return {
                "success": False,
                "bucket": target_bucket,
                "versions": [],
                "error": code,
                "message": str(e)
            }


aws_service = AWSS3Service()
