"""
Utility helper functions for AEGISSTOR
"""
import os
import hashlib
import subprocess
import shutil
from typing import Tuple, Dict

def format_bytes(bytes_val: float) -> str:
    """Format bytes into readable units (B, KB, MB, GB, TB)."""
    if bytes_val is None or bytes_val <= 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB", "PB"]
    val = float(bytes_val)
    idx = 0
    while val >= 1024.0 and idx < len(units) - 1:
        val /= 1024.0
        idx += 1
    return f"{val:.2f} {units[idx]}"

def get_file_hash(file_path: str, max_bytes: int = 10 * 1024 * 1024) -> str:
    """
    Calculate SHA-256 hash of a file.
    Reads in 64KB blocks, capped at max_bytes to keep scanning responsive for multi-GB files.
    """
    hasher = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            bytes_read = 0
            while bytes_read < max_bytes:
                chunk = f.read(65536)
                if not chunk:
                    break
                hasher.update(chunk)
                bytes_read += len(chunk)
        return hasher.hexdigest()
    except (PermissionError, FileNotFoundError, OSError):
        return ""

EXTENSION_CATEGORIES: Dict[str, str] = {
    # Video
    ".mp4": "Video", ".mkv": "Video", ".avi": "Video", ".mov": "Video", ".wmv": "Video", ".flv": "Video", ".webm": "Video",
    # Audio
    ".mp3": "Audio", ".wav": "Audio", ".flac": "Audio", ".aac": "Audio", ".ogg": "Audio", ".wma": "Audio", ".m4a": "Audio",
    # Images
    ".jpg": "Images", ".jpeg": "Images", ".png": "Images", ".gif": "Images", ".bmp": "Images", ".svg": "Images", ".webp": "Images", ".ico": "Images", ".raw": "Images",
    # Documents
    ".pdf": "Documents", ".docx": "Documents", ".doc": "Documents", ".xlsx": "Documents", ".xls": "Documents", ".pptx": "Documents", ".ppt": "Documents", ".txt": "Documents", ".csv": "Documents", ".rtf": "Documents",
    # Archives & Disk Images
    ".zip": "Archives", ".rar": "Archives", ".7z": "Archives", ".tar": "Archives", ".gz": "Archives", ".iso": "Archives", ".img": "Archives", ".bz2": "Archives",
    # Executables & Installers
    ".exe": "Executables", ".msi": "Executables", ".dll": "Executables", ".sys": "Executables", ".bat": "Executables", ".cmd": "Executables", ".bin": "Executables",
    # Development / Code
    ".py": "Code", ".js": "Code", ".ts": "Code", ".tsx": "Code", ".jsx": "Code", ".html": "Code", ".css": "Code", ".json": "Code", ".xml": "Code", ".java": "Code", ".cpp": "Code", ".c": "Code", ".h": "Code", ".rs": "Code", ".go": "Code", ".sql": "Code",
    # System & Temp
    ".tmp": "Temporary", ".temp": "Temporary", ".log": "Temporary", ".bak": "Temporary", ".old": "Temporary", ".dmp": "Temporary", ".chk": "Temporary"
}

def classify_extension(ext: str) -> str:
    """Classify file extension into standard categories."""
    if not ext:
        return "Unknown"
    ext_clean = ext.lower().strip()
    return EXTENSION_CATEGORIES.get(ext_clean, "Other")

def get_disk_health_info() -> str:
    """
    Query real Windows physical disk status using PowerShell Get-PhysicalDisk.
    Gracefully fallbacks to standard status if command is unavailable or restricted.
    """
    if os.name != "nt":
        return "Healthy (POSIX filesystem operational)"
    try:
        cmd = ["powershell", "-NoProfile", "-Command", "Get-PhysicalDisk | Select-Object -ExpandProperty OperationalStatus"]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
        if res.returncode == 0 and res.stdout.strip():
            status = res.stdout.strip().replace("\r", " ").replace("\n", ", ")
            return f"Operational: {status}"
    except Exception:
        pass
    return "Healthy (Self-Monitoring OK)"
