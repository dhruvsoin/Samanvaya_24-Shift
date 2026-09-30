"""
Samanvaya Engine Acceptance Tests
Verifies mathematical correctness, constraint satisfaction, and edge cases.

Acceptance Criteria:
1. Three incidents produce INC-01 -> BOAT-01, INC-02 -> RES-02, INC-03 -> AMB-01.
2. Closing ROAD-04 and slowing ROAD-05 produces INC-02 -> RES-01 (new unit),
   INC-03 -> AMB-01 with a higher ETA, INC-01 unchanged, each with a data-driven reason.
3. Ten incidents with three units leaves an unserved list and does not crash.
"""

import json
from pathlib import Path
import pytest

from backend.engine.graph import build_graph
from backend.engine.rain import apply_rain
from backend.engine.eta import compute_etas
from backend.engine.allocate import solve
from backend.engine.diff import diff_plans

ROOT_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture
def seed_data():
    with open(ROOT_DIR / "seed" / "roads.json", "r", encoding="utf-8") as f:
        roads = json.load(f)
    with open(ROOT_DIR / "seed" / "units.json", "r", encoding="utf-8") as f:
        units = json.load(f)
    with open(ROOT_DIR / "seed" / "incidents.json", "r", encoding="utf-8") as f:
        incidents = json.load(f)
    return roads, units, incidents


def test_acceptance_criteria_1_initial_dispatch(seed_data):
    """
    Test 1: Three incidents produce:
      INC-01 -> BOAT-01
      INC-02 -> RES-02
      INC-03 -> AMB-01
    """
    roads, units, incidents = seed_data
    graph = build_graph(roads)

    etas = compute_etas(graph, units, incidents, rain="none")
    result = solve(etas, incidents, units, previous_plan=None)

    assigned_map = {e["incidentId"]: e["unitId"] for e in result["entries"]}

    assert assigned_map.get("INC-01") == "BOAT-01", f"Expected INC-01 -> BOAT-01, got {assigned_map.get('INC-01')}"
    assert assigned_map.get("INC-02") == "RES-02", f"Expected INC-02 -> RES-02, got {assigned_map.get('INC-02')}"
    assert assigned_map.get("INC-03") == "AMB-01", f"Expected INC-03 -> AMB-01, got {assigned_map.get('INC-03')}"
    assert len(result["unserved"]) == 0


def test_acceptance_criteria_2_rain_rerouting_and_diff(seed_data):
    """
    Test 2: Closing ROAD-04 and slowing ROAD-05 produces:
      INC-01 -> BOAT-01 (unchanged)
      INC-02 -> RES-01 (new unit, reason mentions cut off / closed)
      INC-03 -> AMB-01 (higher ETA, reason mentions slowed)
    """
    roads, units, incidents = seed_data
    graph = build_graph(roads)

    # Phase 1: Initial
    etas_001 = compute_etas(graph, units, incidents, rain="none")
    plan_001 = solve(etas_001, incidents, units, previous_plan=None)

    # Phase 2: Heavy Rain
    road_changes = apply_rain(graph, "heavy")
    assert any(rc["roadId"] == "ROAD-04" and rc["newStatus"] == "closed" for rc in road_changes)
    assert any(rc["roadId"] == "ROAD-05" and rc["newStatus"] == "slow" for rc in road_changes)

    etas_002 = compute_etas(graph, units, incidents, rain="heavy")
    plan_002 = solve(etas_002, incidents, units, previous_plan=plan_001)

    diffs = diff_plans(plan_001, plan_002, etas_001, etas_002, road_changes)
    diff_map = {d["incidentId"]: d for d in diffs}

    # Verify INC-01 is unchanged
    assert diff_map["INC-01"]["changeType"] == "unchanged"
    assert diff_map["INC-01"]["newUnitId"] == "BOAT-01"

    # Verify INC-02 switched to RES-01 with appropriate data-driven reason
    assert diff_map["INC-02"]["changeType"] == "changed_unit"
    assert diff_map["INC-02"]["previousUnitId"] == "RES-02"
    assert diff_map["INC-02"]["newUnitId"] == "RES-01"
    assert "ROAD-04 closed" in diff_map["INC-02"]["reason"]

    # Verify INC-03 kept AMB-01 with increased ETA
    assert diff_map["INC-03"]["changeType"] == "eta_changed"
    assert diff_map["INC-03"]["previousUnitId"] == "AMB-01"
    assert diff_map["INC-03"]["newUnitId"] == "AMB-01"
    assert diff_map["INC-03"]["newEta"] > diff_map["INC-03"]["previousEta"]
    assert "Canal Rd slowed" in diff_map["INC-03"]["reason"]


def test_acceptance_criteria_3_scalability_unserved(seed_data):
    """
    Test 3: Ten incidents with three available units leaves an unserved list
    and does not crash.
    """
    roads, units, _ = seed_data
    graph = build_graph(roads)

    # Limit to 3 units
    three_units = units[:3]

    # Generate 10 incidents across different nodes and severities
    ten_incidents = []
    severities = ["critical", "high", "medium", "low"]
    types = ["flooded_home", "trapped", "medical", "stranded_vehicle"]

    for i in range(1, 11):
        target_node = f"N{(i % 8) + 1}"
        ten_incidents.append({
            "id": f"INC-10{i:02d}",
            "type": types[i % len(types)],
            "severity": severities[i % len(severities)],
            "status": "reported",
            "nearestNode": target_node,
            "peopleCount": i,
            "reportedAt": "2026-09-30T09:10:00Z",
            "timeWindowMinutes": 20,
        })

    etas = compute_etas(graph, three_units, ten_incidents, rain="none")
    result = solve(etas, ten_incidents, three_units, previous_plan=None)

    # At most 3 units can be assigned
    assert len(result["entries"]) <= 3
    # Remaining incidents must be cleanly listed in unserved
    assert len(result["unserved"]) == len(ten_incidents) - len(result["entries"])
    assert len(result["unserved"]) >= 7

    # Ensure all unserved incidents contain data-driven reasons
    for u in result["unserved"]:
        assert "reason" in u
        assert len(u["reason"]) > 0


def test_boat_can_cross_closed_flooded_roads(seed_data):
    """
    Verifies that boats can traverse road segments that are marked as 'closed' (submerged),
    reflecting Option C in APR-001.
    """
    roads, _, _ = seed_data
    graph = build_graph(roads)

    # Artificially close Causeway Rd (ROAD-04: N2 <-> N5)
    for u, v, k, d in graph.edges(keys=True, data=True):
        if d.get("id") == "ROAD-04":
            d["status"] = "closed"

    boat_unit = [{
        "id": "BOAT-TEST",
        "type": "boat",
        "status": "available",
        "nearestNode": "N2",
        "speedKmH": 12.0,
    }]
    incident_at_n5 = [{
        "id": "INC-TEST",
        "type": "trapped",
        "severity": "high",
        "nearestNode": "N5",
    }]

    etas = compute_etas(graph, boat_unit, incident_at_n5, rain="heavy")
    assert "INC-TEST" in etas
    assert "BOAT-TEST" in etas["INC-TEST"]
    assert "ROAD-04" in etas["INC-TEST"]["BOAT-TEST"]["pathRoadIds"]
