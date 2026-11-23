import json
import boto3
from botocore.exceptions import ClientError, ProfileNotFound, NoCredentialsError
from datetime import datetime, timedelta

def run_verification():
    profile = "aegisstor"
    region = "ap-southeast-2"
    bucket = "aegisstor-mon-425178888081-ap-southeast-2-an"
    test_obj_key = "test-storage.txt"

    report = {
        "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
        "profile": profile,
        "region": region,
        "bucket": bucket,
        "test_object_key": test_obj_key,
        "results": {}
    }

    # 1. Boto3 Session & STS Caller Identity
    try:
        session = boto3.Session(profile_name=profile, region_name=region)
        sts = session.client("sts")
        identity = sts.get_caller_identity()
        report["results"]["sts_identity"] = {
            "status": "SUCCESS",
            "account_id": identity.get("Account"),
            "arn": identity.get("Arn"),
            "user_id": identity.get("UserId"),
        }
    except Exception as e:
        report["results"]["sts_identity"] = {
            "status": "ERROR",
            "error_type": type(e).__name__,
            "message": str(e)
        }
        print(json.dumps(report, indent=2))
        return

    s3 = session.client("s3")

    # 2. Bucket Accessibility (head_bucket)
    try:
        s3.head_bucket(Bucket=bucket)
        report["results"]["bucket_accessibility"] = {
            "status": "ACCESSIBLE",
            "bucket": bucket,
            "message": "Bucket exists and caller has permission to access it."
        }
    except ClientError as e:
        report["results"]["bucket_accessibility"] = {
            "status": "ERROR",
            "code": e.response.get("Error", {}).get("Code"),
            "message": str(e)
        }

    # 3. Bucket Versioning
    try:
        v_res = s3.get_bucket_versioning(Bucket=bucket)
        report["results"]["versioning"] = {
            "status": v_res.get("Status", "Disabled"),
            "mfa_delete": v_res.get("MFADelete", "Disabled"),
            "raw_response": v_res
        }
    except ClientError as e:
        report["results"]["versioning"] = {
            "status": "ERROR",
            "code": e.response.get("Error", {}).get("Code"),
            "message": str(e)
        }

    # 4. Bucket Encryption
    try:
        enc_res = s3.get_bucket_encryption(Bucket=bucket)
        rules = enc_res.get("ServerSideEncryptionConfiguration", {}).get("Rules", [])
        report["results"]["encryption"] = {
            "status": "Enabled" if rules else "Not configured",
            "rules": rules,
            "raw_response": enc_res
        }
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        report["results"]["encryption"] = {
            "status": "Disabled" if code == "ServerSideEncryptionConfigurationNotFoundError" else "ERROR",
            "code": code,
            "message": str(e)
        }

    # 5. Public Access Block
    try:
        pab_res = s3.get_public_access_block(Bucket=bucket)
        pab = pab_res.get("PublicAccessBlockConfiguration", {})
        report["results"]["public_access_block"] = {
            "status": "SUCCESS",
            "block_public_acls": pab.get("BlockPublicAcls"),
            "ignore_public_acls": pab.get("IgnorePublicAcls"),
            "block_public_policy": pab.get("BlockPublicPolicy"),
            "restrict_public_buckets": pab.get("RestrictPublicBuckets"),
            "is_fully_blocked": all([
                pab.get("BlockPublicAcls"),
                pab.get("IgnorePublicAcls"),
                pab.get("BlockPublicPolicy"),
                pab.get("RestrictPublicBuckets")
            ])
        }
    except ClientError as e:
        report["results"]["public_access_block"] = {
            "status": "ERROR",
            "code": e.response.get("Error", {}).get("Code"),
            "message": str(e)
        }

    # 6. Bucket Ownership Controls
    try:
        oc_res = s3.get_bucket_ownership_controls(Bucket=bucket)
        rules = oc_res.get("OwnershipControls", {}).get("Rules", [])
        report["results"]["ownership_controls"] = {
            "status": "SUCCESS",
            "rules": rules,
            "object_ownership": rules[0].get("ObjectOwnership") if rules else "ObjectWriter"
        }
    except ClientError as e:
        report["results"]["ownership_controls"] = {
            "status": "ERROR",
            "code": e.response.get("Error", {}).get("Code"),
            "message": str(e)
        }

    # 7. List Objects with Pagination
    try:
        paginator = s3.get_paginator("list_objects_v2")
        total_objects = 0
        total_size_bytes = 0
        objects_list = []
        for page in paginator.paginate(Bucket=bucket):
            for obj in page.get("Contents", []):
                total_objects += 1
                total_size_bytes += obj.get("Size", 0)
                objects_list.append({
                    "key": obj.get("Key"),
                    "size_bytes": obj.get("Size"),
                    "last_modified": obj.get("LastModified").strftime("%Y-%m-%d %H:%M:%S UTC") if obj.get("LastModified") else None,
                    "storage_class": obj.get("StorageClass"),
                    "etag": obj.get("ETag")
                })
        report["results"]["objects"] = {
            "status": "SUCCESS",
            "total_objects": total_objects,
            "total_size_bytes": total_size_bytes,
            "total_size_kb": round(total_size_bytes / 1024, 2),
            "total_size_mb": round(total_size_bytes / (1024**2), 4),
            "objects": objects_list
        }
    except ClientError as e:
        report["results"]["objects"] = {
            "status": "ERROR",
            "code": e.response.get("Error", {}).get("Code"),
            "message": str(e)
        }

    # 8. Test Object Metadata (head_object)
    try:
        head_res = s3.head_object(Bucket=bucket, Key=test_obj_key)
        report["results"]["test_object_metadata"] = {
            "status": "EXISTS",
            "key": test_obj_key,
            "content_length": head_res.get("ContentLength"),
            "content_type": head_res.get("ContentType"),
            "etag": head_res.get("ETag"),
            "last_modified": head_res.get("LastModified").strftime("%Y-%m-%d %H:%M:%S UTC") if head_res.get("LastModified") else None,
            "server_side_encryption": head_res.get("ServerSideEncryption"),
            "version_id": head_res.get("VersionId"),
            "storage_class": head_res.get("StorageClass", "STANDARD"),
            "metadata": head_res.get("Metadata", {})
        }
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        report["results"]["test_object_metadata"] = {
            "status": "NOT_FOUND" if code == "404" or code == "NoSuchKey" else "ERROR",
            "code": code,
            "message": str(e)
        }

    # 9. CloudWatch Metrics Query
    cw = session.client("cloudwatch")
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(days=14)
    metric_queries = [
        {
            "Id": "size_bytes",
            "MetricStat": {
                "Metric": {
                    "Namespace": "AWS/S3",
                    "MetricName": "BucketSizeBytes",
                    "Dimensions": [
                        {"Name": "BucketName", "Value": bucket},
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
                        {"Name": "BucketName", "Value": bucket},
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
        cw_res = cw.get_metric_data(
            MetricDataQueries=metric_queries,
            StartTime=start_time,
            EndTime=end_time,
            ScanBy="TimestampAscending"
        )
        cw_data = {}
        for series in cw_res.get("MetricDataResults", []):
            qid = series.get("Id")
            ts = [t.strftime("%Y-%m-%d") for t in series.get("Timestamps", [])]
            vals = series.get("Values", [])
            cw_data[qid] = [{"date": d, "value": v} for d, v in zip(ts, vals)]

        has_data = any(len(v) > 0 for v in cw_data.values())
        report["results"]["cloudwatch_metrics"] = {
            "status": "SUCCESS",
            "has_data": has_data,
            "metric_series": cw_data,
            "note": "AWS S3 daily CloudWatch metrics. Empty response is normal for new buckets (<24-48h of existence) and is NOT an error."
        }
    except ClientError as e:
        report["results"]["cloudwatch_metrics"] = {
            "status": "ERROR",
            "code": e.response.get("Error", {}).get("Code"),
            "message": str(e)
        }

    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    run_verification()
