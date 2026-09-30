"""
tests/test_api.py — Integration tests for all REST endpoints.

Uses FastAPI TestClient (HTTPX) — no real server needed.
Each test creates a fresh AppState via state.reset() before running.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.state import state

client = TestClient(app, raise_server_exceptions=True)


@pytest.fixture(autouse=True)
def reset_state():
    state.reset()
    yield
    state.reset()


# ── helpers ───────────────────────────────────────────────────────────

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


# ── Auth ──────────────────────────────────────────────────────────────

def test_operator_login_success():
    r = client.post("/auth/login", json={"username": "operator", "password": "demo1234"})
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "operator"
    assert body["token"]
    assert body["unitId"] is None


def test_operator_login_wrong_password():
    r = client.post("/auth/login", json={"username": "operator", "password": "wrong"})
    assert r.status_code == 401


def test_crew_login_success():
    r = client.post("/auth/crew-login", json={"unitCode": "AMB-01", "pin": "1111"})
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "crew"
    assert body["unitId"] == "AMB-01"


def test_crew_login_wrong_pin():
    r = client.post("/auth/crew-login", json={"unitCode": "AMB-01", "pin": "9999"})
    assert r.status_code == 401


def test_demo_login():
    r = client.post("/auth/demo")
    assert r.status_code == 200
    assert r.json()["role"] == "reviewer"


# ── State GET endpoints ───────────────────────────────────────────────

def test_get_units_requires_auth():
    r = client.get("/units")
    assert r.status_code == 401


def test_get_units():
    r = client.get("/units", headers=auth(operator_token()))
    assert r.status_code == 200
    units = r.json()
    assert len(units) == 8
    ids = {u["unitId"] for u in units}
    assert "AMB-01" in ids


def test_reviewer_can_get_units():
    r = client.get("/units", headers=auth(reviewer_token()))
    assert r.status_code == 200


def test_crew_cannot_get_units():
    r = client.get("/units", headers=auth(crew_token()))
    assert r.status_code == 403


def test_get_facilities():
    r = client.get("/facilities", headers=auth(operator_token()))
    assert r.status_code == 200
    assert len(r.json()) == 3


def test_get_roads():
    r = client.get("/roads", headers=auth(operator_token()))
    assert r.status_code == 200
    body = r.json()
    assert "nodes" in body and "roads" in body
    assert len(body["roads"]) == 10


def test_get_zones():
    r = client.get("/zones", headers=auth(operator_token()))
    assert r.status_code == 200
    zone_ids = {z["zoneId"] for z in r.json()}
    assert "ZONE-B" in zone_ids


def test_get_status():
    r = client.get("/status", headers=auth(operator_token()))
    assert r.status_code == 200
    body = r.json()
    assert "scenarioTime" in body
    assert "rain" in body
    assert "overallSeverity" in body
    # Must be scenario time, not today's date
    assert body["scenarioTime"].startswith("2026-10-10")


def test_get_incidents_empty_at_start():
    r = client.get("/incidents", headers=auth(operator_token()))
    assert r.status_code == 200
    assert r.json() == []


# ── Phone-in ──────────────────────────────────────────────────────────

def test_phone_in_creates_incident():
    tok = operator_token()
    r = client.post("/incidents/phone-in", headers=auth(tok), json={
        "location": {"lat": 12.929, "lng": 77.612, "label": "Test St"},
        "type": "flooded_home",
        "peopleAffected": 4,
        "language": "en",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["incidentId"].startswith("INC-")
    assert body["status"] == "reported"
    assert body["source"] == "phone_in"

    # now appears in GET /incidents
    incidents = client.get("/incidents", headers=auth(tok)).json()
    assert any(i["incidentId"] == body["incidentId"] for i in incidents)


def test_phone_in_reviewer_gets_403():
    r = client.post("/incidents/phone-in", headers=auth(reviewer_token()), json={
        "location": {"lat": 12.929, "lng": 77.612, "label": "Test St"},
        "type": "medical",
        "peopleAffected": 1,
        "language": "en",
    })
    assert r.status_code == 403


# ── Plan ──────────────────────────────────────────────────────────────

def test_plan_current_null_before_any_plan():
    r = client.get("/plan/current", headers=auth(operator_token()))
    assert r.status_code == 200
    assert r.json() is None


def test_plan_history_empty_at_start():
    r = client.get("/plan/history", headers=auth(operator_token()))
    assert r.status_code == 200
    assert r.json() == []


def test_plan_diff_404_unknown():
    r = client.get("/plan/diff?from=PLAN-001&to=PLAN-002",
                   headers=auth(operator_token()))
    assert r.status_code == 404
    # Also support backwards compatibility from_plan / to_plan
    r2 = client.get("/plan/diff?from_plan=PLAN-001&to_plan=PLAN-002",
                    headers=auth(operator_token()))
    assert r2.status_code == 404


# ── Approvals ─────────────────────────────────────────────────────────

def test_approvals_empty_at_start():
    r = client.get("/approvals", headers=auth(operator_token()))
    assert r.status_code == 200
    assert r.json() == []

    # test ?status=pending query param alias
    r2 = client.get("/approvals?status=pending", headers=auth(operator_token()))
    assert r2.status_code == 200
    assert r2.json() == []


def test_approval_decision_404():
    r = client.post("/approvals/APR-999/decision", headers=auth(operator_token()),
                    json={"decision": "approve"})
    assert r.status_code == 404


# ── Scenario ──────────────────────────────────────────────────────────

def test_rain_surge_updates_status():
    tok = operator_token()
    r = client.post("/scenario/rain-surge", headers=auth(tok),
                    json={"intensity": "heavy"})
    assert r.status_code == 200
    assert r.json()["rain"]["intensity"] == "heavy"


def test_time_warp_allowed_speeds():
    tok = operator_token()
    for speed in (1, 2, 5, 10):
        r = client.post("/scenario/time-warp", headers=auth(tok),
                        json={"speed": speed})
        assert r.status_code == 200
        assert r.json()["speed"] == speed


def test_time_warp_invalid_speed():
    r = client.post("/scenario/time-warp", headers=auth(operator_token()),
                    json={"speed": 3})
    assert r.status_code == 422


def test_outage_zone_b():
    tok = operator_token()
    r = client.post("/scenario/outage", headers=auth(tok),
                    json={"zoneId": "ZONE-B", "active": True})
    assert r.status_code == 200
    assert r.json()["commsStatus"] == "degraded"

    r2 = client.post("/scenario/outage", headers=auth(tok),
                     json={"zoneId": "ZONE-B", "active": False})
    assert r2.json()["commsStatus"] == "ok"


def test_outage_unknown_zone():
    r = client.post("/scenario/outage", headers=auth(operator_token()),
                    json={"zoneId": "ZONE-X", "active": True})
    assert r.status_code == 404


def test_inject_incident():
    tok = operator_token()
    r = client.post("/scenario/inject-incident", headers=auth(tok), json={
        "type": "medical",
        "zoneId": "ZONE-A",
        "peopleAffected": 2,
        "language": "en",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "scenario"
    assert body["location"]["zoneId"] == "ZONE-A"


def test_unit_offline():
    tok = operator_token()
    r = client.post("/scenario/unit-offline", headers=auth(tok),
                    json={"unitId": "AMB-01"})
    assert r.status_code == 200
    assert r.json()["status"] == "offline"


def test_reset_clears_state():
    tok = operator_token()
    # create an incident
    client.post("/incidents/phone-in", headers=auth(tok), json={
        "location": {"lat": 12.9, "lng": 77.6, "label": "x"},
        "type": "other",
        "peopleAffected": 1,
        "language": "en",
    })
    assert len(client.get("/incidents", headers=auth(tok)).json()) == 1
    client.post("/scenario/reset", headers=auth(tok))
    assert client.get("/incidents", headers=auth(tok)).json() == []


# ── Reporter ──────────────────────────────────────────────────────────

def test_create_reporter_session():
    r = client.post("/reporter/session", json={"language": "kn"})
    assert r.status_code == 200
    body = r.json()
    assert body["sessionId"].startswith("SES-")
    assert body["language"] == "kn"
    assert body["token"]


def test_reporter_message_requires_reporter_token():
    r = client.post("/reporter/session", json={"language": "en"})
    session_id = r.json()["sessionId"]
    # Using operator token should fail
    r2 = client.post("/reporter/message",
                     headers=auth(operator_token()),
                     json={"sessionId": session_id, "text": "Help!"})
    assert r2.status_code == 403


def test_reporter_message_success():
    session_r = client.post("/reporter/session", json={"language": "en"})
    session = session_r.json()
    r = client.post("/reporter/message",
                    headers=auth(session["token"]),
                    json={"sessionId": session["sessionId"], "text": "Help!"})
    assert r.status_code == 200
    assert r.json()["messageId"].startswith("MSG-")


# ── Crew ──────────────────────────────────────────────────────────────

def test_crew_assignment_none_at_start():
    r = client.get("/crew/assignment", headers=auth(crew_token("AMB-01")))
    assert r.status_code == 200
    assert r.json() is None


def test_crew_status_en_route():
    tok = crew_token("AMB-01")
    r = client.post("/crew/status", headers=auth(tok),
                    json={"action": "en_route", "clientRequestId": "req-001"})
    assert r.status_code == 200
    assert r.json()["status"] == "en_route"


def test_crew_status_idempotent():
    tok = crew_token("AMB-01")
    body = {"action": "en_route", "clientRequestId": "req-idm-001"}
    r1 = client.post("/crew/status", headers=auth(tok), json=body)
    r2 = client.post("/crew/status", headers=auth(tok), json=body)
    assert r1.json() == r2.json()


def test_crew_problem():
    tok = crew_token("AMB-01")
    r = client.post("/crew/problem", headers=auth(tok),
                    json={"kind": "road_blocked", "note": "test", "clientRequestId": "req-p01"})
    assert r.status_code == 200
    assert r.json()["ok"] is True


# ── Reports ───────────────────────────────────────────────────────────

def test_after_action_report():
    r = client.get("/reports/after-action", headers=auth(operator_token()))
    assert r.status_code == 200
    body = r.json()
    assert "timeline" in body
    assert "approvals" in body


def test_comms_log_empty():
    r = client.get("/comms/log", headers=auth(operator_token()))
    assert r.status_code == 200
    assert r.json() == []


def test_decisions_empty():
    r = client.get("/decisions", headers=auth(operator_token()))
    assert r.status_code == 200
    assert r.json() == []
