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
from typing import List

from ..auth import require_operator, require_operator_or_reviewer
from ..bus import bus
from ..clock import clock
from ..models import UnitStatusRequest, Unit, Facility, RoadNetwork, Zone, SystemStatus
from ..state import state

router = APIRouter(tags=["State"])


@router.get("/units", response_model=list[Unit], response_model_by_alias=True)
def get_units(_=Depends(require_operator_or_reviewer)):
    return state.get_units()


@router.get("/facilities", response_model=list[Facility], response_model_by_alias=True)
def get_facilities(_=Depends(require_operator_or_reviewer)):
    return state.get_facilities()


@router.get("/roads", response_model=RoadNetwork, response_model_by_alias=True)
def get_roads(_=Depends(require_operator_or_reviewer)):
    return state.get_roads()


@router.get("/zones", response_model=list[Zone], response_model_by_alias=True)
def get_zones(_=Depends(require_operator_or_reviewer)):
    return state.get_zones()


@router.get("/status", response_model=SystemStatus, response_model_by_alias=True)
def get_status(_=Depends(require_operator_or_reviewer)):
    s = state.get_system_status()
    s["scenarioTime"] = clock.now()
    return s


@router.post("/units/{unit_id}/status", response_model=Unit, response_model_by_alias=True)
def update_unit_status(
    unit_id: str,
    body: UnitStatusRequest,
    claims=Depends(require_operator),
):
    """Operator manually overrides a unit's status."""
    unit = state.set_unit_status(unit_id, body.status)
    if unit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unit {unit_id} not found",
        )
    return unit
