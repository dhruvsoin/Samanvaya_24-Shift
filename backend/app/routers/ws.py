"""
routers/ws.py — WebSocket endpoints per contracts/events.md.

Channels:
  /ws/operator               → operator and reviewer (receive all events)
  /ws/crew/{unitId}          → crew (assignment.*, unit.status_changed, unit.unavailable for own unit)
  /ws/reporter/{sessionId}   → reporter (reporter.message_sent, reporter.status_updated for own session)

Connection rules:
  - Token from ?token=<jwt>. Unauthorized / invalid tokens close with code 4001.
  - Role / unit mismatch closes with code 4003.
  - Handle plain text "ping" by replying plain text "pong".
  - Optional ?since=<eventId> replays missed events matching the channel filter.
  - Clean up subscription and background tasks on disconnect.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from ..auth import _decode
from ..bus import bus
from ..config import settings
from ..state import state

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])


def _ws_auth(token: str | None) -> dict | None:
    """Validate JWT token passed as query param; returns claims dict or None."""
    if not token:
        return None
    try:
        return _decode(token)
    except Exception:
        return None


def _matches_crew(envelope: dict, target_unit_id: str) -> bool:
    """Filter for crew channel: only assignment.*, unit.status_changed, unit.unavailable for target_unit_id."""
    event_type = envelope.get("type", "")
    allowed_prefixes = ("assignment.",)
    allowed_types = ("unit.status_changed", "unit.unavailable")
    
    if not (any(event_type.startswith(p) for p in allowed_prefixes) or event_type in allowed_types):
        return False

    payload = envelope.get("payload") or {}
    unit_id = payload.get("unitId")

    # Check nested assignment object if present
    if not unit_id and isinstance(payload.get("assignment"), dict):
        unit_id = payload["assignment"].get("unitId")

    # If assignment.cancelled has only assignmentId in payload, check state store
    if not unit_id and "assignmentId" in payload:
        asn = state.get_assignment(payload["assignmentId"])
        if asn:
            unit_id = asn.get("unitId")

    return unit_id == target_unit_id


def _matches_reporter(envelope: dict, target_session_id: str) -> bool:
    """Filter for reporter channel: only reporter.message_sent and reporter.status_updated for target_session_id."""
    event_type = envelope.get("type", "")
    if event_type not in ("reporter.message_sent", "reporter.status_updated"):
        return False

    payload = envelope.get("payload") or {}
    session_id = payload.get("sessionId")
    return session_id == target_session_id


async def _run_ws(
    ws: WebSocket,
    filter_fn: Callable[[dict], bool] | None,
    since: str | None,
) -> None:
    """Core WebSocket handler loop managing send, receive ping/pong, and cleanup."""
    await ws.accept()

    # 1. Replay missed events if ?since= was specified
    if since:
        for evt in bus.get_events_since(since):
            if filter_fn is None or filter_fn(evt):
                await ws.send_text(json.dumps(evt))

    # 2. Subscribe queue with filter
    queue = bus.subscribe_queue(filter_fn=filter_fn)

    async def sender():
        try:
            while True:
                evt = await queue.get()
                await ws.send_text(json.dumps(evt))
                queue.task_done()
        except (WebSocketDisconnect, asyncio.CancelledError):
            pass
        except Exception as e:
            logger.debug("WebSocket sender exception: %s", e)

    async def receiver():
        try:
            while True:
                data = await ws.receive_text()
                if data.strip() == "ping":
                    await ws.send_text("pong")
        except (WebSocketDisconnect, asyncio.CancelledError):
            pass
        except Exception as e:
            logger.debug("WebSocket receiver exception: %s", e)

    sender_task = asyncio.create_task(sender())
    receiver_task = asyncio.create_task(receiver())

    try:
        done, pending = await asyncio.wait(
            [sender_task, receiver_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
    finally:
        # Clean up tasks and unsubscribe from bus
        sender_task.cancel()
        receiver_task.cancel()
        bus.unsubscribe_queue(queue)


# ── Channel Endpoints ─────────────────────────────────────────────────

@router.websocket("/ws/operator")
async def ws_operator(
    ws: WebSocket,
    token: str | None = Query(default=None),
    since: str | None = Query(default=None),
) -> None:
    claims = _ws_auth(token)
    if claims is None and settings.dev_mode:
        claims = {"role": "operator", "sub": "operator"}
    if claims is None or claims.get("role") not in ("operator", "reviewer"):
        await ws.close(code=4001, reason="Unauthorized")
        return

    # Operator and reviewer receive all events
    await _run_ws(ws, filter_fn=None, since=since)


@router.websocket("/ws/crew/{unit_id}")
async def ws_crew(
    ws: WebSocket,
    unit_id: str,
    token: str | None = Query(default=None),
    since: str | None = Query(default=None),
) -> None:
    claims = _ws_auth(token)
    if claims is None and settings.dev_mode:
        claims = {"role": "crew", "sub": unit_id, "unitId": unit_id}
    if claims is None or claims.get("role") != "crew":
        await ws.close(code=4001, reason="Unauthorized")
        return

    # Crew token must match unitId in path
    if claims.get("unit_id") != unit_id:
        await ws.close(code=4003, reason="Unit mismatch")
        return

    def crew_filter(envelope: dict) -> bool:
        return _matches_crew(envelope, unit_id)

    await _run_ws(ws, filter_fn=crew_filter, since=since)


@router.websocket("/ws/reporter/{session_id}")
async def ws_reporter(
    ws: WebSocket,
    session_id: str,
    token: str | None = Query(default=None),
    since: str | None = Query(default=None),
) -> None:
    claims = _ws_auth(token)
    if claims is None or claims.get("role") != "reporter":
        await ws.close(code=4001, reason="Unauthorized")
        return

    # Reporter token sub must match sessionId in path (unless generic reporter token)
    sub = claims.get("sub")
    if sub and sub not in (session_id, "reporter"):
        await ws.close(code=4003, reason="Session mismatch")
        return

    def reporter_filter(envelope: dict) -> bool:
        return _matches_reporter(envelope, session_id)

    await _run_ws(ws, filter_fn=reporter_filter, since=since)
