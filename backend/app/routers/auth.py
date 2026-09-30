"""
routers/auth.py — POST /auth/login, /auth/crew-login, /auth/demo

Shapes from contracts/types.ts:
    LoginRequest, CrewLoginRequest, AuthResponse
Users from contracts/seed/users.json:
    operators[].{username, password, displayName}
    crewPin, crewCodes[]
"""
from fastapi import APIRouter, HTTPException, status

from ..auth import create_token
from ..models import AuthResponse, CrewLoginRequest, LoginRequest
from ..state import state

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest) -> AuthResponse:
    """Operator login.  Demo: username=operator password=demo1234"""
    user = state.verify_operator(body.username, body.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid credentials")
    token = create_token(sub=user["username"], role="operator")
    return AuthResponse(
        token=token,
        role="operator",
        display_name=user.get("displayName", user["username"]),
        unit_id=None,
    )


@router.post("/crew-login", response_model=AuthResponse)
def crew_login(body: CrewLoginRequest) -> AuthResponse:
    """Crew login.  Demo: unit_code=AMB-01  pin=1111"""
    if not state.verify_crew(body.unit_code, body.pin):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid crew credentials")
    token = create_token(sub=body.unit_code, role="crew", unit_id=body.unit_code)
    return AuthResponse(
        token=token,
        role="crew",
        display_name=body.unit_code,
        unit_id=body.unit_code,
    )


@router.post("/demo", response_model=AuthResponse)
def demo_login() -> AuthResponse:
    """Reviewer demo token.  No credentials needed."""
    token = create_token(sub="reviewer-demo", role="reviewer")
    return AuthResponse(
        token=token,
        role="reviewer",
        display_name="Demo Reviewer",
        unit_id=None,
    )
