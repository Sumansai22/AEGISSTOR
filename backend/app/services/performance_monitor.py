"""
Real-time System Performance Monitoring Service
Optimized for instant, non-blocking telemetry on Windows systems.
"""
import time
import psutil
from datetime import datetime
from typing import Dict, Any, List
from app.models.database import PerformanceTelemetry
from app.database.session import SessionLocal, execute_with_db_retry

class PerformanceMonitor:
    def __init__(self):
        self._last_net_time = time.time()
        self._last_net_io = psutil.net_io_counters()
        self._last_disk_time = time.time()
        self._last_disk_io = psutil.disk_io_counters()

    def get_network_rates(self) -> Dict[str, float]:
        now = time.time()
        dt = max(now - self._last_net_time, 0.001)
        current = psutil.net_io_counters()
        sent_mb_s = 0.0
        recv_mb_s = 0.0

        if current and self._last_net_io:
            sent_mb_s = max(0.0, (current.bytes_sent - self._last_net_io.bytes_sent) / dt / (1024 * 1024))
            recv_mb_s = max(0.0, (current.bytes_recv - self._last_net_io.bytes_recv) / dt / (1024 * 1024))

        self._last_net_io = current
        self._last_net_time = now
        return {
            "network_sent_mb_s": round(sent_mb_s, 3),
            "network_recv_mb_s": round(recv_mb_s, 3)
        }

    def get_disk_rates(self) -> Dict[str, float]:
        now = time.time()
        dt = max(now - self._last_disk_time, 0.001)
        current = psutil.disk_io_counters()
        read_mb_s = 0.0
        write_mb_s = 0.0

        if current and self._last_disk_io:
            read_mb_s = max(0.0, (current.read_bytes - self._last_disk_io.read_bytes) / dt / (1024 * 1024))
            write_mb_s = max(0.0, (current.write_bytes - self._last_disk_io.write_bytes) / dt / (1024 * 1024))

        self._last_disk_io = current
        self._last_disk_time = now
        return {
            "io_read_mb_s": round(read_mb_s, 2),
            "io_write_mb_s": round(write_mb_s, 2)
        }

    def get_top_processes(self, limit: int = 8) -> List[Dict[str, Any]]:
        """Retrieve top running processes quickly without hanging process iteration."""
        procs = []
        try:
            # Query only top PIDs directly or fast slice
            pids = psutil.pids()[:limit * 3]
            for pid in pids:
                try:
                    p = psutil.Process(pid)
                    with p.oneshot():
                        mem_info = p.memory_info()
                        mem_mb = round(mem_info.rss / (1024 * 1024), 1)
                        procs.append({
                            "pid": pid,
                            "name": p.name(),
                            "cpu_percent": round(p.cpu_percent(), 1),
                            "memory_percent": round(p.memory_percent(), 1),
                            "memory_mb": mem_mb,
                            "username": "Active",
                            "status": p.status()
                        })
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    continue
                if len(procs) >= limit:
                    break
        except Exception:
            pass

        procs.sort(key=lambda x: x["memory_mb"], reverse=True)
        return procs[:limit]

    def get_current_metrics(self) -> Dict[str, Any]:
        """Collect current system performance snapshot instantly."""
        mem = psutil.virtual_memory()
        cpu_pct = psutil.cpu_percent(interval=None)
        net = self.get_network_rates()
        disk = self.get_disk_rates()
        procs = self.get_top_processes(limit=8)

        return {
            "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
            "cpu_percent": round(cpu_pct, 1),
            "cpu_count_logical": psutil.cpu_count(logical=True) or 12,
            "cpu_count_physical": psutil.cpu_count(logical=False) or 8,
            "memory_total_bytes": float(mem.total),
            "memory_used_bytes": float(mem.used),
            "memory_free_bytes": float(mem.available),
            "memory_total_gb": round(mem.total / (1024 ** 3), 2),
            "memory_used_gb": round(mem.used / (1024 ** 3), 2),
            "memory_free_gb": round(mem.available / (1024 ** 3), 2),
            "memory_percent": round(mem.percent, 1),
            "io_read_mb_s": disk["io_read_mb_s"],
            "io_write_mb_s": disk["io_write_mb_s"],
            "network_sent_mb_s": net["network_sent_mb_s"],
            "network_recv_mb_s": net["network_recv_mb_s"],
            "top_processes": procs
        }

    def record_telemetry_snapshot(self):
        """Save performance snapshot to SQLite database with retry on lock."""
        try:
            metrics = self.get_current_metrics()
            now = datetime.utcnow()
            pids_count = len(psutil.pids())

            def _do_write():
                db = SessionLocal()
                try:
                    entry = PerformanceTelemetry(
                        timestamp=now,
                        cpu_percent=metrics["cpu_percent"],
                        memory_total=metrics["memory_total_bytes"],
                        memory_used=metrics["memory_used_bytes"],
                        memory_free=metrics["memory_free_bytes"],
                        memory_percent=metrics["memory_percent"],
                        io_read_bytes_sec=metrics["io_read_mb_s"] * 1024 * 1024,
                        io_write_bytes_sec=metrics["io_write_mb_s"] * 1024 * 1024,
                        running_processes_count=pids_count
                    )
                    db.add(entry)
                    db.commit()
                except Exception:
                    db.rollback()
                    raise
                finally:
                    db.close()

            execute_with_db_retry(_do_write)
        except Exception as e:
            print(f"[PerformanceMonitor] Error saving telemetry: {e}")

performance_monitor = PerformanceMonitor()
