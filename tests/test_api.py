"""
API Route Tests for AEGISSTOR
"""
import sys
from pathlib import Path
from fastapi.testclient import TestClient

backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.main import app

client = TestClient(app)

def test_api_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["app"] == "AEGISSTOR"

def test_api_system_info():
    res = client.get("/api/system/info")
    assert res.status_code == 200
    data = res.json()
    assert "os_name" in data
    assert "hostname" in data
    assert "cpu_logical_cores" in data

def test_api_storage_drives():
    res = client.get("/api/storage/drives")
    assert res.status_code == 200
    drives = res.json()
    assert isinstance(drives, list)
    assert len(drives) > 0
    assert "total_bytes" in drives[0]

def test_api_storage_summary():
    res = client.get("/api/storage/summary")
    assert res.status_code == 200
    data = res.json()
    assert data["total_drives"] >= 1
    assert data["total_storage_bytes"] > 0

def test_api_performance_current():
    res = client.get("/api/performance/current")
    assert res.status_code == 200
    data = res.json()
    assert "cpu_percent" in data
    assert "memory_percent" in data
    assert isinstance(data["top_processes"], list)

def test_api_risks():
    res = client.get("/api/risks")
    assert res.status_code == 200
    data = res.json()
    assert "overall_system_risk" in data
    assert "alerts" in data

def test_api_recommendations():
    res = client.get("/api/recommendations")
    assert res.status_code == 200
    recs = res.json()
    assert isinstance(recs, list)

def test_api_forecast():
    res = client.get("/api/forecast")
    assert res.status_code == 200
    data = res.json()
    assert "forecast_points" in data
    assert "runway" in data
    assert len(data["forecast_points"]) >= 4

def test_api_settings():
    res = client.get("/api/settings")
    assert res.status_code == 200
    settings = res.json()
    assert "warning_usage_percent" in settings
