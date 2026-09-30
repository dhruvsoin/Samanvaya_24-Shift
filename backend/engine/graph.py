"""
Samanvaya Engine - Road Network Graph Builder
Builds a NetworkX graph representation from road and node specifications.
Compatible with both contracts/seed/roads.json and seed/roads.json formats.
"""

from typing import Any
import json
import networkx as nx


def build_graph(network: dict[str, Any] | str) -> nx.MultiGraph:
    """
    Builds a bidirectional NetworkX MultiGraph from a network dict or path to roads.json.
    
    Nodes: N1 to N8 (with coordinates and names)
    Edges: Road segments with id/roadId, name, lengthKm, status ('open' | 'slow' | 'closed'), speedLimitKmH, isWaterway
    """
    if isinstance(network, str):
        with open(network, "r", encoding="utf-8") as f:
            network_data = json.load(f)
    else:
        network_data = network

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
            lon=node.get("lng") or node.get("lon"),
        )

    # Add edges with road metadata
    for road in network_data.get("roads", []):
        road_id = road.get("roadId") or road.get("id")
        graph.add_edge(
            road["fromNode"],
            road["toNode"],
            key=road_id,
            id=road_id,
            roadId=road_id,
            name=road.get("name", road_id),
            lengthKm=float(road["lengthKm"]),
            status=road.get("status", "open"),
            speedLimitKmH=road.get("speedLimitKmH", 40.0),
            isWaterway=bool(road.get("isWaterway", False)),
        )

    return graph
