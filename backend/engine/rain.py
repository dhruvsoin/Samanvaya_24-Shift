"""
Samanvaya Engine - Rain Impact Assessment
Applies meteorological precipitation intensity rules to the road network graph.
"""
from typing import Any
import json
from pathlib import Path
import networkx as nx

CONFIG_PATH = Path(__file__).parent / "config.json"


def load_rain_rules() -> list[dict[str, Any]]:
    """Loads configurable rain impact rules from config.json."""
    if not CONFIG_PATH.exists():
        return []
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("rain_rules", [])


def apply_rain(graph: nx.MultiGraph, intensity: str) -> list[dict[str, Any]]:
    """
    Applies rain rules based on rain intensity ('none', 'light', 'moderate', 'heavy', 'extreme').
    Modifies graph edge statuses and returns a list of RoadChange objects matching contracts/types.ts.
    """
    intensity = intensity.lower()
    rules = load_rain_rules()
    changes: list[dict[str, Any]] = []

    # Map of road ID to edge endpoints
    road_map: dict[str, tuple[str, str, str, dict[str, Any]]] = {}
    for u, v, key, data in graph.edges(keys=True, data=True):
        road_id = data.get("roadId") or data.get("id") or key
        road_map[road_id] = (u, v, key, data)

    for rule in rules:
        target_conditions = [c.lower() for c in rule.get("condition", [])]
        target_road_id = rule.get("roadId")
        new_status = rule.get("newStatus") or rule.get("status")
        reason = rule.get("reason", f"Rain impact: {intensity}")

        if target_road_id in road_map:
            u, v, key, edge_data = road_map[target_road_id]
            current_status = edge_data.get("status", "open")

            if intensity in target_conditions:
                if current_status != new_status:
                    edge_data["status"] = new_status
                    changes.append({
                        "roadId": target_road_id,
                        "status": new_status,
                        "previousStatus": current_status,
                        "reason": reason,
                    })
            else:
                default_status = rule.get("defaultStatus", "open")
                if current_status != default_status:
                    edge_data["status"] = default_status
                    changes.append({
                        "roadId": target_road_id,
                        "status": default_status,
                        "previousStatus": current_status,
                        "reason": f"Rain cleared: restored to {default_status}",
                    })

    return changes
