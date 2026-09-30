"""
services/scenario.py — Scenario manipulation services for Person 4's endpoints.

Provides:
  - inject_incident(request)
  - set_unit_offline(unit_id)
  - rain_surge(intensity)
  - set_outage(zone_id, active)
  - set_time_warp(speed)
  - reset()

All functions mutate state through state.py and publish appropriate events
on the pub/sub event bus per contracts/endpoints.md behaviour notes.
"""
from __future__ import annotations

import logging
from typing import Any

from ..agents.route import RouteAgent
from ..bus import bus
from ..clock import clock
from ..models import InjectIncidentRequest
from ..state import state

logger = logging.getLogger(__name__)


def inject_incident(request: InjectIncidentRequest | dict[str, Any]) -> dict[str, Any]:
    """
    Creates an incident via the scenario panel.

    Signature:
        inject_incident(request: InjectIncidentRequest | dict) -> dict

    Parameters:
        request: An InjectIncidentRequest instance or dictionary containing:
            - type (str): Incident type ('medical', 'trapped_person', 'flooded_home', etc.)
            - zone_id / zoneId (str): ID of the target zone (e.g. 'ZONE-A')
            - people_affected / peopleAffected (int, optional): People count (defaults to 1)
            - lat (float, optional): Latitude
            - lng (float, optional): Longitude
            - language (str, optional): Reporter language (defaults to 'en')

    Returns:
        dict: The created Incident domain object.

    State Mutations:
        - Allocates sequential incident ID (e.g. 'INC-01')
        - Persists incident into state store

    Events Published:
        - incident.reported: The newly structured incident
        - agent.activity: Intake agent log message indicating scenario injection

    Raises:
        ValueError: If the target zone does not exist.
    """
    if hasattr(request, "type"):
        inc_type = request.type
        zone_id = request.zone_id
        people_affected = request.people_affected
        lat = request.lat
        lng = request.lng
        language = request.language or "en"
    else:
        inc_type = request.get("type", "other")
        zone_id = request.get("zoneId") or request.get("zone_id", "ZONE-A")
        people_affected = request.get("peopleAffected") or request.get("people_affected", 1)
        lat = request.get("lat")
        lng = request.get("lng")
        language = request.get("language") or "en"

    zone = state.get_zone(zone_id)
    if zone is None:
        raise ValueError(f"Zone {zone_id} not found")

    incident_id = state.next_id("INC")
    ts = clock.now()

    incident: dict[str, Any] = {
        "incidentId": incident_id,
        "type": inc_type,
        "status": "reported",
        "severity": None,
        "severityScore": None,
        "timeWindowMinutes": None,
        "location": {
            "lat": lat if lat is not None else 12.929,
            "lng": lng if lng is not None else 77.612,
            "label": f"Scenario inject — {zone_id}",
            "zoneId": zone_id,
        },
        "peopleAffected": people_affected,
        "language": language,
        "source": "scenario",
        "summary": f"Scenario-injected {inc_type.replace('_', ' ')}.",
        "confidence": 1.0,
        "reportedAt": ts,
        "assignedUnitIds": [],
        "reporterSessionId": None,
    }

    state.upsert_incident(incident)
    bus.publish("incident.reported", {"incident": incident})
    bus.publish("agent.activity", {
        "agent": "intake",
        "message": f"Scenario panel injected {inc_type} in {zone_id}.",
        "incidentId": incident_id,
        "planId": None,
    })
    return incident


def set_unit_offline(unit_id: str) -> dict[str, Any]:
    """
    Takes a unit offline from the scenario panel.

    Signature:
        set_unit_offline(unit_id: str) -> dict

    Parameters:
        unit_id (str): Identifier of the unit to take offline (e.g. 'AMB-01').

    Returns:
        dict: The updated unit dictionary with status 'offline'.

    State Mutations:
        - Updates unit status to 'offline' in state store

    Events Published:
        - unit.unavailable: Payload containing unitId and reason 'operator'

    Raises:
        ValueError: If unit_id is not found in the state store.
    """
    unit = state.get_unit(unit_id)
    if unit is None:
        raise ValueError(f"Unit {unit_id} not found")

    unit["status"] = "offline"
    state.upsert_unit(unit)
    bus.publish("unit.unavailable", {
        "unitId": unit_id,
        "reason": "operator",
    })
    return unit


