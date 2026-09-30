"""
tests/test_state.py — Unit tests for app.state.AppState.
"""
from app.state import AppState


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
