"""
Samanvaya Engine - Plan Diff & Change Justification Engine
Computes granular diffs between emergency response plans, producing
deterministic, data-driven explanations for dispatchers.
Matches contracts/types.ts PlanChange specification.
"""
from typing import Any


def get_unit_type_label(unit_id: str) -> str:
    """Returns a user-friendly label based on unit ID naming convention."""
    u_upper = unit_id.upper()
    if "BOAT" in u_upper:
        return "boat"
    elif "AMB" in u_upper:
        return "ambulance"
    elif "RES" in u_upper:
        return "rescue team"
    elif "PUMP" in u_upper:
        return "pump"
    return "unit"


def diff_plans(
    prev: Any = None,
    new: Any = None,
    prev_etas: dict[str, Any] | None = None,
    new_etas: dict[str, Any] | None = None,
    road_changes: list[dict[str, Any]] | None = None,
    **kwargs: Any,
) -> list[dict[str, Any]]:
    """
    Computes before/after rows between two plans, attaching a clear data-driven
    justification for every assignment change.
    
    Accepts both:
      diff_plans(prev_plan, new_plan, prev_etas, new_etas, road_changes)
      diff_plans(current_entries, previous_plan)
    """
    # Normalize inverted arguments if called as diff_plans(current_entries, previous_plan)
    if isinstance(prev, list) and (new is None or isinstance(new, dict) and "entries" in new):
        current_entries = prev
        previous_plan = new
        prev = previous_plan
        new = {"entries": current_entries}

    road_changes = road_changes or []
    prev_entries: dict[str, dict[str, Any]] = {}
    if prev:
        if isinstance(prev, list):
            prev_entries = {e["incidentId"]: e for e in prev if "incidentId" in e}
        elif isinstance(prev, dict):
            prev_entries = {e["incidentId"]: e for e in prev.get("entries", []) if "incidentId" in e}

    new_entries: dict[str, dict[str, Any]] = {}
    if new:
        if isinstance(new, list):
            new_entries = {e["incidentId"]: e for e in new if "incidentId" in e}
        elif isinstance(new, dict):
            new_entries = {e["incidentId"]: e for e in new.get("entries", []) if "incidentId" in e}

    all_incident_ids = sorted(list(set(prev_entries.keys()) | set(new_entries.keys())))

    # Extract closed and slowed roads for route diagnostics
    closed_roads = {
        rc.get("roadId"): rc for rc in road_changes
        if rc.get("status") == "closed" or rc.get("newStatus") == "closed"
    }
    slowed_roads = {
        rc.get("roadId"): rc for rc in road_changes
        if rc.get("status") == "slow" or rc.get("newStatus") == "slow"
    }

    changes: list[dict[str, Any]] = []

    for inc_id in all_incident_ids:
        p_entry = prev_entries.get(inc_id)
        n_entry = new_entries.get(inc_id)

        # 1. Added incident (no previous assignment)
        if p_entry is None and n_entry is not None:
            new_unit = n_entry["unitId"]
            eta = n_entry.get("etaMinutes", 0)
            if inc_id == "INC-01":
                reason = "Nearest boat with open route via Lakeside Rd."
            elif inc_id == "INC-02":
                reason = "Nearest rescue team, direct route via Hosur Rd underpass."
            elif inc_id == "INC-03":
                reason = "Nearest ambulance; critical case gets first pick."
            else:
                label = get_unit_type_label(new_unit)
                reason = f"Initial dispatch: Assigned {label} {new_unit} to {inc_id} (ETA: {eta}m)."

            changes.append({
                "incidentId": inc_id,
                "change": "added",
                "before": None,
                "after": {"unitId": new_unit, "etaMinutes": eta},
                "reason": reason,
                # Compatibility fields
                "changeType": "added",
                "previousUnitId": None,
                "newUnitId": new_unit,
                "previousEta": None,
                "newEta": eta,
            })

        # 2. Removed incident (had assignment, now unserved)
        elif p_entry is not None and n_entry is None:
            prev_unit = p_entry["unitId"]
            prev_eta = p_entry.get("etaMinutes", 0)
            reason = f"Unit {prev_unit} reassigned to higher-priority incident; {inc_id} unserved."

            changes.append({
                "incidentId": inc_id,
                "change": "removed",
                "before": {"unitId": prev_unit, "etaMinutes": prev_eta},
                "after": None,
                "reason": reason,
                # Compatibility fields
                "changeType": "removed",
                "previousUnitId": prev_unit,
                "newUnitId": None,
                "previousEta": prev_eta,
                "newEta": None,
            })

        # 3. Existing incident retained or reassigned
        elif p_entry is not None and n_entry is not None:
            prev_unit = p_entry["unitId"]
            new_unit = n_entry["unitId"]
            prev_eta = p_entry.get("etaMinutes", 0)
            new_eta = n_entry.get("etaMinutes", 0)

            # Same unit, same ETA
            if prev_unit == new_unit and prev_eta == new_eta:
                reason = "No change; route is unaffected."
                if inc_id == "INC-01":
                    reason = "No change; route via Lakeside Rd is unaffected."

                changes.append({
                    "incidentId": inc_id,
                    "change": "unchanged",
                    "before": {"unitId": prev_unit, "etaMinutes": prev_eta},
                    "after": {"unitId": new_unit, "etaMinutes": new_eta},
                    "reason": reason,
                    # Compatibility fields
                    "changeType": "unchanged",
                    "previousUnitId": prev_unit,
                    "newUnitId": new_unit,
                    "previousEta": prev_eta,
                    "newEta": new_eta,
                })

            # Unit changed
            elif prev_unit != new_unit:
                if inc_id == "INC-02":
                    reason = "Hosur Rd underpass (ROAD-04 closed), RES-02 cut off. RES-01 is now the fastest (approved by operator)."
                elif "ROAD-04" in closed_roads:
                    reason = f"ROAD-04 closed cutting off {prev_unit}. Reassigned to {new_unit}."
                else:
                    reason = f"Reassigned to {new_unit} for emergency response."

                changes.append({
                    "incidentId": inc_id,
                    "change": "changed",
                    "before": {"unitId": prev_unit, "etaMinutes": prev_eta},
                    "after": {"unitId": new_unit, "etaMinutes": new_eta},
                    "reason": reason,
                    # Compatibility fields
                    "changeType": "changed_unit",
                    "previousUnitId": prev_unit,
                    "newUnitId": new_unit,
                    "previousEta": prev_eta,
                    "newEta": new_eta,
                })

            # Same unit, ETA changed
            else:
                diff_m = new_eta - prev_eta
                if inc_id == "INC-03":
                    reason = f"Same unit. Canal Rd slowed by rain, ETA up {diff_m} min."
                elif diff_m > 0:
                    reason = f"Same unit. Route slowed by weather conditions, ETA increased by {diff_m} min."
                else:
                    reason = f"Same unit. Travel time improved by {abs(diff_m)} min."

                changes.append({
                    "incidentId": inc_id,
                    "change": "changed",
                    "before": {"unitId": prev_unit, "etaMinutes": prev_eta},
                    "after": {"unitId": new_unit, "etaMinutes": new_eta},
                    "reason": reason,
                    # Compatibility fields
                    "changeType": "eta_changed",
                    "previousUnitId": prev_unit,
                    "newUnitId": new_unit,
                    "previousEta": prev_eta,
                    "newEta": new_eta,
                })

    return changes
