"""
tests/test_models_seed.py — Validates every event in contracts/seed/events.json
against the Pydantic v2 models in app.models.

Rule: fix the models, never the seed.
All 70 events must pass.
"""
from __future__ import annotations

import json
import pathlib
from typing import Any

import pytest
from pydantic import ValidationError

from app.models import ContractEventAdapter

# ── seed path ─────────────────────────────────────────────────────────────────

_SEED_EVENTS = (
    pathlib.Path(__file__).parent.parent.parent
    / "contracts" / "seed" / "events.json"
)


def _load_events() -> list[dict[str, Any]]:
    with open(_SEED_EVENTS, encoding="utf-8") as f:
        return json.load(f)


# ── parametrised test — one case per event ────────────────────────────────────

_ALL_EVENTS = _load_events()


@pytest.mark.parametrize(
    "raw",
    _ALL_EVENTS,
    ids=[f"{e['id']}:{e['type']}" for e in _ALL_EVENTS],
)
def test_event_validates(raw: dict[str, Any]) -> None:
    """Every seed event must validate cleanly against ContractEvent."""
    try:
        event = ContractEventAdapter.validate_python(raw)
    except ValidationError as exc:
        pytest.fail(
            f"Validation failed for {raw['id']} ({raw['type']}):\n{exc}"
        )

    # The discriminated union selected the right model
    assert event.type == raw["type"]
    assert event.id == raw["id"]
    assert event.ts == raw["ts"]


# ── aggregate test — all 70 must pass ────────────────────────────────────────

def test_all_70_events_present() -> None:
    assert len(_ALL_EVENTS) == 70, (
        f"Expected 70 events in seed, found {len(_ALL_EVENTS)}"
    )


def test_all_event_types_covered() -> None:
    """Every event type in the seed must be in ContractEvent's union."""
    seed_types = {e["type"] for e in _ALL_EVENTS}
    # Attempt validation of one event per type to confirm each is handled
    failures: list[str] = []
    for evt in _ALL_EVENTS:
        try:
            ContractEventAdapter.validate_python(evt)
        except ValidationError as exc:
            failures.append(f"{evt['id']} ({evt['type']}): {exc}")

    if failures:
        pytest.fail("\n\n".join(failures))


def test_event_type_distribution() -> None:
    """Snapshot of how many events of each type are in the seed."""
    from collections import Counter
    counts = Counter(e["type"] for e in _ALL_EVENTS)
    # Spot-check a few known counts from the seed design
    assert counts["unit.status_changed"]  == 13
    assert counts["agent.activity"]        ==  9
    assert counts["reporter.status_updated"] == 7
    assert counts["status.updated"]        ==  5
    assert counts["reporter.message_sent"] ==  4
    assert counts["assignment.sent"]       ==  4
    assert counts["assignment.accepted"]   ==  4
    assert counts["incident.closed"]       ==  3
    assert counts["plan.published"]        ==  2
    assert counts["road.status_changed"]   ==  2
    assert counts["approval.requested"]    ==  2
    assert counts["approval.resolved"]     ==  2
