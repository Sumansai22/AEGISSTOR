"""
AEGISSTOR AWS Integration Test Suite
Validates AWS connection verification, S3 bucket metadata extraction,
CloudWatch metrics gathering, error handling for expired sessions, and mocked responses.
"""
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch
from datetime import datetime, timedelta
import pytest
from botocore.exceptions import ClientError, ProfileNotFound, NoCredentialsError

backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.services.aws_service import AWSS3Service, DEFAULT_PROFILE, DEFAULT_BUCKET, DEFAULT_REGION


@pytest.fixture
def aws_service():
    """Returns an AWSS3Service instance."""
    return AWSS3Service(
        profile_name="aegisstor",
        region_name="ap-southeast-2",
        default_bucket="aegisstor-mon-425178888081-ap-southeast-2-an"
    )


# =========================================================================
# 1. LIVE / PROFILE CONNECTION & S3 BUCKET TESTS
# =========================================================================

def test_aws_live_or_fallback_connection(aws_service):
    """Test connection verification using active CLI profile credentials."""
    conn = aws_service.verify_connection()
    assert "success" in conn
    assert "connected" in conn
    if conn["connected"]:
        assert conn["account_id"] == "425178888081"
        assert conn["profile"] == "aegisstor"
        assert conn["region"] == "ap-southeast-2"
        assert "arn" in conn


def test_aws_bucket_metadata(aws_service):
    """Test retrieving bucket metadata, encryption, versioning."""
    meta = aws_service.get_bucket_metadata()
    assert "bucket_name" in meta
    if meta.get("success"):
        assert meta["bucket_name"] == "aegisstor-mon-425178888081-ap-southeast-2-an"
        assert meta["region"] == "ap-southeast-2"
        assert "versioning_status" in meta
        assert "encryption" in meta
        assert meta["encryption"].get("enabled") is True
        assert meta["encryption"].get("algorithm") == "AES256"


# =========================================================================
# 2. MOCKED AWS RESPONSES & TESTS
# =========================================================================

def test_mocked_sts_caller_identity_success():
    """Verify verify_connection logic when STS returns valid caller identity."""
    service = AWSS3Service()
    mock_session = MagicMock()
    mock_sts = MagicMock()
    mock_sts.get_caller_identity.return_value = {
        "Account": "425178888081",
        "Arn": "arn:aws:sts::425178888081:assumed-role/TestRole/session",
        "UserId": "TEST_USER_ID"
    }
    mock_session.client.return_value = mock_sts

    with patch.object(service, "get_session", return_value=mock_session):
        res = service.verify_connection()
        assert res["success"] is True
        assert res["connected"] is True
        assert res["account_id"] == "425178888081"
        assert res["arn"] == "arn:aws:sts::425178888081:assumed-role/TestRole/session"


def test_mocked_expired_token_handling():
    """Verify graceful handling when AWS temporary session is expired via ClientError."""
    service = AWSS3Service()
    mock_session = MagicMock()
    mock_sts = MagicMock()
    error_response = {
        "Error": {
            "Code": "ExpiredToken",
            "Message": "The security token included in the request is expired"
        }
    }
    mock_sts.get_caller_identity.side_effect = ClientError(error_response, "GetCallerIdentity")
    mock_session.client.return_value = mock_sts

    with patch.object(service, "get_session", return_value=mock_session):
        res = service.verify_connection()
        assert res["success"] is False
        assert res["connected"] is False
        assert res["status"] == "EXPIRED"
        assert res["error"] == "ExpiredToken"
        assert res["is_expired"] is True
        assert "reauthenticate" in res["message"].lower() or "expired" in res["message"].lower()


