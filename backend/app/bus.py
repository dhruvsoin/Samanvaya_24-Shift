"""
bus.py — In-process event bus + WebSocket connection manager.

Event envelope (from contracts/README.md §5):
    { "id": "evt_001", "type": "<EventType>", "ts": "<scenario time>", "payload": { ... } }

WebSocket channels (from contracts/events.md):
    /ws/operator          → all events (operator + reviewer)
    /ws/crew/{unitId}     → assignment.*, unit.status_changed, unit.unavailable for that unit
    /ws/reporter/{sessionId} → reporter.message_sent, reporter.status_updated for that session

Connection rules:
    - Client sends plain text "ping"; server replies plain text "pong".
    - Optional ?since=<lastEventId> replays missed events.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections import deque
from typing import Any

from fastapi import WebSocket

from .clock import clock
from .state import state

logger = logging.getLogger(__name__)

# Events broadcast to the operator channel
_OPERATOR_EVENTS = {
    "incident.reported", "incident.assessed", "incident.updated", "incident.closed",
    "plan.published", "approval.requested", "approval.resolved",
    "assignment.sent", "assignment.accepted", "assignment.declined",
    "assignment.timeout", "assignment.cancelled",
    "unit.status_changed", "unit.unavailable", "unit.heartbeat_lost",
    "road.status_changed",
    "zone.comms_degraded", "zone.comms_restored",
    "comms.delivery_failed", "comms.channel_switched",
    "reporter.message_sent",
    "reporter.status_updated",
    "status.updated",
    "agent.activity",
}

# Events forwarded to crew channel (filtered per unitId)
_CREW_EVENTS = {
    "assignment.sent", "assignment.accepted", "assignment.declined",
    "assignment.timeout", "assignment.cancelled",
    "unit.status_changed", "unit.unavailable",
}

# Events forwarded to reporter channel (filtered per sessionId)
_REPORTER_EVENTS = {"reporter.message_sent", "reporter.status_updated"}


class EventBus:
    """
    Central event bus.  Call `bus.publish(type, payload)` from any router.
    Broadcasts to all matching WebSocket subscribers.

    Thread-safe: publish() schedules coroutines into the running loop.
    """

    def __init__(self) -> None:
        # recent event log for ?since= replay (keep last 500)
        self._log: deque[dict] = deque(maxlen=500)

        # WebSocket subscriber sets
        self._operator_sockets: set[WebSocket] = set()
        # crew sockets: {unit_id: set[WebSocket]}
        self._crew_sockets: dict[str, set[WebSocket]] = {}
        # reporter sockets: {session_id: set[WebSocket]}
        self._reporter_sockets: dict[str, set[WebSocket]] = {}

        # asyncio event loop reference (set on first publish from async context)
        self._loop: asyncio.AbstractEventLoop | None = None

    # ── event publication ─────────────────────────────────────────────

    def publish(self, event_type: str, payload: dict[str, Any]) -> dict:
        """
        Build the event envelope and broadcast to all matching sockets.
        Returns the envelope so callers can include it in HTTP responses if needed.
        Safe to call from sync or async code.
        """
        envelope = {
            "id": state.next_id("evt"),
            "type": event_type,
            "ts": clock.now(),
            "payload": payload,
        }
        self._log.append(envelope)

        # schedule async broadcast
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self._broadcast(envelope))
        except RuntimeError:
            # called from a sync context with no running loop — skip WS delivery
            # (fine for test environments)
            pass

        return envelope

    def events_since(self, last_id: str | None) -> list[dict]:
        """Return events logged after `last_id` (for ?since= reconnect replay)."""
        if last_id is None:
            return []
        events = list(self._log)
        found = False
        out = []
        for evt in events:
            if found:
                out.append(evt)
            if evt["id"] == last_id:
                found = True
        return out

    # ── WebSocket connection management ───────────────────────────────

    async def connect_operator(self, ws: WebSocket) -> None:
        await ws.accept()
        self._operator_sockets.add(ws)

    def disconnect_operator(self, ws: WebSocket) -> None:
        self._operator_sockets.discard(ws)

    async def connect_crew(self, ws: WebSocket, unit_id: str) -> None:
        await ws.accept()
        self._crew_sockets.setdefault(unit_id, set()).add(ws)

    def disconnect_crew(self, ws: WebSocket, unit_id: str) -> None:
        self._crew_sockets.get(unit_id, set()).discard(ws)

    async def connect_reporter(self, ws: WebSocket, session_id: str) -> None:
        await ws.accept()
        self._reporter_sockets.setdefault(session_id, set()).add(ws)

    def disconnect_reporter(self, ws: WebSocket, session_id: str) -> None:
        self._reporter_sockets.get(session_id, set()).discard(ws)

    # ── internal broadcast ────────────────────────────────────────────

    async def _broadcast(self, envelope: dict) -> None:
        msg = json.dumps(envelope)
        event_type = envelope["type"]

        # operator channel gets everything
        if event_type in _OPERATOR_EVENTS:
            await self._send_to_set(self._operator_sockets, msg)

        # crew channel — filter by unitId in payload
        if event_type in _CREW_EVENTS:
            payload = envelope.get("payload", {})
            unit_id = payload.get("unitId") or payload.get("assignment", {}).get("unitId")
            if unit_id and unit_id in self._crew_sockets:
                await self._send_to_set(self._crew_sockets[unit_id], msg)

        # reporter channel — filter by sessionId in payload
        if event_type in _REPORTER_EVENTS:
            payload = envelope.get("payload", {})
            session_id = payload.get("sessionId")
            if session_id and session_id in self._reporter_sockets:
                await self._send_to_set(self._reporter_sockets[session_id], msg)

    @staticmethod
    async def _send_to_set(sockets: set[WebSocket], msg: str) -> None:
        dead: set[WebSocket] = set()
        for ws in list(sockets):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.add(ws)
        sockets -= dead


# singleton
bus = EventBus()
