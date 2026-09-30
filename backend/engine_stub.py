"""
backend/engine_stub.py — Stub implementation for Person 2's pure engine functions.

Provides:
  - compute_etas(incidents, units, roads, rain_intensity)
  - apply_rain(roads, rain_intensity)
  - solve(incidents, units, etas, previous_plan)
  - diff_plans(current_entries, previous_plan)

Returns hard-coded values matching contracts/seed/events.json PLAN-001 and PLAN-002.
Used until Person 2's pure functions exist in backend/engine/.
"""
from __future__ import annotations

import copy
from typing import Any


# ── Seed Hard-Coded Plans ─────────────────────────────────────────────

PLAN_001_ENTRIES = [
    {
        "incidentId": "INC-01",
        "unitId": "BOAT-01",
        "etaMinutes": 6,
        "etaRange": [5, 8],
    },
    {
        "incidentId": "INC-02",
        "unitId": "RES-02",
        "etaMinutes": 5,
        "etaRange": [4, 7],
    },
    {
        "incidentId": "INC-03",
        "unitId": "AMB-01",
        "etaMinutes": 4,
        "etaRange": [3, 6],
    },
]

PLAN_001_CHANGES = [
    {
        "incidentId": "INC-01",
        "change": "added",
        "before": None,
        "after": {"unitId": "BOAT-01", "etaMinutes": 6},
        "reason": "Nearest boat with open route via Lakeside Rd.",
    },
    {
        "incidentId": "INC-02",
        "change": "added",
        "before": None,
        "after": {"unitId": "RES-02", "etaMinutes": 5},
        "reason": "Nearest rescue team, direct route via Hosur Rd underpass.",
    },
    {
        "incidentId": "INC-03",
        "change": "added",
        "before": None,
        "after": {"unitId": "AMB-01", "etaMinutes": 4},
        "reason": "Nearest ambulance; critical case gets first pick.",
    },
]

PLAN_002_ENTRIES = [
    {
        "incidentId": "INC-01",
        "unitId": "BOAT-01",
        "etaMinutes": 6,
        "etaRange": [5, 8],
    },
    {
        "incidentId": "INC-02",
        "unitId": "RES-01",
        "etaMinutes": 9,
        "etaRange": [8, 12],
    },
    {
        "incidentId": "INC-03",
        "unitId": "AMB-01",
        "etaMinutes": 7,
        "etaRange": [6, 9],
    },
]

PLAN_002_CHANGES = [
    {
        "incidentId": "INC-01",
        "change": "unchanged",
        "before": {"unitId": "BOAT-01", "etaMinutes": 6},
        "after": {"unitId": "BOAT-01", "etaMinutes": 6},
        "reason": "No change; route via Lakeside Rd is unaffected.",
    },
    {
        "incidentId": "INC-02",
        "change": "changed",
        "before": {"unitId": "RES-02", "etaMinutes": 5},
        "after": {"unitId": "RES-01", "etaMinutes": 9},
        "reason": "Hosur Rd underpass closed, RES-02 cut off. RES-01 is now the fastest (approved by operator).",
    },
    {
        "incidentId": "INC-03",
        "change": "changed",
        "before": {"unitId": "AMB-01", "etaMinutes": 4},
        "after": {"unitId": "AMB-01", "etaMinutes": 7},
        "reason": "Same unit. Canal Rd slowed by rain, ETA up 3 min.",
    },
]


# ── Pure Engine Functions ─────────────────────────────────────────────

def apply_rain(roads: dict | list, rain_intensity: str = "light") -> dict | list:
    """
    Adjusts road speed factors or status based on rain intensity.
    """
    roads_copy = copy.deepcopy(roads)
    # If rain is heavy or extreme, roads are slowed down
    return roads_copy


def compute_etas(
    incidents: list[dict],
    units: list[dict],
    roads: dict | list,
    rain_intensity: str = "light",
) -> dict[str, dict[str, Any]]:
    """
    Computes ETAs for (unitId, incidentId) pairs under given road & rain conditions.
    Returns nested dict: {incidentId: {unitId: {"etaMinutes": int, "etaRange": [min, max]}}}
    """
    # Check if road-04 (Hosur Rd underpass) is closed or impassable
    road_list = roads if isinstance(roads, list) else roads.get("roads", [])
    underpass_closed = any(
        (r.get("roadId") == "ROAD-04" or "underpass" in r.get("name", "").lower())
        and r.get("status") in ("closed", "impassable", "flooded")
        for r in road_list
    )

    etas: dict[str, dict[str, Any]] = {}

    for inc in incidents:
        inc_id = inc.get("incidentId")
        if not inc_id:
            continue
        etas[inc_id] = {}

        if inc_id == "INC-01":
            etas[inc_id]["BOAT-01"] = {"etaMinutes": 6, "etaRange": [5, 8]}
            etas[inc_id]["BOAT-02"] = {"etaMinutes": 12, "etaRange": [10, 15]}
        elif inc_id == "INC-02":
            if underpass_closed:
                # RES-02 cut off
                etas[inc_id]["RES-01"] = {"etaMinutes": 9, "etaRange": [8, 12]}
                etas[inc_id]["RES-02"] = {"etaMinutes": 999, "etaRange": [999, 999]}  # Cut off
            else:
                etas[inc_id]["RES-02"] = {"etaMinutes": 5, "etaRange": [4, 7]}
                etas[inc_id]["RES-01"] = {"etaMinutes": 9, "etaRange": [8, 12]}
        elif inc_id == "INC-03":
            if underpass_closed or rain_intensity in ("heavy", "extreme"):
                # Canal Rd slowed by rain
                etas[inc_id]["AMB-01"] = {"etaMinutes": 7, "etaRange": [6, 9]}
            else:
                etas[inc_id]["AMB-01"] = {"etaMinutes": 4, "etaRange": [3, 6]}
            etas[inc_id]["AMB-02"] = {"etaMinutes": 11, "etaRange": [9, 14]}

    # Ensure all units have at least a fallback ETA if passed
    for inc in incidents:
        inc_id = inc.get("incidentId")
        if not inc_id:
            continue
        for u in units:
            u_id = u.get("unitId")
            if u_id and u_id not in etas[inc_id]:
                etas[inc_id][u_id] = {"etaMinutes": 15, "etaRange": [12, 18]}

    return etas


