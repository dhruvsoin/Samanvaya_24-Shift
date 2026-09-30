"""
tests/test_auth_roles.py — Authentication and role-based access control tests.

Tests:
  - POST /auth/login with seed/users.json operator credentials
  - POST /auth/crew-login with seed/users.json crew credentials
  - POST /auth/demo returning reviewer token
  - Signed tokens carry role, displayName, and unitId
  - require_role(*roles) dependency enforcement
  - Reviewer gets 403 on every POST except /auth/demo
  - create_reporter_session() helper and /reporter/session
  - Error envelope shape: {"error": {"code": ..., "message": ...}}
"""
from fastapi.testclient import TestClient

from app.auth import _decode, create_reporter_session, create_token
from app.main import app

client = TestClient(app)


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ── POST /auth/login ──────────────────────────────────────────────────

def test_login_success():
    r = client.post("/auth/login", json={"username": "operator", "password": "demo1234"})
    assert r.status_code == 200
    data = r.json()
    assert "token" in data
    assert data["role"] == "operator"
    assert data["displayName"] == "Duty Operator"
    assert data["unitId"] is None

    # Inspect signed token payload
    claims = _decode(data["token"])
    assert claims["role"] == "operator"
    assert claims["displayName"] == "Duty Operator"
    assert claims["unitId"] is None


def test_login_invalid_password():
    r = client.post("/auth/login", json={"username": "operator", "password": "wrongpassword"})
    assert r.status_code == 401
    data = r.json()
    assert "error" in data
    assert data["error"]["code"] == "unauthorized"
    assert "Invalid username or password" in data["error"]["message"]


# ── POST /auth/crew-login ─────────────────────────────────────────────

def test_crew_login_success():
    r = client.post("/auth/crew-login", json={"unitCode": "AMB-01", "pin": "1111"})
    assert r.status_code == 200
    data = r.json()
    assert "token" in data
    assert data["role"] == "crew"
    assert data["displayName"] == "AMB-01"
    assert data["unitId"] == "AMB-01"

    # Inspect signed token payload
    claims = _decode(data["token"])
    assert claims["role"] == "crew"
    assert claims["displayName"] == "AMB-01"
    assert claims["unitId"] == "AMB-01"


def test_crew_login_invalid_pin():
    r = client.post("/auth/crew-login", json={"unitCode": "AMB-01", "pin": "9999"})
    assert r.status_code == 401
    data = r.json()
    assert "error" in data
    assert data["error"]["code"] == "unauthorized"


def test_crew_login_unknown_unit():
    r = client.post("/auth/crew-login", json={"unitCode": "PLANE-01", "pin": "1111"})
    assert r.status_code == 401
    data = r.json()
    assert "error" in data
    assert data["error"]["code"] == "unauthorized"


# ── POST /auth/demo ───────────────────────────────────────────────────

def test_demo_login_success():
    r = client.post("/auth/demo")
    assert r.status_code == 200
    data = r.json()
    assert "token" in data
    assert data["role"] == "reviewer"
    assert data["displayName"] == "Demo Reviewer"
    assert data["unitId"] is None

    claims = _decode(data["token"])
    assert claims["role"] == "reviewer"
    assert claims["displayName"] == "Demo Reviewer"
    assert claims["unitId"] is None


# ── Protected Endpoints by Role ───────────────────────────────────────

def test_operator_access_operator_endpoints():
    login_resp = client.post("/auth/login", json={"username": "operator", "password": "demo1234"}).json()
    tok = login_resp["token"]

    # GET /incidents
    r_get = client.get("/incidents", headers=auth_header(tok))
    assert r_get.status_code == 200

    # POST /incidents/phone-in
    r_post = client.post(
        "/incidents/phone-in",
        headers=auth_header(tok),
        json={
            "location": {"lat": 12.929, "lng": 77.612, "label": "Silk Board"},
            "type": "flooded_home",
            "peopleAffected": 2,
            "language": "en",
        },
    )
    assert r_post.status_code == 200


def test_reviewer_read_only_and_post_blocked():
    demo_resp = client.post("/auth/demo").json()
    tok = demo_resp["token"]

    # Reviewer can read state (GET)
    r_get = client.get("/incidents", headers=auth_header(tok))
    assert r_get.status_code == 200

    # Reviewer gets 403 on POST
    r_post = client.post(
        "/incidents/phone-in",
        headers=auth_header(tok),
        json={
            "location": {"lat": 12.929, "lng": 77.612, "label": "Silk Board"},
            "type": "flooded_home",
            "peopleAffected": 2,
            "language": "en",
        },
    )
    assert r_post.status_code == 403
    data = r_post.json()
    assert "error" in data
    assert data["error"]["code"] == "forbidden"


def test_crew_access_and_rejection():
    crew_resp = client.post("/auth/crew-login", json={"unitCode": "AMB-01", "pin": "1111"}).json()
    tok = crew_resp["token"]

    # Crew can access GET /crew/assignment
    r_crew = client.get("/crew/assignment", headers=auth_header(tok))
    assert r_crew.status_code == 200

    # Crew is forbidden on operator-only endpoints
    r_op = client.get("/incidents", headers=auth_header(tok))
    assert r_op.status_code == 403
    assert r_op.json()["error"]["code"] == "forbidden"


def test_reporter_session_and_rejection():
    # Call create_reporter_session helper directly
    session = create_reporter_session(language="kn")
    assert session["sessionId"].startswith("SES-")
    assert session["language"] == "kn"
    assert "token" in session

    # Also test via endpoint POST /reporter/session
    r_sess = client.post("/reporter/session", json={"language": "hi"})
    assert r_sess.status_code == 200
    sess_data = r_sess.json()
    assert sess_data["sessionId"].startswith("SES-")
    assert sess_data["language"] == "hi"

    rep_tok = sess_data["token"]
    # Reporter can post message
    r_msg = client.post(
        "/reporter/message",
        headers=auth_header(rep_tok),
        json={"sessionId": sess_data["sessionId"], "text": "Need help", "language": "hi"},
    )
    assert r_msg.status_code == 200
    assert "messageId" in r_msg.json()

    # Reporter is forbidden on operator endpoints
    r_op = client.get("/incidents", headers=auth_header(rep_tok))
    assert r_op.status_code == 403
    assert r_op.json()["error"]["code"] == "forbidden"


# ── Error Envelope Format Tests ───────────────────────────────────────

def test_missing_auth_header_error_format():
    r = client.get("/incidents")
    assert r.status_code == 401
    data = r.json()
    assert "error" in data
    assert data["error"]["code"] == "unauthorized"
    assert "message" in data["error"]


def test_invalid_token_error_format():
    r = client.get("/incidents", headers=auth_header("invalid.jwt.token"))
    assert r.status_code == 401
    data = r.json()
    assert "error" in data
    assert data["error"]["code"] == "unauthorized"
    assert "message" in data["error"]


def test_not_found_error_format():
    # 404 from missing approval decision
    tok = client.post("/auth/login", json={"username": "operator", "password": "demo1234"}).json()["token"]
    r = client.post("/approvals/APR-NONEXISTENT/decision", headers=auth_header(tok), json={"decision": "approve"})
    assert r.status_code == 404
    data = r.json()
    assert "error" in data
    assert data["error"]["code"] == "not_found"
    assert "message" in data["error"]
