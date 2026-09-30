from typing import Optional
from fastapi import Header, HTTPException, status

def _require_token(authorization: Optional[str] = Header(None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing token"
        )
    return authorization.split(" ", 1)[1]