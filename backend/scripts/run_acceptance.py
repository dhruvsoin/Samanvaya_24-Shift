"""
Acceptance verification script for Samanvaya Engine (ENGINE_MODE=real, LLM_MODE=scripted).
Executes:
1. Demo flow with real engine:
   - Injects 3 seed incidents -> prints PLAN-001 assignments and ETAs
   - Triggers rain surge heavy -> approves APR-001 -> prints PLAN-002 assignments, ETAs, and reasons
2. Determinism test:
   - Runs demo -> reset -> demo -> reset -> demo and compares outputs
"""
import os
import sys
import json
import asyncio

# Set environment before any app imports
os.environ["ENGINE_MODE"] = "real"
os.environ["LLM_MODE"] = "scripted"

from pathlib import Path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.bus import bus
from app.clock import clock
from app.state import state
from app.services import scenario as scenario_service
from app.agents.base import AgentRunner
from app.agents.assessment import AssessmentAgent
from app.agents.route import RouteAgent
from app.agents.allocation import AllocationAgent
from app.agents.command import CommandAgent


def reset_all():
    bus.reset()
    state.reset()
    clock.reset()


async def run_single_demo():
    reset_all()

    assessment = AssessmentAgent()
    route = RouteAgent()
    allocation = AllocationAgent(route_agent=route)
    command = CommandAgent(allocation_agent=allocation)

    runner = AgentRunner([assessment, route, allocation, command])
    runner.start()

    try:
        # Phase 1: Inject 3 seed incidents
        inc1 = scenario_service.inject_incident({
            "type": "flooded_home",
            "zoneId": "ZONE-A",
            "peopleAffected": 6,
            "lat": 12.929,
            "lng": 77.612,
            "language": "kn",
        })
        inc1["summary"] = "Water entering ground-floor homes; 6 people including children."
        inc1["reporterSessionId"] = "SES-01"
        inc1["source"] = "reporter_voice"
        state.upsert_incident(inc1)

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

        # Allow pipeline to settle for PLAN-001
        for _ in range(25):
            await asyncio.sleep(0.05)
            plans = [e for e in bus.get_events_since() if e["type"] == "plan.published"]
            if plans:
                break

        plan1 = plans[0]["payload"]["plan"] if plans else None
        assert plan1 is not None, "PLAN-001 was not published"

        # Phase 2: Rain surge heavy
        scenario_service.rain_surge("heavy", route_agent=route)
        for _ in range(30):
            await asyncio.sleep(0.05)
            reqs = [e for e in bus.get_events_since() if e["type"] == "approval.requested"]
            if reqs:
                break

        assert reqs, "No approval.requested event found"
        latest_apr_id = reqs[-1]["payload"]["approval"]["approvalId"]

        # Approve APR-001
        state.resolve_approval(latest_apr_id, "approve", "OPT-A", "operator", publish=True)
        for _ in range(30):
            await asyncio.sleep(0.05)
            plans = [e for e in bus.get_events_since() if e["type"] == "plan.published"]
            if len(plans) >= 2:
                break

        assert len(plans) >= 2, "PLAN-002 was not published"
        plan2 = plans[1]["payload"]["plan"]

        return plan1, plan2

    finally:
        runner.stop()


async def main():
    print("=== ACCEPTANCE RUN: Samanvaya Real Engine ===")
    print(f"ENGINE_MODE = {os.environ.get('ENGINE_MODE')}")
    print(f"LLM_MODE = {os.environ.get('LLM_MODE')}\n")

    plan1, plan2 = await run_single_demo()

    print("--- PLAN-001: Initial Dispatch ---")
    print(f"Plan ID: {plan1['planId']}")
    for entry in plan1["entries"]:
        print(f"  {entry['incidentId']} -> {entry['unitId']} (ETA: {entry['etaMinutes']} min, range: {entry.get('etaRange')})")

    print("\n--- PLAN-002: Rain Surge (Heavy) & Re-optimization ---")
    print(f"Plan ID: {plan2['planId']}")
    for entry in plan2["entries"]:
        print(f"  {entry['incidentId']} -> {entry['unitId']} (ETA: {entry['etaMinutes']} min, range: {entry.get('etaRange')})")

    print("\n--- PLAN-002 Changes & Reasons ---")
    for change in plan2.get("changes", []):
        b_str = f"{change['before']['unitId']} ({change['before']['etaMinutes']}m)" if change.get('before') else "None"
        a_str = f"{change['after']['unitId']} ({change['after']['etaMinutes']}m)" if change.get('after') else "None"
        print(f"  [{change['incidentId']}] {change['change'].upper()}: {b_str} -> {a_str}")
        print(f"    Reason: {change.get('reason')}")

    # Check Plan 1 assertions
    p1_map = {e["incidentId"]: e for e in plan1["entries"]}
    assert p1_map["INC-01"]["unitId"] == "BOAT-01", f"Expected BOAT-01 for INC-01, got {p1_map['INC-01']['unitId']}"
    assert p1_map["INC-02"]["unitId"] == "RES-02", f"Expected RES-02 for INC-02, got {p1_map['INC-02']['unitId']}"
    assert p1_map["INC-03"]["unitId"] == "AMB-01", f"Expected AMB-01 for INC-03, got {p1_map['INC-03']['unitId']}"

    # Check Plan 2 assertions
    p2_map = {e["incidentId"]: e for e in plan2["entries"]}
    assert p2_map["INC-01"]["unitId"] == "BOAT-01", f"Expected BOAT-01 for INC-01, got {p2_map['INC-01']['unitId']}"
    assert p2_map["INC-02"]["unitId"] == "RES-01", f"Expected RES-01 for INC-02, got {p2_map['INC-02']['unitId']}"
    assert p2_map["INC-03"]["unitId"] == "AMB-01", f"Expected AMB-01 for INC-03, got {p2_map['INC-03']['unitId']}"
    assert p2_map["INC-03"]["etaMinutes"] > p1_map["INC-03"]["etaMinutes"], "Expected larger ETA for INC-03"

    p2_changes = {c["incidentId"]: c for c in plan2.get("changes", [])}
    assert p2_changes["INC-01"]["change"] == "unchanged"
    assert p2_changes["INC-02"]["change"] == "changed"
    assert p2_changes["INC-03"]["change"] == "changed"
    for inc_id, ch in p2_changes.items():
        assert ch["reason"], f"Reason missing for {inc_id}"

    print("\n>>> ACCEPTANCE CRITERIA 1 & 2: PASSED!")

    # Determinism test
    print("\n--- Determinism Test: demo -> reset -> demo -> reset -> demo ---")
    runs = []
    for r in range(3):
        p1, p2 = await run_single_demo()
        summary = {
            "p1_entries": [(e["incidentId"], e["unitId"], e["etaMinutes"]) for e in p1["entries"]],
            "p2_entries": [(e["incidentId"], e["unitId"], e["etaMinutes"]) for e in p2["entries"]],
            "p2_changes": [(c["incidentId"], c["change"], c["reason"]) for c in p2.get("changes", [])],
        }
        runs.append(summary)
        print(f"  Run {r+1} completed successfully.")

    assert runs[0] == runs[1] == runs[2], "Determinism failed across 3 runs!"
    print(">>> DETERMINISM CHECK: PASSED (3 identical runs)!")


if __name__ == "__main__":
    asyncio.run(main())
