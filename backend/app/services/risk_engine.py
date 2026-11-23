"""
Storage Risk Analysis Engine
"""
from datetime import datetime
from typing import Dict, Any, List
from app.services.storage_monitor import storage_monitor
from app.models.database import RiskAlert, ApplicationSetting
from app.database.session import SessionLocal
from app.utils.helpers import format_bytes

class RiskEngine:
    def __init__(self):
        pass

    def get_thresholds(self) -> Dict[str, float]:
        db = SessionLocal()
        try:
            settings = {s.key: s.value for s in db.query(ApplicationSetting).all()}
            return {
                "warning_usage_percent": float(settings.get("warning_usage_percent", 80.0)),
                "critical_usage_percent": float(settings.get("critical_usage_percent", 90.0)),
                "runway_warning_days": float(settings.get("runway_warning_days", 30.0)),
                "runway_critical_days": float(settings.get("runway_critical_days", 7.0)),
            }
        except Exception:
            return {
                "warning_usage_percent": 80.0,
                "critical_usage_percent": 90.0,
                "runway_warning_days": 30.0,
                "runway_critical_days": 7.0,
            }
        finally:
            db.close()

    def evaluate_risks(self) -> Dict[str, Any]:
        """Evaluate real-time storage risks across all drives and persist new alerts."""
        drives = storage_monitor.get_all_drives()
        thresholds = self.get_thresholds()
        alerts: List[Dict[str, Any]] = []

        highest_risk = "LOW"
        risk_rank = {"LOW": 1, "MODERATE": 2, "HIGH": 3, "CRITICAL": 4}

        db = SessionLocal()
        try:
            for d in drives:
                pct = d["usage_percent"]
                free_gb = d["free_bytes"] / (1024 ** 3)
                drive_name = d["device"]

                # 1. Critical Utilization Threshold (>= 90%)
                if pct >= thresholds["critical_usage_percent"]:
                    highest_risk = "CRITICAL"
                    alerts.append({
                        "drive_name": drive_name,
                        "risk_level": "CRITICAL",
                        "title": f"Critical Storage Exhaustion on {drive_name}",
                        "reason": f"Drive utilization has reached {pct:.1f}%, leaving only {free_gb:.1f} GB of free space.",
                        "recommended_action": "Execute immediate cleanup of temporary files and relocate large media files to secondary storage.",
                        "timestamp": datetime.utcnow()
                    })
                # 2. Warning Utilization Threshold (>= 80%)
                elif pct >= thresholds["warning_usage_percent"]:
                    if risk_rank["HIGH"] > risk_rank[highest_risk]:
                        highest_risk = "HIGH"
                    alerts.append({
                        "drive_name": drive_name,
                        "risk_level": "HIGH",
                        "title": f"Elevated Disk Capacity Warning on {drive_name}",
                        "reason": f"Disk utilization is at {pct:.1f}%, exceeding the 80% advisory safety margin.",
                        "recommended_action": "Review large folders, purge stale application caches, and prune duplicate files.",
                        "timestamp": datetime.utcnow()
                    })

                # 3. Absolute Free Space Risk (< 15 GB)
                if free_gb < 15.0 and pct < thresholds["critical_usage_percent"]:
                    if risk_rank["HIGH"] > risk_rank[highest_risk]:
                        highest_risk = "HIGH"
                    alerts.append({
                        "drive_name": drive_name,
                        "risk_level": "HIGH",
                        "title": f"Low Absolute Free Space on {drive_name}",
                        "reason": f"Only {free_gb:.2f} GB remains free. Windows OS requires minimum working overhead for virtual memory paging.",
                        "recommended_action": "Free up at least 20 GB to maintain smooth OS paging, system updates, and caching.",
                        "timestamp": datetime.utcnow()
                    })
                elif free_gb < 30.0 and pct < thresholds["warning_usage_percent"]:
                    if risk_rank["MODERATE"] > risk_rank[highest_risk]:
                        highest_risk = "MODERATE"
                    alerts.append({
                        "drive_name": drive_name,
                        "risk_level": "MODERATE",
                        "title": f"Moderate Space Advisory on {drive_name}",
                        "reason": f"Free space is {free_gb:.2f} GB. Consider scheduling routine maintenance before disk reaches warning threshold.",
                        "recommended_action": "Run storage analyzer scan to identify duplicate and uncompressed archives.",
                        "timestamp": datetime.utcnow()
                    })

                # 4. Sustained High I/O Throughput Risk
                total_io_mb_s = (d["read_bytes_sec"] + d["write_bytes_sec"]) / (1024 * 1024)
                if total_io_mb_s > 150.0:
                    if risk_rank["MODERATE"] > risk_rank[highest_risk]:
                        highest_risk = "MODERATE"
                    alerts.append({
                        "drive_name": drive_name,
                        "risk_level": "MODERATE",
                        "title": f"High Disk I/O Saturation on {drive_name}",
                        "reason": f"Active throughput is {total_io_mb_s:.1f} MB/s, which may induce storage access latency.",
                        "recommended_action": "Check system processes to identify disk-heavy applications.",
                        "timestamp": datetime.utcnow()
                    })

            # If no alerts triggered, add a healthy LOW alert info
            if not alerts:
                alerts.append({
                    "drive_name": drives[0]["device"] if drives else "System",
                    "risk_level": "LOW",
                    "title": "Storage Operating Within Normal Parameters",
                    "reason": "All drive volumes maintain adequate headroom (> 20% free space) and normal I/O telemetry.",
                    "recommended_action": "No immediate intervention required. Routine monitoring is active.",
                    "timestamp": datetime.utcnow()
                })

            # Sync active alerts with DB
            for a in alerts:
                existing = db.query(RiskAlert).filter(
                    RiskAlert.drive_name == a["drive_name"],
                    RiskAlert.title == a["title"],
                    RiskAlert.is_resolved == False
                ).first()
                if not existing:
                    db.add(RiskAlert(
                        drive_name=a["drive_name"],
                        risk_level=a["risk_level"],
                        title=a["title"],
                        reason=a["reason"],
                        recommended_action=a["recommended_action"],
                        is_resolved=False
                    ))
            db.commit()

        except Exception as e:
            db.rollback()
            print(f"[RiskEngine] Evaluation error: {e}")
        finally:
            db.close()

        counts = {"CRITICAL": 0, "HIGH": 0, "MODERATE": 0, "LOW": 0}
        for a in alerts:
            lvl = a.get("risk_level", "LOW")
            counts[lvl] = counts.get(lvl, 0) + 1

        return {
            "overall_system_risk": highest_risk,
            "active_alerts_count": len(alerts),
            "critical_count": counts["CRITICAL"],
            "high_count": counts["HIGH"],
            "moderate_count": counts["MODERATE"],
            "low_count": counts["LOW"],
            "alerts": alerts
        }

risk_engine = RiskEngine()
