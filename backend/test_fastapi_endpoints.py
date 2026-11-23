import json
from fastapi.testclient import TestClient
from app.main import app

def test_endpoints():
    client = TestClient(app)

    # 1. /api/v1/aws/status
    res_status = client.get("/api/v1/aws/status")
    print(f"GET /api/v1/aws/status: HTTP {res_status.status_code}")
    assert res_status.status_code == 200, res_status.text
    data_status = res_status.json()

    # 2. /api/v1/aws/s3/bucket
    res_bucket = client.get("/api/v1/aws/s3/bucket")
    print(f"GET /api/v1/aws/s3/bucket: HTTP {res_bucket.status_code}")
    assert res_bucket.status_code == 200, res_bucket.text
    data_bucket = res_bucket.json()

    # 3. /api/v1/aws/s3/object?key=test-storage.txt
    res_obj = client.get("/api/v1/aws/s3/object?key=test-storage.txt")
    print(f"GET /api/v1/aws/s3/object?key=test-storage.txt: HTTP {res_obj.status_code}")
    assert res_obj.status_code == 200, res_obj.text
    data_obj = res_obj.json()

    # 4. /api/v1/aws/s3/metrics?days=7
    res_metrics = client.get("/api/v1/aws/s3/metrics?days=7")
    print(f"GET /api/v1/aws/s3/metrics?days=7: HTTP {res_metrics.status_code}")
    assert res_metrics.status_code == 200, res_metrics.text
    data_metrics = res_metrics.json()

    # 5. /api/v1/aws/s3/buckets
    res_buckets = client.get("/api/v1/aws/s3/buckets")
    print(f"GET /api/v1/aws/s3/buckets: HTTP {res_buckets.status_code}")
    assert res_buckets.status_code == 200, res_buckets.text
    data_buckets = res_buckets.json()

    output = {
        "status_endpoint": data_status,
        "bucket_endpoint": data_bucket,
        "object_endpoint": data_obj,
        "metrics_endpoint": data_metrics,
        "buckets_endpoint": data_buckets
    }
    with open("fastapi_verified_responses.json", "w") as f:
        json.dump(output, f, indent=2)

    print("ALL_FASTAPI_ENDPOINTS_TESTED_SUCCESSFULLY")

if __name__ == "__main__":
    test_endpoints()