def test_mocked_login_refresh_required_handling():
    """Verify graceful handling when botocore LoginRefreshRequired or SSO token error is raised."""
    from botocore.exceptions import BotoCoreError
    service = AWSS3Service()
    mock_session = MagicMock()
    mock_sts = MagicMock()

    class MockLoginRefreshRequired(BotoCoreError):
        fmt = "Your session has expired or credentials have changed. Please reauthenticate using 'aws login'."

    mock_sts.get_caller_identity.side_effect = MockLoginRefreshRequired()
    mock_session.client.return_value = mock_sts

    with patch.object(service, "get_session", return_value=mock_session):
        res = service.verify_connection()
        assert res["success"] is False
        assert res["connected"] is False
        assert res["status"] == "EXPIRED"
        assert res["is_expired"] is True
        assert res["remedy"] == "aws login"
        assert "aws login" in res["message"].lower()



def test_mocked_missing_profile():
    """Verify error reporting when the configured AWS CLI profile does not exist."""
    service = AWSS3Service(profile_name="nonexistent_profile")
    with patch.object(service, "get_session", side_effect=ProfileNotFound(profile="nonexistent_profile")):
        res = service.verify_connection()
        assert res["success"] is False
        assert res["connected"] is False
        assert res["error"] == "PROFILE_OR_CREDENTIALS_MISSING"


def test_mocked_s3_bucket_metadata_complete():
    """Verify S3 metadata aggregation: encryption, versioning, objects count and public access block."""
    service = AWSS3Service()
    mock_session = MagicMock()
    mock_s3 = MagicMock()

    # Mock get_bucket_location
    mock_s3.get_bucket_location.return_value = {"LocationConstraint": "ap-southeast-2"}
    # Mock get_bucket_versioning
    mock_s3.get_bucket_versioning.return_value = {"Status": "Enabled", "MFADelete": "Disabled"}
    # Mock get_bucket_encryption
    mock_s3.get_bucket_encryption.return_value = {
        "ServerSideEncryptionConfiguration": {
            "Rules": [{
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": False
            }]
        }
    }
    # Mock paginator for list_objects_v2
    mock_paginator = MagicMock()
    now = datetime.utcnow()
    mock_paginator.paginate.return_value = [{
        "Contents": [
            {"Key": "telemetry-1.json", "Size": 1048576, "StorageClass": "STANDARD", "LastModified": now},
            {"Key": "telemetry-2.json", "Size": 2097152, "StorageClass": "STANDARD", "LastModified": now}
        ]
    }]
    mock_s3.get_paginator.return_value = mock_paginator

    # Mock get_public_access_block
    mock_s3.get_public_access_block.return_value = {
        "PublicAccessBlockConfiguration": {
            "BlockPublicAcls": True,
            "IgnorePublicAcls": True,
            "BlockPublicPolicy": True,
            "RestrictPublicBuckets": True
        }
    }

    mock_session.client.return_value = mock_s3

    with patch.object(service, "verify_connection", return_value={"connected": True}):
        with patch.object(service, "get_session", return_value=mock_session):
            meta = service.get_bucket_metadata("test-bucket")
            assert meta["success"] is True
            assert meta["bucket_name"] == "test-bucket"
            assert meta["versioning_status"] == "Enabled"
            assert meta["encryption"]["enabled"] is True
            assert meta["encryption"]["algorithm"] == "AES256"
            assert meta["object_count"] == 2
            assert meta["total_size_bytes"] == 3145728
            assert meta["total_size_mb"] == 3.0
            assert meta["public_access_block"]["is_fully_blocked"] is True


def test_mocked_cloudwatch_metrics():
    """Verify parsing of CloudWatch S3 MetricData queries."""
    service = AWSS3Service()
    mock_session = MagicMock()
    mock_cw = MagicMock()

    t1 = datetime(2026, 11, 15, 0, 0, 0)
    t2 = datetime(2026, 11, 16, 0, 0, 0)

    mock_cw.get_metric_data.return_value = {
        "MetricDataResults": [
            {
                "Id": "size_bytes",
                "Timestamps": [t1, t2],
                "Values": [10485760.0, 20971520.0],
                "StatusCode": "Complete"
            },
            {
                "Id": "num_objects",
                "Timestamps": [t1, t2],
                "Values": [5.0, 10.0],
                "StatusCode": "Complete"
            }
        ]
    }
    mock_session.client.return_value = mock_cw

    with patch.object(service, "get_session", return_value=mock_session):
        metrics = service.get_cloudwatch_metrics("test-bucket", days=7)
        assert metrics["success"] is True
        assert metrics["has_cloudwatch_data"] is True
        assert len(metrics["size_history"]) == 2
        assert metrics["size_history"][0]["value"] == 10485760.0
        assert len(metrics["object_history"]) == 2
        assert metrics["object_history"][1]["value"] == 10.0


