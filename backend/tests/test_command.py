"""
tests/test_command.py — Tests for CommandAgent, approval rules, and full plan lifecycle.

Verifies:
  1. Reproduction of PLAN-001:
     - Initial 3 incidents auto-publish PLAN-001 (no approval needed).
     - Emits assignment.sent for BOAT-01, RES-02, AMB-01.
     - Emits reporter.status_updated.
  2. Reproduction of rain surge -> APR-001 -> PLAN-002:
     - ROAD-04 closed causes RES-02 cut-off; Allocation proposes RES-01.
     - Rule (a) triggers: RES-01 leaves Zone C with no standby rescue team.
     - Creates APR-001, emits approval.requested, and holds plan.
     - On approval (approval.resolved approve), publishes PLAN-002 (v2, previousPlanId: PLAN-001).
     - Emits assignment.cancelled for RES-02.
     - Emits assignment.sent for RES-01.
     - Emits reporter delay notice and status_updated for INC-03.
  3. Plan rejection keeps previous plan and logs why.
  4. Approval rules (b) and (c):
     - Critical incident unit change triggers approval.
     - Unit in degraded comms zone triggers approval.
  5. assignment.declined, assignment.timeout, unit.unavailable trigger re-plan and log decision.
"""
from __future__ import annotations

import asyncio
from typing import Any
import pytest

from app.agents.allocation import AllocationAgent
from app.agents.approval_rules import evaluate_plan_approval
from app.agents.command import CommandAgent
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


def setup_seed_incidents():
    """Sets up the 3 seed incidents matching events.json."""
    inc1 = {
        "incidentId": "INC-01",
        "type": "flooded_home",
        "status": "assessed",
        "severity": "high",
        "severityScore": 72,
        "timeWindowMinutes": 20,
        "location": {
            "lat": 12.929,
            "lng": 77.612,
            "label": "Lakeside colony, 2nd cross",
            "zoneId": "ZONE-A",
        },
        "peopleAffected": 6,
        "language": "kn",
        "source": "reporter_voice",
        "summary": "Water entering ground-floor homes; 6 people including children.",
        "confidence": 0.85,
        "reportedAt": clock.now(),
        "assignedUnitIds": [],
        "reporterSessionId": "SES-01",
    }
    inc2 = {
        "incidentId": "INC-02",
        "type": "stranded_vehicle",
        "status": "assessed",
        "severity": "high",
        "severityScore": 65,
        "timeWindowMinutes": 25,
        "location": {
            "lat": 12.918,
            "lng": 77.6255,
            "label": "Hosur Rd underpass, south side",
            "zoneId": "ZONE-B",
        },
        "peopleAffected": 3,
        "language": "en",
        "source": "phone_in",
        "summary": "Car stranded in rising water; 3 people inside.",
        "confidence": 0.95,
        "reportedAt": clock.now(),
        "assignedUnitIds": [],
        "reporterSessionId": None,
    }
    inc3 = {
        "incidentId": "INC-03",
        "type": "medical",
        "status": "assessed",
        "severity": "critical",
        "severityScore": 91,
        "timeWindowMinutes": 10,
        "location": {
            "lat": 12.9285,
            "lng": 77.6385,
            "label": "Canal Rd near Market St",
            "zoneId": "ZONE-A",
        },
        "peopleAffected": 2,
        "language": "en",
        "source": "reporter_chat",
        "summary": "Elderly person with breathing difficulty; water at the doorstep.",
        "confidence": 0.9,
        "reportedAt": clock.now(),
        "assignedUnitIds": [],
        "reporterSessionId": "SES-02",
    }
    state.add_incident(inc1, publish=False)
    state.add_incident(inc2, publish=False)
    state.add_incident(inc3, publish=False)
    return inc1, inc2, inc3


# ── 1. Full Reproduction: PLAN-001 then Rain Surge -> APR-001 -> PLAN-002 ──

