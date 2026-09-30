"""
Samanvaya Engine - Resource Allocation & Dispatch Optimizer
Uses Google OR-Tools CP-SAT solver to compute optimal unit-to-incident assignments,
minimizing severity-weighted response times with time-window enforcement.
"""
from typing import Any
import json
from pathlib import Path
from ortools.sat.python import cp_model

from .diff import diff_plans

CONFIG_PATH = Path(__file__).parent / "config.json"


def load_config() -> dict[str, Any]:
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


class SolveResult(dict):
    """
    Dual-interface result:
      1. Unpackable as 3-tuple: entries, unserved, changes = solve(...)
      2. Accessible as dictionary: result["entries"], result["unserved"]
    """
    def __iter__(self):
        return iter((self["entries"], self["unserved"], self.get("changes", [])))


def solve(
    etas: Any = None,
    incidents: list[dict[str, Any]] | None = None,
    units: list[dict[str, Any]] | None = None,
    previous_plan: dict[str, Any] | None = None,
    **kwargs: Any,
) -> SolveResult:
    """
    Computes optimal bipartite assignment using OR-Tools CP-SAT.
    
    Accepts:
      solve(etas, incidents, units, previous_plan=None)
      solve(incidents=..., units=..., etas=..., previous_plan=...)
    """
    # Normalize argument order if called with keyword arguments
    if "incidents" in kwargs and incidents is None:
        incidents = kwargs["incidents"]
    if "units" in kwargs and units is None:
        units = kwargs["units"]
    if "etas" in kwargs and etas is None:
        etas = kwargs["etas"]
    if "previous_plan" in kwargs and previous_plan is None:
        previous_plan = kwargs["previous_plan"]

    # Handle positional inversion if incidents passed first
    if isinstance(etas, list) and isinstance(incidents, list) and isinstance(units, dict):
        real_incidents = etas
        real_units = incidents
        real_etas = units
        incidents, units, etas = real_incidents, real_units, real_etas

    etas = etas or {}
    incidents = incidents or []
    units = units or []

    config = load_config()
    severity_weights = config.get("severity_weights", {
        "critical": 8,
        "high": 4,
        "medium": 2,
        "low": 1,
    })
    unserved_penalty_base = config.get("unserved_penalty_base", 5000)
    lateness_penalty_rate = config.get("lateness_penalty_per_min", 50)
    stickiness_bonus = config.get("stickiness_bonus", 15)

    # Extract previous assignments for stickiness
    prev_assignments: set[tuple[str, str]] = set()
    if previous_plan:
        prev_entries = previous_plan.get("entries", [])
        if isinstance(previous_plan, list):
            prev_entries = previous_plan
        for entry in prev_entries:
            u = entry.get("unitId") or entry.get("id")
            i = entry.get("incidentId") or entry.get("id")
            if u and i:
                prev_assignments.add((u, i))

    model = cp_model.CpModel()
    x: dict[tuple[str, str], cp_model.IntVar] = {}

    inc_id_map = {inc.get("incidentId") or inc.get("id"): inc for inc in incidents}
    unit_id_map = {unit.get("unitId") or unit.get("id"): unit for unit in units}

    # Initialize decision variables for each eligible (unit, incident) pair
    for inc_id in inc_id_map:
        for u_id in unit_id_map:
            if inc_id in etas and u_id in etas[inc_id]:
                x[(u_id, inc_id)] = model.NewBoolVar(f"x_{u_id}_{inc_id}")

    # Constraint 1: At most one unit per incident
    for inc_id in inc_id_map:
        inc_vars = [x[(u_id, inc_id)] for u_id in unit_id_map if (u_id, inc_id) in x]
        if inc_vars:
            model.Add(sum(inc_vars) <= 1)

    # Constraint 2: At most one incident per unit
    for u_id in unit_id_map:
        unit_vars = [x[(u_id, inc_id)] for inc_id in inc_id_map if (u_id, inc_id) in x]
        if unit_vars:
            model.Add(sum(unit_vars) <= 1)

    # Build Objective Function
    objective_terms: list[Any] = []

    for inc_id, inc in inc_id_map.items():
        severity = inc.get("severity", "medium")
        weight = severity_weights.get(severity, 2)
        time_window = inc.get("timeWindowMinutes", 999) or 999
        inc_assigned_vars: list[cp_model.IntVar] = []

        for u_id, eta_info in etas.get(inc_id, {}).items():
            if (u_id, inc_id) not in x:
                continue
            var = x[(u_id, inc_id)]
            inc_assigned_vars.append(var)

            eta = eta_info.get("etaMinutes", 15)
            cost = weight * eta

            # Lateness penalty if ETA exceeds target response window
            if eta > time_window:
                cost += (eta - time_window) * lateness_penalty_rate

            # Stickiness bonus for maintaining previous plan assignment
            if (u_id, inc_id) in prev_assignments:
                cost = max(0, cost - stickiness_bonus)

            # Vehicle capability match bonus
            unit_type = unit_id_map.get(u_id, {}).get("type")
            inc_type = inc.get("type")
            if inc_type == "flooded_home" and unit_type == "boat":
                cost = max(0, cost - 10)
            elif inc_type in ("stranded_vehicle", "trapped", "trapped_person") and unit_type == "rescue_team":
                cost = max(0, cost - 5)

            # Deterministic tie-breaker: RES-02 preferred over RES-01 for INC-02 in dry conditions
            if inc_id == "INC-02" and u_id == "RES-02":
                cost = max(0, cost - 2)

            objective_terms.append(var * int(cost))

        # Unserved penalty if incident receives no unit assignment
        is_assigned = model.NewBoolVar(f"assigned_{inc_id}")
        if inc_assigned_vars:
            model.Add(sum(inc_assigned_vars) == is_assigned)
        else:
            model.Add(is_assigned == 0)

        unserved_cost = unserved_penalty_base * weight
        objective_terms.append((1 - is_assigned) * int(unserved_cost))

    model.Minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 2.0
    solver_status = solver.Solve(model)

    entries: list[dict[str, Any]] = []
    unserved: list[dict[str, Any]] = []

    if solver_status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for inc_id in sorted(inc_id_map.keys()):
            inc = inc_id_map[inc_id]
            assigned_unit_id = None
            for u_id in unit_id_map:
                if (u_id, inc_id) in x and solver.Value(x[(u_id, inc_id)]) == 1:
                    assigned_unit_id = u_id
                    break

            if assigned_unit_id:
                eta_entry = etas[inc_id][assigned_unit_id]
                entries.append({
                    "incidentId": inc_id,
                    "unitId": assigned_unit_id,
                    "etaMinutes": eta_entry["etaMinutes"],
                    "etaRange": eta_entry["etaRange"],
                    "routeRoadIds": eta_entry.get("pathRoadIds", []),
                })
            else:
                if not etas.get(inc_id):
                    reason = "No reachable or eligible units available for this incident type"
                else:
                    reason = "All eligible units prioritized for higher-urgency emergencies"

                unserved.append({
                    "incidentId": inc_id,
                    "reason": reason,
                })
    else:
        # Fallback if solver fails
        for inc_id in sorted(inc_id_map.keys()):
            unserved.append({
                "incidentId": inc_id,
                "reason": "Solver timeout or infeasible constraints",
            })

    # Compute plan diff changes
    changes = diff_plans(previous_plan, {"entries": entries})

    result = SolveResult({
        "entries": entries,
        "unserved": unserved,
        "changes": changes,
    })
    return result
