"""
test_sms.py — Unit and integration tests for SMS endpoints.
"""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
AUTH_HEADER = {"Authorization": "Bearer test-operator-token"}


def test_sms_outbox_empty_initially():
    res = client.get("/sms/outbox", headers=AUTH_HEADER)
    assert res.status_code == 200
    data = res.json()
    assert "count" in data
    assert "messages" in data
    assert isinstance(data["messages"], list)


def test_sms_requires_auth():
    res = client.get("/sms/outbox")
    assert res.status_code == 401

    res = client.post("/sms/send", json={"to": "+919876543210", "body": "Hello"})
    assert res.status_code == 401


def test_sms_send_validation():
    res = client.post("/sms/send", json={"to": "+919876543210", "body": ""}, headers=AUTH_HEADER)
    assert res.status_code == 422


def test_sms_status_update_endpoint():
    res = client.post(
        "/sms/status-update",
        json={"to": "+919876543210", "incident_id": "INC-001", "new_status": "resolved"},
        headers=AUTH_HEADER,
    )
    assert res.status_code == 200
    data = res.json()
    assert "sid" in data
    assert data["to"] == "+919876543210"
