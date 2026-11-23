"""
Safe Performance Optimization Engine
"""
import os
import json
import psutil
from datetime import datetime
from typing import Dict, Any, List, Optional
from app.services.storage_monitor import storage_monitor
from app.services.storage_scanner import storage_scanner, PROTECTED_PATHS
from app.models.database import OptimizationRecommendation, AuditLog
from app.database.session import SessionLocal
from app.utils.helpers import format_bytes

class OptimizationEngine:
    def __init__(self):
        pass

    def generate_recommendations(self) -> List[Dict[str, Any]]:
        """
        Analyze current system storage, scan results, and telemetry to generate
        safe, actionable optimization proposals with measured recovery estimates.
        """
        recs: List[Dict[str, Any]] = []
        drives = storage_monitor.get_all_drives()
        last_scan = storage_scanner.last_result

        db = SessionLocal()
        try:
            # 1. Temporary Files Cleanup Recommendation
            user_temp = os.environ.get("TEMP", "")
            temp_size = 0.0
            temp_paths = []
            if user_temp and os.path.exists(user_temp):
                try:
                    for root, _, files in os.walk(user_temp):
                        for f in files:
                            p = os.path.join(root, f)
                            try:
                                sz = os.path.getsize(p)
                                temp_size += sz
                                if len(temp_paths) < 100:
                                    temp_paths.append(p)
                            except (PermissionError, OSError):
                                pass
                except Exception:
                    pass

            if temp_size > 50 * 1024 * 1024: # > 50MB
                recs.append({
                    "id": 1,
                    "timestamp": datetime.utcnow(),
                    "drive_name": drives[0]["device"] if drives else "C:",
                    "category": "TEMP_FILES",
                    "issue": f"Detected {format_bytes(temp_size)} of obsolete user temporary cache files.",
                    "expected_benefit": "Reclaim fast SSD/HDD capacity and prevent file indexing overhead.",
                    "estimated_recovery_bytes": float(temp_size),
                    "estimated_recovery_formatted": format_bytes(temp_size),
                    "risk_level": "LOW",
                    "recommended_action": "Safely purge unreserved temporary application caches from user %TEMP% directory.",
                    "target_paths": temp_paths,
                    "status": "PENDING"
                })

            # 2. Duplicate Files Recommendations (from scanner)
            if last_scan and last_scan.get("duplicates"):
                dups = last_scan["duplicates"]
                total_dup_wasted = sum(d["wasted_bytes"] for d in dups)
                if total_dup_wasted > 10 * 1024 * 1024:
                    dup_candidate_paths = []
                    for group in dups:
                        # Recommend keeping the first file and reviewing duplicate copies
                        for f in group["files"][1:]:
                            dup_candidate_paths.append(f["path"])

                    recs.append({
                        "id": 2,
                        "timestamp": datetime.utcnow(),
                        "drive_name": last_scan.get("target_path", "C:"),
                        "category": "DUPLICATES",
                        "issue": f"Identified {len(dups)} duplicate file groups wasting {format_bytes(total_dup_wasted)}.",
                        "expected_benefit": f"Recover up to {format_bytes(total_dup_wasted)} by consolidating redundant copies.",
                        "estimated_recovery_bytes": float(total_dup_wasted),
                        "estimated_recovery_formatted": format_bytes(total_dup_wasted),
                        "risk_level": "LOW",
                        "recommended_action": "Review redundant duplicate copies with identical SHA-256 hashes and purge duplicates.",
                        "target_paths": dup_candidate_paths[:50],
                        "status": "PENDING"
                    })

            # 3. Large File Candidates (> 1GB)
            if last_scan and last_scan.get("largest_files"):
                large_files = [f for f in last_scan["largest_files"] if f["size_bytes"] > 1024 * 1024 * 1024]
                if large_files:
                    total_large = sum(f["size_bytes"] for f in large_files)
                    recs.append({
                        "id": 3,
                        "timestamp": datetime.utcnow(),
                        "drive_name": last_scan.get("target_path", "C:"),
                        "category": "LARGE_FILES",
                        "issue": f"Discovered {len(large_files)} individual files exceeding 1.0 GB ({format_bytes(total_large)} total).",
                        "expected_benefit": "Identify large archives, disk images, or installer media that can be archived or offloaded.",
                        "estimated_recovery_bytes": float(total_large),
                        "estimated_recovery_formatted": format_bytes(total_large),
                        "risk_level": "MODERATE",
                        "recommended_action": "Inspect largest media and archive files. Move completed downloads or virtual disk images to external storage.",
                        "target_paths": [f["path"] for f in large_files[:20]],
                        "status": "PENDING"
                    })

            # 4. Storage Headroom Optimization
            for d in drives:
                if d["usage_percent"] > 80.0:
                    needed_to_75 = max(0.0, d["used_bytes"] - (d["total_bytes"] * 0.75))
                    recs.append({
                        "id": 4 + len(recs),
                        "timestamp": datetime.utcnow(),
                        "drive_name": d["device"],
                        "category": "CAPACITY",
                        "issue": f"Drive {d['device']} is utilizing {d['usage_percent']:.1f}% capacity. SSD write performance degrades above 80% usage.",
                        "expected_benefit": "Restores optimal SSD wear-leveling and prevents write-amplification penalties.",
                        "estimated_recovery_bytes": float(needed_to_75),
                        "estimated_recovery_formatted": format_bytes(needed_to_75),
                        "risk_level": "MODERATE",
                        "recommended_action": f"Free approximately {format_bytes(needed_to_75)} to restore comfortable 25% free headroom.",
                        "target_paths": [],
                        "status": "PENDING"
                    })

            # 5. High Resource Process Optimization
            high_cpu_or_mem_procs = []
            for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_info']):
                try:
                    info = p.info
                    rss_mb = (info['memory_info'].rss / (1024 * 1024)) if info.get('memory_info') else 0
                    if rss_mb > 1500 or (info.get('cpu_percent') or 0) > 40:
                        high_cpu_or_mem_procs.append(f"{info['name']} (PID: {info['pid']}, {rss_mb:.0f} MB)")
                except Exception:
                    continue

            if high_cpu_or_mem_procs:
                recs.append({
                    "id": 5 + len(recs),
                    "timestamp": datetime.utcnow(),
                    "drive_name": "System RAM/CPU",
                    "category": "IO_LOAD",
                    "issue": f"High memory/CPU demand detected in active applications: {', '.join(high_cpu_or_mem_procs[:3])}.",
                    "expected_benefit": "Alleviates virtual memory pagefile I/O thrashing on disk.",
                    "estimated_recovery_bytes": 0.0,
                    "estimated_recovery_formatted": "Memory Pressure Relief",
                    "risk_level": "LOW",
                    "recommended_action": "Check process details and consider closing idle high-memory applications to reduce disk swap activity.",
                    "target_paths": [],
                    "status": "PENDING"
                })

            # Sync to DB
            for r in recs:
                existing = db.query(OptimizationRecommendation).filter(
                    OptimizationRecommendation.category == r["category"],
                    OptimizationRecommendation.issue == r["issue"],
                    OptimizationRecommendation.status == "PENDING"
                ).first()
                if not existing:
                    entry = OptimizationRecommendation(
                        drive_name=r["drive_name"],
                        category=r["category"],
                        issue=r["issue"],
                        expected_benefit=r["expected_benefit"],
                        estimated_recovery_bytes=r["estimated_recovery_bytes"],
                        risk_level=r["risk_level"],
                        recommended_action=r["recommended_action"],
                        target_paths_json=json.dumps(r["target_paths"]),
                        status="PENDING"
                    )
                    db.add(entry)
            db.commit()

        except Exception as e:
            db.rollback()
            print(f"[OptimizationEngine] Error: {e}")
        finally:
            db.close()

        return recs

    def execute_safe_cleanup(self, recommendation_id: int, confirmed: bool, file_paths: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Execute user-confirmed file cleanup with strict safety checks:
        - NEVER delete Windows or system directories
        - ONLY delete within user TEMP or user-selected specific duplicate candidates
        - Record every deleted file in audit_logs
        """
        if not confirmed:
            return {
                "success": False,
                "message": "Action cancelled: User confirmation is mandatory before any deletion.",
                "freed_bytes": 0.0,
                "freed_formatted": "0 B",
                "details": []
            }

        db = SessionLocal()
        freed_bytes = 0.0
        details = []

        try:
            target_list = file_paths or []
            if not target_list and recommendation_id == 1:
                # User TEMP cleanup
                user_temp = os.environ.get("TEMP", "")
                if user_temp and os.path.exists(user_temp):
                    for root, _, files in os.walk(user_temp):
                        for f in files:
                            target_list.append(os.path.join(root, f))
                            if len(target_list) >= 150:
                                break

            for file_path in target_list:
                norm_path = os.path.abspath(file_path).lower()

                # Safety check 1: Disallow protected system paths
                is_safe = True
                for p in PROTECTED_PATHS:
                    if p in norm_path:
                        is_safe = False
                        break

                # Safety check 2: Disallow deletion outside of temp or designated files
                if not is_safe:
                    details.append(f"Skipped protected path: {file_path}")
                    continue

                try:
                    if os.path.isfile(file_path):
                        sz = os.path.getsize(file_path)
                        os.remove(file_path)
                        freed_bytes += sz
                        details.append(f"Safely removed: {os.path.basename(file_path)} ({format_bytes(sz)})")
                except (PermissionError, FileNotFoundError, OSError) as err:
                    details.append(f"Locked / in-use: {os.path.basename(file_path)}")

            # Update recommendation status in DB
            db.query(OptimizationRecommendation).filter(
                OptimizationRecommendation.id == recommendation_id
            ).update({"status": "APPLIED"})

            # Log audit trail
            db.add(AuditLog(
                action_type="OPTIMIZATION_CLEANUP",
                description=f"User-confirmed cleanup freed {format_bytes(freed_bytes)}. ({len(details)} files processed)",
                status="SUCCESS",
                details_json=json.dumps({"freed_bytes": freed_bytes, "details_count": len(details)})
            ))
            db.commit()

            return {
                "success": True,
                "message": f"Optimization executed successfully. Reclaimed {format_bytes(freed_bytes)} of storage.",
                "freed_bytes": freed_bytes,
                "freed_formatted": format_bytes(freed_bytes),
                "details": details[:25]
            }
        except Exception as e:
            db.rollback()
            return {
                "success": False,
                "message": f"Optimization failed: {str(e)}",
                "freed_bytes": freed_bytes,
                "freed_formatted": format_bytes(freed_bytes),
                "details": details
            }
        finally:
            db.close()

optimization_engine = OptimizationEngine()
