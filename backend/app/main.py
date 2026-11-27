"""
AEGISSTOR Enterprise Backend Main Application
"""
import time
import threading
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import TELEMETRY_INTERVAL_SEC
from app.database.session import init_db, engine
from app.api.routes import router as legacy_api_router
from app.api.v1.endpoints import api_v1
from app.services.storage_monitor import storage_monitor
from app.services.performance_monitor import performance_monitor
from app.services.historical_pipeline import historical_pipeline
from app.collectors.database_collector import database_collector
from app.notifications.engine import notification_engine

# Process start time for uptime reporting
app_start_time = time.time()

# Background telemetry worker lifecycle control
stop_event = threading.Event()
telemetry_lock = threading.Lock()
worker_thread = None

def telemetry_worker():
    """Periodic background telemetry recorder (runs every 5 seconds by default)."""
    db_sync_counter = 0
    notif_counter = 0
    hist_counter = 0
    while not stop_event.is_set():
        try:
            with telemetry_lock:
                # 1. Local storage & performance telemetry
                storage_monitor.record_telemetry_snapshot()
                performance_monitor.record_telemetry_snapshot()

                # 2. Historical unified telemetry persistence (configurable interval, default 5s)
                historical_pipeline.record_telemetry_snapshot()

                # 3. Time-series storage persistence (~30 seconds / 6 cycles)
                hist_counter += 1
                if hist_counter >= 6:
                    historical_pipeline.record_local_storage_sample()
                    hist_counter = 0

                # 4. Enterprise database sync every ~60 seconds (12 cycles)
                db_sync_counter += 1
                if db_sync_counter >= 12:
                    database_collector.collect_all_active_databases()
                    db_sync_counter = 0

                # 5. Notification surveillance & alert rules evaluation (~15s)
                notif_counter += 1
                if notif_counter >= 3:
                    notification_engine.process_live_telemetry_snapshot()
                    notif_counter = 0

        except Exception as e:
            print(f"[TelemetryWorker] Sampling error: {e}")
            
        # Non-blocking sleep responsive to stop_event
        stop_event.wait(TELEMETRY_INTERVAL_SEC)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global app_start_time, worker_thread
    app_start_time = time.time()
    print("[AEGISSTOR] Initializing database and enterprise security subsystem...")
    init_db()

    # Start telemetry collector daemon thread, guarding against duplicate threads on reload
    if worker_thread is None or not worker_thread.is_alive():
        stop_event.clear()
        worker_thread = threading.Thread(target=telemetry_worker, daemon=True, name="AEGISSTOR-TelemetryWorker")
        worker_thread.start()
        print(f"[AEGISSTOR] Live telemetry engine active ({TELEMETRY_INTERVAL_SEC}s interval).")
    yield
    print("[AEGISSTOR] Shutting down telemetry engine...")
    stop_event.set()
    if worker_thread and worker_thread.is_alive():
        worker_thread.join(timeout=3.0)
    print("[AEGISSTOR] Telemetry engine shut down cleanly.")

app = FastAPI(
    title="AEGISSTOR Enterprise Platform",
    description="Predictive Storage Intelligence & Enterprise Database Security Engine",
    version="2.0.0",
    lifespan=lifespan
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# HTTP Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# Root health endpoint
@app.get("/health")
def root_health():
    uptime = round(time.time() - app_start_time, 2)
    db_status = "connected"
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "status": "healthy",
        "app": "AEGISSTOR",
        "version": "2.0.0",
        "uptime_seconds": uptime,
        "started_at": datetime.fromtimestamp(app_start_time, tz=timezone.utc).isoformat(),
        "database": db_status
    }

# Mount both v1 and legacy routes
app.include_router(api_v1, prefix="/api/v1")
app.include_router(legacy_api_router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    from app.core.config import HOST, PORT
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)
