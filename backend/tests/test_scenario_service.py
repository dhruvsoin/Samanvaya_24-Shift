"""
tests/test_scenario_service.py — Unit and integration tests for app.services.scenario.

Tests:
  1. inject_incident(request):
     - Works with InjectIncidentRequest and plain dict
     - Allocates INC-xx ID, status 'reported', confidence 1.0
     - Emits incident.reported and agent.activity (intake)
     - Validates zone existence (raises ValueError for unknown zone)
  2. set_unit_offline(unit_id):
     - Mutates unit status to 'offline' in state store
     - Emits unit.unavailable event (reason: 'operator')
     - Raises ValueError for unknown unit ID
  3. rain_surge(intensity):
     - Updates rain status and emits status.updated
     - Light/moderate rain does not alter roads or trigger route agent
     - Heavy/extreme rain closes ROAD-04, slows ROAD-05, produces road.status_changed events,
       and runs RouteAgent (caching ETAs and emitting agent.activity)
  4. set_outage(zone_id, active):
     - Active=True sets zone comms to degraded and emits zone.comms_degraded (fallbackChannel: sms)
     - Active=False restores zone comms to ok and emits zone.comms_restored
     - Recomputes overall comms status and raises ValueError on invalid zone
  5. set_time_warp(speed):
     - Allowed speeds (1, 2, 5, 10) update clock and state, and emit status.updated
     - Disallowed speeds raise ValueError
  6. reset():
     - Restores seed state (units, facilities, roads, zones)
     - Clears runtime incidents, plans, approvals, and event log
     - Publishes status.updated
"""
import pytest

from app.agents.route import RouteAgent
from app.bus import bus
from app.clock import clock
from app.models import InjectIncidentRequest
from app.services import scenario as scenario_service
from app.state import state


@pytest.fixture(autouse=True)
def clean_environment():
    """Reset state, clock, and bus before and after each test."""
    bus.reset()
    state.reset()
    clock.reset()
    yield
    bus.reset()
    state.reset()
    clock.reset()


# ── 1. inject_incident Tests ─────────────────────────────────────────────

def test_inject_incident_with_pydantic_model():
    """inject_incident accepts InjectIncidentRequest and mutates state with proper events."""
    events: list[dict] = []
    bus.subscribe(["incident.reported", "agent.activity"], lambda e: events.append(e))

    req = InjectIncidentRequest(
        type="flooded_home",
        zone_id="ZONE-A",
        people_affected=4,
        lat=12.934,
        lng=77.615,
        language="en",
    )
    result = scenario_service.inject_incident(req)

    assert result["incidentId"].startswith("INC-")
    assert result["type"] == "flooded_home"
    assert result["status"] == "reported"
    assert result["peopleAffected"] == 4
    assert result["location"]["zoneId"] == "ZONE-A"
    assert result["location"]["lat"] == 12.934
    assert result["location"]["lng"] == 77.615
    assert result["confidence"] == 1.0
    assert result["source"] == "scenario"

    # Verify state mutation
    stored = state.get_incident(result["incidentId"])
    assert stored is not None
    assert stored["type"] == "flooded_home"

    # Verify events
    rep_evts = [e for e in events if e["type"] == "incident.reported"]
    act_evts = [e for e in events if e["type"] == "agent.activity"]
    assert len(rep_evts) == 1
    assert rep_evts[0]["payload"]["incident"]["incidentId"] == result["incidentId"]

    assert len(act_evts) == 1
    assert act_evts[0]["payload"]["agent"] == "intake"
    assert "Scenario panel injected flooded_home in ZONE-A" in act_evts[0]["payload"]["message"]


def test_inject_incident_with_dict():
    """inject_incident accepts plain dictionary input."""
    req_dict = {
        "type": "medical",
        "zoneId": "ZONE-B",
        "peopleAffected": 2,
    }
    result = scenario_service.inject_incident(req_dict)

    assert result["incidentId"].startswith("INC-")
    assert result["type"] == "medical"
    assert result["location"]["zoneId"] == "ZONE-B"
    assert result["peopleAffected"] == 2
    assert state.get_incident(result["incidentId"]) is not None


def test_inject_incident_unknown_zone_raises_value_error():
    """inject_incident raises ValueError if the zone does not exist."""
    req = InjectIncidentRequest(
        type="medical",
        zone_id="ZONE-NONEXISTENT",
        people_affected=1,
    )
    with pytest.raises(ValueError, match="Zone ZONE-NONEXISTENT not found"):
        scenario_service.inject_incident(req)


