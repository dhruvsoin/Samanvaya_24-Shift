"""
routers/incidents.py — Incident-specific endpoints.

GET  /incidents              → Incident[]           (Op, Rev)
POST /incidents/phone-in    → Incident              (Op only)

These were in routers/state.py; extracted here so the router map
matches contracts/endpoints.md §groups exactly.
The state and bus wiring is identical — only the router file changes.
"""
from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import require_operator, require_operator_or_reviewer
from ..bus import bus
from ..clock import clock
from ..models import PhoneInRequest
from ..state import state

router = APIRouter(tags=["Incidents"])


@router.get("/incidents")
def get_incidents(_=Depends(require_operator_or_reviewer)) -> list[dict]:
    """
    Returns all incidents in the runtime state.
    Empty list at scenario start (seed data has no pre-existing incidents).
    """
    return state.get_incidents()


@router.post("/incidents/phone-in")
def phone_in(body: PhoneInRequest, claims=Depends(require_operator)) -> dict:
    """
    Operator enters a phone-in call as an incident.
    Publishes incident.reported. Intake is skipped because the structure is already provided.
    """
    return state.create_phone_in_incident(
        location=body.location,
        incident_type=body.type,
        people_affected=body.people_affected,
        language=body.language,
        note=body.note,
    )
