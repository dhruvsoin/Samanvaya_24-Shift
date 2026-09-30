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

import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import require_operator
from ..bus import bus
from ..clock import clock
from ..models import (
    InjectIncidentRequest,
    OutageRequest,
    RainSurgeRequest,
    TimeWarpRequest,
    UnitOfflineRequest,
)
from ..state import state

router = APIRouter(prefix="/scenario", tags=["Scenario"])


@router.post("/inject-incident")
def inject_incident(body: InjectIncidentRequest,
                    _=Depends(require_operator)) -> dict:
    """Creates an incident via the scenario panel.  Emits incident.reported."""
    incident_id = state.next_id("INC")
    ts = clock.now()
    zone = state.get_zone(body.zone_id)
    if zone is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Zone {body.zone_id} not found")

    incident: dict = {
        "incidentId": incident_id,
        "type": body.type,
        "status": "reported",
        "severity": None,
        "severityScore": None,
        "timeWindowMinutes": None,
        "location": {
            "lat": body.lat or 12.929,
            "lng": body.lng or 77.612,
            "label": f"Scenario inject — {body.zone_id}",
            "zoneId": body.zone_id,
        },
        "peopleAffected": body.people_affected,
        "language": body.language or "en",
        "source": "scenario",
        "summary": f"Scenario-injected {body.type.replace('_', ' ')}.",
        "confidence": 1.0,
        "reportedAt": ts,
        "assignedUnitIds": [],
        "reporterSessionId": None,
    }
    state.upsert_incident(incident)
    bus.publish("incident.reported", {"incident": incident})
    bus.publish("agent.activity", {
        "agent": "intake",
        "message": f"Scenario panel injected {body.type} in {body.zone_id}.",
        "incidentId": incident_id,
        "planId": None,
    })
    return incident


@router.post("/unit-offline")
def unit_offline(body: UnitOfflineRequest, _=Depends(require_operator)) -> dict:
    """Takes a unit offline.  Emits unit.unavailable."""
    unit = state.get_unit(body.unit_id)
    if unit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Unit {body.unit_id} not found")
    unit["status"] = "offline"
    state.upsert_unit(unit)
    bus.publish("unit.unavailable", {
        "unitId": body.unit_id,
        "reason": "operator",
    })
    return unit


@router.post("/rain-surge")
def rain_surge(body: RainSurgeRequest, _=Depends(require_operator)) -> dict:
    """
    Updates rain intensity in SystemStatus and emits status.updated.
    Per contracts/endpoints.md: heavy or extreme should make P2's route
    agent close ROAD-04 and slow ROAD-05 (P2's responsibility).
    """
    ts = clock.now()
    mm_map = {"none": 0, "light": 4, "moderate": 10, "heavy": 22, "extreme": 40}
    patch = {
        "scenarioTime": ts,
        "rain": {
            "intensity": body.intensity,
            "mmPerHour": float(mm_map.get(body.intensity, 0)),
            "freshness": "live",
            "observedAt": ts,
        },
    }
    return state.update_system_status(patch, publish=True)


@router.post("/outage")
def outage(body: OutageRequest, _=Depends(require_operator)) -> dict:
    """
    Zone comms outage. Emits zone.comms_degraded or zone.comms_restored and updates status.
    Per contracts: active=true triggers SMS fallback; active=false restores.
    """
    zone = state.set_zone_comms(body.zone_id, body.active, publish=True)
    if zone is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Zone {body.zone_id} not found",
        )
    return zone


@router.post("/time-warp")
def time_warp(body: TimeWarpRequest, _=Depends(require_operator)) -> dict:
    """
    Changes scenario clock speed. Allowed: 1, 2, 5, 10.
    Emits status.updated with new speed.
    """
    if body.speed not in (1, 2, 5, 10):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="speed must be 1, 2, 5 or 10",
        )
    return state.set_speed(body.speed, publish=True)


@router.post("/reset")
def reset(_=Depends(require_operator)) -> dict:
    """
    Restore seed state: units, roads, zones all reset; incidents, plans,
    approvals cleared. Emits status.updated.
    """
    state.reset()
    clock.reset()
    updated = state.get_system_status()
    bus.publish("status.updated", {"status": updated})
    return updated