def test_list_all_accessible_buckets():
    """Verify list_all_accessible_buckets returns list of buckets and owner info."""
    service = AWSS3Service(default_bucket="my-target-bucket")
    mock_session = MagicMock()
    mock_s3 = MagicMock()

    mock_s3.list_buckets.return_value = {
        "Owner": {"DisplayName": "aegisstor-admin"},
        "Buckets": [
            {"Name": "my-target-bucket", "CreationDate": datetime(2026, 1, 1)},
            {"Name": "backup-bucket", "CreationDate": datetime(2026, 2, 1)}
        ]
    }
    mock_session.client.return_value = mock_s3

    with patch.object(service, "verify_connection", return_value={"connected": True}):
        with patch.object(service, "get_session", return_value=mock_session):
            res = service.list_all_accessible_buckets()
            assert res["success"] is True
            assert res["total_buckets"] == 2
            assert res["buckets"][0]["name"] == "my-target-bucket"
            assert res["buckets"][0]["is_target"] is True
            assert res["buckets"][1]["is_target"] is False


def test_mocked_get_object_metadata():
    """Verify get_object_metadata parsing for test-storage.txt."""
    service = AWSS3Service()
    mock_session = MagicMock()
    mock_s3 = MagicMock()

    mock_s3.head_object.return_value = {
        "ContentLength": 51,
        "ContentType": "text/plain",
        "ETag": '"5c0c143839e35c82674a228ce2186143"',
        "LastModified": datetime(2026, 11, 17, 18, 31, 27),
        "ServerSideEncryption": "AES256",
        "VersionId": "Oc8SxnPSIRl9yviu7HDR2LxYeou88i82",
        "StorageClass": "STANDARD",
        "Metadata": {}
    }
    mock_session.client.return_value = mock_s3

    with patch.object(service, "verify_connection", return_value={"connected": True}):
        with patch.object(service, "get_session", return_value=mock_session):
            obj = service.get_object_metadata(key="test-storage.txt")
            assert obj["success"] is True
            assert obj["status"] == "EXISTS"
            assert obj["key"] == "test-storage.txt"
            assert obj["content_length"] == 51
            assert obj["content_type"] == "text/plain"
            assert obj["server_side_encryption"] == "AES256"
            assert obj["version_id"] == "Oc8SxnPSIRl9yviu7HDR2LxYeou88i82"
            assert "data_source" in obj


def test_cloudwatch_empty_response_not_treated_as_error():
    """Verify empty CloudWatch response (normal for fresh buckets) does not trigger error state."""
    service = AWSS3Service()
    mock_session = MagicMock()
    mock_cw = MagicMock()

    mock_cw.get_metric_data.return_value = {
        "MetricDataResults": [
            {"Id": "size_bytes", "Timestamps": [], "Values": []},
            {"Id": "num_objects", "Timestamps": [], "Values": []}
        ]
    }
    mock_session.client.return_value = mock_cw

    with patch.object(service, "get_session", return_value=mock_session):
        metrics = service.get_cloudwatch_metrics("aegisstor-mon-425178888081-ap-southeast-2-an", days=7)
        assert metrics["success"] is True
        assert metrics["status"] == "SUCCESS"
        assert metrics["metric_status"] == "UNAVAILABLE"
        assert metrics["has_cloudwatch_data"] is False
        assert len(metrics["size_history"]) == 0
        assert "unavailable" in metrics["notice"].lower()

