"""
tests/test_health.py — Smoke tests for /health and root endpoints.
"""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_returns_200():
    r = client.get("/health")
    assert r.status_code == 200


def test_health_body():
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert "scenarioTime" in body
    assert body["scenarioTime"].startswith("2026-10-10")


def test_root_returns_links():
    body = client.get("/").json()
    assert body["docs"] == "/docs"
    assert body["openapi"] == "/openapi.json"
    assert body["health"] == "/health"


def test_openapi_json_loads():
    r = client.get("/openapi.json")
    assert r.status_code == 200
    schema = r.json()
    assert schema["info"]["title"] == "Samanvaya API"
    # Verify all key endpoint groups are present in the schema
    paths = schema["paths"]
    required = [
        "/incidents", "/units", "/facilities", "/roads",
        "/zones", "/status", "/plan/current", "/plan/history",
        "/approvals", "/health",
    ]
    for path in required:
        assert path in paths, f"Missing from OpenAPI schema: {path}"


def test_cors_origin_configured():
    """CORS preflight for localhost:5173 must succeed."""
    r = client.options(
        "/units",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    # FastAPI returns 200 for OPTIONS with CORS configured
    assert r.status_code == 200
    assert "access-control-allow-origin" in r.headers
