"""
routers/state.py — State read endpoints (GET only, Op + Rev roles).

GET /units          → Unit[]
GET /facilities     → Facility[]
GET /roads          → RoadNetwork
GET /zones          → Zone[]
GET /status         → SystemStatus

POST /units/{id}/status    → Unit       (Op only)

Crews and reporters get 403 on all these (enforced by require_operator_or_reviewer).
Incidents and phone-in live in routers/incidents.py.
"""
from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import require_operator, require_operator_or_reviewer
from ..bus import bus
from ..clock import clock
from ..models import UnitStatusRequest
from ..state import state

router = APIRouter(tags=["State"])


@router.get("/units")
def get_units(_=Depends(require_operator_or_reviewer)) -> list[dict]:
    return state.get_units()


@router.get("/facilities")
def get_facilities(_=Depends(require_operator_or_reviewer)) -> list[dict]:
    return state.get_facilities()


@router.get("/roads")
def get_roads(_=Depends(require_operator_or_reviewer)) -> dict:
    return state.get_roads()


@router.get("/zones")
def get_zones(_=Depends(require_operator_or_reviewer)) -> list[dict]:
    return state.get_zones()


@router.get("/status")
def get_status(_=Depends(require_operator_or_reviewer)) -> dict:
    s = state.get_system_status()
    s["scenarioTime"] = clock.now()
    return s


@router.post("/units/{unit_id}/status")
def update_unit_status(unit_id: str, body: UnitStatusRequest,
                       claims=Depends(require_operator)) -> dict:
    """Operator manually overrides a unit's status."""
    unit = state.get_unit(unit_id)
    if unit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Unit {unit_id} not found")
    previous = unit["status"]
    unit["status"] = body.status
    state.upsert_unit(unit)
    bus.publish("unit.status_changed", {
        "unitId": unit_id,
        "status": body.status,
        "previousStatus": previous,
        "location": None,
    })
    return unit
