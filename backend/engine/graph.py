"""
Samanvaya Engine - Road Network Graph Builder
Builds a NetworkX graph representation from road and node specifications.
Compatible with contracts/seed/roads.json.
"""
from typing import Any
import json
from pathlib import Path
import networkx as nx

CONTRACTS_ROADS_PATH = Path(__file__).resolve().parent.parent.parent / "contracts" / "seed" / "roads.json"


def build_graph(network: dict[str, Any] | list[dict[str, Any]] | str | Path | None = None) -> nx.MultiGraph:
    """
    Builds a bidirectional NetworkX MultiGraph from a network dict, list of roads, or path to roads.json.
    
    Nodes: N1 to N8 (with coordinates and names)
    Edges: Road segments with roadId, id, name, lengthKm, status ('open' | 'slow' | 'closed')
    """
    if network is None:
        network = CONTRACTS_ROADS_PATH

    if isinstance(network, (str, Path)):
        with open(network, "r", encoding="utf-8") as f:
            network_data = json.load(f)
    elif isinstance(network, dict):
        network_data = network
    elif isinstance(network, list):
        # Passed list of roads: load base nodes and network from contracts/seed/roads.json
        base_data = {}
        if CONTRACTS_ROADS_PATH.exists():
            with open(CONTRACTS_ROADS_PATH, "r", encoding="utf-8") as f:
                base_data = json.load(f)
        network_data = {"nodes": base_data.get("nodes", []), "roads": network}
    else:
        network_data = {}

    graph = nx.MultiGraph()

    # Add nodes with metadata
    for node in network_data.get("nodes", []):
        node_id = node.get("nodeId") or node.get("id")
        graph.add_node(
            node_id,
            nodeId=node_id,
            id=node_id,
            name=node.get("name", node_id),
            lat=node.get("lat"),
            lng=node.get("lng") if "lng" in node else node.get("lon"),
            lon=node.get("lng") if "lng" in node else node.get("lon"),
        )

    # Add edges with road metadata
    for road in network_data.get("roads", []):
        road_id = road.get("roadId") or road.get("id")
        from_node = road.get("fromNode")
        to_node = road.get("toNode")
        if not from_node or not to_node:
            continue
        graph.add_edge(
            from_node,
            to_node,
            key=road_id,
            roadId=road_id,
            id=road_id,
            name=road.get("name", road_id),
            lengthKm=float(road.get("lengthKm", 1.0)),
            status=road.get("status", "open"),
            speedLimitKmH=float(road.get("speedLimitKmH", 40.0)),
            isWaterway=bool(road.get("isWaterway", False)),
        )

    return graph