def rain_surge(intensity: str, route_agent: RouteAgent | None = None) -> dict[str, Any]:
    """
    Triggers a rain surge scenario event.

    Signature:
        rain_surge(intensity: str, route_agent: RouteAgent | None = None) -> dict

    Parameters:
        intensity (str): Rain intensity level ('none', 'light', 'moderate', 'heavy', 'extreme').
        route_agent (RouteAgent, optional): Optional RouteAgent instance. If None,
            a RouteAgent instance is invoked to recompute ETAs and emit activity.

    Returns:
        dict: The updated SystemStatus.

    State Mutations:
        - Updates system_status.rain with intensity, mmPerHour, freshness ('live'), and observedAt
        - If intensity is 'heavy' or 'extreme':
            * Closes ROAD-04 in state (status: 'closed')
            * Slows ROAD-05 in state (status: 'slow')

    Events Published:
        - status.updated: System status reflecting new rain conditions
        - If intensity is 'heavy' or 'extreme':
            * road.status_changed: ROAD-04 closed ('Underpass flooded, impassable')
            * road.status_changed: ROAD-05 slow ('Heavy rain, water on carriageway')
            * agent.activity: Route agent log ('Hosur Rd underpass now impassable; 2 ETAs updated.')
    """
    ts = clock.now()
    mm_map = {"none": 0.0, "light": 4.0, "moderate": 10.0, "heavy": 22.0, "extreme": 40.0}
    patch = {
        "scenarioTime": ts,
        "rain": {
            "intensity": intensity,
            "mmPerHour": float(mm_map.get(intensity, 0.0)),
            "freshness": "live",
            "observedAt": ts,
        },
    }
    updated_status = state.update_system_status(patch, publish=True)

    if intensity in ("heavy", "extreme"):
        # 1. Produce road.status_changed for ROAD-04 (closed)
        state.set_road_status(
            "ROAD-04",
            "closed",
            reason="Underpass flooded, impassable",
            publish=True,
        )
        # 2. Produce road.status_changed for ROAD-05 (slow)
        state.set_road_status(
            "ROAD-05",
            "slow",
            reason="Heavy rain, water on carriageway",
            publish=True,
        )
        # 3. Run Route agent
        agent = route_agent or RouteAgent()
        agent.handle_sync({
            "type": "road.status_changed",
            "payload": {
                "roadId": "ROAD-04",
                "status": "closed",
                "previousStatus": "open",
                "reason": "Underpass flooded, impassable",
            },
        })

    return updated_status


