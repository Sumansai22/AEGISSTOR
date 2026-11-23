"""
Multi-Factor Authentication (TOTP / RFC 6238) with Replay Protection
"""
import time
import pyotp
from typing import Dict, Tuple

# Replay protection cache: maps (secret_hash, code) -> expiration timestamp
_VERIFIED_CODES: Dict[Tuple[str, str], float] = {}

def generate_mfa_secret() -> str:
    """Generate a base32 TOTP secret key."""
    return pyotp.random_base32()

def get_mfa_provisioning_uri(secret: str, user_email: str, issuer_name: str = "AEGISSTOR Enterprise") -> str:
    """Generate otpauth:// URI for authenticator apps (Google Authenticator, Microsoft Authenticator, 1Password)."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=user_email, issuer_name=issuer_name)

def verify_totp_code(secret: str, code: str, allow_replay: bool = False) -> bool:
    """
    Verify 6-digit TOTP code with time drift window of +/- 30 seconds.
    Enforces RFC 6238 Section 7.3 replay protection:
    Rejects the same OTP if submitted twice within the active time window.
    """
    if not secret or not code:
        return False
    try:
        clean_code = code.strip().replace(" ", "")
        if not clean_code.isdigit() or len(clean_code) != 6:
            return False

        # Clean expired replay entries
        now = time.time()
        expired_keys = [k for k, exp in _VERIFIED_CODES.items() if exp < now]
        for k in expired_keys:
            _VERIFIED_CODES.pop(k, None)

        cache_key = (secret[:12], clean_code)
        if not allow_replay and cache_key in _VERIFIED_CODES:
            # Replay detected!
            return False

        totp = pyotp.TOTP(secret)
        is_valid = totp.verify(clean_code, valid_window=1)
        if is_valid and not allow_replay:
            # Register code as used for the next 90 seconds (window = +/-1 step of 30s)
            _VERIFIED_CODES[cache_key] = now + 90.0

        return bool(is_valid)
    except Exception:
        return False
