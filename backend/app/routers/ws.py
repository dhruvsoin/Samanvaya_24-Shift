"""
routers/ws.py — WebSocket endpoints.

/ws/operator               → operator + reviewer (all events)
/ws/crew/{unitId}          → crew (assignment.*, unit.* for own unit)
/ws/reporter/{sessionId}   → reporter (reporter.message_sent, reporter.status_updated)

Connection rules (from contracts/events.md):
  - Client sends plain text "ping"; server replies plain text "pong".
  - Optional ?since=<lastEventId> replays missed events.
  - Token passed as ?token=<jwt>  (WebSocket headers are browser-restricted).
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from ..auth import _decode  # re-use decode; no HTTPException in WS context
from ..bus import bus

router = APIRouter(tags=["WebSocket"])


def _ws_auth(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        return _decode(token)
    except Exception:
        return None


@router.websocket("/ws/operator")
async def ws_operator(
    ws: WebSocket,
    token: str | None = Query(default=None),
    since: str | None = Query(default=None),
) -> None:
    claims = _ws_auth(token)
    if claims is None or claims.get("role") not in ("operator", "reviewer"):
        await ws.close(code=4001, reason="Unauthorized")
        return

    await bus.connect_operator(ws)

    # replay missed events if ?since= is provided
    for evt in bus.events_since(since):
        await ws.send_text(json.dumps(evt))

    try:
        while True:
            data = await ws.receive_text()
            if data.strip() == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        bus.disconnect_operator(ws)


@router.websocket("/ws/crew/{unit_id}")
async def ws_crew(
    ws: WebSocket,
    unit_id: str,
    token: str | None = Query(default=None),
    since: str | None = Query(default=None),
) -> None:
    claims = _ws_auth(token)
    if claims is None or claims.get("role") != "crew":
        await ws.close(code=4001, reason="Unauthorized")
        return
    if claims.get("unit_id") != unit_id:
        await ws.close(code=4003, reason="Unit mismatch")
        return

    await bus.connect_crew(ws, unit_id)

    for evt in bus.events_since(since):
        await ws.send_text(json.dumps(evt))

    try:
        while True:
            data = await ws.receive_text()
            if data.strip() == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        bus.disconnect_crew(ws, unit_id)


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

    await bus.connect_reporter(ws, session_id)

    for evt in bus.events_since(since):
        await ws.send_text(json.dumps(evt))

    try:
        while True:
            data = await ws.receive_text()
            if data.strip() == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        bus.disconnect_reporter(ws, session_id)
