"""
tests/test_status_reports.py — Tests for SystemStatus, Open-Meteo weather client,
reports endpoints (comms log, decisions, after-action report), and demo replay.
"""
from __future__ import annotations

import json
import time
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.bus import bus
from app.clock import clock
from app.main import app
from app.replay import replay_demo_events
from app.state import state
from app.weather import OpenMeteoRainClient, sync_system_rain, weather_client


client = TestClient(app, raise_server_exceptions=True)


@pytest.fixture(autouse=True)
def reset_all():
    bus.reset()
    state.reset()
    clock.reset()
    weather_client.reset()
    yield
    bus.reset()
    state.reset()
    clock.reset()
    weather_client.reset()


def operator_token() -> str:
    r = client.post("/auth/login", json={"username": "operator", "password": "demo1234"})
    assert r.status_code == 200
    return r.json()["token"]


def reviewer_token() -> str:
    r = client.post("/auth/demo")
    assert r.status_code == 200
    return r.json()["token"]


def crew_token() -> str:
    r = client.post("/auth/crew-login", json={"unitCode": "AMB-01", "pin": "1111"})
    assert r.status_code == 200
    return r.json()["token"]


def auth(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


# ── 1. Open-Meteo Weather Client Tests ────────────────────────────────

def test_weather_client_freshness_live_cached_stale():
    """Tests live fetch, cached return within TTL, and stale fallback when offline."""
    client_instance = OpenMeteoRainClient(cache_ttl_seconds=10.0)

    # Mock successful Open-Meteo response
    mock_payload = {
        "current": {
            "time": "2026-10-10T09:00",
            "precipitation": 18.5,
            "rain": 18.5,
        }
    }
    mock_resp = MagicMock()
    mock_resp.status = 200
    mock_resp.read.return_value = json.dumps(mock_payload).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp):
        # 1. Live fetch
        r_live = client_instance.get_rain(allow_network=True)
        assert r_live["freshness"] == "live"
        assert r_live["intensity"] == "heavy"
        assert r_live["mmPerHour"] == 18.5

        # 2. Cached fetch within TTL
        r_cached = client_instance.get_rain(allow_network=True)
        assert r_cached["freshness"] == "cached"
        assert r_cached["intensity"] == "heavy"

    # 3. Network failure with cached data -> stale
    with patch("urllib.request.urlopen", side_effect=Exception("Network error")):
        r_stale = client_instance.get_rain(force_refresh=True, allow_network=True)
        assert r_stale["freshness"] == "stale"
        assert r_stale["intensity"] == "heavy"


def test_weather_client_offline_fallback_file():
    """When offline and no cache exists, loads fallback JSON with stale freshness."""
    client_instance = OpenMeteoRainClient()
    client_instance.reset()

    r_fallback = client_instance.get_rain(allow_network=False)
    assert r_fallback["freshness"] == "stale"
    assert r_fallback["intensity"] == "light"
    assert r_fallback["mmPerHour"] == 4.0


def test_sync_system_rain_publishes_status_updated():
    """sync_system_rain updates system status and publishes status.updated if changed."""
    events = []
    bus.subscribe("status.updated", lambda e: events.append(e))

    weather_client.set_cached_data({
        "intensity": "heavy",
        "mmPerHour": 24.0,
        "freshness": "live",
        "observedAt": clock.now(),
    })

    sync_system_rain(force_refresh=False, allow_network=False)

    assert len(events) >= 1
    st = events[-1]["payload"]["status"]
    assert st["rain"]["intensity"] == "heavy"
    assert st["rain"]["mmPerHour"] == 24.0


# ── 2. SystemStatus and status.updated publishing ────────────────────

def test_get_status_endpoint():
    """GET /status returns SystemStatus with scenario time."""
    tok = operator_token()
    r = client.get("/status", headers=auth(tok))
    assert r.status_code == 200
    body = r.json()
    assert "scenarioTime" in body
    assert "speed" in body
    assert "overallSeverity" in body
    assert "rain" in body
    assert "commsOverall" in body


def test_status_updated_on_speed_change():
    """Changing speed publishes status.updated."""
    events = []
    bus.subscribe("status.updated", lambda e: events.append(e))

    tok = operator_token()
    r = client.post("/scenario/time-warp", headers=auth(tok), json={"speed": 5})
    assert r.status_code == 200
    assert r.json()["speed"] == 5

    assert len(events) >= 1
    assert events[-1]["payload"]["status"]["speed"] == 5


def test_status_updated_on_rain_surge():
    """Rain surge updates rain intensity and publishes status.updated."""
    events = []
    bus.subscribe("status.updated", lambda e: events.append(e))

    tok = operator_token()
    r = client.post("/scenario/rain-surge", headers=auth(tok), json={"intensity": "extreme"})
    assert r.status_code == 200
    assert r.json()["rain"]["intensity"] == "extreme"

    assert len(events) >= 1
    assert events[-1]["payload"]["status"]["rain"]["intensity"] == "extreme"


def test_status_updated_on_comms_outage():
    """Zone outage degrades commsOverall and publishes status.updated."""
    events = []
    bus.subscribe("status.updated", lambda e: events.append(e))

    tok = operator_token()
    r = client.post("/scenario/outage", headers=auth(tok), json={"zoneId": "ZONE-B", "active": True})
    assert r.status_code == 200

    assert len(events) >= 1
    assert events[-1]["payload"]["status"]["commsOverall"] == "degraded"

    # Restoring restores commsOverall
    client.post("/scenario/outage", headers=auth(tok), json={"zoneId": "ZONE-B", "active": False})
    assert events[-1]["payload"]["status"]["commsOverall"] == "ok"