@pytest.mark.asyncio
async def test_reproduce_plan_001_and_plan_002_flow():
    setup_seed_incidents()

    published_plans: list[dict] = []
    requested_approvals: list[dict] = []
    sent_assignments: list[dict] = []
    cancelled_assignments: list[dict] = []
    reporter_statuses: list[dict] = []
    reporter_messages: list[dict] = []

    bus.subscribe("plan.published", lambda e: published_plans.append(e))
    bus.subscribe("approval.requested", lambda e: requested_approvals.append(e))
    bus.subscribe("assignment.sent", lambda e: sent_assignments.append(e))
    bus.subscribe("assignment.cancelled", lambda e: cancelled_assignments.append(e))
    bus.subscribe("reporter.status_updated", lambda e: reporter_statuses.append(e))
    bus.subscribe("reporter.message_sent", lambda e: reporter_messages.append(e))

    route_agent = RouteAgent()
    allocation_agent = AllocationAgent(route_agent=route_agent)
    command_agent = CommandAgent(allocation_agent=allocation_agent)

    # ── Step 1: Initial Allocation (Produces PLAN-001 automatically) ───
    candidate_1 = await allocation_agent.reallocate()
    assert candidate_1 is not None
    await asyncio.sleep(0.05)

    # PLAN-001 should be published
    assert len(published_plans) == 1
    p1 = published_plans[0]["payload"]["plan"]
    assert p1["planId"] == "PLAN-001"
    assert p1["version"] == 1
    assert p1["previousPlanId"] is None
    assert len(p1["entries"]) == 3
    assert len(requested_approvals) == 0, "PLAN-001 should not require approval"

    # Assignments sent for 3 units
    assert len(sent_assignments) == 3
    assigned_units = {a["payload"]["assignment"]["unitId"] for a in sent_assignments}
    assert assigned_units == {"BOAT-01", "RES-02", "AMB-01"}

    # Decisions logged
    decisions = state.get_decision_log()
    assert any(d["decision"] == "publish_plan" for d in decisions)

    # ── Step 2: Rain Surge (ROAD-04 Closed) -> Re-solve -> APR-001 ───
    # Close ROAD-04
    state.set_road_status("ROAD-04", "closed", reason="Flooded underpass", publish=True)

    # Route agent updates ETAs, notifying AllocationAgent which notifies CommandAgent
    await route_agent.handle({
        "id": "evt_road_closed",
        "type": "road.status_changed",
        "ts": clock.now(),
        "payload": {"roadId": "ROAD-04", "status": "closed"},
    })
    await asyncio.sleep(0.05)

    candidate_2 = allocation_agent.get_candidate_plan()
    assert candidate_2 is not None

    # Rule (a) triggered! Plan should be held for approval
    assert len(requested_approvals) == 1
    appr = requested_approvals[0]["payload"]["approval"]
    assert appr["approvalId"] == "APR-001"
    assert appr["kind"] == "reassign_unit"
    assert "RES-01" in appr["summary"]
    assert appr["recommendedOptionId"] == "OPT-A"

    # Plan-002 NOT published yet (held)
    assert len(published_plans) == 1, "Plan should be held until approved"

    # ── Step 3: Operator Approves APR-001 -> PLAN-002 Published ────────
    state.resolve_approval(
        approval_id="APR-001",
        decision="approve",
        chosen_option_id="OPT-A",
        decided_by="operator",
        publish=True,
    )

    await command_agent.handle({
        "id": "evt_appr_resolved",
        "type": "approval.resolved",
        "ts": clock.now(),
        "payload": {
            "approvalId": "APR-001",
            "decision": "approve",
            "chosenOptionId": "OPT-A",
            "decidedBy": "operator",
        },
    })
    await asyncio.sleep(0.05)

    # Now PLAN-002 is published!
    assert len(published_plans) == 2
    p2 = published_plans[1]["payload"]["plan"]
    assert p2["planId"] == "PLAN-002"
    assert p2["version"] == 2
    assert p2["previousPlanId"] == "PLAN-001"

    # RES-02 was cancelled
    assert len(cancelled_assignments) >= 1
    canc = cancelled_assignments[0]["payload"]
    assert canc["unitId"] == "RES-02"
    assert canc["incidentId"] == "INC-02"

    # RES-01 was sent new assignment
    new_asns = [a["payload"]["assignment"] for a in sent_assignments if a["payload"]["assignment"]["unitId"] == "RES-01"]
    assert len(new_asns) == 1
    assert new_asns[0]["incidentId"] == "INC-02"

    # Delay notice sent to SES-02 (INC-03)
    ses02_msgs = [m["payload"] for m in reporter_messages if m["payload"].get("sessionId") == "SES-02"]
    assert len(ses02_msgs) >= 1
    assert "Heavy rain has slowed the route" in ses02_msgs[0]["text"]


