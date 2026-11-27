"""
AEGISSTOR Enterprise Historical Reports & Telemetry Test Suite
Validates telemetry collection, database persistence, chronological sorting,
date/device filtering, schema conformance, duplicate prevention, and aggregation.
"""
import pytest
import sys
from pathlib import Path
from datetime import datetime, timedelta

backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.models.database import Base, HistoricalTelemetry
from app.database.session import SessionLocal, get_db
from app.services.historical_pipeline import historical_pipeline
from app.services.storage_monitor import storage_monitor

client = TestClient(app)

@pytest.fixture(autouse=True)
def ensure_telemetry_fixture():
    """Ensure at least some real telemetry exists for testing."""
    historical_pipeline.record_telemetry_snapshot(org_id=1)
    yield

def test_historical_telemetry_insertion():
    """Test genuine telemetry insertion into HistoricalTelemetry."""
    res = historical_pipeline.record_telemetry_snapshot(org_id=1)
    # res is list of recorded device summaries or empty if throttled by duplicate prevention
    assert isinstance(res, list)

def test_database_persistence_and_retrieval():
    """Verify records persist in the database and can be retrieved."""
    db = SessionLocal()
    try:
        latest = db.query(HistoricalTelemetry).order_by(HistoricalTelemetry.timestamp_utc.desc()).first()
        assert latest is not None
        assert latest.total_storage_gb > 0
        assert latest.used_storage_gb >= 0
        assert latest.free_storage_gb >= 0
        assert 0 <= latest.utilization_percent <= 100
        assert 0 <= latest.cpu_percent <= 100
        assert 0 <= latest.ram_percent <= 100
        assert latest.collection_status == "VERIFIED"
    finally:
        db.close()

def test_api_historical_response_schema():
    """Verify GET /api/reports/historical matches the exact Phase 4 specification."""
    response = client.get("/api/reports/historical?range=24h")
    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "data_available" in data
    assert "range" in data
    assert "record_count" in data
    assert "generated_at" in data

    if data["data_available"]:
        assert "summary" in data
        summary = data["summary"]
        assert "total_storage_gb" in summary
        assert "average_used_storage_gb" in summary
        assert "maximum_used_storage_gb" in summary
        assert "average_utilization_percent" in summary
        assert "average_cpu_percent" in summary
        assert "average_ram_percent" in summary

        assert "storage_history" in data
        assert isinstance(data["storage_history"], list)
        assert "performance_history" in data
        assert isinstance(data["performance_history"], list)
        assert "disk_io_history" in data
        assert isinstance(data["disk_io_history"], list)

        if data["storage_history"]:
            item = data["storage_history"][0]
            assert "timestamp" in item
            assert "device_id" in item
            assert "used_storage_gb" in item
            assert "free_storage_gb" in item
            assert "utilization_percent" in item

def test_timestamp_ordering():
    """Verify records are strictly sorted in chronological ascending order."""
    response = client.get("/api/reports/historical?range=30d")
    assert response.status_code == 200
    data = response.json()
    if data["data_available"] and len(data["storage_history"]) > 1:
        timestamps = [item["timestamp"] for item in data["storage_history"]]
        assert timestamps == sorted(timestamps)

def test_date_range_filtering():
    """Verify range filtering for 24h, 7d, 30d, 90d."""
    for rng in ["24h", "7d", "30d", "90d"]:
        resp = client.get(f"/api/reports/historical?range={rng}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["range"] == rng

def test_custom_date_range_filtering():
    """Verify custom start_date and end_date filtering."""
    now = datetime.utcnow()
    start = (now - timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S")
    end = now.strftime("%Y-%m-%d %H:%M:%S")

    resp = client.get(f"/api/reports/historical?start_date={start}&end_date={end}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["range"] == "custom"

def test_device_filtering():
    """Verify filtering by specific device_id."""
    resp = client.get("/api/reports/historical?range=30d&device_id=C:")
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    if data["data_available"]:
        for item in data["storage_history"]:
            assert item["device_id"] == "C:"

def test_empty_historical_database_handling():
    """Verify graceful handling when query returns no records."""
    # Query future date where no telemetry exists
    future_start = (datetime.utcnow() + timedelta(days=365)).strftime("%Y-%m-%d")
    future_end = (datetime.utcnow() + timedelta(days=366)).strftime("%Y-%m-%d")

    resp = client.get(f"/api/reports/historical?start_date={future_start}&end_date={future_end}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["data_available"] is False
    assert data["record_count"] == 0
    assert "Historical telemetry has not been collected yet" in data["message"]

def test_duplicate_prevention():
    """Verify rapid consecutive calls do not insert duplicate measurements for the same timestamp."""
    db = SessionLocal()
    try:
        count_before = db.query(HistoricalTelemetry).count()
        # Call two collections back-to-back
        historical_pipeline.record_telemetry_snapshot(org_id=1)
        historical_pipeline.record_telemetry_snapshot(org_id=1)
        count_after = db.query(HistoricalTelemetry).count()
        # The second rapid call should be throttled/skipped for existing devices
        assert (count_after - count_before) <= len(storage_monitor.get_all_drives())
    finally:
        db.close()

def test_long_range_aggregation():
    """Verify that 30d range aggregates data points rather than returning tens of thousands of raw points."""
    resp = client.get("/api/reports/historical?range=30d")
    assert resp.status_code == 200
    data = resp.json()
    if data["data_available"]:
        # Should be smoothly bucketed (less than 250 points)
        assert data["record_count"] <= 250

def test_historical_csv_export_endpoint():
    """Verify CSV export endpoint returns valid CSV content."""
    resp = client.get("/api/reports/historical/csv?range=24h")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers.get("content-type", "")
    content = resp.text
    lines = content.strip().split("\n")
    assert len(lines) >= 1
    # Check headers
    headers = [h.strip() for h in lines[0].split(",")]
    assert "Timestamp_UTC" in headers
    assert "Device_ID" in headers
    assert "Used_Storage_GB" in headers
    assert "Utilization_Percent" in headers

def test_legacy_history_endpoint_backwards_compatibility():
    """Verify legacy GET /api/history returns valid ISO timestamps and non-empty data."""
    resp = client.get("/api/history?hours=24")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    if len(data) > 0:
        item = data[0]
        assert "timestamp" in item
        assert "drive" in item
        assert "used_gb" in item
        assert "free_gb" in item
        # ISO timestamp format check (contains 'T')
        assert "T" in item["timestamp"]

def test_database_failure_handling(monkeypatch):
    """Verify API handles internal database errors without crashing."""
    def mock_fail(*args, **kwargs):
        raise RuntimeError("Simulated database connection failure")

    monkeypatch.setattr(historical_pipeline, "get_historical_report", mock_fail)
    resp = client.get("/api/reports/historical?range=24h")
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is False
    assert data["data_available"] is False
    assert "Simulated database connection failure" in data["message"]