def test_status_updated_on_overall_severity_change():
    """Assessing an incident updates overall severity and publishes status.updated."""
    events = []
    bus.subscribe("status.updated", lambda e: events.append(e))

    state.add_incident({
        "incidentId": "INC-TEST-01",
        "type": "medical",
        "status": "reported",
        "severity": None,
        "location": {"lat": 12.9, "lng": 77.6, "label": "test"},
        "peopleAffected": 1,
        "language": "en",
        "source": "phone_in",
        "summary": "Urgent medical",
        "reportedAt": clock.now(),
        "assignedUnitIds": [],
    }, publish=False)

    state.assess_incident(
        incident_id="INC-TEST-01",
        severity="critical",
        severity_score=92,
        time_window_minutes=10,
        publish=True,
    )

    assert len(events) >= 1
    assert events[-1]["payload"]["status"]["overallSeverity"] == "critical"


# ── 3. Comms Log and Decisions Endpoints ───────────────────────────────

def test_get_comms_log():
    """GET /comms/log returns logged communications."""
    tok = operator_token()

    state.append_comms_log({
        "entryId": "COM-001",
        "ts": clock.now(),
        "direction": "out",
        "channel": "sms",
        "recipient": {"kind": "crew", "id": "RES-01"},
        "text": "Zone B outage: switching to SMS channel.",
        "delivery": "sent",
        "zoneId": "ZONE-B",
    })

    r = client.get("/comms/log", headers=auth(tok))
    assert r.status_code == 200
    log = r.json()
    assert len(log) == 1
    assert log[0]["entryId"] == "COM-001"
    assert log[0]["channel"] == "sms"


def test_get_decisions():
    """GET /decisions returns recorded operational decisions."""
    tok = operator_token()

    state.append_decision_log({
        "decisionId": "DEC-001",
        "ts": clock.now(),
        "agent": "command",
        "decision": "hold_plan_for_approval",
        "reason": "RES-01 leaves zone C without standby",
        "incidentId": "INC-02",
        "planId": "PLAN-001",
        "approvalId": "APR-001",
    })

    r = client.get("/decisions", headers=auth(tok))
    assert r.status_code == 200
    decs = r.json()
    assert len(decs) == 1
    assert decs[0]["decisionId"] == "DEC-001"
    assert decs[0]["agent"] == "command"


# ── 4. After-Action Report and Demo Replay ─────────────────────────────

def test_after_action_report_after_replaying_demo_script():
    """
    Replays the 70 scripted demo events from contracts/seed/events.json into the bus,
    then verifies GET /reports/after-action:
      - timeline from the event log
      - plan changes with reasons
      - approvals
      - response times per incident (reportedAt to arrived)
      - baseline comparison (Samanvaya plan vs first-come-first-served)
      - unresolved incidents
    """
    # Replay all 70 events from the demo script into the bus and state
    replayed = replay_demo_events()
    assert len(replayed) == 70

    tok = operator_token()
    r = client.get("/reports/after-action", headers=auth(tok))
    assert r.status_code == 200
    report = r.json()

    # 1. Timeline from the event log
    assert len(report["timeline"]) >= 70
    assert any("INC-01 reported" in t["text"] for t in report["timeline"])
    assert any("APR-001" in t["text"] for t in report["timeline"])
    assert any("Plan PLAN-001" in t["text"] for t in report["timeline"])

    # 2. Plan changes with reasons
    assert len(report["planChanges"]) >= 2
    p1 = next(p for p in report["planChanges"] if p["planId"] == "PLAN-001")
    assert "Initial plan" in p1["trigger"]
    assert len(p1["changes"]) == 3

    p2 = next(p for p in report["planChanges"] if p["planId"] == "PLAN-002")
    assert "ROAD-04 closed" in p2["trigger"]
    assert any(c["incidentId"] == "INC-02" and c["change"] == "changed" for c in p2["changes"])

    # 3. Approvals
    approval_ids = {a["approvalId"] for a in report["approvals"]}
    assert "APR-001" in approval_ids
    assert "APR-002" in approval_ids

    # 4. Response time per incident (reportedAt to arrived)
    rt_map = {rt["incidentId"]: rt["reportedToArrivedMinutes"] for rt in report["responseTimes"]}
    assert "INC-01" in rt_map
    assert "INC-02" in rt_map
    assert "INC-03" in rt_map

    # In events.json:
    # INC-03: reported 09:02:40, arrived 09:11:10 -> 8.5 min
    # INC-02: reported 09:02:00, arrived 09:17:00 -> 15.0 min
    # INC-01: reported 09:01:14, arrived 09:10:20 -> 9.1 min
    assert 8.0 <= rt_map["INC-03"] <= 9.0
    assert 14.5 <= rt_map["INC-02"] <= 15.5
    assert 8.5 <= rt_map["INC-01"] <= 9.5

    # 5. Baseline comparison
    metrics = {m["metric"]: m for m in report["baseline"]}
    assert "First Responder Arrival" in metrics
    assert "Avg Dispatch Time" in metrics
    assert "High-Risk Incident Triaged" in metrics

    arr = metrics["First Responder Arrival"]
    assert arr["samanvaya"] < arr["baseline"]  # Samanvaya is significantly faster than FCFS
    assert arr["unit"] == "minutes"

    # 6. Unresolved incidents
    # In events.json, all 3 incidents are closed at the end (events 68, 69, 70)
    assert report["unresolved"] == []
