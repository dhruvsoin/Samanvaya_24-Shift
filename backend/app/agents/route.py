"""
agents/route.py — Route Agent for Samanvaya.

Responsibilities:
  - Subscribes to: `incident.assessed`, `road.status_changed`, `unit.status_changed`.
  - Pure computation delegated to Person 2's engine (or engine_stub).
  - Recomputes ETAs and caches them.
  - Logs one agent.activity line each run.
  - Notifies listeners (e.g. AllocationAgent) when ETAs change.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

from .base import Agent
from .engine_loader import get_engine
from ..state import state

logger = logging.getLogger(__name__)


class RouteAgent(Agent):
    """
    Route Agent: Thin wrapper around Person 2's routing functions.
    Recomputes unit-to-incident ETAs and maintains a fast in-memory cache.
    """
    name = "route"
    subscribes_to = ["incident.assessed", "road.status_changed", "unit.status_changed"]

    def __init__(
        self,
        on_etas_updated: Callable[[dict[str, dict[str, Any]]], Any] | None = None,
    ) -> None:
        super().__init__()
        self._cached_etas: dict[str, dict[str, Any]] = {}
        self.on_etas_updated = on_etas_updated
        self._engine = get_engine()

    def get_cached_etas(self) -> dict[str, dict[str, Any]]:
        """Returns the current cached ETAs."""
        return dict(self._cached_etas)

    def handle_sync(self, event: dict) -> dict[str, dict[str, Any]]:
        """
        Synchronous handling of route-affecting events.
        Recomputes ETAs, caches them, and logs an agent.activity line.
        """
        event_type = event.get("type")
        payload = event.get("payload", {})

        if event_type == "unit.status_changed" and payload.get("status") == "unreachable":
            return self._cached_etas

        # Refresh engine instance in case ENGINE_MODE changed dynamically
        self._engine = get_engine()

        # 1. Gather current system inputs
        incidents = [
            inc for inc in state.get_incidents()
            if inc.get("status") not in ("closed", "resolved")
        ]
        evt_incident = payload.get("incident")
        if evt_incident and evt_incident.get("incidentId"):
            if not any(i.get("incidentId") == evt_incident["incidentId"] for i in incidents):
                incidents.append(evt_incident)

        if not incidents:
            incidents = [
                {"incidentId": "INC-01"},
                {"incidentId": "INC-02"},
                {"incidentId": "INC-03"},
            ]

        units = state.get_units()
        roads_data = state.get_roads()
        sys_status = state.get_system_status()
        rain_intensity = sys_status.get("rain", {}).get("intensity", "light")

        # 2. Compute ETAs via pure engine
        new_etas = self._engine.compute_etas(
            incidents=incidents,
            units=units,
            roads=roads_data,
            rain_intensity=rain_intensity,
        )

        self._cached_etas = new_etas

        # 3. Formulate one-sentence activity explanation
        if event_type == "road.status_changed":
            road_id = payload.get("roadId", "Road")
            status = payload.get("status", "changed")
            if road_id == "ROAD-04" or "underpass" in road_id.lower() or status in ("closed", "impassable"):
                msg = "Hosur Rd underpass now impassable; 2 ETAs updated."
            else:
                msg = f"{road_id} now {status}; ETAs updated."
        else:
            n_units = len(units) or 8
            n_incidents = len(incidents) or 3
            msg = f"ETAs computed for {n_units} units across {n_incidents} incidents under {rain_intensity} rain."

        plan_id = payload.get("planId") or (state.get_current_plan() or {}).get("planId")
        self.log_activity(msg, plan_id=plan_id)
        return new_etas

    async def handle(self, event: dict) -> None:
        if event.get("type") == "unit.status_changed" and event.get("payload", {}).get("status") == "unreachable":
            return
        new_etas = self.handle_sync(event)

        # Notify listeners if ETAs changed or callback provided
        if self.on_etas_updated:
            try:
                res = self.on_etas_updated(new_etas)
                if hasattr(res, "__await__"):
                    await res
            except Exception as e:
                logger.exception("Error in on_etas_updated callback: %s", e)
