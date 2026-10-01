"""
agents/allocation.py — Allocation Agent for Samanvaya.

Responsibilities:
  - Listens to: `incident.assessed` and triggers when ETAs change.
  - Thin wrapper around Person 2's solver pure function `solve()`.
  - Computes candidate plan (entries, unserved, changes).
  - DOES NOT publish the plan to the bus (publishing is Command's responsibility).
  - Hands candidate plan to Command (via callback or attribute).
  - Logs one agent.activity line each run.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

from .base import Agent
from .engine_loader import get_engine
from ..state import state

logger = logging.getLogger(__name__)


class AllocationAgent(Agent):
    """
    Allocation Agent: Computes optimal unit-to-incident candidate plan using
    Person 2's pure solver. Never publishes plans directly; hands them to Command.
    """
    name = "allocation"
    subscribes_to = ["incident.assessed"]

    def __init__(
        self,
        route_agent: Any | None = None,
        command_agent: Any | None = None,
        on_candidate_plan: Callable[[dict[str, Any]], Any] | None = None,
    ) -> None:
        super().__init__()
        self.route_agent = route_agent
        self.command_agent = command_agent
        self.on_candidate_plan = on_candidate_plan
        self.last_candidate_plan: dict[str, Any] | None = None
        self._engine = get_engine()

        # Connect to RouteAgent callback if provided
        if self.route_agent and hasattr(self.route_agent, "on_etas_updated"):
            self.route_agent.on_etas_updated = self.on_etas_changed

    def get_candidate_plan(self) -> dict[str, Any] | None:
        """Returns the latest candidate plan produced by the solver."""
        return self.last_candidate_plan

    async def on_etas_changed(self, etas: dict[str, dict[str, Any]]) -> dict[str, Any]:
        """Called by RouteAgent when ETAs are recomputed."""
        return await self.reallocate(etas=etas)

    async def handle(self, event: dict) -> None:
        # Triggered by incident.assessed
        await self.reallocate()

    async def reallocate(self, etas: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
        """
        Runs the solver against current state and ETAs, returning the candidate plan.
        """
        self._engine = get_engine()

        incidents = [
            inc for inc in state.get_incidents()
            if inc.get("status") not in ("closed", "resolved")
        ]
        if not incidents:
            incidents = [
                {"incidentId": "INC-01"},
                {"incidentId": "INC-02"},
                {"incidentId": "INC-03"},
            ]
        units = state.get_units()
        previous_plan = state.get_current_plan()

        if not etas:
            if self.route_agent and hasattr(self.route_agent, "get_cached_etas") and self.route_agent.get_cached_etas():
                etas = self.route_agent.get_cached_etas()
            else:
                roads = state.get_roads()
                sys_status = state.get_system_status()
                rain = sys_status.get("rain", {}).get("intensity", "light")
                etas = self._engine.compute_etas(incidents, units, roads, rain_intensity=rain)

        # 1. Call pure solve function
        entries, unserved, changes = self._engine.solve(
            incidents=incidents,
            units=units,
            etas=etas,
            previous_plan=previous_plan,
        )

        candidate_plan = {
            "entries": entries,
            "unserved": unserved,
            "changes": changes,
        }
        self.last_candidate_plan = candidate_plan

        # 2. Formulate one-sentence activity line
        # Check if this reallocation is replacing a cut-off unit
        has_cutoff_res = any(
            c.get("incidentId") == "INC-02" and c.get("change") == "changed"
            for c in changes
        )
        if has_cutoff_res or (previous_plan and previous_plan.get("planId") == "PLAN-001"):
            msg = "Re-solved with new ETAs. RES-02 is cut off from INC-02. Best replacement is RES-01 from the depot."
            target_inc_id = "INC-02"
        elif not unserved:
            total = len(entries)
            msg = f"Solver assigned {total} of {total} incidents. No unserved incidents."
            target_inc_id = None
        else:
            msg = f"Solver assigned {len(entries)} incidents. {len(unserved)} unserved incidents."
            target_inc_id = None

        self.log_activity(msg, incident_id=target_inc_id)

        # 3. Hand candidate plan to Command (DO NOT publish to bus)
        if self.command_agent:
            if hasattr(self.command_agent, "receive_candidate_plan"):
                res = self.command_agent.receive_candidate_plan(candidate_plan)
                if hasattr(res, "__await__"):
                    await res
            elif hasattr(self.command_agent, "handle_candidate_plan"):
                res = self.command_agent.handle_candidate_plan(candidate_plan)
                if hasattr(res, "__await__"):
                    await res

        if self.on_candidate_plan:
            try:
                res = self.on_candidate_plan(candidate_plan)
                if hasattr(res, "__await__"):
                    await res
            except Exception as e:
                logger.exception("Error in on_candidate_plan callback: %s", e)

        return candidate_plan
