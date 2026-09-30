"""
Samanvaya Engine - Travel Time & ETA Matrix Calculator
Computes shortest path travel times, ETA ranges, and route segments
using Dijkstra's algorithm across the dynamic road graph.
"""

from typing import Any
import json
from pathlib import Path
import networkx as nx

CONFIG_PATH = Path(__file__).parent / "config.json"


def load_config() -> dict[str, Any]:
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def is_unit_eligible(unit: dict[str, Any], incident: dict[str, Any], config: dict[str, Any]) -> bool:
    """Checks whether a unit's status and capability match the incident requirements."""
    valid_statuses = config.get("valid_unit_statuses", ["available", "en_route"])
    if unit.get("status") not in valid_statuses:
        return False

    eligibility_map = config.get("eligibility", {
        "medical": ["ambulance"],
        "flooded_home": ["boat", "rescue_team"],
        "trapped": ["boat", "rescue_team"],
        "stranded_vehicle": ["rescue_team", "boat"],
        "road_blocked": ["pump"],
    })

    inc_type = incident.get("type", "")
    allowed_types = eligibility_map.get(inc_type, ["rescue_team", "ambulance", "boat"])
    return unit.get("type") in allowed_types


def get_edge_travel_time(
    edge_data: dict[str, Any],
    unit_type: str,
    base_speed_kmh: float,
    rain_multiplier: float = 1.0,
) -> float | None:
    """
    Calculates travel time (in minutes) across a road edge for a specific unit type.
    Returns None if the edge is impassable for that unit type.
    """
    status = edge_data.get("status", "open")
    length_km = float(edge_data.get("lengthKm", 1.0))
    is_waterway = bool(edge_data.get("isWaterway", False))

    if unit_type == "boat":
        # Boats can cross closed (flooded) roads, plus designated waterways
        if status == "closed" or is_waterway:
            return (length_km / max(1.0, base_speed_kmh)) * 60.0
        return None

    # Land vehicles (ambulance, rescue_team, pump)
    # Cannot drive across open waterways
    if is_waterway:
        return None

    if status == "closed":
        return None  # Road is submerged or impassable for land vehicles

    speed_factor = 0.5 if status == "slow" else 1.0
    effective_speed = base_speed_kmh * speed_factor
    return (length_km / max(1.0, effective_speed)) * 60.0


def compute_etas(
    graph: nx.MultiGraph,
    units: list[dict[str, Any]],
    incidents: list[dict[str, Any]],
    rain: str = "none",
) -> dict[str, dict[str, dict[str, Any]]]:
    """
    Computes the fastest arrival time from each eligible unit to each incident.
    Returns an EtaMatrix: { incident_id: { unit_id: EtaEntry } }
    """
    config = load_config()
    speeds = config.get("speeds_kmh", {
        "ambulance": 30.0,
        "rescue_team": 25.0,
        "boat": 12.0,
        "pump": 25.0,
    })
    rain_multipliers = config.get("rain_multipliers", {
        "none": 1.0,
        "light": 0.9,
        "moderate": 0.75,
        "heavy": 0.55,
        "extreme": 0.4,
    })
    rain_multiplier = rain_multipliers.get(rain.lower(), 1.0)
    last_mile = config.get("last_mile_minutes", 1.0)

    eta_matrix: dict[str, dict[str, dict[str, Any]]] = {}

    for inc in incidents:
        inc_id = inc["id"]
        inc_node = inc.get("nearestNode")
        eta_matrix[inc_id] = {}

        for unit in units:
            unit_id = unit["id"]
            if not is_unit_eligible(unit, inc, config):
                continue

            unit_node = unit.get("nearestNode")
            if not unit_node or not inc_node:
                continue

            unit_type = unit.get("type", "rescue_team")
            base_speed = float(unit.get("speedKmH") or speeds.get(unit_type, 25.0))

            if unit_node == inc_node:
                total_eta = round(last_mile)
                eta_range = [max(1, total_eta - 1), total_eta + 3]
                eta_matrix[inc_id][unit_id] = {
                    "unitId": unit_id,
                    "incidentId": inc_id,
                    "etaMinutes": total_eta,
                    "etaRange": eta_range,
                    "pathRoadIds": [],
                }
                continue

            # Build temporary traversal graph for this unit type
            traversal_graph = nx.DiGraph()
            for u, v, key, data in graph.edges(keys=True, data=True):
                tt = get_edge_travel_time(data, unit_type, base_speed, rain_multiplier)
                if tt is not None:
                    road_id = data.get("id", key)
                    if not traversal_graph.has_edge(u, v) or traversal_graph[u][v]["weight"] > tt:
                        traversal_graph.add_edge(u, v, weight=tt, road_id=road_id)
                    if not traversal_graph.has_edge(v, u) or traversal_graph[v][u]["weight"] > tt:
                        traversal_graph.add_edge(v, u, weight=tt, road_id=road_id)

            if not traversal_graph.has_node(unit_node) or not traversal_graph.has_node(inc_node):
                continue

            try:
                path_nodes = nx.shortest_path(traversal_graph, source=unit_node, target=inc_node, weight="weight")
                path_time = nx.shortest_path_length(traversal_graph, source=unit_node, target=inc_node, weight="weight")

                path_roads: list[str] = []
                for i in range(len(path_nodes) - 1):
                    p_u, p_v = path_nodes[i], path_nodes[i + 1]
                    path_roads.append(traversal_graph[p_u][p_v]["road_id"])

                total_eta = round(path_time + last_mile)
                eta_range = [max(1, total_eta - 1), total_eta + 3]

                eta_matrix[inc_id][unit_id] = {
                    "unitId": unit_id,
                    "incidentId": inc_id,
                    "etaMinutes": total_eta,
                    "etaRange": eta_range,
                    "pathRoadIds": path_roads,
                }
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                continue

    return eta_matrix
