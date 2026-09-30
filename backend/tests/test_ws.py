"""
tests/test_ws.py — WebSocket endpoint tests per contracts/events.md.

Tests:
  - Connect as each role (operator, reviewer, crew, reporter)
  - Role-based event filtering:
    - Operator and reviewer receive all events
    - Crew receives only assignment.*, unit.status_changed, unit.unavailable for own unit
    - Reporter receives only reporter.message_sent, reporter.status_updated for own session
  - Ping / pong handling
  - Missed event replay via ?since=<eventId>
  - Cleanup on disconnect (no lingering queues)
  - Unauthorized and mismatch rejection (codes 4001 and 4003)
"""
import json
import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.auth import create_token
from app.bus import bus
from app.clock import clock
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_state():
    bus.reset()
    clock.reset()
    yield
    bus.reset()
    clock.reset()


# ── Helpers ───────────────────────────────────────────────────────────

def operator_token() -> str:
    return create_token(sub="operator", role="operator")


def reviewer_token() -> str:
    return create_token(sub="reviewer", role="reviewer")


def crew_token(unit_id: str = "AMB-01") -> str:
    return create_token(sub=unit_id, role="crew", unit_id=unit_id)


def reporter_token(session_id: str = "SES-01") -> str:
    return create_token(sub=session_id, role="reporter")


# ── Ping / Pong Tests ─────────────────────────────────────────────────

def test_ws_operator_ping_pong():
    tok = operator_token()
    with client.websocket_connect(f"/ws/operator?token={tok}") as ws:
        ws.send_text("ping")
        assert ws.receive_text() == "pong"


def test_ws_crew_ping_pong():
    tok = crew_token("AMB-01")
    with client.websocket_connect(f"/ws/crew/AMB-01?token={tok}") as ws:
        ws.send_text("ping")
        assert ws.receive_text() == "pong"


def test_ws_reporter_ping_pong():
    tok = reporter_token("SES-01")
    with client.websocket_connect(f"/ws/reporter/SES-01?token={tok}") as ws:
        ws.send_text("ping")
        assert ws.receive_text() == "pong"


# ── Operator & Reviewer receive all events ─────────────────────────────

def test_ws_operator_receives_all_events():
    tok = operator_token()
    with client.websocket_connect(f"/ws/operator?token={tok}") as ws:
        bus.publish("incident.reported", {"incidentId": "INC-01"})
        bus.publish("road.status_changed", {"roadId": "ROAD-04", "status": "closed"})
        bus.publish("unit.status_changed", {"unitId": "BOAT-01", "status": "en_route"})

        msg1 = json.loads(ws.receive_text())
        assert msg1["type"] == "incident.reported"
        assert msg1["payload"]["incidentId"] == "INC-01"

        msg2 = json.loads(ws.receive_text())
        assert msg2["type"] == "road.status_changed"
        assert msg2["payload"]["roadId"] == "ROAD-04"

        msg3 = json.loads(ws.receive_text())
        assert msg3["type"] == "unit.status_changed"
        assert msg3["payload"]["unitId"] == "BOAT-01"


def test_ws_reviewer_receives_all_events():
    tok = reviewer_token()
    with client.websocket_connect(f"/ws/operator?token={tok}") as ws:
        bus.publish("status.updated", {"overallSeverity": "high"})
        msg = json.loads(ws.receive_text())
        assert msg["type"] == "status.updated"
        assert msg["payload"]["overallSeverity"] == "high"


# ── Crew Channel Filtering ────────────────────────────────────────────

def test_ws_crew_receives_only_own_unit_events():
    tok = crew_token("AMB-01")
    with client.websocket_connect(f"/ws/crew/AMB-01?token={tok}") as ws:
        # 1. Events that should be ignored by crew channel
        bus.publish("incident.reported", {"incidentId": "INC-01"})
        bus.publish("road.status_changed", {"roadId": "ROAD-04", "status": "closed"})

        # 2. Events for other units that should be filtered out
        bus.publish("unit.status_changed", {"unitId": "BOAT-01", "status": "en_route"})
        bus.publish("assignment.sent", {"assignment": {"assignmentId": "ASN-002", "unitId": "BOAT-01"}})

        # 3. Events for this crew unit that should be received
        bus.publish("assignment.sent", {"assignment": {"assignmentId": "ASN-001", "unitId": "AMB-01"}})
        bus.publish("unit.status_changed", {"unitId": "AMB-01", "status": "en_route"})
        bus.publish("unit.unavailable", {"unitId": "AMB-01", "reason": "maintenance"})

        # Assert only the 3 events for AMB-01 are delivered
        msg1 = json.loads(ws.receive_text())
        assert msg1["type"] == "assignment.sent"
        assert msg1["payload"]["assignment"]["unitId"] == "AMB-01"

        msg2 = json.loads(ws.receive_text())
        assert msg2["type"] == "unit.status_changed"
        assert msg2["payload"]["unitId"] == "AMB-01"

        msg3 = json.loads(ws.receive_text())
        assert msg3["type"] == "unit.unavailable"
        assert msg3["payload"]["unitId"] == "AMB-01"

        # Verify ping still works (confirming no extra queued events in front)
        ws.send_text("ping")
        assert ws.receive_text() == "pong"


