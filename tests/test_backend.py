"""
Comprehensive Test Suite for AEGISSTOR
"""
import os
import sys
import tempfile
import pytest
from pathlib import Path

# Add backend directory to sys.path
backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.database.session import init_db, SessionLocal
from app.services.storage_monitor import storage_monitor
from app.services.performance_monitor import performance_monitor
from app.services.storage_scanner import storage_scanner
from app.services.forecasting_service import forecasting_service
from app.services.risk_engine import risk_engine
from app.services.optimization_engine import optimization_engine
from app.services.digital_twin import digital_twin_service
from app.utils.helpers import format_bytes, get_file_hash, classify_extension

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    init_db()

def test_drive_detection():
    """Verify that actual physical drives are identified and return genuine capacities."""
    drives = storage_monitor.get_all_drives()
    assert len(drives) > 0, "At least one storage drive must be detected on the host."
    primary = drives[0]
    assert primary["total_bytes"] > 0, "Drive total capacity must be greater than 0."
    assert primary["used_bytes"] > 0, "Drive used capacity must be greater than 0."
    assert 0.0 <= primary["usage_percent"] <= 100.0, "Drive usage percent must be between 0 and 100."
    assert primary["mountpoint"], "Drive mount point must be defined."
    assert primary["fstype"], "Filesystem type must be identified."

def test_storage_summary():
    """Verify storage summary aggregation."""
    summary = storage_monitor.get_storage_summary()
    assert summary["total_drives"] >= 1
    assert summary["total_storage_bytes"] >= summary["total_used_bytes"]
    assert 0.0 <= summary["overall_usage_percent"] <= 100.0

def test_disk_io_metrics():
    """Verify disk I/O rates calculation."""
    io_rates = storage_monitor.get_live_io_rates()
    assert "read_bytes_sec" in io_rates
    assert "write_bytes_sec" in io_rates
    assert "read_throughput_mb_s" in io_rates
    assert io_rates["read_bytes_sec"] >= 0.0
    assert io_rates["write_bytes_sec"] >= 0.0

def test_performance_monitoring():
    """Verify CPU, RAM, and top processes monitoring."""
    perf = performance_monitor.get_current_metrics()
    assert 0.0 <= perf["cpu_percent"] <= 100.0
    assert perf["memory_total_bytes"] > 0
    assert 0.0 <= perf["memory_percent"] <= 100.0
    assert len(perf["top_processes"]) > 0
    first_proc = perf["top_processes"][0]
    assert "name" in first_proc
    assert "pid" in first_proc
    assert first_proc["memory_mb"] >= 0

def test_folder_scanning_and_duplicates():
    """Verify folder scanner and duplicate detection using a temporary test directory."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        # Create test files
        sub_dir = os.path.join(tmp_dir, "media")
        os.makedirs(sub_dir, exist_ok=True)

        content_a = b"AEGISSTOR_UNIQUE_CONTENT_DATA_12345" * 2000
        content_b = b"AEGISSTOR_OTHER_DATA_67890" * 3000

        file1 = os.path.join(tmp_dir, "original.mp4")
        file2 = os.path.join(sub_dir, "duplicate_copy.mp4")
        file3 = os.path.join(tmp_dir, "unique.txt")

        with open(file1, "wb") as f:
            f.write(content_a)
        with open(file2, "wb") as f:
            f.write(content_a) # Exact duplicate
        with open(file3, "wb") as f:
            f.write(content_b)

        result = storage_scanner.scan_directory(tmp_dir, max_files=100, max_depth=3)
        assert result["status"] == "COMPLETED"
        assert result["total_files"] == 3
        assert len(result["largest_files"]) > 0

        # Verify duplicate detection
        assert len(result["duplicates"]) == 1
        dup_group = result["duplicates"][0]
        assert dup_group["count"] == 2
        assert dup_group["wasted_bytes"] == len(content_a)

        # Verify category classification
        categories = {c["category"]: c for c in result["categories"]}
        assert "Video" in categories
        assert "Documents" in categories

def test_risk_classification():
    """Verify risk analysis engine output structure and thresholds."""
    risk = risk_engine.evaluate_risks()
    assert risk["overall_system_risk"] in ["LOW", "MODERATE", "HIGH", "CRITICAL"]
    assert risk["active_alerts_count"] >= 1
    assert len(risk["alerts"]) > 0
    first_alert = risk["alerts"][0]
    assert "drive_name" in first_alert
    assert "risk_level" in first_alert
    assert "reason" in first_alert
    assert "recommended_action" in first_alert

def test_digital_twin_simulation():
    """Verify Digital Twin simulation calculations for expansion and growth scenarios."""
    drives = storage_monitor.get_all_drives()
    drive_name = drives[0]["device"]

    sim = digital_twin_service.run_simulation(
        drive_name=drive_name,
        monthly_growth_rate_percent=5.0,
        removed_unnecessary_files_gb=10.0,
        capacity_expansion_gb=50.0,
        continuation_days=60,
        scenario_title="Test Twin Scenario"
    )

    assert sim["scenario_name"] == "Test Twin Scenario"
    assert sim["drive_name"] == drive_name
    assert sim["projected_total_bytes"] > sim["current_total_bytes"]
    assert len(sim["timeline_projection"]) > 0
    assert "risk_change_summary" in sim
    assert sim["projected_risk"] in ["LOW", "MODERATE", "HIGH", "CRITICAL"]

def test_forecasting_pipeline():
    """Verify baseline or ML storage forecasting pipeline."""
    drives = storage_monitor.get_all_drives()
    drive_name = drives[0]["device"]

    res = forecasting_service.train_and_forecast(drive_name)
    assert res["drive_name"] == drive_name
    assert res["total_capacity_bytes"] > 0
    assert len(res["forecast_points"]) == 4 # 24h, 7d, 30d, 90d
    assert "runway" in res
    assert "status_message" in res
    assert res["model_type"] in ["BASELINE_TREND", "LIGHTGBM_REGRESSOR"]

def test_optimization_engine_safety():
    """Verify safety guarantees of the optimization engine."""
    recs = optimization_engine.generate_recommendations()
    assert isinstance(recs, list)
    for r in recs:
        assert r["risk_level"] in ["LOW", "MODERATE", "HIGH"]
        assert "recommended_action" in r
        assert "expected_benefit" in r

    # Non-confirmed deletion should be rejected
    rejected = optimization_engine.execute_safe_cleanup(
        recommendation_id=1, confirmed=False
    )
    assert rejected["success"] is False
    assert "confirmation is mandatory" in rejected["message"].lower()

def test_helpers():
    """Verify helper formatting and classification."""
    assert format_bytes(0) == "0 B"
    assert "GB" in format_bytes(10 * (1024 ** 3))
    assert classify_extension(".mp4") == "Video"
    assert classify_extension(".zip") == "Archives"
    assert classify_extension(".py") == "Code"
    assert classify_extension(".tmp") == "Temporary"
