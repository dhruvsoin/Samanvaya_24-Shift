"""
tests/test_approvals_api.py — End-to-end HTTP integration tests for Approvals API.

Tests:
  1. GET /approvals?status=pending:
     - Enforces operator role (401 unauthenticated, 403 reviewer/crew).
     - Returns pending approvals correctly filtered.
  2. POST /approvals/{id}/decision:
     - Enforces operator role (403 for reviewer and crew).
     - Returns 404 for unknown approval ID.
     - Validates decision inputs (400 for choose_other without optionId or invalid option).
     - Records decidedBy from token and decidedAt from scenario clock.
     - Emits approval.resolved on event bus.
     - CommandAgent continues: publishes plan.published (PLAN-002), cancels old assignments, dispatches new.
     - Returns 409 Conflict if approval is already resolved.
  3. Tests full APR-001 flow through HTTP (reproducing the contract scenario).
  4. Tests choose_other and reject flows through HTTP.
"""
from __future__ import annotations

import asyncio
import pytest
from fastapi.testclient import TestClient

from app.agents.allocation import AllocationAgent
from app.agents.command import CommandAgent
from app.agents.route import RouteAgent
from app.bus import bus
from app.clock import clock
from app.main import app
from app.state import state


client = TestClient(app, raise_server_exceptions=True)


@pytest.fixture(autouse=True)
def reset_all():
    bus.reset()
    state.reset()
    clock.reset()
    yield
    bus.reset()
    state.reset()
    clock.reset()


def operator_token() -> str:
    r = client.post("/auth/login", json={"username": "operator", "password": "demo1234"})
    assert r.status_code == 200
    return r.json()["token"]


def reviewer_token() -> str:
    r = client.post("/auth/demo")
    assert r.status_code == 200
    return r.json()["token"]


