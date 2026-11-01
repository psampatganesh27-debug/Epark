import hashlib
import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from models import User

JWT_SECRET = os.getenv("JWT_SECRET", "epark-super-secret-pin-auth-key-2026")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 30

security = HTTPBearer(auto_error=False)


def hash_pin(pin: str) -> str:
    """Hashes a 4-6 digit numeric PIN using PBKDF2 with SHA-256 and a random salt."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        "sha256",
        pin.strip().encode("utf-8"),
        salt.encode("utf-8"),
        100000,
    )
    return f"{salt}${key.hex()}"


def verify_pin(pin: str, stored_hash: str) -> bool:
    """Verifies a plain 4-6 digit PIN against a stored salt$hash string."""
    try:
        salt, key_hex = stored_hash.split("$", 1)
        computed_key = hashlib.pbkdf2_hmac(
            "sha256",
            pin.strip().encode("utf-8"),
            salt.encode("utf-8"),
            100000,
        )
        return secrets.compare_digest(computed_key.hex(), key_hex)
    except Exception:
        return False


def create_access_token(user_id: int, phone: str, name: str) -> str:
    """Generates a signed JWT access token valid for 30 days."""
    expire = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRATION_DAYS)
    payload = {
        "sub": str(user_id),
        "phone": phone,
        "name": name,
        "exp": expire,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Decodes and validates a signed JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except Exception:
        return None


def get_current_user_optional(
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Returns the current user if a valid Bearer token is present, else None."""
    if not auth or not auth.credentials:
        return None
    payload = decode_access_token(auth.credentials)
    if not payload or "sub" not in payload:
        return None
    try:
        user_id = int(payload["sub"])
        return db.query(User).filter(User.id == user_id).first()
    except Exception:
        return None


def get_current_user_required(
    user: Optional[User] = Depends(get_current_user_optional),
) -> User:
    """Enforces that the request has an authenticated user; raises 401 otherwise."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in with your PIN.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
