"""
JWT Authentication Tokens (Access & Refresh with JTI Rotation & Revocation)
"""
import uuid
import time
import jwt
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Set

JWT_SECRET_KEY = "AEGISSTOR_ENTERPRISE_INTERNAL_JWT_SECRET_KEY_PROD_2026"
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Thread-safe in-memory revoked JTI blacklist
_REVOKED_JTIS: Set[str] = set()

def create_access_token(user_id: int, org_id: int, role: str, email: str, jti: Optional[str] = None) -> str:
    """Generate signed short-lived JWT access token with unique JTI."""
    now = datetime.utcnow()
    token_id = jti or str(uuid.uuid4())
    payload = {
        "sub": str(user_id),
        "user_id": user_id,
        "org_id": org_id,
        "role": role,
        "email": email,
        "type": "access",
        "jti": token_id,
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: int, org_id: int, jti: Optional[str] = None) -> str:
    """Generate signed long-lived refresh token with unique JTI."""
    now = datetime.utcnow()
    token_id = jti or str(uuid.uuid4())
    payload = {
        "sub": str(user_id),
        "user_id": user_id,
        "org_id": org_id,
        "type": "refresh",
        "jti": token_id,
        "iat": now,
        "exp": now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

def decode_token(token: str, check_revocation: bool = True) -> Optional[Dict[str, Any]]:
    """Decode and cryptographically verify JWT token; checks revocation list."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        jti = payload.get("jti")
        if check_revocation and jti and jti in _REVOKED_JTIS:
            return None
        return payload
    except jwt.PyJWTError:
        return None

def revoke_token(jti: str) -> None:
    """Add a JWT ID to the revocation list."""
    if jti:
        _REVOKED_JTIS.add(jti)

def is_token_revoked(jti: str) -> bool:
    """Check if JTI has been revoked."""
    return jti in _REVOKED_JTIS
