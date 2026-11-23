"""
Storage Scanner Service for Advanced Disk Analysis
"""
import os
import time
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from collections import defaultdict
from app.utils.helpers import format_bytes, get_file_hash, classify_extension
from app.models.database import ScanResult, AuditLog
from app.database.session import SessionLocal

# Default safety exclusions
PROTECTED_PATHS = {
    "c:\\windows", "c:\\system volume information", "c:\\$recycle.bin",
    "c:\\recovery", "c:\\winsxs", "pagefile.sys", "hiberfil.sys", "swapfile.sys"
}

class StorageScanner:
    def __init__(self):
        self.is_scanning: bool = False
        self.current_scan_path: str = ""
        self.progress: Dict[str, Any] = {
            "files_scanned": 0,
            "dirs_scanned": 0,
            "bytes_scanned": 0,
            "status": "IDLE"
        }
        self.last_result: Optional[Dict[str, Any]] = None

    def _is_protected(self, path: str) -> bool:
        low = path.lower()
        for p in PROTECTED_PATHS:
            if p in low:
                return True
        return False

    def scan_directory(self, target_path: str, max_files: int = 40000, max_depth: int = 5) -> Dict[str, Any]:
        """
        Scan a directory or drive root, gathering files, folders, duplicate candidates,
        categories, and temporary file candidates.
        """
        self.is_scanning = True
        self.current_scan_path = target_path
        self.progress = {
            "files_scanned": 0,
            "dirs_scanned": 0,
            "bytes_scanned": 0,
            "status": "RUNNING"
        }

        start_time = time.time()
        all_files: List[Dict[str, Any]] = []
        folder_sizes: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"size": 0, "file_count": 0, "subfolders": 0})
        category_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"bytes": 0, "count": 0, "exts": set()})
        potential_duplicates: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
        temp_files_list: List[Dict[str, Any]] = []

        now = datetime.now()
        target_norm = os.path.abspath(target_path)
        base_depth = target_norm.rstrip(os.sep).count(os.sep)

        try:
            for root, dirs, files in os.walk(target_norm, topdown=True):
                if not self.is_scanning:
                    break

                # Filter protected directories
                dirs[:] = [d for d in dirs if not self._is_protected(os.path.join(root, d))]
                curr_depth = root.rstrip(os.sep).count(os.sep) - base_depth
                if curr_depth > max_depth:
                    dirs.clear()
                    continue

                self.progress["dirs_scanned"] += 1
                parent_folder = root

                for filename in files:
                    if not self.is_scanning or self.progress["files_scanned"] >= max_files:
                        break

                    file_path = os.path.join(root, filename)
                    if self._is_protected(file_path):
                        continue

                    try:
                        stat = os.stat(file_path)
                        size = stat.st_size
                        mtime = datetime.fromtimestamp(stat.st_mtime)
                    except (PermissionError, FileNotFoundError, OSError):
                        continue

                    self.progress["files_scanned"] += 1
                    self.progress["bytes_scanned"] += size

                    _, ext = os.path.splitext(filename)
                    ext = ext.lower()
                    cat = classify_extension(ext)

                    # Update folder size
                    folder_sizes[parent_folder]["size"] += size
                    folder_sizes[parent_folder]["file_count"] += 1

                    # Update categories
                    category_stats[cat]["bytes"] += size
                    category_stats[cat]["count"] += 1
                    if ext:
                        category_stats[cat]["exts"].add(ext)

                    # Record file item
                    file_info = {
                        "path": file_path,
                        "name": filename,
                        "size_bytes": float(size),
                        "size_formatted": format_bytes(size),
                        "category": cat,
                        "extension": ext,
                        "modified_time": mtime.strftime("%Y-%m-%d %H:%M:%S"),
                        "is_safe_to_delete": False
                    }

                    all_files.append(file_info)

                    # Check for temp candidates
                    is_temp = (
                        cat == "Temporary" or
                        "\\temp\\" in file_path.lower() or
                        "\\tmp\\" in file_path.lower() or
                        ext in [".tmp", ".bak", ".dmp", ".old", ".chk", ".log"]
                    )
                    if is_temp:
                        temp_file_item = dict(file_info)
                        temp_file_item["is_safe_to_delete"] = True
                        temp_files_list.append(temp_file_item)

                    # Candidate for duplicate checking (> 50KB to avoid zero-byte empty duplicates flooding)
                    if size > 50 * 1024:
                        potential_duplicates[size].append(file_info)

        except Exception as e:
            print(f"[StorageScanner] Walk exception: {e}")
        finally:
            self.is_scanning = False

        duration = round(time.time() - start_time, 2)
        total_scanned_bytes = self.progress["bytes_scanned"]

        # Largest Files
        all_files.sort(key=lambda x: x["size_bytes"], reverse=True)
        largest_files = all_files[:50]

        # Largest Folders
        largest_folders = []
        for fpath, data in folder_sizes.items():
            largest_folders.append({
                "path": fpath,
                "name": os.path.basename(fpath) or fpath,
                "size_bytes": float(data["size"]),
                "size_formatted": format_bytes(data["size"]),
                "file_count": data["file_count"],
                "subfolder_count": 0
            })
        largest_folders.sort(key=lambda x: x["size_bytes"], reverse=True)
        largest_folders = largest_folders[:50]

        # Duplicate Files Detection (Compute hash only for files with identical size)
        duplicate_groups = []
        for sz, candidates in potential_duplicates.items():
            if len(candidates) > 1:
                hash_map = defaultdict(list)
                for item in candidates[:20]: # cap comparison per size group
                    h = get_file_hash(item["path"])
                    if h:
                        hash_map[h].append(item)

                for h, matched in hash_map.items():
                    if len(matched) > 1:
                        wasted = sz * (len(matched) - 1)
                        duplicate_groups.append({
                            "file_hash": h,
                            "size_bytes": float(sz),
                            "size_formatted": format_bytes(sz),
                            "count": len(matched),
                            "wasted_bytes": float(wasted),
                            "files": [
                                {
                                    "path": m["path"],
                                    "name": m["name"],
                                    "size_bytes": m["size_bytes"],
                                    "modified_time": m["modified_time"]
                                } for m in matched
                            ]
                        })

        duplicate_groups.sort(key=lambda x: x["wasted_bytes"], reverse=True)
        duplicate_groups = duplicate_groups[:30]

        # Category Breakdown
        categories = []
        for cname, cdata in category_stats.items():
            pct = round((cdata["bytes"] / total_scanned_bytes * 100.0), 1) if total_scanned_bytes > 0 else 0.0
            categories.append({
                "category": cname,
                "extension_list": sorted(list(cdata["exts"]))[:10],
                "total_bytes": float(cdata["bytes"]),
                "size_formatted": format_bytes(cdata["bytes"]),
                "file_count": cdata["count"],
                "percent_of_scanned": pct
            })
        categories.sort(key=lambda x: x["total_bytes"], reverse=True)

        temp_files_bytes = sum(f["size_bytes"] for f in temp_files_list)

        result_summary = {
            "target_path": target_path,
            "status": "COMPLETED",
            "timestamp": datetime.utcnow().isoformat(),
            "duration_sec": duration,
            "total_files": self.progress["files_scanned"],
            "total_dirs": self.progress["dirs_scanned"],
            "total_bytes": total_scanned_bytes,
            "size_formatted": format_bytes(total_scanned_bytes),
            "largest_files": largest_files,
            "largest_folders": largest_folders,
            "duplicates": duplicate_groups,
            "categories": categories,
            "temp_files_bytes": temp_files_bytes,
            "temp_files_count": len(temp_files_list),
            "temp_files_list": temp_files_list[:50]
        }

        self.last_result = result_summary
        self._save_scan_result(result_summary)
        return result_summary

    def _save_scan_result(self, res: Dict[str, Any]):
        db = SessionLocal()
        try:
            entry = ScanResult(
                timestamp=datetime.utcnow(),
                target_path=res["target_path"],
                status="COMPLETED",
                total_files=res["total_files"],
                total_dirs=res["total_dirs"],
                total_bytes=res["total_bytes"],
                duration_sec=res["duration_sec"],
                summary_json=json.dumps(res)
            )
            db.add(entry)
            db.add(AuditLog(
                action_type="SCAN_COMPLETED",
                description=f"Scanned {res['target_path']}: {res['total_files']} files, {res['size_formatted']} analyzed.",
                status="SUCCESS",
                details_json=json.dumps({"path": res["target_path"], "duration": res["duration_sec"]})
            ))
            db.commit()
            res["id"] = entry.id
        except Exception as e:
            db.rollback()
            print(f"[StorageScanner] Error saving scan: {e}")
        finally:
            db.close()

storage_scanner = StorageScanner()
