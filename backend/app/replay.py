"""
replay.py — Replay demo events from contracts/seed/events.json into the bus and state store.
"""
from __future__ import annotations

import logging
from typing import Any

from .bus import bus
from .seed import events as load_seed_events
from .state import state

logger = logging.getLogger(__name__)


def replay_demo_events(events_list: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """
    Replays scripted demo events sequentially into the event bus and updates state.
    """
    evts = events_list or load_seed_events()
    for e in evts:
        etype = e.get("type")
        payload = e.get("payload", {})
        bus.publish(etype, payload, ts=e.get("ts"), event_id=e.get("id"))
        state.apply_event(e)
    return evts
