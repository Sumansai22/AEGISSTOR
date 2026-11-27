"""
AEGISSTOR Core Configuration
Supports local SQLite development and Cloud / Production PostgreSQL (Render).
"""
import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
persistent_dir_env = os.getenv("PERSISTENT_DATA_DIR")
DATA_DIR = Path(persistent_dir_env) if persistent_dir_env else (BASE_DIR / "data")
DATA_DIR.mkdir(parents=True, exist_ok=True)
SQLITE_DB_PATH = DATA_DIR / "aegisstor.db"

MODELS_DIR = BASE_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# Database URL resolution:
# Render and cloud providers supply DATABASE_URL as postgres://...
# SQLAlchemy 2.0+ requires postgresql://...
raw_db_url = os.getenv("DATABASE_URL")
if raw_db_url:
    if raw_db_url.startswith("postgres://"):
        DATABASE_URL = raw_db_url.replace("postgres://", "postgresql://", 1)
    else:
        DATABASE_URL = raw_db_url
else:
    DATABASE_URL = f"sqlite:///{SQLITE_DB_PATH.as_posix()}"

IS_SQLITE = DATABASE_URL.startswith("sqlite")

# Server host & port defaults (supports Render $PORT and standard 0.0.0.0 binding)
HOST = os.getenv("HOST", "0.0.0.0" if (os.getenv("RENDER") or os.getenv("PORT")) else "127.0.0.1")
PORT = int(os.getenv("PORT", 8000))

# Monitoring defaults
DEFAULT_TELEMETRY_INTERVAL_SEC = 5
TELEMETRY_INTERVAL_SEC = float(os.getenv("TELEMETRY_INTERVAL_SEC", str(DEFAULT_TELEMETRY_INTERVAL_SEC)))
FORECAST_MIN_SAMPLES = 10
LIGHTGBM_MIN_SAMPLES = 30

# Risk Thresholds
DEFAULT_WARNING_USAGE_PERCENT = 80.0
DEFAULT_CRITICAL_USAGE_PERCENT = 90.0
DEFAULT_RUNWAY_CRITICAL_DAYS = 7.0
DEFAULT_RUNWAY_WARNING_DAYS = 30.0
