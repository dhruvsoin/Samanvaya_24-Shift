"""
Samanvaya Engine - Acceptance Demo Script
Replays the emergency scenario, computing PLAN-001 and PLAN-002,
demonstrating dynamic rerouting, OR-Tools optimization, and plan diffing.
"""

import json
from pathlib import Path
from backend.engine.graph import build_graph
from backend.engine.rain import apply_rain
from backend.engine.eta import compute_etas
from backend.engine.allocate import solve
from backend.engine.diff import diff_plans

# Color formatting
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
MAGENTA = "\033[95m"
BOLD = "\033[1m"
RESET = "\033[0m"


def print_plan(title: str, plan_result: dict, diffs: list[dict], rain_level: str):
    print(f"\n{BOLD}{CYAN}======================================================================{RESET}")
    print(f"{BOLD}{CYAN}  {title} (Rain: {rain_level.upper()}){RESET}")
    print(f"{BOLD}{CYAN}======================================================================{RESET}")

    print(f"\n{BOLD}ACTIVE ASSIGNMENTS:{RESET}")
    print(f" {'INCIDENT':<10} {'ASSIGNED UNIT':<16} {'ETA':<8} {'RANGE':<10} {'ROUTE'}")
    print(" " + "-" * 65)
    for entry in plan_result["entries"]:
        r_str = " -> ".join(entry["routeRoadIds"]) if entry["routeRoadIds"] else "[direct]"
        range_str = f"[{entry['etaRange'][0]}-{entry['etaRange'][1]}m]"
        print(f" {entry['incidentId']:<10} {entry['unitId']:<16} {str(entry['etaMinutes'])+'m':<8} {range_str:<10} {r_str}")

    print(f"\n{BOLD}PLAN DIFF & JUSTIFICATIONS:{RESET}")
    print(f" {'INCIDENT':<10} {'CHANGE':<14} {'PREV -> NEW':<20} {'REASON'}")
    print(" " + "-" * 70)
    for d in diffs:
        p_u = d["previousUnitId"] or "None"
        n_u = d["newUnitId"] or "Unserved"
        change_tag = d["changeType"].upper()
        if change_tag == "ADDED":
            c_color = GREEN
        elif change_tag in ("CHANGED_UNIT", "ETA_CHANGED"):
            c_color = YELLOW
        elif change_tag == "UNCHANGED":
            c_color = RESET
        else:
            c_color = MAGENTA

        print(f" {d['incidentId']:<10} {c_color}{change_tag:<14}{RESET} {p_u} -> {n_u:<12} {d['reason']}")

    if plan_result.get("unserved"):
        print(f"\n{BOLD}UNSERVED INCIDENTS:{RESET}")
        for u in plan_result["unserved"]:
            print(f"  [!] {u['incidentId']} (Severity: {u['severity']}): {u['reason']}")
    print()


def main():
    root = Path(__file__).resolve().parent.parent.parent
    roads_path = root / "contracts" / "seed" / "roads.json"
    units_path = root / "contracts" / "seed" / "units.json"
    events_path = root / "contracts" / "seed" / "events.json"

    with open(roads_path, "r", encoding="utf-8") as f:
        network = json.load(f)
    with open(units_path, "r", encoding="utf-8") as f:
        units = json.load(f)
    with open(events_path, "r", encoding="utf-8") as f:
        events = json.load(f)

    incidents_map = {}
    for evt in events:
        if evt.get("type") in ("incident.assessed", "incident.reported"):
            inc = evt.get("payload", {}).get("incident")
            if inc and inc.get("incidentId") in ("INC-01", "INC-02", "INC-03"):
                inc_id = inc["incidentId"]
                if inc_id not in incidents_map or evt.get("type") == "incident.assessed":
                    incidents_map[inc_id] = inc
    incidents = [incidents_map[k] for k in sorted(incidents_map.keys())]

    # -------------------------------------------------------------
    # PHASE 1: Initial Dry Conditions -> Generate PLAN-001
    # -------------------------------------------------------------
    graph = build_graph(network)
    etas_001 = compute_etas(graph, units, incidents, rain="none")
    res_001 = solve(etas_001, incidents, units, previous_plan=None)
    diff_001 = diff_plans(None, res_001, None, etas_001, [])

    print_plan("PLAN-001: INITIAL DISPATCH DISCOVERY", res_001, diff_001, "none")

    # -------------------------------------------------------------
    # PHASE 2: Heavy Rain -> Road-04 Closes, Road-05 Slows -> PLAN-002
    # -------------------------------------------------------------
    road_changes = apply_rain(graph, "heavy")
    print(f"{BOLD}{YELLOW}>> METEOROLOGICAL ALERT: Heavy precipitation detected!{RESET}")
    for rc in road_changes:
        print(f"   * {rc['roadId']}: {rc['oldStatus']} -> {rc['newStatus'].upper()} ({rc['reason']})")

    etas_002 = compute_etas(graph, units, incidents, rain="heavy")
    res_002 = solve(etas_002, incidents, units, previous_plan=res_001)
    diff_002 = diff_plans(res_001, res_002, etas_001, etas_002, road_changes)

    print_plan("PLAN-002: CONTINGENCY RE-OPTIMIZATION", res_002, diff_002, "heavy")


if __name__ == "__main__":
    main()
