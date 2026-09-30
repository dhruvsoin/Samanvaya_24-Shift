import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.state import state

client = TestClient(app)

from app.services import scenario as scenario_service

@pytest.fixture(autouse=True)
def reset_state():
    scenario_service.reset()
    yield
    scenario_service.reset()

def test_decision_log_contains_null_keys():
    # Insert a decision log entry directly to verify JSON serialization
    state.append_decision_log({
        "decisionId": "DEC-999",
        "ts": "2026-10-10T10:00:00",
        "agent": "operator",
        "decision": "test",
        "reason": "test",
        "incidentId": None,
        "planId": None,
        "approvalId": None,
    })

    # The operator endpoint for decisions
    # Requires operator token, let's get one via login
    login_resp = client.post("/auth/login", json={"username": "operator", "password": "demo1234"})
    token = login_resp.json()["token"]

    response = client.get("/decisions", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    
    # Check that keys are present and have value None (null in JSON)
    entry = data[0]
    assert "incidentId" in entry
    assert entry["incidentId"] is None
    assert "planId" in entry
    assert entry["planId"] is None
    assert "approvalId" in entry
    assert entry["approvalId"] is None

def test_comms_log_contains_null_keys():
    state.append_comms_log({
        "entryId": "LOG-999",
        "ts": "2026-10-10T10:00:00",
        "direction": "in",
        "channel": "chat",
        "recipient": {"kind": "operator", "id": "operator"},
        "text": "test",
        "delivery": "sent",
        "zoneId": None,
    })

    login_resp = client.post("/auth/login", json={"username": "operator", "password": "demo1234"})
    token = login_resp.json()["token"]

    response = client.get("/comms/log", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    
    entry = data[0]
    assert "zoneId" in entry
    assert entry["zoneId"] is None

def test_phone_in_without_lat_returns_422():
    login_resp = client.post("/auth/login", json={"username": "operator", "password": "demo1234"})
    token = login_resp.json()["token"]

    # Missing 'lat' in location
    payload = {
        "location": {
            "lng": 77.5946,
            "label": "Test Location"
        },
        "type": "medical",
        "people_affected": 1,
        "language": "en"
    }

    response = client.post(
        "/incidents/phone-in", 
        json=payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 422
    assert "error" in response.json()
    assert response.json()["error"]["code"] == "validation_error"

def test_voice_without_audio_returns_422():
    # First, create a reporter session to get a token
    session_resp = client.post("/reporter/session", json={"language": "en"})
    assert session_resp.status_code == 200
    session_data = session_resp.json()
    token = session_data["token"]
    session_id = session_data["sessionId"]

    # Attempt to post to /reporter/voice without the audio file
    response = client.post(
        "/reporter/voice",
        data={"sessionId": session_id},  # Form data, but no audio file
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 422
    assert "error" in response.json()
    assert response.json()["error"]["code"] == "validation_error"
