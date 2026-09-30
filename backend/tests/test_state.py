from fastapi.testclient import TestClient

from app.bus import bus
from app.main import app
from app.state import AppState, state

client = TestClient(app)


def make_state() -> AppState:
    """Fresh state instance per test (don't mutate the global singleton)."""
    return AppState()


# ── ID generation ─────────────────────────────────────────────────────

def test_incident_id_format():
    s = make_state()
    assert s.next_id("INC") == "INC-01"
    assert s.next_id("INC") == "INC-02"


def test_plan_id_format():
    s = make_state()
    assert s.next_id("PLAN") == "PLAN-001"


def test_approval_id_format():
    s = make_state()
    assert s.next_id("APR") == "APR-001"


def test_assignment_id_format():
    s = make_state()
    assert s.next_id("ASN") == "ASN-001"


def test_session_id_format():
    s = make_state()
    assert s.next_id("SES") == "SES-01"


def test_message_id_format():
    s = make_state()
    assert s.next_id("MSG") == "MSG-001"


def test_evt_id_format():
    s = make_state()
    assert s.next_id("evt") == "evt_001"


# ── Seed loading ──────────────────────────────────────────────────────

def test_units_loaded():
    s = make_state()
    units = s.get_units()
    assert len(units) == 8
    ids = {u["unitId"] for u in units}
    assert "AMB-01" in ids
    assert "BOAT-01" in ids
    assert "RES-01" in ids
    assert "PUMP-01" in ids


def test_units_all_available_at_start():
    s = make_state()
    for u in s.get_units():
        assert u["status"] == "available"


def test_roads_loaded():
    s = make_state()
    roads = s.get_roads()
    assert len(roads["roads"]) == 10
    assert len(roads["nodes"]) == 8
    road_ids = {r["roadId"] for r in roads["roads"]}
    assert "ROAD-04" in road_ids


def test_zones_loaded():
    s = make_state()
    zones = s.get_zones()
    assert len(zones) == 3
    zone_ids = {z["zoneId"] for z in zones}
    assert {"ZONE-A", "ZONE-B", "ZONE-C"} == zone_ids


def test_facilities_loaded():
    s = make_state()
    facilities = s.get_facilities()
    assert len(facilities) == 3


# ── Auth helpers ──────────────────────────────────────────────────────

def test_verify_operator_correct():
    s = make_state()
    user = s.verify_operator("operator", "demo1234")
    assert user is not None
    assert user["username"] == "operator"


def test_verify_operator_wrong_password():
    s = make_state()
    assert s.verify_operator("operator", "wrong") is None


def test_verify_crew_correct():
    s = make_state()
    assert s.verify_crew("AMB-01", "1111") is True


def test_verify_crew_wrong_pin():
    s = make_state()
    assert s.verify_crew("AMB-01", "0000") is False


def test_verify_crew_unknown_unit():
    s = make_state()
    assert s.verify_crew("UNKNOWN", "1111") is False


# ── CRUD helpers ──────────────────────────────────────────────────────

def test_upsert_and_get_incident():
    s = make_state()
    inc_id = s.next_id("INC")
    inc = {"incidentId": inc_id, "status": "reported"}
    s.upsert_incident(inc)
    result = s.get_incident(inc_id)
    assert result is not None
    assert result["status"] == "reported"


def test_upsert_incident_updates():
    s = make_state()
    inc_id = s.next_id("INC")
    s.upsert_incident({"incidentId": inc_id, "status": "reported"})
    s.upsert_incident({"incidentId": inc_id, "status": "assessed"})
    assert s.get_incident(inc_id)["status"] == "assessed"


def test_incident_returns_deep_copy():
    s = make_state()
    inc_id = s.next_id("INC")
    s.upsert_incident({"incidentId": inc_id, "status": "reported"})
    result = s.get_incident(inc_id)
    result["status"] = "hacked"   # mutate the copy
    assert s.get_incident(inc_id)["status"] == "reported"  # original unchanged


def test_reset_clears_incidents():
    s = make_state()
    inc_id = s.next_id("INC")
    s.upsert_incident({"incidentId": inc_id, "status": "reported"})
    assert len(s.get_incidents()) == 1
    s.reset()
    assert s.get_incidents() == []


