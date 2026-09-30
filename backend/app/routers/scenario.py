"""
routers/scenario.py — Scenario control endpoints (Op only).

POST /scenario/inject-incident  → Incident
POST /scenario/unit-offline     → Unit
POST /scenario/rain-surge       → SystemStatus
POST /scenario/outage           → Zone
POST /scenario/time-warp        → SystemStatus
POST /scenario/reset            → SystemStatus

All described in contracts/endpoints.md §Behaviour notes.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import require_operator
from ..models import (
    InjectIncidentRequest,
    OutageRequest,
    RainSurgeRequest,
    TimeWarpRequest,
    UnitOfflineRequest,
)
from ..services import scenario as scenario_service

router = APIRouter(prefix="/scenario", tags=["Scenario"])


@router.post("/inject-incident")
def inject_incident(body: InjectIncidentRequest,
                    _=Depends(require_operator)) -> dict:
    """Creates an incident via the scenario panel.  Emits incident.reported."""
    try:
        return scenario_service.inject_incident(body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/unit-offline")
def unit_offline(body: UnitOfflineRequest, _=Depends(require_operator)) -> dict:
    """Takes a unit offline.  Emits unit.unavailable."""
    try:
        return scenario_service.set_unit_offline(body.unit_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/rain-surge")
def rain_surge(body: RainSurgeRequest, _=Depends(require_operator)) -> dict:
    """
    Updates rain intensity in SystemStatus and emits status.updated.
    Per contracts/endpoints.md: heavy or extreme makes the route agent
    close ROAD-04 and slow ROAD-05.
    """
    return scenario_service.rain_surge(body.intensity)


@router.post("/outage")
def outage(body: OutageRequest, _=Depends(require_operator)) -> dict:
    """
    Zone comms outage. Emits zone.comms_degraded or zone.comms_restored and updates status.
    Per contracts: active=true triggers SMS fallback; active=false restores.
    """
    try:
        return scenario_service.set_outage(body.zone_id, body.active)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/time-warp")
def time_warp(body: TimeWarpRequest, _=Depends(require_operator)) -> dict:
    """
    Changes scenario clock speed. Allowed: 1, 2, 5, 10.
    Emits status.updated with new speed.
    """
    try:
        return scenario_service.set_time_warp(body.speed)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="speed must be 1, 2, 5 or 10",
        )


@router.post("/reset")
def reset(_=Depends(require_operator)) -> dict:
    """
    Restore seed state: units, roads, zones all reset; incidents, plans,
    approvals cleared. Emits status.updated.
    """
    return scenario_service.reset()
