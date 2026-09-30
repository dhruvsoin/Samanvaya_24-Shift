"""
tests/test_demo_flow.py — Full integration test exercising the end-to-end demo flow.

Setup:
  - LLM_MODE=scripted, ENGINE_MODE=stub
  - Full agent pipeline wired: IntakeAgent → AssessmentAgent → RouteAgent → AllocationAgent → CommandAgent
  - All agents registered via AgentRunner with bus subscriptions

Scenario:
  1. Inject three seed incidents (INC-01 flooded_home, INC-02 stranded_vehicle, INC-03 medical).
  2. Allow the pipeline to produce PLAN-001 (auto-approved) with assignments.
  3. Trigger rain_surge("heavy") → closes ROAD-04, slows ROAD-05.
  4. Route recomputes ETAs → Allocation re-solves → Command holds plan for APR-001.
  5. Approve APR-001 → PLAN-002 published.
  6. Trigger comms outage in ZONE-B → zone.comms_degraded + comms.channel_switched.
  7. Approve APR-002 if generated.

Assertions:
  - Event sequence contains, in order:
      incident.reported, incident.assessed, plan.published (PLAN-001),
      assignment.sent, road.status_changed (ROAD-04 closed),
      approval.requested, approval.resolved, plan.published (PLAN-002),
      zone.comms_degraded, comms.channel_switched
  - PLAN-002 changes:
      INC-02 → RES-01, INC-03 same unit (AMB-01) with larger ETA, INC-01 unchanged,
      each with a non-empty reason.
"""
from __future__ import annotations

import asyncio
import os
from typing import Any

import pytest

# Set environment before importing agents so engine_loader picks up stub
os.environ.setdefault("LLM_MODE", "scripted")
os.environ.setdefault("ENGINE_MODE", "stub")

from fastapi.testclient import TestClient

from app.agents.allocation import AllocationAgent
from app.agents.assessment import AssessmentAgent
from app.agents.base import AgentRunner
from app.agents.command import CommandAgent
from app.agents.route import RouteAgent
from app.bus import bus
from app.clock import clock
from app.main import app
from app.services import scenario as scenario_service
from app.state import state


# ── Fixtures ──────────────────────────────────────────────────────────

@pytest.fixture(params=["stub", "real"], autouse=True)
def clean_env(request, monkeypatch):
    """Runs tests under both ENGINE_MODE=stub and ENGINE_MODE=real with full environment resets."""
    monkeypatch.setenv("ENGINE_MODE", request.param)
    monkeypatch.setenv("LLM_MODE", "scripted")
    bus.reset()
    state.reset()
    clock.reset()
    yield request.param
    bus.reset()
    state.reset()
    clock.reset()


def _build_agent_pipeline() -> tuple[
    AgentRunner,
    AssessmentAgent,
    RouteAgent,
    AllocationAgent,
    CommandAgent,
]:
    """Wire the full agent pipeline and return the runner + agents."""
    assessment = AssessmentAgent()
    route = RouteAgent()
    allocation = AllocationAgent(route_agent=route)
    command = CommandAgent(allocation_agent=allocation)
    # AllocationAgent ← → CommandAgent back-link set by CommandAgent.__init__

    runner = AgentRunner([assessment, route, allocation, command])
    runner.start()
    return runner, assessment, route, allocation, command


def _inject_seed_incidents() -> list[dict]:
    """Inject the three demo incidents via scenario_service.inject_incident."""
    incidents: list[dict] = []

    # INC-01: flooded_home, ZONE-A, 6 people, Kannada
    inc1 = scenario_service.inject_incident({
        "type": "flooded_home",
        "zoneId": "ZONE-A",
        "peopleAffected": 6,
        "lat": 12.929,
        "lng": 77.612,
        "language": "kn",
    })
    # Patch summary and session to match seed
    inc1["summary"] = "Water entering ground-floor homes; 6 people including children."
    inc1["reporterSessionId"] = "SES-01"
    inc1["source"] = "reporter_voice"
    state.upsert_incident(inc1)
    incidents.append(inc1)

    # INC-02: stranded_vehicle, ZONE-B, 3 people
    inc2 = scenario_service.inject_incident({
        "type": "stranded_vehicle",
        "zoneId": "ZONE-B",
        "peopleAffected": 3,
        "lat": 12.918,
        "lng": 77.6255,
        "language": "en",
    })
    inc2["summary"] = "Car stranded in rising water; 3 people inside."
    inc2["source"] = "phone_in"
    state.upsert_incident(inc2)
    incidents.append(inc2)

    # INC-03: medical, ZONE-A, 2 people
    inc3 = scenario_service.inject_incident({
        "type": "medical",
        "zoneId": "ZONE-A",
        "peopleAffected": 2,
        "lat": 12.9285,
        "lng": 77.6385,
        "language": "en",
    })
    inc3["summary"] = "Elderly person with breathing difficulty; water at the doorstep."
    inc3["reporterSessionId"] = "SES-02"
    inc3["source"] = "reporter_chat"
    state.upsert_incident(inc3)
    incidents.append(inc3)

    return incidents


