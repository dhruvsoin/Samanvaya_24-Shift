"""
routers/auth.py — Authentication endpoints per contracts/endpoints.md.

Endpoints:
  POST /auth/login       → operator token
  POST /auth/crew-login  → crew token (unitId in payload)
  POST /auth/demo        → reviewer demo token (no credentials needed)

Validated against contracts/seed/users.json:
  - operator: operator / demo1234
  - crew: unitCode (e.g. AMB-01) / PIN 1111
  - reviewer: POST /auth/demo
"""
from fastapi import APIRouter, HTTPException, status

from ..auth import create_token
from ..models import AuthResponse, CrewLoginRequest, LoginRequest
from ..state import state

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest) -> AuthResponse:
    """Operator login. Demo credentials from seed/users.json: operator / demo1234"""
    user = state.verify_operator(body.username, body.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    display_name = user.get("displayName", user["username"])
    token = create_token(
        sub=user["username"],
        role="operator",
        display_name=display_name,
        unit_id=None,
    )
    return AuthResponse(
        token=token,
        role="operator",
        display_name=display_name,
        unit_id=None,
    )


@router.post("/crew-login", response_model=AuthResponse)
def crew_login(body: CrewLoginRequest) -> AuthResponse:
    """Crew login. Demo credentials from seed/users.json: unit_code=AMB-01, pin=1111"""
    if not state.verify_crew(body.unit_code, body.pin):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid crew unit code or PIN",
        )
    token = create_token(
        sub=body.unit_code,
        role="crew",
        display_name=body.unit_code,
        unit_id=body.unit_code,
    )
    return AuthResponse(
        token=token,
        role="crew",
        display_name=body.unit_code,
        unit_id=body.unit_code,
    )


@router.post("/demo", response_model=AuthResponse)
def demo_login() -> AuthResponse:
    """Reviewer demo login (read-only operator access). No credentials needed."""
    token = create_token(
        sub="reviewer-demo",
        role="reviewer",
        display_name="Demo Reviewer",
        unit_id=None,
    )
    return AuthResponse(
        token=token,
        role="reviewer",
        display_name="Demo Reviewer",
        unit_id=None,
    )
