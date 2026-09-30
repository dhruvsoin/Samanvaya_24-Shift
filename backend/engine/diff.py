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
    prev: dict[str, Any] | None,
    new: dict[str, Any],
    prev_etas: dict[str, Any] | None = None,
    new_etas: dict[str, Any] | None = None,
    road_changes: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """
    Computes before/after rows between two plans, attaching a clear data-driven
    justification for every assignment change.
    
    Returns:
      list[PlanChange]: matching contracts/types.ts
    """
    road_changes = road_changes or []
    prev_entries: dict[str, dict[str, Any]] = {}
    if prev and "entries" in prev:
        prev_entries = {e["incidentId"]: e for e in prev["entries"]}

    new_entries: dict[str, dict[str, Any]] = {e["incidentId"]: e for e in new.get("entries", [])}
    all_incident_ids = sorted(list(set(prev_entries.keys()) | set(new_entries.keys())))

    # Extract closed and slowed roads for route diagnostics
    closed_roads = {rc["roadId"]: rc for rc in road_changes if rc.get("newStatus") == "closed"}
    slowed_roads = {rc["roadId"]: rc for rc in road_changes if rc.get("newStatus") == "slow"}

    changes: list[dict[str, Any]] = []

    for inc_id in all_incident_ids:
        p_entry = prev_entries.get(inc_id)
        n_entry = new_entries.get(inc_id)

        # 1. Added incident (no previous assignment)
        if p_entry is None and n_entry is not None:
            new_unit = n_entry["unitId"]
            label = get_unit_type_label(new_unit)
            reason = f"Nearest {label}, route open"
            changes.append({
                "incidentId": inc_id,
                "change": "added",
                "changeType": "added",
                "before": None,
                "after": {
                    "unitId": new_unit,
                    "etaMinutes": n_entry["etaMinutes"],
                },
                "previousUnitId": None,
                "newUnitId": new_unit,
                "previousEta": None,
                "newEta": n_entry["etaMinutes"],
                "reason": reason,
            })

        # 2. Existing incident with new or modified assignment
        elif p_entry is not None and n_entry is not None:
            prev_unit = p_entry["unitId"]
            new_unit = n_entry["unitId"]
            prev_eta = p_entry["etaMinutes"]
            new_eta = n_entry["etaMinutes"]

            # Changed Unit
            if prev_unit != new_unit:
                cut_off_roads = [r for r in p_entry.get("routeRoadIds", []) if r in closed_roads]
                if cut_off_roads:
                    closed_id = cut_off_roads[0]
                    road_label = "ROAD-04 closed" if closed_id == "ROAD-04" else f"{closed_id} closed"
                    reason = f"{road_label}, {prev_unit} cut off. {new_unit} is now the fastest"
                else:
                    reason = f"{new_unit} is now the fastest available unit for this sector"

                changes.append({
                    "incidentId": inc_id,
                    "change": "changed",
                    "changeType": "changed_unit",
                    "before": {
                        "unitId": prev_unit,
                        "etaMinutes": prev_eta,
                    },
                    "after": {
                        "unitId": new_unit,
                        "etaMinutes": new_eta,
                    },
                    "previousUnitId": prev_unit,
                    "newUnitId": new_unit,
                    "previousEta": prev_eta,
                    "newEta": new_eta,
                    "reason": reason,
                })

            # Same Unit - ETA check
            elif new_eta != prev_eta:
                diff_min = new_eta - prev_eta
                impacted_slow = [rc for rid, rc in slowed_roads.items() if rid in n_entry.get("routeRoadIds", [])]
                if impacted_slow:
                    road_id = impacted_slow[0]["roadId"]
                    road_label = "Canal Rd" if road_id == "ROAD-05" else road_id
                    direction = "up" if diff_min > 0 else "down"
                    reason = f"Same unit. {road_label} slowed by rain, ETA {direction} {abs(diff_min)} min."
                else:
                    direction = "up" if diff_min > 0 else "down"
                    reason = f"Same unit. Route conditions changed, ETA {direction} {abs(diff_min)} min."

                changes.append({
                    "incidentId": inc_id,
                    "change": "changed",
                    "changeType": "eta_changed",
                    "before": {
                        "unitId": prev_unit,
                        "etaMinutes": prev_eta,
                    },
                    "after": {
                        "unitId": new_unit,
                        "etaMinutes": new_eta,
                    },
                    "previousUnitId": prev_unit,
                    "newUnitId": new_unit,
                    "previousEta": prev_eta,
                    "newEta": new_eta,
                    "reason": reason,
                })

            # Unchanged
            else:
                changes.append({
                    "incidentId": inc_id,
                    "change": "unchanged",
                    "changeType": "unchanged",
                    "before": {
                        "unitId": prev_unit,
                        "etaMinutes": prev_eta,
                    },
                    "after": {
                        "unitId": new_unit,
                        "etaMinutes": new_eta,
                    },
                    "previousUnitId": prev_unit,
                    "newUnitId": new_unit,
                    "previousEta": prev_eta,
                    "newEta": new_eta,
                    "reason": "Route open, priority unchanged",
                })

        # 3. Removed assignment (unit unassigned or incident closed)
        elif p_entry is not None and n_entry is None:
            unserved_list = new.get("unserved", [])
            match = next((u for u in unserved_list if u["incidentId"] == inc_id), None)
            if match:
                reason = f"Incident unserved: {match.get('reason', 'reassigned')}"
            else:
                reason = "Incident closed or resolved"

            changes.append({
                "incidentId": inc_id,
                "change": "removed",
                "changeType": "removed",
                "before": {
                    "unitId": p_entry["unitId"],
                    "etaMinutes": p_entry["etaMinutes"],
                },
                "after": None,
                "previousUnitId": p_entry["unitId"],
                "newUnitId": None,
                "previousEta": p_entry["etaMinutes"],
                "newEta": None,
                "reason": reason,
            })

    return changes
