"""
routers/crew.py — Crew endpoints (crew token only).

GET  /crew/assignment                → Assignment | null
POST /crew/assignment/{id}/respond   → Assignment
POST /crew/status                    → Unit
POST /crew/problem                   → { ok: true }

Per contracts/endpoints.md:
  - All crew POSTs carry a clientRequestId for idempotency.
  - The crew page queues actions offline and resends on reconnect;
    the backend must ignore duplicates.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional

from ..auth import require_crew
from ..bus import bus
from ..clock import clock
from ..models import CrewProblemRequest, CrewRespondRequest, CrewStatusRequest, Assignment, Unit
from ..state import state

router = APIRouter(prefix="/crew", tags=["Crew"])

# Simple idempotency cache: {clientRequestId: response}
_idempotency_cache: dict[str, dict] = {}


def _check_idempotency(client_request_id: str) -> dict | None:
    return _idempotency_cache.get(client_request_id)


def _cache(client_request_id: str, response: dict) -> None:
    _idempotency_cache[client_request_id] = response


@router.get("/assignment", response_model=Optional[Assignment], response_model_by_alias=True)
def get_assignment(claims=Depends(require_crew)):
    """Returns the active (sent/accepted) assignment for this crew's unit."""
    unit_id = claims.get("unit_id")
    assignments = state.get_assignments_for_unit(unit_id)
    active = next(
        (a for a in assignments if a["status"] in ("sent", "accepted")),
        None,
    )
    return active


@router.post("/assignment/{assignment_id}/respond", response_model=Assignment, response_model_by_alias=True)
def respond_to_assignment(
    assignment_id: str,
    body: CrewRespondRequest,
    claims=Depends(require_crew),
):
    """
    Crew accepts or declines an assignment.
    Emits: assignment.accepted or assignment.declined.
    Idempotent via clientRequestId.
    """
    cached = _check_idempotency(body.client_request_id)
    if cached:
        return cached

    assignment = state.get_assignment(assignment_id)
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Assignment {assignment_id} not found")

    ts = clock.now()
    assignment["status"] = "accepted" if body.accept else "declined"
    assignment["respondedAt"] = ts
    state.upsert_assignment(assignment)

    event_type = "assignment.accepted" if body.accept else "assignment.declined"
    payload: dict = {
        "assignmentId": assignment_id,
        "unitId": assignment["unitId"],
        "incidentId": assignment["incidentId"],
    }
    if not body.accept:
        payload["reason"] = body.reason
    bus.publish(event_type, payload)

    _cache(body.client_request_id, assignment)
    return assignment


@router.post("/status", response_model=Unit, response_model_by_alias=True)
def crew_status(body: CrewStatusRequest, claims=Depends(require_crew)):
    """
    Crew reports their own status transition (en_route / arrived / task_complete).
    Emits: unit.status_changed.
    Idempotent via clientRequestId.
    """
    cached = _check_idempotency(body.client_request_id)
    if cached:
        return cached

    unit_id = claims.get("unit_id")
    unit = state.get_unit(unit_id)
    if unit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Unit {unit_id} not found")

    status_map = {
        "en_route": "en_route",
        "arrived": "on_scene",
        "task_complete": "available",
    }
    previous = unit["status"]
    unit["status"] = status_map[body.action]
    state.upsert_unit(unit)

    bus.publish("unit.status_changed", {
        "unitId": unit_id,
        "status": unit["status"],
        "previousStatus": previous,
        "location": None,
    })

    _cache(body.client_request_id, unit)
    return unit


@router.post("/problem", response_model=dict, response_model_by_alias=True)
def crew_problem(body: CrewProblemRequest, claims=Depends(require_crew)):
    """
    Crew reports a field problem (road blocked, vehicle stuck, other).
    Emits: agent.activity so the operator sees it.
    Idempotent via clientRequestId.
    """
    cached = _check_idempotency(body.client_request_id)
    if cached:
        return cached

    unit_id = claims.get("unit_id")
    bus.publish("agent.activity", {
        "agent": "command",
        "message": f"Crew {unit_id} reported problem: {body.kind}. {body.note or ''}".strip(),
        "incidentId": None,
        "planId": None,
    })

    result = {"ok": True}
    _cache(body.client_request_id, result)
    return result
