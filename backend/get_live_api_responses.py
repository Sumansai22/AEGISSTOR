import json
from app.services.aws_service import aws_service

def collect():
    status = aws_service.verify_connection()
    bucket = aws_service.get_bucket_metadata()
    obj = aws_service.get_object_metadata(key="test-storage.txt")
    metrics = aws_service.get_cloudwatch_metrics(days=7)
    buckets = aws_service.list_all_accessible_buckets()

    responses = {
        "/api/v1/aws/status": status,
        "/api/v1/aws/s3/bucket": bucket,
        "/api/v1/aws/s3/object?key=test-storage.txt": obj,
        "/api/v1/aws/s3/metrics?days=7": metrics,
        "/api/v1/aws/s3/buckets": buckets
    }

    with open("live_aws_api_responses.json", "w") as f:
        json.dump(responses, f, indent=2)

    print("LIVE_RESPONSES_COLLECTED_SUCCESSFULLY")

if __name__ == "__main__":
    collect()