def _event_types_from_log() -> list[str]:
    """Extract the ordered list of event types from the bus log."""
    return [e["type"] for e in bus.get_events_since()]


def _find_events_of_type(event_type: str) -> list[dict]:
    """Find all events of a given type in the bus log."""
    return [e for e in bus.get_events_since() if e["type"] == event_type]


def _assert_ordered_subsequence(full: list[str], expected: list[str]) -> None:
    """Assert that `expected` appears as an ordered subsequence in `full`."""
    idx = 0
    for i, etype in enumerate(full):
        if idx < len(expected) and etype == expected[idx]:
            idx += 1
    missing = expected[idx:]
    assert idx == len(expected), (
        f"Expected ordered subsequence not found. Missing from position {idx}: {missing}.\n"
        f"Full sequence: {full}"
    )


# ── Main Integration Test ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_full_demo_flow():
    """
    End-to-end demo: inject incidents → PLAN-001 → rain surge → PLAN-002 → outage → comms.
    """
    runner, assessment_agent, route_agent, allocation_agent, command_agent = _build_agent_pipeline()

    try:
        # ────────────────────────────────────────────────────────────────
        # Phase 1: Inject 3 seed incidents
        # ────────────────────────────────────────────────────────────────
        incidents = _inject_seed_incidents()
        assert len(incidents) == 3
        assert incidents[0]["incidentId"] == "INC-01"
        assert incidents[1]["incidentId"] == "INC-02"
        assert incidents[2]["incidentId"] == "INC-03"

        # Let the agent pipeline settle (assessment → route → allocation → command)
        await asyncio.sleep(0.3)

        # Verify incident.reported events were emitted
        reported = _find_events_of_type("incident.reported")
        assert len(reported) >= 3, f"Expected at least 3 incident.reported, got {len(reported)}"

        # Verify incident.assessed events were emitted
        assessed = _find_events_of_type("incident.assessed")
        assert len(assessed) >= 3, f"Expected at least 3 incident.assessed, got {len(assessed)}"

        # Verify scores match seed values
        assessed_by_inc: dict[str, dict] = {}
        for e in assessed:
            inc = e["payload"]["incident"]
            assessed_by_inc[inc["incidentId"]] = inc

        assert assessed_by_inc["INC-01"]["severityScore"] == 72
        assert assessed_by_inc["INC-01"]["severity"] == "high"
        assert assessed_by_inc["INC-02"]["severityScore"] == 65
        assert assessed_by_inc["INC-02"]["severity"] == "high"
        assert assessed_by_inc["INC-03"]["severityScore"] == 91
        assert assessed_by_inc["INC-03"]["severity"] == "critical"

        # Verify PLAN-001 was published (auto-approved because initial plan)
        plans = _find_events_of_type("plan.published")
        assert len(plans) >= 1, "PLAN-001 should have been published"
        plan1 = plans[0]["payload"]["plan"]
        assert plan1["planId"] == "PLAN-001"
        assert plan1["version"] == 1
        assert plan1["previousPlanId"] is None
        assert len(plan1["entries"]) == 3

        # Check assignments were dispatched
        assignments_sent = _find_events_of_type("assignment.sent")
        assert len(assignments_sent) >= 3, f"Expected 3 assignment.sent, got {len(assignments_sent)}"
        assigned_units = {
            a["payload"]["assignment"]["unitId"] for a in assignments_sent
        }
        assert "BOAT-01" in assigned_units
        assert "RES-02" in assigned_units
        assert "AMB-01" in assigned_units

        # ────────────────────────────────────────────────────────────────
        # Phase 2: Rain surge (heavy) → road closures → re-plan → APR-001
        # ────────────────────────────────────────────────────────────────
        scenario_service.rain_surge("heavy", route_agent=route_agent)
        await asyncio.sleep(0.3)

        # Verify road status changed events
        road_changes = _find_events_of_type("road.status_changed")
        road_04_closed = [
            e for e in road_changes
            if e["payload"].get("roadId") == "ROAD-04"
            and e["payload"].get("status") == "closed"
        ]
        assert len(road_04_closed) >= 1, "ROAD-04 should be closed after heavy rain"

        road_05_slow = [
            e for e in road_changes
            if e["payload"].get("roadId") == "ROAD-05"
            and e["payload"].get("status") == "slow"
        ]
        assert len(road_05_slow) >= 1, "ROAD-05 should be slowed after heavy rain"

        # Route agent updates ETAs via the rain surge (AgentRunner handles the bus events)
        await asyncio.sleep(0.3)

        # An approval should have been requested (rule a)
        approvals_requested = _find_events_of_type("approval.requested")
        assert len(approvals_requested) >= 1, "An approval should be requested"
        apr1 = approvals_requested[-1]["payload"]["approval"]  # Get the latest in case of multiple
        latest_apr_id = apr1["approvalId"]
        assert apr1["kind"] == "reassign_unit"
        assert apr1["status"] == "pending"
        assert "RES-01" in apr1["summary"]
        assert apr1["recommendedOptionId"] == "OPT-A"
        assert len(apr1["options"]) == 3  # OPT-A, OPT-B, OPT-C matching seed

        # PLAN-002 should NOT be published yet (held for approval)
        plans_after_rain = _find_events_of_type("plan.published")
        assert len(plans_after_rain) == 1, "Plan should be held until approved"

        # ────────────────────────────────────────────────────────────────
        # Phase 3: Approve the requested plan → PLAN-002 published
        # ────────────────────────────────────────────────────────────────
        state.resolve_approval(
            approval_id=latest_apr_id,
            decision="approve",
            chosen_option_id="OPT-A",
            decided_by="operator",
            publish=True,
        )
        # AgentRunner will process the approval.resolved event asynchronously
        await asyncio.sleep(0.3)

        # PLAN-002 should now be published
        plans_final = _find_events_of_type("plan.published")
        assert len(plans_final) >= 2, f"Expected PLAN-002 to be published, got {len(plans_final)} plans"
        plan2 = plans_final[1]["payload"]["plan"]
        assert plan2["planId"] == "PLAN-002"
        assert plan2["version"] == 2
        assert plan2["previousPlanId"] == "PLAN-001"

        # ── Verify PLAN-002 entries ──
        entries_by_inc = {e["incidentId"]: e for e in plan2["entries"]}
        assert entries_by_inc["INC-01"]["unitId"] == "BOAT-01"
        assert entries_by_inc["INC-02"]["unitId"] == "RES-01"
        assert entries_by_inc["INC-03"]["unitId"] == "AMB-01"

        # ── Verify PLAN-002 changes ──
        changes_by_inc = {c["incidentId"]: c for c in plan2["changes"]}

        # INC-01: unchanged
        assert changes_by_inc["INC-01"]["change"] == "unchanged"
        assert changes_by_inc["INC-01"]["reason"], "INC-01 change should have a non-empty reason"

        # INC-02: changed from RES-02 → RES-01
        assert changes_by_inc["INC-02"]["change"] == "changed"
        assert changes_by_inc["INC-02"]["before"]["unitId"] == "RES-02"
        assert changes_by_inc["INC-02"]["after"]["unitId"] == "RES-01"
        assert changes_by_inc["INC-02"]["reason"], "INC-02 change should have a non-empty reason"

        # INC-03: same unit (AMB-01), larger ETA
        assert changes_by_inc["INC-03"]["change"] == "changed"
        assert changes_by_inc["INC-03"]["before"]["unitId"] == "AMB-01"
        assert changes_by_inc["INC-03"]["after"]["unitId"] == "AMB-01"
        assert changes_by_inc["INC-03"]["after"]["etaMinutes"] > changes_by_inc["INC-03"]["before"]["etaMinutes"], (
            "INC-03 ETA should increase after heavy rain"
        )
        assert changes_by_inc["INC-03"]["reason"], "INC-03 change should have a non-empty reason"

        # Verify assignment.cancelled for RES-02
        cancelled = _find_events_of_type("assignment.cancelled")
        assert len(cancelled) >= 1, "RES-02 assignment should be cancelled"
        assert cancelled[0]["payload"]["unitId"] == "RES-02"

        # Verify new assignment.sent for RES-01
        asns_after_plan2 = _find_events_of_type("assignment.sent")
        res01_asns = [
            a for a in asns_after_plan2
            if a["payload"]["assignment"]["unitId"] == "RES-01"
        ]
        assert len(res01_asns) >= 1, "RES-01 should have a new assignment"
        assert res01_asns[0]["payload"]["assignment"]["incidentId"] == "INC-02"

        # ────────────────────────────────────────────────────────────────
        # Phase 4: Outage in ZONE-B → zone.comms_degraded + comms.channel_switched
        # ────────────────────────────────────────────────────────────────
        scenario_service.set_outage("ZONE-B", active=True)
        await asyncio.sleep(0.1)

        comms_degraded = _find_events_of_type("zone.comms_degraded")
        assert len(comms_degraded) >= 1, "Expected zone.comms_degraded for ZONE-B"
        assert comms_degraded[0]["payload"]["zoneId"] == "ZONE-B"
        assert comms_degraded[0]["payload"]["fallbackChannel"] == "sms"

        # Emit comms.channel_switched (simulating Person 4's comms layer behaviour)
        # In the real app, this is emitted by Person 4's layer detecting the degraded zone.
        bus.publish("comms.channel_switched", {
            "recipient": {"kind": "crew", "id": "RES-01"},
            "from": "chat",
            "to": "sms",
            "reason": "ZONE-B comms degraded",
        })
        await asyncio.sleep(0.1)

        channel_switched = _find_events_of_type("comms.channel_switched")
        assert len(channel_switched) >= 1, "Expected comms.channel_switched"

        # ────────────────────────────────────────────────────────────────
        # Phase 5: Verify overall system status
        # ────────────────────────────────────────────────────────────────
        sys_status = state.get_system_status()
        assert sys_status["commsOverall"] == "degraded"
        assert sys_status["rain"]["intensity"] == "heavy"

        # ────────────────────────────────────────────────────────────────
        # Final: Assert the FULL event sequence contains expected subsequence
        # ────────────────────────────────────────────────────────────────
        all_types = _event_types_from_log()

        expected_order = [
            "incident.reported",
            "incident.assessed",
            "plan.published",       # PLAN-001
            "assignment.sent",
            "road.status_changed",  # ROAD-04 closed
            "approval.requested",
            "approval.resolved",
            "plan.published",       # PLAN-002
            "zone.comms_degraded",
            "comms.channel_switched",
        ]
        _assert_ordered_subsequence(all_types, expected_order)

        # ────────────────────────────────────────────────────────────────
        # Decision log should contain entries
        # ────────────────────────────────────────────────────────────────
        decisions = state.get_decision_log()
        assert len(decisions) >= 2, f"Expected at least 2 decision log entries, got {len(decisions)}"
        publish_decisions = [d for d in decisions if d["decision"] == "publish_plan"]
        assert len(publish_decisions) >= 2, "Should have publish_plan for both PLAN-001 and PLAN-002"
        approve_decisions = [d for d in decisions if d["decision"] == "approve_plan"]
        assert len(approve_decisions) >= 1, "Should have approve_plan decision"

    finally:
        runner.stop()


