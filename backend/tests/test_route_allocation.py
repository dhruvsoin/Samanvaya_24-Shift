"""
tests/test_route_allocation.py — Tests for RouteAgent, AllocationAgent, and engine_stub.

Verifies:
  1. RouteAgent:
     - Reacts to incident.assessed, road.status_changed, unit.status_changed.
     - Recomputes and caches ETAs.
     - Logs one agent.activity line each run.
  2. AllocationAgent:
     - When ETAs change or a new incident is assessed, calls solve() with previous plan.
     - Returns candidate plan (entries, unserved, changes) matching PLAN-001 and PLAN-002.
     - Never publishes plan.published to the event bus; hands candidate plan to Command.
     - Logs one agent.activity line each run.
  3. ENGINE_MODE:
     - Switches between stub and real engine via ENGINE_MODE environment variable.
"""
from __future__ import annotations

import asyncio
import os
from typing import Any
import pytest

from app.agents.allocation import AllocationAgent
from app.agents.engine_loader import get_engine
from app.agents.route import RouteAgent
from app.bus import bus
from app.clock import clock
from app.state import state
import engine_stub


@pytest.fixture(autouse=True)
def reset_environment():
    bus.reset()
    state.reset()
    clock.reset()
    yield
    bus.reset()
    state.reset()
    clock.reset()


# ── 1. Pure Engine Stub Tests ─────────────────────────────────────────

def test_engine_stub_pure_functions():
    """
    Tests engine_stub functions compute_etas, apply_rain, solve, and diff_plans.
    """
    incidents = [
        {"incidentId": "INC-01"},
        {"incidentId": "INC-02"},
        {"incidentId": "INC-03"},
    ]
    units = [{"unitId": "BOAT-01"}, {"unitId": "RES-02"}, {"unitId": "AMB-01"}]
    roads = state.get_roads()

    # compute_etas baseline
    etas = engine_stub.compute_etas(incidents, units, roads, rain_intensity="light")
    assert "INC-01" in etas
    assert etas["INC-01"]["BOAT-01"]["etaMinutes"] == 6
    assert etas["INC-02"]["RES-02"]["etaMinutes"] == 5
    assert etas["INC-03"]["AMB-01"]["etaMinutes"] == 4

    # Initial solve -> PLAN-001
    entries, unserved, changes = engine_stub.solve(incidents, units, etas, previous_plan=None)
    assert len(entries) == 3
    assert unserved == []
    assert len(changes) == 3
    assert all(c["change"] == "added" for c in changes)

    # Next solve with previous plan PLAN-001 -> PLAN-002
    prev_plan = {
        "planId": "PLAN-001",
        "entries": entries,
    }
    entries2, unserved2, changes2 = engine_stub.solve(incidents, units, etas, previous_plan=prev_plan)
    assert len(entries2) == 3
    assert unserved2 == []
    # In PLAN-002: INC-01 is unchanged, INC-02 and INC-03 are changed
    inc01_c = next(c for c in changes2 if c["incidentId"] == "INC-01")
    assert inc01_c["change"] == "unchanged"
    inc02_c = next(c for c in changes2 if c["incidentId"] == "INC-02")
    assert inc02_c["change"] == "changed"
    assert inc02_c["after"]["unitId"] == "RES-01"


# ── 2. RouteAgent Tests ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_route_agent_computes_etas_and_logs_activity():
    """
    RouteAgent recomputes and caches ETAs on:
      - incident.assessed
      - road.status_changed
      - unit.status_changed
    Logs one agent.activity line each run.
    """
    route_agent = RouteAgent()
    activities: list[dict] = []
    bus.subscribe("agent.activity", lambda e: activities.append(e))

    # Event 1: incident.assessed
    await route_agent.handle({
        "id": "evt_test_assessed",
        "type": "incident.assessed",
        "ts": clock.now(),
        "payload": {
            "incident": {
                "incidentId": "INC-01",
                "type": "flooded_home",
                "status": "assessed",
            }
        },
    })
    await asyncio.sleep(0.05)

    cached = route_agent.get_cached_etas()
    assert "INC-01" in cached
    assert cached["INC-01"]["BOAT-01"]["etaMinutes"] == 6

    route_acts = [a for a in activities if a["payload"]["agent"] == "route"]
    assert len(route_acts) == 1
    assert "ETAs computed" in route_acts[0]["payload"]["message"]
    assert "light rain" in route_acts[0]["payload"]["message"]

    # Event 2: road.status_changed for underpass
    await route_agent.handle({
        "id": "evt_test_road",
        "type": "road.status_changed",
        "ts": clock.now(),
        "payload": {
            "roadId": "ROAD-04",
            "status": "closed",
            "previousStatus": "open",
            "reason": "Water surged",
        },
    })
    await asyncio.sleep(0.05)

    route_acts = [a for a in activities if a["payload"]["agent"] == "route"]
    assert len(route_acts) == 2
    assert "Hosur Rd underpass now impassable; 2 ETAs updated." in route_acts[1]["payload"]["message"]


