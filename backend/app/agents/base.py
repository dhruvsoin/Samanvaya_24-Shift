"""
agents/base.py — Base Agent class and AgentRunner.

Each agent inherits from `Agent`:
  - `name`: AgentName ("intake", "assessment", "route", "allocation", "command")
  - `subscribes_to`: list of event types this agent reacts to
  - `async handle(event: dict) -> None`: coroutine invoked when a matching event arrives
  - `emit(type: str, payload: dict) -> dict`: publishes an event envelope to the bus
  - `log_activity(message: str, incident_id: str | None = None, plan_id: str | None = None) -> dict`:
      publishes an `agent.activity` event
  - `log_decision(...) -> dict`: appends a DecisionLogEntry to state and returns it

AgentRunner:
  - Registers agents
  - Starts agents (subscribes each agent to the bus for its `subscribes_to` types)
  - Isolates exceptions: wraps `handle(event)` in try/except so an agent exception never crashes the bus or other agents
  - On error: logs the exception and publishes an `agent.activity` error message:
      f"Error in {agent.name}: {exc}"
  - Stops / unsubscribes agents cleanly
"""
from __future__ import annotations

import abc
import logging
from collections.abc import Callable, Iterable
from typing import Any

from ..bus import bus
from ..clock import clock
from ..state import state

logger = logging.getLogger(__name__)


class Agent(abc.ABC):
    """
    Base class for all Samanvaya agents.
    """
    name: str = "agent"
    subscribes_to: list[str] = []

    def __init__(
        self,
        name: str | None = None,
        subscribes_to: list[str] | None = None,
    ) -> None:
        if name is not None:
            self.name = name
        if subscribes_to is not None:
            self.subscribes_to = list(subscribes_to)

    @abc.abstractmethod
    async def handle(self, event: dict) -> None:
        """
        Handle an incoming event envelope from the bus.
        Must be implemented by subclasses.
        """
        raise NotImplementedError

    def emit(self, event_type: str, payload: dict[str, Any]) -> dict:
        """Helper to publish an event envelope to the event bus."""
        return bus.publish(event_type, payload)

    def log_activity(
        self,
        message: str,
        incident_id: str | None = None,
        plan_id: str | None = None,
    ) -> dict:
        """
        Helper to publish an agent.activity event line for the operator stream.
        """
        return self.emit("agent.activity", {
            "agent": self.name,
            "message": message,
            "incidentId": incident_id,
            "planId": plan_id,
        })

    def log_decision(
        self,
        decision: str,
        reason: str,
        incident_id: str | None = None,
        plan_id: str | None = None,
        approval_id: str | None = None,
    ) -> dict:
        """
        Helper to record a DecisionLogEntry in the state store.
        """
        decision_id = state.next_id("DEC")
        ts = clock.now()
        entry = {
            "decisionId": decision_id,
            "ts": ts,
            "agent": self.name,
            "decision": decision,
            "reason": reason,
            "incidentId": incident_id,
            "planId": plan_id,
            "approvalId": approval_id,
        }
        state.append_decision_log(entry)
        return entry


class AgentRunner:
    """
    Manages agent lifecycle, bus subscriptions, and exception isolation.
    """

    def __init__(self, agents: list[Agent] | None = None) -> None:
        self.agents: list[Agent] = list(agents or [])
        self._unsubscribers: list[Callable[[], None]] = []
        self._running: bool = False

    def register(self, agent: Agent) -> None:
        """Register an agent with the runner."""
        self.agents.append(agent)
        if self._running:
            self._subscribe_agent(agent)

    def start(self) -> None:
        """Start all registered agents and subscribe them to the bus."""
        if self._running:
            return
        self._running = True
        for agent in self.agents:
            self._subscribe_agent(agent)

    def stop(self) -> None:
        """Stop all agents and unsubscribe them from the bus."""
        self._running = False
        for unsub in self._unsubscribers:
            try:
                unsub()
            except Exception:
                pass
        self._unsubscribers.clear()

    def _subscribe_agent(self, agent: Agent) -> None:
        """Subscribes an individual agent with complete exception isolation."""
        async def safe_callback(envelope: dict) -> None:
            try:
                await agent.handle(envelope)
            except Exception as exc:
                logger.exception("Agent %s failed handling event %s: %s", agent.name, envelope.get("id"), exc)
                # Isolate exception: record the error as an agent.activity line
                try:
                    payload = envelope.get("payload") or {}
                    inc_id = payload.get("incidentId")
                    if not inc_id and isinstance(payload.get("incident"), dict):
                        inc_id = payload["incident"].get("incidentId")
                    plan_id = payload.get("planId")

                    bus.publish("agent.activity", {
                        "agent": agent.name,
                        "message": f"Error in {agent.name}: {exc}",
                        "incidentId": inc_id,
                        "planId": plan_id,
                    })
                except Exception as inner_exc:
                    logger.error("Failed to emit agent.activity for %s error: %s", agent.name, inner_exc)

        unsub = bus.subscribe(agent.subscribes_to, safe_callback)
        self._unsubscribers.append(unsub)