# ── 2. set_unit_offline Tests ────────────────────────────────────────────

def test_set_unit_offline_success():
    """set_unit_offline updates unit status to offline and emits unit.unavailable."""
    events: list[dict] = []
    bus.subscribe("unit.unavailable", lambda e: events.append(e))

    initial_unit = state.get_unit("AMB-01")
    assert initial_unit["status"] != "offline"

    updated = scenario_service.set_unit_offline("AMB-01")
    assert updated["status"] == "offline"

    stored = state.get_unit("AMB-01")
    assert stored["status"] == "offline"

    assert len(events) == 1
    assert events[0]["payload"]["unitId"] == "AMB-01"
    assert events[0]["payload"]["reason"] == "operator"


def test_set_unit_offline_unknown_unit_raises_value_error():
    """set_unit_offline raises ValueError for non-existent unit."""
    with pytest.raises(ValueError, match="Unit UNKNOWN-99 not found"):
        scenario_service.set_unit_offline("UNKNOWN-99")


# ── 3. rain_surge Tests ──────────────────────────────────────────────────

def test_rain_surge_light_does_not_affect_roads():
    """Moderate or light rain updates SystemStatus without closing roads."""
    events: list[dict] = []
    bus.subscribe(["status.updated", "road.status_changed"], lambda e: events.append(e))

    status = scenario_service.rain_surge("light")
    assert status["rain"]["intensity"] == "light"
    assert status["rain"]["mmPerHour"] == 4.0

    # Roads should remain open
    assert state.get_road("ROAD-04")["status"] == "open"
    assert state.get_road("ROAD-05")["status"] == "open"

    status_evts = [e for e in events if e["type"] == "status.updated"]
    road_evts = [e for e in events if e["type"] == "road.status_changed"]
    assert len(status_evts) == 1
    assert len(road_evts) == 0


def test_rain_surge_heavy_closes_road04_slows_road05_and_runs_route_agent():
    """
    rain_surge with 'heavy' mutates state for ROAD-04 and ROAD-05,
    produces road.status_changed events, and runs RouteAgent.
    """
    events: list[dict] = []
    bus.subscribe(["status.updated", "road.status_changed", "agent.activity"], lambda e: events.append(e))

    route_agent = RouteAgent()
    status = scenario_service.rain_surge("heavy", route_agent=route_agent)

    # 1. SystemStatus updated
    assert status["rain"]["intensity"] == "heavy"
    assert status["rain"]["mmPerHour"] == 22.0

    # 2. State mutations for roads
    road_4 = state.get_road("ROAD-04")
    road_5 = state.get_road("ROAD-05")
    assert road_4["status"] == "closed"
    assert road_5["status"] == "slow"

    # 3. Events produced
    road_evts = [e for e in events if e["type"] == "road.status_changed"]
    assert len(road_evts) == 2
    r4_evt = next(e for e in road_evts if e["payload"]["roadId"] == "ROAD-04")
    r5_evt = next(e for e in road_evts if e["payload"]["roadId"] == "ROAD-05")
    assert r4_evt["payload"]["status"] == "closed"
    assert "impassable" in r4_evt["payload"]["reason"].lower()
    assert r5_evt["payload"]["status"] == "slow"

    # 4. RouteAgent executed: cached ETAs and logged activity
    cached_etas = route_agent.get_cached_etas()
    assert len(cached_etas) > 0

    route_acts = [e for e in events if e["type"] == "agent.activity" and e["payload"]["agent"] == "route"]
    assert len(route_acts) >= 1
    assert "Hosur Rd underpass now impassable; 2 ETAs updated." in route_acts[0]["payload"]["message"]


def test_rain_surge_extreme_runs_route_agent_without_explicit_instance():
    """rain_surge with 'extreme' runs RouteAgent even if no instance is passed."""
    events: list[dict] = []
    bus.subscribe(["road.status_changed", "agent.activity"], lambda e: events.append(e))

    status = scenario_service.rain_surge("extreme")
    assert status["rain"]["intensity"] == "extreme"
    assert status["rain"]["mmPerHour"] == 40.0

    assert state.get_road("ROAD-04")["status"] == "closed"
    assert state.get_road("ROAD-05")["status"] == "slow"

    route_acts = [e for e in events if e["type"] == "agent.activity" and e["payload"]["agent"] == "route"]
    assert len(route_acts) >= 1
    assert "Hosur Rd underpass now impassable" in route_acts[0]["payload"]["message"]


