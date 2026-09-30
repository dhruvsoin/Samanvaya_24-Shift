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
    Emits: incident.reported, agent.activity
    """
    incident_id = state.next_id("INC")
    ts = clock.now()
    incident: dict = {
        "incidentId": incident_id,
        "type": body.type,
        "status": "reported",
        "severity": None,
        "severityScore": None,
        "timeWindowMinutes": None,
        "location": {
            "lat": body.location["lat"],
            "lng": body.location["lng"],
            "label": body.location.get("label", ""),
            "zoneId": body.location.get("zoneId", ""),
        },
        "peopleAffected": body.people_affected,
        "language": body.language,
        "source": "phone_in",
        "summary": body.note or "Phone-in incident",
        "confidence": 0.95,
        "reportedAt": ts,
        "assignedUnitIds": [],
        "reporterSessionId": None,
    }
    state.upsert_incident(incident)
    bus.publish("incident.reported", {"incident": incident})
    bus.publish("agent.activity", {
        "agent": "intake",
        "message": (
            f"Phone-in entered by operator: {body.type} "
            f"at {incident['location']['label']}."
        ),
        "incidentId": incident_id,
        "planId": None,
    })
    return incident