def test_update_road_status():
    s = make_state()
    road = s.update_road_status("ROAD-04", "closed")
    assert road["status"] == "closed"
    roads = s.get_roads()
    road_04 = next(r for r in roads["roads"] if r["roadId"] == "ROAD-04")
    assert road_04["status"] == "closed"


def test_update_zone_comms():
    s = make_state()
    zone = s.update_zone_comms("ZONE-B", "degraded")
    assert zone["commsStatus"] == "degraded"


# ── Integration: Endpoint Mutation & Event Emission ───────────────────

def test_change_unit_status_endpoint_updates_get_and_emits_event():
    """
    POST /units/{id}/status changes the unit's status, updates GET /units,
    and publishes unit.status_changed on the event bus.
    """
    bus.reset()
    state.reset()

    # 1. Capture events from bus
    events = []
    unsub = bus.subscribe("unit.status_changed", lambda evt: events.append(evt))

    # 2. Login as operator
    login_resp = client.post("/auth/login", json={"username": "operator", "password": "demo1234"}).json()
    tok = login_resp["token"]
    headers = {"Authorization": f"Bearer {tok}"}

    # 3. Verify initial status via GET /units
    r_get_init = client.get("/units", headers=headers)
    assert r_get_init.status_code == 200
    amb_init = next(u for u in r_get_init.json() if u["unitId"] == "AMB-01")
    assert amb_init["status"] == "available"

    # 4. Change unit status via endpoint
    r_post = client.post(
        "/units/AMB-01/status",
        headers=headers,
        json={"status": "on_scene", "note": "At waterlogged junction"},
    )
    assert r_post.status_code == 200
    updated = r_post.json()
    assert updated["unitId"] == "AMB-01"
    assert updated["status"] == "on_scene"

    # 5. Confirm GET /units reflects the new status
    r_get_after = client.get("/units", headers=headers)
    assert r_get_after.status_code == 200
    amb_after = next(u for u in r_get_after.json() if u["unitId"] == "AMB-01")
    assert amb_after["status"] == "on_scene"

    # 6. Confirm unit.status_changed event was published on the bus
    assert len(events) == 1
    evt = events[0]
    assert evt["type"] == "unit.status_changed"
    assert evt["payload"]["unitId"] == "AMB-01"
    assert evt["payload"]["status"] == "on_scene"
    assert evt["payload"]["previousStatus"] == "available"

    unsub()


def test_phone_in_incident_endpoint_updates_get_and_emits_event():
    """
    POST /incidents/phone-in creates the incident, updates GET /incidents,
    and publishes incident.reported on the event bus.
    """
    bus.reset()
    state.reset()

    events = []
    unsub = bus.subscribe("incident.reported", lambda evt: events.append(evt))

    login_resp = client.post("/auth/login", json={"username": "operator", "password": "demo1234"}).json()
    tok = login_resp["token"]
    headers = {"Authorization": f"Bearer {tok}"}

    # Confirm initially GET /incidents is empty
    r_get_init = client.get("/incidents", headers=headers)
    assert r_get_init.status_code == 200
    assert r_get_init.json() == []

    # POST phone-in
    r_post = client.post(
        "/incidents/phone-in",
        headers=headers,
        json={
            "location": {"lat": 12.929, "lng": 77.612, "label": "Silk Board Junction", "zoneId": "ZONE-A"},
            "type": "trapped_person",
            "peopleAffected": 3,
            "language": "en",
            "note": "Water rising above vehicle",
        },
    )
    assert r_post.status_code == 200
    inc = r_post.json()
    assert inc["incidentId"].startswith("INC-")
    assert inc["type"] == "trapped_person"
    assert inc["status"] == "reported"
    assert inc["source"] == "phone_in"

    # Confirm GET /incidents returns the new incident
    r_get_after = client.get("/incidents", headers=headers)
    assert r_get_after.status_code == 200
    assert len(r_get_after.json()) == 1
    assert r_get_after.json()[0]["incidentId"] == inc["incidentId"]

    # Confirm incident.reported event was published on bus
    assert len(events) == 1
    evt = events[0]
    assert evt["type"] == "incident.reported"
    assert evt["payload"]["incident"]["incidentId"] == inc["incidentId"]

    unsub()

