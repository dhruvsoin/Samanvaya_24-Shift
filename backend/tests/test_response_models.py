import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import scenario as scenario_service
from app.state import state

client = TestClient(app)

@pytest.fixture(autouse=True)
def reset_state():
    scenario_service.reset()
    yield
    scenario_service.reset()

def get_op_token():
    return client.post("/auth/login", json={"username": "operator", "password": "demo1234"}).json()["token"]

def get_crew_token(unit_id):
    return client.post("/auth/crew-login", json={"unitCode": unit_id, "pin": "1111"}).json()["token"]

def get_reporter_token():
    resp = client.post("/reporter/session", json={"language": "en"}).json()
    return resp["token"], resp["sessionId"]

def test_all_routes_response_models():
    op_token = get_op_token()
    headers = {"Authorization": f"Bearer {op_token}"}

    # --- Scenario ---
    r = client.post("/scenario/reset", headers=headers)
    assert r.status_code == 200

    r = client.post("/scenario/inject-incident", json={
        "type": "medical",
        "zoneId": "ZONE-A",
        "peopleAffected": 1
    }, headers=headers)
    assert r.status_code == 200
    incident = r.json()
    incident_id = incident["incidentId"]

    r = client.post("/scenario/unit-offline", json={"unitId": "AMB-01"}, headers=headers)
    assert r.status_code == 200

    r = client.post("/scenario/rain-surge", json={"intensity": "heavy"}, headers=headers)
    assert r.status_code == 200

    r = client.post("/scenario/outage", json={"zoneId": "ZONE-B", "active": True}, headers=headers)
    assert r.status_code == 200

    r = client.post("/scenario/time-warp", json={"speed": 2}, headers=headers)
    assert r.status_code == 200

    # --- State ---
    assert client.get("/units", headers=headers).status_code == 200
    assert client.get("/facilities", headers=headers).status_code == 200
    assert client.get("/roads", headers=headers).status_code == 200
    assert client.get("/zones", headers=headers).status_code == 200
    assert client.get("/status", headers=headers).status_code == 200

    r = client.post("/units/AMB-02/status", json={"status": "en_route"}, headers=headers)
    assert r.status_code == 200

    # --- Incidents ---
    assert client.get("/incidents", headers=headers).status_code == 200

    r = client.post("/incidents/phone-in", json={
        "location": {"lat": 12.9716, "lng": 77.5946, "label": "Test"},
        "type": "flooded_home",
        "peopleAffected": 2,
        "language": "en"
    }, headers=headers)
    assert r.status_code == 200
    inc2_id = r.json()["incidentId"]

    # Sleep to allow agents to generate plans and approvals
    import time
    time.sleep(0.5)

    # --- Plan ---
    r = client.get("/plan/current", headers=headers)
    assert r.status_code == 200

    r = client.get("/plan/history", headers=headers)
    assert r.status_code == 200

    # Wait for approvals to be generated
    r = client.get("/approvals?status=pending", headers=headers)
    assert r.status_code == 200
    approvals = r.json()
    if approvals:
        appr_id = approvals[0]["approvalId"]
        r = client.post(f"/approvals/{appr_id}/decision", json={"decision": "approve"}, headers=headers)
        assert r.status_code == 200
        time.sleep(0.2) # wait for agents

    # Fetch plans again for diff
    history = client.get("/plan/history", headers=headers).json()
    if len(history) >= 2:
        p1 = history[0]["planId"]
        p2 = history[-1]["planId"]
        r = client.get(f"/plan/diff?from={p1}&to={p2}", headers=headers)
        assert r.status_code == 200

    # --- Reports ---
    assert client.get("/reports/after-action", headers=headers).status_code == 200
    assert client.get("/comms/log", headers=headers).status_code == 200
    assert client.get("/decisions", headers=headers).status_code == 200

    # --- Crew ---
    # Need to check assignment. AMB-02 or something.
    crew_token = get_crew_token("AMB-02")
    crew_headers = {"Authorization": f"Bearer {crew_token}"}
    r = client.get("/crew/assignment", headers=crew_headers)
    assert r.status_code == 200

    assignment = r.json()
    if assignment:
        asn_id = assignment["assignmentId"]
        r = client.post(f"/crew/assignment/{asn_id}/respond", json={"accept": True, "clientRequestId": "req1"}, headers=crew_headers)
        assert r.status_code == 200

    r = client.post("/crew/status", json={"action": "arrived", "clientRequestId": "req2"}, headers=crew_headers)
    assert r.status_code == 200

    r = client.post("/crew/problem", json={"kind": "road_blocked", "clientRequestId": "req3"}, headers=crew_headers)
    assert r.status_code == 200

    # --- Reporter ---
    rep_token, rep_session = get_reporter_token()
    rep_headers = {"Authorization": f"Bearer {rep_token}"}

    r = client.post("/reporter/message", json={"sessionId": rep_session, "text": "Help!"}, headers=rep_headers)
    assert r.status_code == 200

    with open("dummy.wav", "wb") as f:
        f.write(b"dummy audio data")
    
    with open("dummy.wav", "rb") as f:
        r = client.post("/reporter/voice", data={"sessionId": rep_session}, files={"audio": ("dummy.wav", f, "audio/wav")}, headers=rep_headers)
        assert r.status_code == 200

    import os
    os.remove("dummy.wav")
