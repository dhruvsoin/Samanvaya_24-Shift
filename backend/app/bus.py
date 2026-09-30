"""
bus.py — In-process asyncio pub/sub event bus + WebSocket manager.

Event envelope (contracts/README.md §5):
    { "id": "evt_001", "type": "<EventType>", "ts": "<scenario time>", "payload": { ... } }

Key features:
    - publish(type, payload): builds envelope with sequential ID (evt_001, evt_002, ...),
      scenario clock timestamp, appends to in-memory log, and dispatches to subscribers.
      Never blocks the publisher.
    - subscribe(types, callback): for agents; supports sync or async callbacks.
      Events for the same entity are strictly delivered in order.
    - subscribe_queue(types, maxsize): for WebSocket clients (returns asyncio.Queue).
    - get_events_since(event_id): for replay.
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
from collections import deque
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from fastapi import WebSocket

from .clock import clock

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


@dataclass
class _AgentSub:
    types: set[str] | None  # None or containing '*' means wildcard
    callback: Callable[[dict], Any]

    def matches(self, event_type: str) -> bool:
        if self.types is None or "*" in self.types:
            return True
        return event_type in self.types


@dataclass
class _QueueSub:
    queue: asyncio.Queue[dict]
    types: set[str] | None  # None means wildcard
    filter_fn: Callable[[dict], bool] | None = None
    loop: asyncio.AbstractEventLoop | None = None

    def matches(self, envelope: dict) -> bool:
        event_type = envelope.get("type", "")
        if self.types is not None and "*" not in self.types and event_type not in self.types:
            return False
        if self.filter_fn is not None:
            try:
                return bool(self.filter_fn(envelope))
            except Exception as e:
                logger.exception("Error in queue filter_fn: %s", e)
                return False
        return True


class EventBus:
    """
    Central in-process asyncio pub/sub event bus.
    """

    def __init__(self) -> None:
        self._seq: int = 0
        self._log: list[dict] = []
        self._lock = threading.Lock()

        # Subscriptions
        self._agent_subs: list[_AgentSub] = []
        self._queue_subs: list[_QueueSub] = []

        # Entity queues and worker tasks for ordered delivery per entity
        self._entity_queues: dict[str, asyncio.Queue] = {}
        self._entity_tasks: dict[str, asyncio.Task] = {}

        # WebSocket connection sets (for backward-compatibility with routers/ws.py)
        self._operator_sockets: set[WebSocket] = set()
        self._crew_sockets: dict[str, set[WebSocket]] = {}
        self._reporter_sockets: dict[str, set[WebSocket]] = {}

    # ── Publication ───────────────────────────────────────────────────

    def publish(
        self,
        event_type: str,
        payload: dict[str, Any],
        ts: str | None = None,
        event_id: str | None = None,
    ) -> dict:
        """
        Builds the envelope (sequential id, scenario clock ts, type, payload),
        appends to the in-memory event log, and delivers to subscribers.
        NEVER blocks the publisher.
        """
        with self._lock:
            self._seq += 1
            envelope = {
                "id": event_id or f"evt_{self._seq:03d}",
                "type": event_type,
                "ts": ts or clock.now(),
                "payload": payload,
            }
            self._log.append(envelope)
            # Copy subscribers under lock
            queue_subs = list(self._queue_subs)
            agent_subs = [s for s in self._agent_subs if s.matches(event_type)]

        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        # 1. Non-blocking delivery to subscriber queues (WebSockets)
        for q_sub in queue_subs:
            if q_sub.matches(envelope):
                if q_sub.loop and q_sub.loop is not current_loop:
                    if not q_sub.loop.is_closed():
                        q_sub.loop.call_soon_threadsafe(q_sub.queue.put_nowait, envelope)
                else:
                    try:
                        q_sub.queue.put_nowait(envelope)
                    except asyncio.QueueFull:
                        logger.warning("Subscriber queue full; dropping event %s", envelope["id"])

        # 2. Backward-compatible direct WebSocket broadcast
        self._schedule_ws_broadcast(envelope)

        # 3. Agent subscriber delivery — ordered per entity
        if agent_subs:
            callbacks = [s.callback for s in agent_subs]
            entity_key = self._extract_entity_key(envelope)
            self._dispatch_agent_callbacks(entity_key, envelope, callbacks)

        return envelope

    # ── Subscriptions ─────────────────────────────────────────────────

    def subscribe(
        self,
        types: str | Iterable[str],
        callback: Callable[[dict], Any],
    ) -> Callable[[], None]:
        """
        Subscribe an agent callback to events.
        `types` can be a single event type, '*', or an iterable of event types.
        `callback` can be sync or async and is called with `envelope: dict`.
        Events for the same entity are guaranteed to be delivered in order.
        Returns an unsubscribe function.
        """
        if isinstance(types, str):
            type_set = None if types == "*" else {types}
        else:
            type_set = set(types)

        sub = _AgentSub(types=type_set, callback=callback)
        with self._lock:
            self._agent_subs.append(sub)

        def unsubscribe() -> None:
            with self._lock:
                if sub in self._agent_subs:
                    self._agent_subs.remove(sub)

        return unsubscribe

    def subscribe_queue(
        self,
        types: str | Iterable[str] | None = None,
        filter_fn: Callable[[dict], bool] | None = None,
        maxsize: int = 0,
    ) -> asyncio.Queue[dict]:
        """
        Subscribe an asyncio.Queue to events (ideal for WebSocket clients).
        `types` optionally filters event types (None or '*' receives all events).
        `filter_fn` optionally provides custom predicate filtering.
        Returns an asyncio.Queue that receives event envelopes in publication order.
        """
        if types is None or types == "*":
            type_set = None
        elif isinstance(types, str):
            type_set = {types}
        else:
            type_set = set(types)

        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        q: asyncio.Queue[dict] = asyncio.Queue(maxsize=maxsize)
        q_sub = _QueueSub(queue=q, types=type_set, filter_fn=filter_fn, loop=current_loop)
        with self._lock:
            self._queue_subs.append(q_sub)
        return q

    def unsubscribe_queue(self, queue: asyncio.Queue) -> None:
        """Unsubscribe an asyncio.Queue from the event bus."""
        with self._lock:
            self._queue_subs = [s for s in self._queue_subs if s.queue is not queue]

    # ── Replay & Query ────────────────────────────────────────────────

    def get_events_since(self, event_id: str | None = None) -> list[dict]:
        """
        Return logged events since event_id for replay.
        If event_id is None, returns all logged events.
        If event_id is specified, returns all events strictly after that event_id.
        """
        with self._lock:
            events = list(self._log)
        if not event_id:
            return events
        found = False
        out = []
        for evt in events:
            if found:
                out.append(evt)
            elif evt.get("id") == event_id:
                found = True
        return out

    def events_since(self, last_id: str | None) -> list[dict]:
        """Backwards compatibility for ?since= query parameter in WebSocket reconnect."""
        if last_id is None:
            return []
        return self.get_events_since(last_id)

    def reset(self) -> None:
        """Reset the event bus state (for testing)."""
        with self._lock:
            self._seq = 0
            self._log.clear()
            self._agent_subs.clear()
            self._queue_subs.clear()
            for task in list(self._entity_tasks.values()):
                try:
                    if not task.done():
                        loop = task.get_loop()
                        if not loop.is_closed():
                            task.cancel()
                except Exception:
                    pass
            self._entity_queues.clear()
            self._entity_tasks.clear()
            self._operator_sockets.clear()
            self._crew_sockets.clear()
            self._reporter_sockets.clear()

    # ── Internal Entity Ordering & Workers ────────────────────────────

    def _extract_entity_key(self, envelope: dict) -> str:
        """Extract entity identifier from payload to maintain entity-level ordering."""
        payload = envelope.get("payload")
        if not isinstance(payload, dict):
            return envelope.get("type", "_global_")

        for key in (
            "incidentId",
            "unitId",
            "sessionId",
            "approvalId",
            "assignmentId",
            "roadId",
            "zoneId",
            "planId",
            "messageId",
            "channelId",
            "entityId",
        ):
            val = payload.get(key)
            if val is not None and isinstance(val, (str, int)):
                return f"{key}:{val}"

        # Check nested structures (e.g. payload["assignment"]["unitId"])
        for parent in ("assignment", "incident", "unit", "approval", "plan"):
            nested = payload.get(parent)
            if isinstance(nested, dict):
                for child_key in ("unitId", "incidentId", "assignmentId", "approvalId", "planId", "id"):
                    val = nested.get(child_key)
                    if val is not None and isinstance(val, (str, int)):
                        return f"{child_key}:{val}"

        return envelope.get("type", "_global_")

    def _dispatch_agent_callbacks(
        self,
        entity_key: str,
        envelope: dict,
        callbacks: list[Callable[[dict], Any]],
    ) -> None:
        """Enqueues events per entity and processes them sequentially in an entity worker."""
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop is not None and loop.is_running():
            if entity_key not in self._entity_queues:
                self._entity_queues[entity_key] = asyncio.Queue()
            eq = self._entity_queues[entity_key]
            eq.put_nowait((envelope, callbacks))

            if entity_key not in self._entity_tasks or self._entity_tasks[entity_key].done():
                self._entity_tasks[entity_key] = loop.create_task(self._run_entity_worker(entity_key))
        else:
            # Sync context without running loop: execute synchronous callbacks in order
            for cb in callbacks:
                try:
                    res = cb(envelope)
                    if asyncio.iscoroutine(res):
                        res.close()
                except Exception as ex:
                    logger.exception("Error in subscriber callback for %s: %s", envelope.get("id"), ex)

    async def _run_entity_worker(self, entity_key: str) -> None:
        """Processes events for a specific entity in strict FIFO order."""
        try:
            eq = self._entity_queues.get(entity_key)
            if eq is None:
                return

            while not eq.empty():
                try:
                    envelope, callbacks = eq.get_nowait()
                except asyncio.QueueEmpty:
                    break

                for cb in callbacks:
                    try:
                        res = cb(envelope)
                        if asyncio.iscoroutine(res):
                            await res
                    except asyncio.CancelledError:
                        raise
                    except Exception as ex:
                        logger.exception("Error in agent callback for %s: %s", envelope.get("id"), ex)
                eq.task_done()
        except asyncio.CancelledError:
            pass
        finally:
            if entity_key in self._entity_queues and self._entity_queues[entity_key].empty():
                self._entity_queues.pop(entity_key, None)
                self._entity_tasks.pop(entity_key, None)

    # ── Backward-compatible WebSocket methods for ws.py ───────────────

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

    def _schedule_ws_broadcast(self, envelope: dict) -> None:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self._broadcast(envelope))
        except RuntimeError:
            pass

    async def _broadcast(self, envelope: dict) -> None:
        msg = json.dumps(envelope)
        event_type = envelope["type"]

        if event_type in _OPERATOR_EVENTS:
            await self._send_to_set(self._operator_sockets, msg)

        if event_type in _CREW_EVENTS:
            payload = envelope.get("payload", {})
            unit_id = payload.get("unitId") or payload.get("assignment", {}).get("unitId")
            if unit_id and unit_id in self._crew_sockets:
                await self._send_to_set(self._crew_sockets[unit_id], msg)

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


# singleton instance
bus = EventBus()