# ── 4. set_outage Tests ──────────────────────────────────────────────────

def test_set_outage_active_and_restore():
    """set_outage toggles comms degraded and restored, updating overall system status."""
    events: list[dict] = []
    bus.subscribe(["zone.comms_degraded", "zone.comms_restored", "status.updated"], lambda e: events.append(e))

    # Activate outage
    zone_deg = scenario_service.set_outage("ZONE-B", active=True)
    assert zone_deg["commsStatus"] == "degraded"
    assert state.get_zone("ZONE-B")["commsStatus"] == "degraded"
    assert state.get_system_status()["commsOverall"] == "degraded"

    deg_evts = [e for e in events if e["type"] == "zone.comms_degraded"]
    assert len(deg_evts) == 1
    assert deg_evts[0]["payload"]["zoneId"] == "ZONE-B"
    assert deg_evts[0]["payload"]["fallbackChannel"] == "sms"

    # Restore outage
    zone_res = scenario_service.set_outage("ZONE-B", active=False)
    assert zone_res["commsStatus"] == "ok"
    assert state.get_zone("ZONE-B")["commsStatus"] == "ok"
    assert state.get_system_status()["commsOverall"] == "ok"

    res_evts = [e for e in events if e["type"] == "zone.comms_restored"]
    assert len(res_evts) == 1
    assert res_evts[0]["payload"]["zoneId"] == "ZONE-B"


def test_set_outage_unknown_zone_raises_value_error():
    """set_outage raises ValueError if zone is unknown."""
    with pytest.raises(ValueError, match="Zone ZONE-UNKNOWN not found"):
        scenario_service.set_outage("ZONE-UNKNOWN", active=True)


# ── 5. set_time_warp Tests ───────────────────────────────────────────────

def test_set_time_warp_allowed_speeds():
    """set_time_warp succeeds for speeds 1, 2, 5, 10."""
    events: list[dict] = []
    unsub = bus.subscribe("status.updated", lambda e: events.append(e))
    try:
        for speed in (1, 2, 5, 10):
            events.clear()
            status = scenario_service.set_time_warp(speed)
            assert status["speed"] == speed
            assert clock.speed == speed
            assert state.get_system_status()["speed"] == speed

            assert len(events) == 1
            assert events[0]["payload"]["status"]["speed"] == speed
    finally:
        unsub()


def test_set_time_warp_invalid_speed_raises_value_error():
    """set_time_warp raises ValueError for invalid speed values."""
    for bad_speed in (0, 3, 4, 7, 20):
        with pytest.raises(ValueError, match="speed must be 1, 2, 5 or 10"):
            scenario_service.set_time_warp(bad_speed)


# ── 6. reset Tests ───────────────────────────────────────────────────────

def test_reset_restores_seed_and_clears_incidents_plans_approvals_and_log():
    """
    reset() restores seed state, clears incidents, plans, approvals,
    resets clock and bus log, and emits status.updated.
    """
    # 1. Dirty the state: create incident, approval, plan, change unit, warp time
    scenario_service.inject_incident({
        "type": "medical",
        "zoneId": "ZONE-A",
        "peopleAffected": 3,
    })
    state.request_approval({
        "approvalId": "APR-999",
        "status": "pending",
        "planId": "PLAN-999",
    })
    scenario_service.set_unit_offline("AMB-01")
    scenario_service.set_time_warp(5)

    assert len(state.get_incidents()) > 0
    assert len(state.get_approvals()) > 0
    assert state.get_unit("AMB-01")["status"] == "offline"
    assert clock.speed == 5

    # Event log has several events
    assert len(bus.get_events_since(None)) > 0

    # 2. Perform reset
    res = scenario_service.reset()

    # 3. Assertions
    assert len(state.get_incidents()) == 0
    assert len(state.get_plans()) == 0
    assert len(state.get_approvals()) == 0
    assert state.get_unit("AMB-01")["status"] == "available"
    assert state.get_road("ROAD-04")["status"] == "open"
    assert state.get_road("ROAD-05")["status"] == "open"
    assert clock.speed == 1
    assert res["speed"] == 1

    # Event log should contain ONLY the fresh status.updated emitted by reset()
    log = bus.get_events_since(None)
    assert len(log) == 1
    assert log[0]["type"] == "status.updated"
    assert log[0]["payload"]["status"]["speed"] == 1
