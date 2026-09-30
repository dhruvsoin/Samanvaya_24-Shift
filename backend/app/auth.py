"""
auth.py — JWT auth helpers.

- POST /auth/login       → operator token
- POST /auth/crew-login  → crew token (unitId in sub)
- POST /auth/demo        → reviewer token

Token payload: { "sub": "<username>", "role": "<role>", "unit_id": "<id>|null" }

All endpoints that need a token call `require_token(role)` as a FastAPI
dependency.  In the stub a fixed secret is fine; swap for env var in prod.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from jose import JWTError, jwt

_SECRET = os.getenv("SECRET_KEY", "samanvaya-stub-secret-change-in-prod")
_ALGO = os.getenv("ALGORITHM", "HS256")
_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

Role = Literal["operator", "crew", "reviewer", "reporter"]

_bearer = HTTPBearer(auto_error=False)


# ── token creation ────────────────────────────────────────────────────

def create_token(sub: str, role: Role, unit_id: str | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=_EXPIRE_MINUTES)
    payload = {
        "sub": sub,
        "role": role,
        "unit_id": unit_id,
        "exp": expire,
    }
    return jwt.encode(payload, _SECRET, algorithm=_ALGO)


# ── token decoding ────────────────────────────────────────────────────

def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, _SECRET, algorithms=[_ALGO])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── FastAPI dependencies ──────────────────────────────────────────────

def _get_token(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _decode(creds.credentials)


def require_operator(claims: dict = Depends(_get_token)) -> dict:
    if claims.get("role") not in ("operator",):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Operators only")
    return claims


def require_operator_or_reviewer(claims: dict = Depends(_get_token)) -> dict:
    if claims.get("role") not in ("operator", "reviewer"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Operator or reviewer only")
    return claims


def require_crew(claims: dict = Depends(_get_token)) -> dict:
    if claims.get("role") != "crew":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Crew only")
    return claims


def require_reporter(claims: dict = Depends(_get_token)) -> dict:
    if claims.get("role") != "reporter":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Reporter session only")
    return claims


def require_any(claims: dict = Depends(_get_token)) -> dict:
    return claims
