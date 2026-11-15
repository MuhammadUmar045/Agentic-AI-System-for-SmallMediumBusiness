from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash

from .config import Settings, get_settings

password_hash = PasswordHash.recommended()
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, password_hash_value: str) -> bool:
    try:
        return password_hash.verify(password, password_hash_value)
    except Exception:
        return False


def create_access_token(user_id: str, settings: Settings, business_id: str | None = None, role: str = "owner") -> str:
    expiry = datetime.now(UTC) + timedelta(minutes=settings.access_token_minutes)
    claims = {
        "sub": str(user_id),
        "business_id": str(business_id) if business_id else str(user_id),
        "role": role,
        "exp": expiry,
        "iat": datetime.now(UTC),
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, settings: Settings) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired. Please log in again.") from error
    except jwt.PyJWTError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from error


async def get_current_token_payload(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")
    return decode_token(credentials.credentials, settings)


async def get_current_user_id(
    payload: dict[str, Any] = Depends(get_current_token_payload),
) -> str:
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return user_id


def require_role(allowed_roles: list[str]):
    """
    FastAPI dependency factory for strict Role-Based Access Control (SEC-4).
    Roles: owner, manager, hr_officer, cashier, staff
    """
    async def role_checker(payload: dict[str, Any] = Depends(get_current_token_payload)) -> dict[str, Any]:
        user_role = payload.get("role", "staff")
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: required role in {allowed_roles}, your role is '{user_role}'",
            )
        return payload
    return role_checker
