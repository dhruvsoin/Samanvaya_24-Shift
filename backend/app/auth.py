"""
auth.py — JWT auth helpers, token signing, and role-based FastAPI dependencies.

Endpoints supported:
  - POST /auth/login       → operator token
  - POST /auth/crew-login  → crew token (unitId in payload)
  - POST /auth/demo        → reviewer token

Token payload contains:
  { "sub": "<sub/id>", "role": "<role>", "displayName": "<name>", "unitId": "<id>|null", "exp": <expiry> }

Features:
  - require_role(*roles): FastAPI dependency checking token validity and role permission.
  - Reviewer gets 403 on every POST except /auth/demo.
  - create_reporter_session(language): helper exposed for /reporter/session and external modules.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

_SECRET = os.getenv("SECRET_KEY", "samanvaya-stub-secret-change-in-prod")
_ALGO = os.getenv("ALGORITHM", "HS256")
_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

Role = Literal["operator", "crew", "reviewer", "reporter"]

_bearer = HTTPBearer(auto_error=False)


# ── Token Creation ────────────────────────────────────────────────────

def create_token(
    sub: str,
    role: Role,
    display_name: str | None = None,
    unit_id: str | None = None,
) -> str:
    """
    Issue a signed JWT carrying sub, role, displayName, and unitId.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=_EXPIRE_MINUTES)
    d_name = display_name or sub
    payload = {
        "sub": sub,
        "role": role,
        "displayName": d_name,
        "display_name": d_name,
        "unitId": unit_id,
        "unit_id": unit_id,
        "exp": expire,
    }
    return jwt.encode(payload, _SECRET, algorithm=_ALGO)


# ── Token Decoding ────────────────────────────────────────────────────

def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, _SECRET, algorithms=[_ALGO])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _get_token(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _decode(creds.credentials)


# ── Role Dependency ───────────────────────────────────────────────────

def require_role(*roles: Role):
    """
    FastAPI dependency factory enforcing that the authenticated user has one of `roles`.
    Enforces rule: Reviewers get 403 on every POST except /auth/demo.
    """
    def dependency(request: Request, claims: dict = Depends(_get_token)) -> dict:
        user_role = claims.get("role")
        # Reviewer cannot perform any POST operations
        if user_role == "reviewer" and request.method == "POST":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Reviewers are read-only and cannot perform POST operations",
            )
        if user_role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user_role}' not permitted; requires one of: {list(roles)}",
            )
        return claims
    return dependency


# Convenience role dependencies for routers
require_operator = require_role("operator")
require_operator_or_reviewer = require_role("operator", "reviewer")
require_crew = require_role("crew")
require_reporter = require_role("reporter")
require_any = require_role("operator", "crew", "reviewer", "reporter")


# ── Reporter Session Helper ───────────────────────────────────────────

def create_reporter_session(language: str = "en") -> dict:
    """
    Helper for /reporter/session and external modules.
    Creates an anonymous reporter session in state, generates a token,
    and returns: { "sessionId": ..., "token": ..., "language": ... }
    """
    from .state import state
    session_id = state.next_id("SES")
    token = create_token(
        sub=session_id,
        role="reporter",
        display_name=f"Reporter {session_id}",
        unit_id=None,
    )
    session = {
        "sessionId": session_id,
        "token": token,
        "language": language,
    }
    state.upsert_reporter_session(session)
    return session