# ── Reporter Channel Filtering ────────────────────────────────────────

def test_ws_reporter_receives_only_own_session_events():
    tok = reporter_token("SES-01")
    with client.websocket_connect(f"/ws/reporter/SES-01?token={tok}") as ws:
        # Irrelevant events
        bus.publish("incident.reported", {"incidentId": "INC-01"})
        bus.publish("reporter.message_sent", {"sessionId": "SES-99", "text": "Wrong session"})

        # Relevant events for SES-01
        bus.publish("reporter.message_sent", {"sessionId": "SES-01", "text": "Water rising"})
        bus.publish("reporter.status_updated", {"sessionId": "SES-01", "stage": "assigned"})

        msg1 = json.loads(ws.receive_text())
        assert msg1["type"] == "reporter.message_sent"
        assert msg1["payload"]["sessionId"] == "SES-01"
        assert msg1["payload"]["text"] == "Water rising"

        msg2 = json.loads(ws.receive_text())
        assert msg2["type"] == "reporter.status_updated"
        assert msg2["payload"]["sessionId"] == "SES-01"
        assert msg2["payload"]["stage"] == "assigned"

        ws.send_text("ping")
        assert ws.receive_text() == "pong"


# ── Replay with ?since=<eventId> ──────────────────────────────────────

def test_ws_replay_since():
    # Publish 4 events first
    e1 = bus.publish("status.updated", {"step": 1})
    e2 = bus.publish("status.updated", {"step": 2})
    e3 = bus.publish("status.updated", {"step": 3})
    e4 = bus.publish("status.updated", {"step": 4})

    tok = operator_token()
    # Connect with ?since=e2['id'] -> should receive e3 and e4
    with client.websocket_connect(f"/ws/operator?token={tok}&since={e2['id']}") as ws:
        msg1 = json.loads(ws.receive_text())
        assert msg1["id"] == e3["id"]
        assert msg1["payload"]["step"] == 3

        msg2 = json.loads(ws.receive_text())
        assert msg2["id"] == e4["id"]
        assert msg2["payload"]["step"] == 4

        # Followed by normal ping/pong
        ws.send_text("ping")
        assert ws.receive_text() == "pong"


def test_ws_crew_replay_since_respects_filter():
    bus.publish("unit.status_changed", {"unitId": "BOAT-01", "status": "busy"})  # evt_001
    bus.publish("unit.status_changed", {"unitId": "AMB-01", "status": "busy"})   # evt_002
    bus.publish("road.status_changed", {"roadId": "ROAD-04"})                     # evt_003
    bus.publish("unit.status_changed", {"unitId": "AMB-01", "status": "available"}) # evt_004

    tok = crew_token("AMB-01")
    # Replay since evt_001 -> should only get evt_002 and evt_004 for AMB-01
    with client.websocket_connect(f"/ws/crew/AMB-01?token={tok}&since=evt_001") as ws:
        msg1 = json.loads(ws.receive_text())
        assert msg1["id"] == "evt_002"
        assert msg1["payload"]["unitId"] == "AMB-01"

        msg2 = json.loads(ws.receive_text())
        assert msg2["id"] == "evt_004"
        assert msg2["payload"]["unitId"] == "AMB-01"


# ── Cleanup on Disconnect ─────────────────────────────────────────────

def test_ws_cleanup_on_disconnect():
    tok = operator_token()
    assert len(bus._queue_subs) == 0

    with client.websocket_connect(f"/ws/operator?token={tok}") as ws:
        ws.send_text("ping")
        assert ws.receive_text() == "pong"
        assert len(bus._queue_subs) == 1

    # After exiting the context manager, the WebSocket is closed and queue unsubscribed
    assert len(bus._queue_subs) == 0


# ── Auth & Mismatch Validation ────────────────────────────────────────

def test_ws_unauthorized_missing_token():
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/operator"):
            pass
    assert exc.value.code == 4001


def test_ws_unauthorized_wrong_role():
    # Crew token attempting to connect to operator channel
    tok = crew_token("AMB-01")
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"/ws/operator?token={tok}"):
            pass
    assert exc.value.code == 4001


def test_ws_crew_unit_mismatch():
    # Token for AMB-01 attempting to connect to BOAT-01 channel
    tok = crew_token("AMB-01")
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"/ws/crew/BOAT-01?token={tok}"):
            pass
    assert exc.value.code == 4003


def test_ws_reporter_session_mismatch():
    # Token for SES-01 attempting to connect to SES-02 channel
    tok = reporter_token("SES-01")
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"/ws/reporter/SES-02?token={tok}"):
            pass
    assert exc.value.code == 4003