def diff_plans(
    current_entries: list[dict],
    previous_plan: dict | None = None,
) -> list[dict]:
    """
    Computes PlanChanges between candidate current_entries and previous_plan.
    """
    if not previous_plan or not previous_plan.get("entries"):
        # Initial plan: all entries are "added"
        changes = []
        for entry in current_entries:
            inc_id = entry["incidentId"]
            u_id = entry["unitId"]
            eta = entry["etaMinutes"]
            # Default reasons matching seed
            reason = f"Assigned {u_id} to {inc_id} with ETA {eta} min."
            if inc_id == "INC-01":
                reason = "Nearest boat with open route via Lakeside Rd."
            elif inc_id == "INC-02":
                reason = "Nearest rescue team, direct route via Hosur Rd underpass."
            elif inc_id == "INC-03":
                reason = "Nearest ambulance; critical case gets first pick."

            changes.append({
                "incidentId": inc_id,
                "change": "added",
                "before": None,
                "after": {"unitId": u_id, "etaMinutes": eta},
                "reason": reason,
            })
        return changes

    # Compare against previous plan entries
    prev_map = {e["incidentId"]: e for e in previous_plan.get("entries", [])}
    curr_map = {e["incidentId"]: e for e in current_entries}

    changes = []
    # Check current vs previous
    for inc_id, curr in curr_map.items():
        prev = prev_map.get(inc_id)
        if prev is None:
            changes.append({
                "incidentId": inc_id,
                "change": "added",
                "before": None,
                "after": {"unitId": curr["unitId"], "etaMinutes": curr["etaMinutes"]},
                "reason": f"New assignment: {curr['unitId']} to {inc_id}.",
            })
        elif prev["unitId"] == curr["unitId"] and prev["etaMinutes"] == curr["etaMinutes"]:
            reason = "No change; route is unaffected."
            if inc_id == "INC-01":
                reason = "No change; route via Lakeside Rd is unaffected."
            changes.append({
                "incidentId": inc_id,
                "change": "unchanged",
                "before": {"unitId": prev["unitId"], "etaMinutes": prev["etaMinutes"]},
                "after": {"unitId": curr["unitId"], "etaMinutes": curr["etaMinutes"]},
                "reason": reason,
            })
        else:
            reason = f"Assignment updated to {curr['unitId']} (ETA {curr['etaMinutes']} min)."
            if inc_id == "INC-02":
                reason = "Hosur Rd underpass closed, RES-02 cut off. RES-01 is now the fastest (approved by operator)."
            elif inc_id == "INC-03":
                reason = "Same unit. Canal Rd slowed by rain, ETA up 3 min."
            changes.append({
                "incidentId": inc_id,
                "change": "changed",
                "before": {"unitId": prev["unitId"], "etaMinutes": prev["etaMinutes"]},
                "after": {"unitId": curr["unitId"], "etaMinutes": curr["etaMinutes"]},
                "reason": reason,
            })

    # Check for removed incidents
    for inc_id, prev in prev_map.items():
        if inc_id not in curr_map:
            changes.append({
                "incidentId": inc_id,
                "change": "removed",
                "before": {"unitId": prev["unitId"], "etaMinutes": prev["etaMinutes"]},
                "after": None,
                "reason": f"Incident {inc_id} resolved or removed from plan.",
            })

    return changes


def solve(
    incidents: list[dict],
    units: list[dict],
    etas: dict[str, dict[str, Any]],
    previous_plan: dict | None = None,
) -> tuple[list[dict], list[dict], list[dict]]:
    """
    Pure optimization solver.
    Returns: (entries, unserved, changes)
    """
    # Detect if this matches scenario condition for PLAN-002:
    # E.g. previous plan was PLAN-001 or RES-02 is cut off / ETA >= 999
    res02_cutoff = False
    inc2_etas = etas.get("INC-02", {})
    if inc2_etas.get("RES-02", {}).get("etaMinutes", 0) >= 900:
        res02_cutoff = True

    is_plan_2 = bool(previous_plan and previous_plan.get("planId") == "PLAN-001") or res02_cutoff

    if is_plan_2:
        entries = copy.deepcopy(PLAN_002_ENTRIES)
        unserved: list[dict] = []
        changes = diff_plans(entries, previous_plan)
        return entries, unserved, changes

    # Default to PLAN-001 matching entries
    entries = copy.deepcopy(PLAN_001_ENTRIES)
    unserved = []
    changes = diff_plans(entries, previous_plan)
    return entries, unserved, changes
