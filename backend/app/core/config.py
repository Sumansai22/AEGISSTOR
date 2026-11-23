"""
AEGISSTOR Core Configuration
"""
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
SQLITE_DB_PATH = DATA_DIR / "aegisstor.db"

MODELS_DIR = BASE_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite:///{DATA_DIR / 'aegisstor.db'}"

# Monitoring defaults
DEFAULT_TELEMETRY_INTERVAL_SEC = 5
FORECAST_MIN_SAMPLES = 10
LIGHTGBM_MIN_SAMPLES = 30

# Risk Thresholds
DEFAULT_WARNING_USAGE_PERCENT = 80.0
DEFAULT_CRITICAL_USAGE_PERCENT = 90.0
DEFAULT_RUNWAY_CRITICAL_DAYS = 7.0
DEFAULT_RUNWAY_WARNING_DAYS = 30.0
