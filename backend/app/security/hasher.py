"""
Argon2id Password Hashing Engine
"""
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHash

# Secure Argon2id configuration aligned with OWASP recommendations
_hasher = PasswordHasher(
    time_cost=2,
    memory_cost=65536,  # 64 MiB
    parallelism=4,
    hash_len=32,
    salt_len=16
)

def hash_password(password: str) -> str:
    """Hash password using Argon2id algorithm."""
    return _hasher.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against Argon2id hash with timing attack resistance."""
    try:
        return _hasher.verify(hashed_password, plain_password)
    except (VerifyMismatchError, InvalidHash, Exception):
        return False

def needs_rehash(hashed_password: str) -> bool:
    """Determine if password hash needs migration to newer parameters."""
    try:
        return _hasher.check_needs_rehash(hashed_password)
    except Exception:
        return True
