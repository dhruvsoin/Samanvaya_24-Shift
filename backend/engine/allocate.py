"""
Samanvaya Engine - Resource Allocation & Dispatch Optimizer
Uses Google OR-Tools CP-SAT solver to compute optimal unit-to-incident assignments,
minimizing severity-weighted response times with time-window enforcement.
"""

from typing import Any
import json
from pathlib import Path
from datetime import datetime, timezone
from ortools.sat.python import cp_model

CONFIG_PATH = Path(__file__).parent / "config.json"


def load_config() -> dict[str, Any]:
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def solve(
    etas: dict[str, dict[str, dict[str, Any]]],
    incidents: list[dict[str, Any]],
    units: list[dict[str, Any]],
    previous_plan: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Computes optimal bipartite assignment using OR-Tools CP-SAT.
    
    Constraints:
      - At most one unit per incident.
      - At most one incident per unit.
      
    Objective:
      Minimise:
        sum_{u, i} [ x_{u,i} * (weight_i * eta_{u,i} + lateness_penalty - stickiness_bonus) ]
        + sum_i [ (1 - sum_u x_{u,i}) * unserved_penalty_i ]
        
    Returns:
      SolveResult: {"entries": list[PlanEntry], "unserved": list[Unserved]}
    """
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
        for entry in previous_plan.get("entries", []):
            prev_assignments.add((entry["unitId"], entry["incidentId"]))

    model = cp_model.CpModel()
    x: dict[tuple[str, str], cp_model.IntVar] = {}

    # Initialize decision variables for each eligible (unit, incident) pair
    for inc in incidents:
        inc_id = inc["id"]
        for unit in units:
            u_id = unit.get("unitId") or unit.get("id")
            if inc_id in etas and u_id in etas[inc_id]:
                x[(u_id, inc_id)] = model.NewBoolVar(f"x_{u_id}_{inc_id}")

    # Constraint 1: At most one unit per incident
    for inc in incidents:
        inc_id = inc["id"]
        inc_vars = [x[(u_id, inc_id)] for u_id in etas.get(inc_id, {}) if (u_id, inc_id) in x]
        if inc_vars:
            model.Add(sum(inc_vars) <= 1)

    # Constraint 2: At most one incident per unit
    for unit in units:
        u_id = unit.get("unitId") or unit.get("id")
        unit_vars = [x[(u_id, inc_id)] for inc_id in etas if (u_id, inc_id) in x]
        if unit_vars:
            model.Add(sum(unit_vars) <= 1)

    # Build Objective Function
    objective_terms: list[Any] = []

    for inc in incidents:
        inc_id = inc["id"]
        severity = inc.get("severity", "medium")
        weight = severity_weights.get(severity, 2)
        time_window = inc.get("timeWindowMinutes", 999)
        inc_assigned_vars: list[cp_model.IntVar] = []

        for u_id, eta_info in etas.get(inc_id, {}).items():
            if (u_id, inc_id) not in x:
                continue
            var = x[(u_id, inc_id)]
            inc_assigned_vars.append(var)

            eta_val = int(eta_info.get("etaMinutes", 10))
            cost = eta_val * weight

            # Lateness penalty if estimated time exceeds target window
            if eta_val > time_window:
                cost += (eta_val - time_window) * lateness_penalty_rate * weight

            # Continuity bonus to avoid unnecessary plan churn
            if (u_id, inc_id) in prev_assignments:
                cost -= stickiness_bonus * weight

            objective_terms.append(var * cost)

        # Unserved penalty if no unit is dispatched
        unserved_cost = int(unserved_penalty_base * weight)
        if inc_assigned_vars:
            # unserved_cost * (1 - sum(inc_assigned_vars))
            objective_terms.append(unserved_cost)
            objective_terms.append(-unserved_cost * sum(inc_assigned_vars))
        else:
            objective_terms.append(unserved_cost)

    if objective_terms:
        model.Minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5.0
    status = solver.Solve(model)

    now_iso = datetime.now(timezone.utc).isoformat()
    entries: list[dict[str, Any]] = []
    unserved: list[dict[str, Any]] = []

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        served_incident_ids: set[str] = set()

        for inc in incidents:
            inc_id = inc["id"]
            assigned_unit_id: str | None = None

            for u_id in etas.get(inc_id, {}):
                if (u_id, inc_id) in x and solver.Value(x[(u_id, inc_id)]) == 1:
                    assigned_unit_id = u_id
                    break

            if assigned_unit_id:
                served_incident_ids.add(inc_id)
                eta_entry = etas[inc_id][assigned_unit_id]
                entries.append({
                    "incidentId": inc_id,
                    "unitId": assigned_unit_id,
                    "etaMinutes": eta_entry["etaMinutes"],
                    "etaRange": eta_entry["etaRange"],
                    "routeRoadIds": eta_entry["pathRoadIds"],
                    "assignedAt": now_iso,
                    "status": "assigned",
                })
            else:
                # Determine data-driven reason for unserved incident
                severity = inc.get("severity", "medium")
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
        for inc in incidents:
            unserved.append({
                "incidentId": inc["id"],
                "reason": "Solver timeout or infeasible constraints",
            })

    return {
        "entries": entries,
        "unserved": unserved,
    }