def crew_token(unit_code: str = "AMB-01") -> str:
    r = client.post("/auth/crew-login", json={"unitCode": unit_code, "pin": "1111"})
    assert r.status_code == 200
    return r.json()["token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def setup_apr_001_scenario():
    """
    Sets up the seed incidents, generates PLAN-001, and simulates
    rain surge closing ROAD-04 to produce pending approval APR-001.
    """
    inc1 = {
        "incidentId": "INC-01",
        "type": "flooded_home",
        "status": "assessed",
        "severity": "high",
        "severityScore": 72,
        "timeWindowMinutes": 20,
        "location": {"lat": 12.929, "lng": 77.612, "label": "Lakeside colony", "zoneId": "ZONE-A"},
        "peopleAffected": 6,
        "language": "kn",
        "source": "reporter_voice",
        "summary": "Water entering homes",
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
        "location": {"lat": 12.918, "lng": 77.6255, "label": "Hosur Rd underpass", "zoneId": "ZONE-B"},
        "peopleAffected": 3,
        "language": "en",
        "source": "phone_in",
        "summary": "Car stranded in water",
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
        "location": {"lat": 12.9285, "lng": 77.6385, "label": "Canal Rd", "zoneId": "ZONE-A"},
        "peopleAffected": 2,
        "language": "en",
        "source": "reporter_chat",
        "summary": "Elderly patient breathing difficulty",
        "confidence": 0.9,
        "reportedAt": clock.now(),
        "assignedUnitIds": [],
        "reporterSessionId": "SES-02",
    }
    state.add_incident(inc1, publish=False)
    state.add_incident(inc2, publish=False)
    state.add_incident(inc3, publish=False)

    route_agent = RouteAgent()
    allocation_agent = AllocationAgent(route_agent=route_agent)
    command_agent = CommandAgent(allocation_agent=allocation_agent)

    # Subscribe command_agent to bus for approval.resolved
    bus.subscribe("approval.resolved", lambda e: asyncio.create_task(command_agent.handle(e)))

    # Step 1: Initial Allocation (PLAN-001)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    candidate_1 = loop.run_until_complete(allocation_agent.reallocate())
    assert candidate_1 is not None

    # Step 2: Rain surge closes ROAD-04
    state.set_road_status("ROAD-04", "closed", reason="Flooded underpass", publish=True)
    loop.run_until_complete(route_agent.handle({
        "id": "evt_road_closed",
        "type": "road.status_changed",
        "ts": clock.now(),
        "payload": {"roadId": "ROAD-04", "status": "closed"},
    }))

    # Candidate 2 is held by CommandAgent, creating APR-001
    assert command_agent._pending_approval_id == "APR-001"
    assert state.get_approval("APR-001") is not None
    assert state.get_approval("APR-001")["status"] == "pending"

    return route_agent, allocation_agent, command_agent


# ── Tests ─────────────────────────────────────────────────────────────

def test_get_approvals_role_permissions():
    """Only operator role can access GET /approvals."""
    setup_apr_001_scenario()

    # 401 Unauthenticated
    r_unauth = client.get("/approvals")
    assert r_unauth.status_code == 401

    # 403 Reviewer
    r_rev = client.get("/approvals", headers=auth(reviewer_token()))
    assert r_rev.status_code == 403

    # 403 Crew
    r_crew = client.get("/approvals", headers=auth(crew_token()))
    assert r_crew.status_code == 403

    # 200 Operator
    r_op = client.get("/approvals", headers=auth(operator_token()))
    assert r_op.status_code == 200
    approvals = r_op.json()
    assert len(approvals) == 1
    assert approvals[0]["approvalId"] == "APR-001"


def test_get_approvals_status_filter():
    """GET /approvals?status=pending filters appropriately."""
    setup_apr_001_scenario()
    tok = operator_token()

    r_pending = client.get("/approvals?status=pending", headers=auth(tok))
    assert r_pending.status_code == 200
    assert len(r_pending.json()) == 1
    assert r_pending.json()[0]["approvalId"] == "APR-001"

    r_approved = client.get("/approvals?status=approved", headers=auth(tok))
    assert r_approved.status_code == 200
    assert len(r_approved.json()) == 0


def test_post_decision_role_permissions():
    """Only operator can call POST /approvals/{id}/decision."""
    setup_apr_001_scenario()

    # 401 Unauthenticated
    r_unauth = client.post("/approvals/APR-001/decision", json={"decision": "approve"})
    assert r_unauth.status_code == 401

    # 403 Reviewer
    r_rev = client.post("/approvals/APR-001/decision", headers=auth(reviewer_token()), json={"decision": "approve"})
    assert r_rev.status_code == 403

    # 403 Crew
    r_crew = client.post("/approvals/APR-001/decision", headers=auth(crew_token()), json={"decision": "approve"})
    assert r_crew.status_code == 403


def test_post_decision_not_found():
    """POST /approvals/{id}/decision returns 404 for unknown approval."""
    r = client.post("/approvals/APR-999/decision", headers=auth(operator_token()), json={"decision": "approve"})
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_post_decision_validation_errors():
    """Validates inputs for POST /approvals/{id}/decision."""
    setup_apr_001_scenario()
    tok = operator_token()

    # choose_other without optionId -> 400
    r_no_opt = client.post("/approvals/APR-001/decision", headers=auth(tok), json={"decision": "choose_other"})
    assert r_no_opt.status_code == 400
    assert "optionId is required" in r_no_opt.json()["error"]["message"]

    # choose_other with invalid optionId -> 400
    r_bad_opt = client.post("/approvals/APR-001/decision", headers=auth(tok), json={"decision": "choose_other", "optionId": "OPT-INVALID"})
    assert r_bad_opt.status_code == 400
    assert "Invalid optionId" in r_bad_opt.json()["error"]["message"]


def test_full_apr_001_flow_through_http():
    """
    Full reproduction of the APR-001 approval flow via HTTP:
      1. Pending approval APR-001 exists in state.
      2. GET /approvals?status=pending returns [APR-001].
      3. Operator POST /approvals/APR-001/decision with 'approve' and 'OPT-A'.
      4. Decision records decidedBy from token and decidedAt from scenario clock.
      5. approval.resolved is emitted, CommandAgent continues and publishes PLAN-002.
      6. GET /plan/current returns PLAN-002 with RES-01 assigned to INC-02.
      7. Second decision attempt returns 409 Conflict.
    """
    setup_apr_001_scenario()
    tok = operator_token()

    # 1. Query pending approvals
    r_list = client.get("/approvals?status=pending", headers=auth(tok))
    assert r_list.status_code == 200
    approvals = r_list.json()
    assert len(approvals) == 1
    apr = approvals[0]
    assert apr["approvalId"] == "APR-001"
    assert apr["status"] == "pending"
    assert apr["recommendedOptionId"] == "OPT-A"

    # Current plan is still PLAN-001 before approval
    r_curr_plan = client.get("/plan/current", headers=auth(tok))
    assert r_curr_plan.status_code == 200
    assert r_curr_plan.json()["planId"] == "PLAN-001"

    # Track events on the bus
    resolved_events = []
    published_plans = []
    cancelled_assignments = []
    bus.subscribe("approval.resolved", lambda e: resolved_events.append(e))
    bus.subscribe("plan.published", lambda e: published_plans.append(e))
    bus.subscribe("assignment.cancelled", lambda e: cancelled_assignments.append(e))

    # 2. Operator posts approval decision
    clock_now = clock.now()
    r_decide = client.post(
        "/approvals/APR-001/decision",
        headers=auth(tok),
        json={"decision": "approve", "optionId": "OPT-A", "note": "Approved fastest route"},
    )
    assert r_decide.status_code == 200
    decided = r_decide.json()

    # Check updated approval response
    assert decided["approvalId"] == "APR-001"
    assert decided["status"] == "approved"
    assert decided["chosenOptionId"] == "OPT-A"
    assert decided["decidedBy"] == "operator"
    assert decided["decidedAt"] == clock_now

    # Check approval.resolved was published
    assert len(resolved_events) >= 1
    revt = resolved_events[0]["payload"]
    assert revt["approvalId"] == "APR-001"
    assert revt["decision"] == "approve"
    assert revt["chosenOptionId"] == "OPT-A"
    assert revt["decidedBy"] == "operator"

    # 3. Check CommandAgent continued and published PLAN-002
    assert len(published_plans) >= 1
    p2 = published_plans[0]["payload"]["plan"]
    assert p2["planId"] == "PLAN-002"
    assert p2["version"] == 2
    assert p2["previousPlanId"] == "PLAN-001"

    # RES-02 cancelled, RES-01 dispatched
    assert any(c["payload"]["unitId"] == "RES-02" for c in cancelled_assignments)

    # GET /plan/current now returns PLAN-002
    r_new_plan = client.get("/plan/current", headers=auth(tok))
    assert r_new_plan.status_code == 200
    assert r_new_plan.json()["planId"] == "PLAN-002"
    assert any(e["unitId"] == "RES-01" and e["incidentId"] == "INC-02" for e in r_new_plan.json()["entries"])

    # GET /approvals?status=pending is now empty
    r_pending_after = client.get("/approvals?status=pending", headers=auth(tok))
    assert r_pending_after.status_code == 200
    assert r_pending_after.json() == []

    # 4. Attempt duplicate decision -> 409 Conflict
    r_conflict = client.post(
        "/approvals/APR-001/decision",
        headers=auth(tok),
        json={"decision": "approve", "optionId": "OPT-A"},
    )
    assert r_conflict.status_code == 409
    assert r_conflict.json()["error"]["code"] == "conflict"
    assert "already approved" in r_conflict.json()["error"]["message"]


def test_choose_other_flow_through_http():
    """Tests choosing an alternative option (OPT-C) via HTTP."""
    setup_apr_001_scenario()
    tok = operator_token()

    r_decide = client.post(
        "/approvals/APR-001/decision",
        headers=auth(tok),
        json={"decision": "choose_other", "optionId": "OPT-C", "note": "Use boat instead"},
    )
    assert r_decide.status_code == 200
    body = r_decide.json()
    assert body["status"] == "approved"
    assert body["chosenOptionId"] == "OPT-C"
    assert body["decidedBy"] == "operator"

    # Re-decision gives 409
    r_conflict = client.post(
        "/approvals/APR-001/decision",
        headers=auth(tok),
        json={"decision": "approve"},
    )
    assert r_conflict.status_code == 409


def test_reject_flow_through_http():
    """Tests rejecting an approval via HTTP."""
    setup_apr_001_scenario()
    tok = operator_token()

    r_decide = client.post(
        "/approvals/APR-001/decision",
        headers=auth(tok),
        json={"decision": "reject", "note": "Maintain standby units"},
    )
    assert r_decide.status_code == 200
    body = r_decide.json()
    assert body["status"] == "rejected"
    assert body["chosenOptionId"] is None
    assert body["decidedBy"] == "operator"

    # Current plan remains PLAN-001
    r_plan = client.get("/plan/current", headers=auth(tok))
    assert r_plan.json()["planId"] == "PLAN-001"

    # Re-decision gives 409
    r_conflict = client.post(
        "/approvals/APR-001/decision",
        headers=auth(tok),
        json={"decision": "reject"},
    )
    assert r_conflict.status_code == 409
    assert "already rejected" in r_conflict.json()["error"]["message"]