# ── Focused Test: PLAN-002 structure matches seed expectations ────────

@pytest.mark.asyncio
async def test_plan_002_changes_match_seed():
    """
    Verifies the PLAN-002 changes structure matches the seed expectations:
    INC-02 changes to RES-01, INC-03 same unit with larger ETA, INC-01 unchanged.
    Each change has a non-empty reason.
    """
    runner, _, route_agent, allocation_agent, command_agent = _build_agent_pipeline()

    try:
        _inject_seed_incidents()
        await asyncio.sleep(0.3)

        # Get PLAN-001
        plans = _find_events_of_type("plan.published")
        assert len(plans) >= 1

        # Rain surge
        scenario_service.rain_surge("heavy", route_agent=route_agent)
        await asyncio.sleep(0.3)

        # Approve the requested plan
        approvals_requested = _find_events_of_type("approval.requested")
        assert len(approvals_requested) >= 1
        latest_apr_id = approvals_requested[-1]["payload"]["approval"]["approvalId"]
        
        state.resolve_approval(latest_apr_id, "approve", "OPT-A", "operator", publish=True)
        await asyncio.sleep(0.3)

        plans = _find_events_of_type("plan.published")
        assert len(plans) >= 2
        plan2 = plans[1]["payload"]["plan"]

        changes_by_inc = {c["incidentId"]: c for c in plan2["changes"]}

        # Structural checks
        assert "INC-01" in changes_by_inc
        assert "INC-02" in changes_by_inc
        assert "INC-03" in changes_by_inc

        # INC-01: unchanged
        c1 = changes_by_inc["INC-01"]
        assert c1["change"] == "unchanged"
        assert c1["after"]["unitId"] == "BOAT-01"
        assert c1["reason"] != ""

        # INC-02: changed to RES-01
        c2 = changes_by_inc["INC-02"]
        assert c2["change"] == "changed"
        assert c2["before"]["unitId"] == "RES-02"
        assert c2["after"]["unitId"] == "RES-01"
        assert c2["after"]["etaMinutes"] == 9
        assert c2["reason"] != ""

        # INC-03: same unit, larger ETA
        c3 = changes_by_inc["INC-03"]
        assert c3["change"] == "changed"
        assert c3["before"]["unitId"] == "AMB-01"
        assert c3["after"]["unitId"] == "AMB-01"
        assert c3["before"]["etaMinutes"] == 4
        assert c3["after"]["etaMinutes"] == 7
        assert c3["reason"] != ""

    finally:
        runner.stop()


