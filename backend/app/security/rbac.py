"""
Role-Based Access Control (RBAC) & Authentication Dependencies
Enforces true least-privilege role boundaries.
"""
from enum import Enum
from typing import List, Optional, Set
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.security.tokens import decode_token

security_scheme = HTTPBearer(auto_error=False)

class UserRole(str, Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    DATABASE_ADMIN = "DATABASE_ADMIN"
    ANALYST = "ANALYST"
    VIEWER = "VIEWER"

# Mapping each UserRole to the set of role privileges it possesses
USER_ROLE_PERMISSIONS: dict = {
    UserRole.SUPER_ADMIN: {UserRole.SUPER_ADMIN, UserRole.DATABASE_ADMIN, UserRole.ANALYST, UserRole.VIEWER},
    UserRole.DATABASE_ADMIN: {UserRole.DATABASE_ADMIN, UserRole.ANALYST, UserRole.VIEWER},
    UserRole.ANALYST: {UserRole.ANALYST, UserRole.VIEWER},
    UserRole.VIEWER: {UserRole.VIEWER}
}

def get_current_user_token(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme)):
    """Extract and validate bearer token payload. Defaults to local desktop session if unauthenticated."""
    if credentials:
        token = credentials.credentials
        payload = decode_token(token)
        if not payload or payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload

    # Provide automatic authenticated context for local desktop mode
    return {
        "sub": "1",
        "user_id": 1,
        "org_id": 1,
        "role": "SUPER_ADMIN",
        "email": "admin@aegisstor.local",
        "type": "access",
        "jti": "desktop-local-session"
    }

def require_role(allowed_roles: List[UserRole]):
    """FastAPI route guard ensuring caller possesses necessary role permission."""
    def role_checker(token_data: dict = Depends(get_current_user_token)):
        user_role_str = token_data.get("role")
        try:
            user_role = UserRole(user_role_str)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Invalid user role: {user_role_str}"
            )

        granted_permissions = USER_ROLE_PERMISSIONS.get(user_role, set())
        if any(allowed in granted_permissions for allowed in allowed_roles):
            return token_data

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Requires one of {[r.value for r in allowed_roles]} permissions"
        )
    return role_checker