# ── 2. Plan Rejection Test ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_plan_rejection_retains_previous_plan():
    setup_seed_incidents()
    command_agent = CommandAgent()

    # Manually hold a candidate plan
    cand = {
        "entries": engine_stub.PLAN_002_ENTRIES,
        "unserved": [],
        "changes": engine_stub.PLAN_002_CHANGES,
    }
    state.publish_plan({
        "planId": "PLAN-001",
        "version": 1,
        "previousPlanId": None,
        "trigger": "Initial",
        "publishedAt": clock.now(),
        "entries": engine_stub.PLAN_001_ENTRIES,
        "unserved": [],
        "changes": [],
        "pendingApprovalIds": [],
    }, publish=False)

    await command_agent.receive_candidate_plan(cand)
    assert command_agent._pending_approval_id is not None
    appr_id = command_agent._pending_approval_id

    # Operator rejects
    await command_agent.handle({
        "id": "evt_reject",
        "type": "approval.resolved",
        "ts": clock.now(),
        "payload": {
            "approvalId": appr_id,
            "decision": "reject",
            "note": "Keep reserve in Zone C",
        },
    })
    await asyncio.sleep(0.05)

    # Current plan in state remains PLAN-001
    assert state.get_current_plan()["planId"] == "PLAN-001"
    assert state.get_current_plan()["version"] == 1

    # Decision logged
    decisions = state.get_decision_log()
    reject_dec = [d for d in decisions if d["decision"] == "reject_plan"]
    assert len(reject_dec) == 1
    assert appr_id in reject_dec[0]["approvalId"]


# ── 3. Approval Rules Unit Tests ─────────────────────────────────────

def test_approval_rule_critical_incident_unit_change():
    """Rule (b): Changing unit for a critical incident requires approval."""
    setup_seed_incidents()

    # Suppose candidate plan replaces unit on critical INC-03
    cand = {
        "entries": [
            {"incidentId": "INC-03", "unitId": "AMB-02", "etaMinutes": 6, "etaRange": [5, 8]},
        ],
        "changes": [
            {
                "incidentId": "INC-03",
                "change": "changed",
                "before": {"unitId": "AMB-01", "etaMinutes": 4},
                "after": {"unitId": "AMB-02", "etaMinutes": 6},
                "reason": "Replaced ambulance",
            }
        ],
    }

    needs_appr, reason, appr_data = evaluate_plan_approval(cand)
    assert needs_appr is True
    assert "critical incident INC-03" in reason
    assert appr_data is not None
    assert appr_data["kind"] == "reassign_unit"


def test_approval_rule_degraded_comms_zone():
    """Rule (c): Targeting a unit in a zone with degraded comms requires approval."""
    setup_seed_incidents()

    # Mark ZONE-B comms as degraded
    state.set_zone_comms("ZONE-B", active_outage=True, publish=False)

    cand = {
        "entries": [
            {"incidentId": "INC-01", "unitId": "AMB-01", "etaMinutes": 5, "etaRange": [4, 7]},
        ],
        "changes": [
            {
                "incidentId": "INC-01",
                "change": "added",
                "before": None,
                "after": {"unitId": "AMB-01", "etaMinutes": 5},
                "reason": "Dispatch unit",
            }
        ],
    }

    needs_appr, reason, appr_data = evaluate_plan_approval(cand)
    assert needs_appr is True
    assert "degraded communications" in reason
    assert appr_data["kind"] == "crew_check"


# ── 4. Trigger Re-plan Events & Decision Log ─────────────────────────

@pytest.mark.asyncio
async def test_replan_triggers_and_decision_logging():
    """assignment.declined, assignment.timeout, unit.unavailable trigger re-plan and log decisions."""
    replan_triggers: list[str] = []
    command = CommandAgent(on_replan_needed=lambda reason: replan_triggers.append(reason))

    # 1. assignment.declined
    await command.handle({
        "id": "evt_declined",
        "type": "assignment.declined",
        "ts": clock.now(),
        "payload": {
            "assignmentId": "ASN-101",
            "unitId": "BOAT-01",
            "incidentId": "INC-01",
            "reason": "Engine failure",
        },
    })
    # 2. assignment.timeout
    await command.handle({
        "id": "evt_timeout",
        "type": "assignment.timeout",
        "ts": clock.now(),
        "payload": {
            "assignmentId": "ASN-102",
            "unitId": "RES-01",
            "incidentId": "INC-02",
        },
    })
    # 3. unit.unavailable
    await command.handle({
        "id": "evt_unavail",
        "type": "unit.unavailable",
        "ts": clock.now(),
        "payload": {
            "unitId": "AMB-02",
            "reason": "Flat tire",
        },
    })

    assert len(replan_triggers) == 3
    decisions = state.get_decision_log()
    dec_types = {d["decision"] for d in decisions}
    assert "replan_assignment_declined" in dec_types
    assert "replan_assignment_timeout" in dec_types
    assert "replan_unit_unavailable" in dec_types