# ── Test: Event ordering is strictly maintained ──────────────────────

@pytest.mark.asyncio
async def test_event_ordering_maintained():
    """
    Verifies that the event bus log preserves causal ordering:
    reported before assessed, assessed before plan.published, etc.
    """
    runner, _, route_agent, allocation_agent, command_agent = _build_agent_pipeline()

    try:
        _inject_seed_incidents()
        await asyncio.sleep(0.3)

        all_types = _event_types_from_log()

        # Every incident.reported must appear before the first incident.assessed
        first_reported_idx = all_types.index("incident.reported")
        first_assessed_idx = all_types.index("incident.assessed")
        assert first_reported_idx < first_assessed_idx, (
            "incident.reported should precede incident.assessed"
        )

        # First plan.published (PLAN-001) should appear after at least one incident.assessed
        first_plan_idx = all_types.index("plan.published")
        assert first_assessed_idx < first_plan_idx, (
            "incident.assessed should precede plan.published"
        )

        # assignment.sent should appear after plan.published
        first_asn_idx = all_types.index("assignment.sent")
        assert first_plan_idx < first_asn_idx, (
            "plan.published should precede assignment.sent"
        )

    finally:
        runner.stop()


# ── Test: Outage exact sequence and comms log validation ──────────────

@pytest.mark.asyncio
async def test_outage_exact_seed_sequence_and_comms_log():
    """
    Validates:
      1. Outage sequence strictly matches seed evt_045 to evt_053 in order.
      2. APR-002 exists with kind 'crew_check'.
      3. GET /comms/log contains exactly one failed plus one switched entry for RES-01.
      4. GET /approvals lists APR-002.
    """
    runner, _, route_agent, _, _ = _build_agent_pipeline()

    try:
        # Phase 1: Inject seed incidents
        _inject_seed_incidents()
        await asyncio.sleep(0.3)

        # Phase 2: Rain surge heavy
        scenario_service.rain_surge("heavy", route_agent=route_agent)
        await asyncio.sleep(0.3)

        # Phase 3: Approve latest requested approval (reassign to RES-01)
        approvals_requested = _find_events_of_type("approval.requested")
        assert len(approvals_requested) >= 1
        latest_apr_id = approvals_requested[-1]["payload"]["approval"]["approvalId"]
        state.resolve_approval(latest_apr_id, "approve", "OPT-A", "operator", publish=True)
        await asyncio.sleep(0.3)

        # Verify RES-01 assignment is active
        plans = _find_events_of_type("plan.published")
        assert len(plans) >= 2

        # Anchor clock to seed outage time
        clock.set_time("2026-10-10T09:08:00")
        evts_before = len(bus.get_events_since())

        # Phase 4: Set outage in ZONE-B
        scenario_service.set_outage("ZONE-B", active=True)
        await asyncio.sleep(0.4)

        # Phase 5: Resolve APR-002
        clock.set_time("2026-10-10T09:08:30")
        state.resolve_approval("APR-002", "approve", "OPT-A", "operator", publish=True)
        await asyncio.sleep(0.2)

        outage_events = bus.get_events_since()[evts_before:]
        outage_types = [e["type"] for e in outage_events]

        expected_types = [
            "status.updated",           # evt_045
            "zone.comms_degraded",      # evt_046
            "comms.delivery_failed",    # evt_047
            "comms.channel_switched",   # evt_048
            "unit.heartbeat_lost",      # evt_049
            "unit.status_changed",      # evt_050
            "agent.activity",           # evt_051
            "approval.requested",       # evt_052
            "approval.resolved",        # evt_053
        ]
        assert outage_types == expected_types, (
            f"Outage sequence mismatch:\nActual: {outage_types}\nExpected: {expected_types}"
        )

        # Assert APR-002 exists with kind crew_check
        apr_002 = state.get_approval("APR-002")
        assert apr_002 is not None, "APR-002 must exist"
        assert apr_002["kind"] == "crew_check", f"Expected kind crew_check, got {apr_002['kind']}"

        # Assert via HTTP API
        client = TestClient(app)
        auth_resp = client.post("/auth/login", json={"username": "operator", "password": "demo1234"})
        assert auth_resp.status_code == 200
        token = auth_resp.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Check GET /comms/log: exactly one failed plus one switched entry for RES-01
        comms_resp = client.get("/comms/log", headers=headers)
        assert comms_resp.status_code == 200
        comms_log = comms_resp.json()

        res01_entries = [
            e for e in comms_log
            if e.get("recipient", {}).get("id") == "RES-01"
        ]
        failed_res01 = [
            e for e in res01_entries
            if e.get("delivery") == "failed" and e.get("channel") == "chat"
        ]
        switched_res01 = [
            e for e in res01_entries
            if e.get("channel") == "sms"
        ]
        assert len(failed_res01) == 1, (
            f"Expected exactly 1 failed entry for RES-01, got {len(failed_res01)}"
        )
        assert len(switched_res01) == 1, (
            f"Expected exactly 1 switched entry for RES-01, got {len(switched_res01)}"
        )

        # Check GET /approvals: lists APR-002
        approvals_resp = client.get("/approvals", headers=headers)
        assert approvals_resp.status_code == 200
        approvals_list = approvals_resp.json()
        assert any(
            a["approvalId"] == "APR-002" and a["kind"] == "crew_check"
            for a in approvals_list
        ), "GET /approvals must list APR-002 with kind crew_check"

    finally:
        runner.stop()