def set_outage(zone_id: str, active: bool) -> dict[str, Any]:
    """
    Toggles communication outage for a specified zone.

    Signature:
        set_outage(zone_id: str, active: bool) -> dict

    Parameters:
        zone_id (str): Target zone ID (e.g. 'ZONE-B').
        active (bool): True to activate outage (comms degraded, SMS fallback),
                       False to restore normal communications.

    Returns:
        dict: The updated Zone object.

    State Mutations:
        - Updates zone commsStatus to 'degraded' or 'ok'
        - Recomputes overall system commsStatus in SystemStatus

    Events Published:
        - zone.comms_degraded (fallbackChannel: 'sms') if active is True
        - zone.comms_restored if active is False
        - status.updated if overall comms status changed

    Raises:
        ValueError: If zone_id is not found.
    """
    zone = state.set_zone_comms(zone_id, active, fallback_channel="sms", publish=True)
    if zone is None:
        raise ValueError(f"Zone {zone_id} not found")

    if active:
        from datetime import datetime, timedelta
        from ..comms import dispatch

        t0_str = clock.now()
        t0_dt = datetime.strptime(t0_str, "%Y-%m-%dT%H:%M:%S")

        # 1. Filter: only message units with an active assignment in this zone (idle units are not messaged)
        active_assignments = state.get_assignments()
        assigned_units = {
            asn["unitId"]: asn
            for asn in active_assignments
            if asn.get("status") in ("sent", "accepted", "en_route", "on_scene")
        }

        active_units_in_zone: list[str] = []
        for unit in state.get_units():
            u_id = unit["unitId"]
            u_zone = unit.get("zoneId") or (unit.get("location") or {}).get("zoneId")
            asn = assigned_units.get(u_id)
            if asn:
                asn_inc = state.get_incident(asn.get("incidentId"))
                inc_zone = (asn_inc.get("location") or {}).get("zoneId") if asn_inc else None
                # Unit has an active assignment in this zone
                if inc_zone == zone_id:
                    active_units_in_zone.append(u_id)

        # Dispatch only to active units
        for u_id in active_units_in_zone:
            dispatch(
                recipient=u_id,
                text=f"Advisory: network outage in {zone_id}. Switching channel to SMS fallback.",
                kind="crew",
                zone_id=zone_id,
                ts=t0_str,
            )

        # 2. Dispatch to open-incident reporters in this zone
        notified_sessions: set[str] = set()
        for inc in state.get_incidents():
            if inc.get("status") not in ("closed", "resolved"):
                loc = inc.get("location") or {}
                if loc.get("zoneId") == zone_id:
                    sess_id = inc.get("reporterSessionId")
                    if sess_id and sess_id not in notified_sessions:
                        notified_sessions.add(sess_id)
                        dispatch(
                            recipient=sess_id,
                            text=f"Network outage detected in your area ({zone_id}). Updates will arrive via SMS.",
                            kind="reporter",
                            zone_id=zone_id,
                            ts=t0_str,
                        )

        # 3. For active units that lost comms in this zone, trigger heartbeat_lost at T0 + 5s
        for u_id in active_units_in_zone:
            hb_ts = (t0_dt - timedelta(seconds=2)).strftime("%Y-%m-%dT%H:%M:%S")
            lost_ts = (t0_dt + timedelta(seconds=5)).strftime("%Y-%m-%dT%H:%M:%S")
            bus.publish("unit.heartbeat_lost", {
                "unitId": u_id,
                "lastHeartbeatAt": hb_ts,
            }, ts=lost_ts)

    return zone


def set_time_warp(speed: int) -> dict[str, Any]:
    """
    Sets the scenario clock time-warp speed.

    Signature:
        set_time_warp(speed: int) -> dict

    Parameters:
        speed (int): Time multiplier. Allowed values: 1, 2, 5, 10.

    Returns:
        dict: The updated SystemStatus.

    State Mutations:
        - Updates clock speed multiplier
        - Updates state.system_status.speed

    Events Published:
        - status.updated: System status reflecting new clock speed.

    Raises:
        ValueError: If speed is not in (1, 2, 5, 10).
    """
    if speed not in (1, 2, 5, 10):
        raise ValueError(f"speed must be 1, 2, 5 or 10 (got {speed})")
    clock.set_speed(speed)
    return state.update_system_status({"speed": speed}, publish=True)


def reset() -> dict[str, Any]:
    """
    Restores seed state, clears incidents, plans, approvals, and the event log,
    then publishes status.updated.

    Signature:
        reset() -> dict

    Parameters:
        None

    Returns:
        dict: The initial SystemStatus after reset.

    State Mutations:
        - Restores seed collections (units, facilities, roads, zones)
        - Clears runtime incidents, plans, approvals, assignments, comms log, decision log
        - Resets scenario clock to initial scenario time and 1x speed
        - Clears the event bus in-memory log and sequence counter

    Events Published:
        - status.updated: Emits fresh initial system status.
    """
    state.reset()
    clock.reset()
    bus.clear_log()
    updated = state.get_system_status()
    bus.publish("status.updated", {"status": updated})
    return updated