# ── 3. AllocationAgent Tests ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_allocation_agent_solves_and_hands_to_command():
    """
    AllocationAgent produces candidate plan:
      - Never publishes plan.published to bus!
      - Hands candidate plan to Command.
      - Logs one agent.activity line each run.
    """
    candidate_plans: list[dict] = []
    allocation_agent = AllocationAgent(
        on_candidate_plan=lambda plan: candidate_plans.append(plan)
    )

    published_plans: list[dict] = []
    activities: list[dict] = []
    bus.subscribe("plan.published", lambda e: published_plans.append(e))
    bus.subscribe("agent.activity", lambda e: activities.append(e))

    # Trigger initial allocation
    await allocation_agent.handle({
        "id": "evt_test_alloc",
        "type": "incident.assessed",
        "ts": clock.now(),
        "payload": {"incident": {"incidentId": "INC-01"}},
    })
    await asyncio.sleep(0.05)

    # 1. Candidate plan was produced and handed to callback
    assert len(candidate_plans) == 1
    cand = candidate_plans[0]
    assert len(cand["entries"]) == 3
    assert cand["entries"][0]["incidentId"] == "INC-01"
    assert cand["entries"][0]["unitId"] == "BOAT-01"
    assert cand["unserved"] == []
    assert len(cand["changes"]) == 3
    assert cand["changes"][0]["change"] == "added"

    # Also available via get_candidate_plan()
    assert allocation_agent.get_candidate_plan() == cand

    # 2. MUST NOT publish plan.published to the bus!
    assert len(published_plans) == 0, "Allocation must not publish plan to bus"

    # 3. Logged activity
    alloc_acts = [a for a in activities if a["payload"]["agent"] == "allocation"]
    assert len(alloc_acts) == 1
    assert "Solver assigned 3 of 3 incidents. No unserved incidents." in alloc_acts[0]["payload"]["message"]


@pytest.mark.asyncio
async def test_allocation_reallocates_on_etas_changed_with_previous_plan():
    """
    When ETAs change with PLAN-001 active:
      - Produces candidate plan matching PLAN-002 (RES-01 replaces cut-off RES-02).
      - Logs activity line explaining replacement.
    """
    # Set current plan in state to PLAN-001
    state.publish_plan({
        "planId": "PLAN-001",
        "version": 1,
        "previousPlanId": None,
        "trigger": "Initial plan",
        "publishedAt": clock.now(),
        "entries": engine_stub.PLAN_001_ENTRIES,
        "unserved": [],
        "changes": engine_stub.PLAN_001_CHANGES,
        "pendingApprovalIds": [],
    }, publish=False)

    activities: list[dict] = []
    bus.subscribe("agent.activity", lambda e: activities.append(e))

    route_agent = RouteAgent()
    allocation_agent = AllocationAgent(route_agent=route_agent)

    # Trigger road change on underpass -> route recomputes and calls allocation.on_etas_changed
    await route_agent.handle({
        "id": "evt_test_underpass",
        "type": "road.status_changed",
        "ts": clock.now(),
        "payload": {
            "roadId": "ROAD-04",
            "status": "closed",
        },
    })
    await asyncio.sleep(0.05)

    cand = allocation_agent.get_candidate_plan()
    assert cand is not None
    # Entries should match PLAN-002
    res_entry = next(e for e in cand["entries"] if e["incidentId"] == "INC-02")
    assert res_entry["unitId"] == "RES-01"
    assert res_entry["etaMinutes"] == 9

    # Changes should indicate RES-02 replaced
    inc02_change = next(c for c in cand["changes"] if c["incidentId"] == "INC-02")
    assert inc02_change["change"] == "changed"
    assert inc02_change["before"]["unitId"] == "RES-02"
    assert inc02_change["after"]["unitId"] == "RES-01"

    # Activity line logged
    alloc_acts = [a for a in activities if a["payload"]["agent"] == "allocation"]
    assert len(alloc_acts) >= 1
    msg = alloc_acts[-1]["payload"]["message"]
    assert "RES-02 is cut off from INC-02. Best replacement is RES-01 from the depot." in msg


# ── 4. ENGINE_MODE Switching Test ────────────────────────────────────

def test_engine_mode_switch():
    """
    Verifies that get_engine respects ENGINE_MODE env var.
    """
    os.environ["ENGINE_MODE"] = "stub"
    eng = get_engine()
    assert eng is not None
    assert hasattr(eng, "compute_etas")
    assert hasattr(eng, "solve")

    # In case ENGINE_MODE=real with no engine module, it safely falls back to stub
    os.environ["ENGINE_MODE"] = "real"
    eng2 = get_engine()
    assert eng2 is not None
    assert hasattr(eng2, "compute_etas")

    # Reset
    os.environ["ENGINE_MODE"] = "stub"