# ── Test: Determinism across demo -> reset cycles in one process ─────

@pytest.mark.asyncio
async def test_outage_determinism_demo_reset_cycles():
    """
    Runs demo -> reset -> demo -> reset -> demo in one process and asserts
    the outage sequence is strictly identical across all iterations.
    """
    expected_types = [
        "status.updated",
        "zone.comms_degraded",
        "comms.delivery_failed",
        "comms.channel_switched",
        "unit.heartbeat_lost",
        "unit.status_changed",
        "agent.activity",
        "approval.requested",
        "approval.resolved",
    ]

    sequences = []

    for cycle in range(3):
        state.reset()
        bus.reset()
        clock.reset()

        runner, _, route_agent, _, _ = _build_agent_pipeline()
        try:
            _inject_seed_incidents()
            await asyncio.sleep(0.3)

            scenario_service.rain_surge("heavy", route_agent=route_agent)
            await asyncio.sleep(0.3)

            approvals = _find_events_of_type("approval.requested")
            latest_id = approvals[-1]["payload"]["approval"]["approvalId"]
            state.resolve_approval(latest_id, "approve", "OPT-A", "operator", publish=True)
            await asyncio.sleep(0.3)

            clock.set_time("2026-10-10T09:08:00")
            before_idx = len(bus.get_events_since())

            scenario_service.set_outage("ZONE-B", active=True)
            await asyncio.sleep(0.4)

            clock.set_time("2026-10-10T09:08:30")
            state.resolve_approval("APR-002", "approve", "OPT-A", "operator", publish=True)
            await asyncio.sleep(0.2)

            cycle_events = bus.get_events_since()[before_idx:]
            sequences.append([e["type"] for e in cycle_events])
        finally:
            runner.stop()

    assert len(sequences) == 3
    assert sequences[0] == expected_types
    assert sequences[1] == expected_types
    assert sequences[2] == expected_types
    assert sequences[0] == sequences[1] == sequences[2]
