"""
tests/test_comms_dispatch.py — Tests for Person 4's channel layer and comms dispatch.

Verifies:
  1. Normal zone uses chat with no failure events.
  2. Degraded zone publishes comms.delivery_failed then comms.channel_switched then writes an SMS log entry in order.
  3. Comms restoration returns dispatch back to the normal chat channel.
  4. Sequential message/log IDs and monotonic scenario timestamps.
  5. Automatic zone resolution for crew units and reporter sessions.
"""
from __future__ import annotations

import pytest
from datetime import datetime

from app.bus import bus
from app.clock import clock
from app.comms import dispatch, resolve_zone, get_channel_for_recipient
from app.services import scenario as scenario_service
from app.state import state


@pytest.fixture(autouse=True)
def reset_all():
    state.reset()
    bus.reset()
    clock.reset()
    yield
    state.reset()
    bus.reset()
    clock.reset()


def test_normal_zone_uses_chat_no_failure_events():
    """In an OK zone, dispatch delivers on chat with no failure or switch events."""
    # Ensure ZONE-A is ok
    state.set_zone_comms("ZONE-A", active_outage=False, publish=False)

    bus_events: list[dict] = []
    bus.subscribe("*", lambda e: bus_events.append(e))

    res = dispatch(
        recipient="AMB-01",
        text="Proceed to checkpoint Alpha.",
        kind="crew",
        zone_id="ZONE-A",
    )

    assert res["channel"] == "chat"
    assert res["delivery"] == "sent"

    # Check comms log in state
    logs = state.get_comms_log()
    assert len(logs) == 1
    log = logs[0]
    assert log["channel"] == "chat"
    assert log["direction"] == "out"
    assert log["recipient"] == {"kind": "crew", "id": "AMB-01"}
    assert log["text"] == "Proceed to checkpoint Alpha."
    assert log["delivery"] == "sent"
    assert log["zoneId"] == "ZONE-A"

    # Verify no failure or switched events were published
    failed_evts = [e for e in bus_events if e["type"] == "comms.delivery_failed"]
    switched_evts = [e for e in bus_events if e["type"] == "comms.channel_switched"]
    assert len(failed_evts) == 0
    assert len(switched_evts) == 0


def test_degraded_zone_gives_failed_then_switched_then_sms_log():
    """In a degraded zone, dispatch publishes delivery_failed, then channel_switched, then logs SMS."""
    # Mark ZONE-B as degraded
    state.set_zone_comms("ZONE-B", active_outage=True, fallback_channel="sms", publish=True)

    bus_events: list[dict] = []
    bus.subscribe("*", lambda e: bus_events.append(e))

    initial_log_count = len(state.get_comms_log())

    res = dispatch(
        recipient={"kind": "crew", "id": "RES-01"},
        text="Check in with base immediately.",
        zone_id="ZONE-B",
    )

    assert res["channel"] == "sms"
    assert res["delivery"] == "sent"

    # Verify event types and exact sequence
    event_types = [e["type"] for e in bus_events]
    assert "comms.delivery_failed" in event_types
    assert "comms.channel_switched" in event_types

    failed_idx = event_types.index("comms.delivery_failed")
    switched_idx = event_types.index("comms.channel_switched")
    assert failed_idx < switched_idx, "comms.delivery_failed must precede comms.channel_switched"

    # Check payload of comms.delivery_failed
    failed_evt = bus_events[failed_idx]
    assert failed_evt["payload"]["channel"] == "chat"
    assert failed_evt["payload"]["zoneId"] == "ZONE-B"
    assert failed_evt["payload"]["recipient"] == {"kind": "crew", "id": "RES-01"}
    assert failed_evt["payload"]["messageId"].startswith("MSG-")

    # Check payload of comms.channel_switched
    switched_evt = bus_events[switched_idx]
    assert switched_evt["payload"]["recipient"] == {"kind": "crew", "id": "RES-01"}
    assert switched_evt["payload"]["from"] == "chat"
    assert switched_evt["payload"]["to"] == "sms"
    assert "ZONE-B comms degraded" in switched_evt["payload"]["reason"]

    # Verify comms log entry has channel 'sms'
    logs = state.get_comms_log()
    assert len(logs) == initial_log_count + 1
    sms_entry = logs[-1]
    assert sms_entry["channel"] == "sms"
    assert sms_entry["direction"] == "out"
    assert sms_entry["recipient"] == {"kind": "crew", "id": "RES-01"}
    assert sms_entry["delivery"] == "sent"
    assert sms_entry["zoneId"] == "ZONE-B"


def test_restore_returns_to_normal_channel():
    """Toggling outage on and off restores normal chat channel for subsequent dispatches."""
    # 1. Activate outage in ZONE-B
    scenario_service.set_outage("ZONE-B", active=True)

    bus_events: list[dict] = []
    bus.subscribe("*", lambda e: bus_events.append(e))

    # Dispatch during outage -> SMS
    res1 = dispatch("RES-01", "Message during outage", kind="crew", zone_id="ZONE-B")
    assert res1["channel"] == "sms"

    # 2. Restore zone comms
    scenario_service.set_outage("ZONE-B", active=False)
    restored_evts = [e for e in bus_events if e["type"] == "zone.comms_restored"]
    assert len(restored_evts) >= 1
    assert restored_evts[-1]["payload"]["zoneId"] == "ZONE-B"

    event_count_before = len(bus_events)

    # 3. Dispatch after restore -> normal chat
    res2 = dispatch("RES-01", "Message after restoration", kind="crew", zone_id="ZONE-B")
    assert res2["channel"] == "chat"

    # Verify no new failure or switch events occurred after restoration
    new_events = bus_events[event_count_before:]
    new_types = [e["type"] for e in new_events]
    assert "comms.delivery_failed" not in new_types
    assert "comms.channel_switched" not in new_types

    logs = state.get_comms_log()
    assert logs[-1]["channel"] == "chat"
    assert logs[-1]["text"] == "Message after restoration"


def test_ids_sequential_and_ts_monotonic():
    """Message IDs, log IDs, and event timestamps are sequential and monotonic."""
    import time
    state.set_zone_comms("ZONE-B", active_outage=True, publish=False)

    bus_events: list[dict] = []
    bus.subscribe("*", lambda e: bus_events.append(e))

    # Dispatch 1
    t1 = clock.now()
    d1 = dispatch("AMB-01", "First message", kind="crew", zone_id="ZONE-B")

    time.sleep(0.02)

    # Dispatch 2
    t2 = clock.now()
    d2 = dispatch("AMB-01", "Second message", kind="crew", zone_id="ZONE-B")

    # Check monotonic scenario timestamps
    dt1 = datetime.fromisoformat(t1)
    dt2 = datetime.fromisoformat(t2)
    assert dt2 >= dt1

    # Check sequential IDs
    logs = state.get_comms_log()
    assert len(logs) >= 2
    log1_id = int(d1["logId"].split("-")[1])
    log2_id = int(d2["logId"].split("-")[1])
    assert log2_id > log1_id

    # Verify event timestamps on the bus are monotonic
    event_ts = [datetime.fromisoformat(e["ts"]) for e in bus_events]
    for i in range(len(event_ts) - 1):
        assert event_ts[i + 1] >= event_ts[i]


def test_automatic_zone_resolution_and_reporter_dispatch():
    """Verifies automatic zone resolution for both crew and open-incident reporters."""
    # Unit AMB-01 has location in ZONE-B, RES-01 has location in ZONE-C
    assert resolve_zone("AMB-01", "crew") == "ZONE-B"
    assert resolve_zone("RES-01", "crew") == "ZONE-C"
    assert get_channel_for_recipient("AMB-01", "crew") == "chat"

    # Add an open incident tied to a reporter session in ZONE-B
    state.add_incident({
        "incidentId": "INC-TEST-01",
        "type": "trapped_person",
        "status": "reported",
        "severity": "high",
        "severityScore": 85.0,
        "timeWindowMinutes": 30,
        "location": {"lat": 12.915, "lng": 77.625, "label": "Silk Board", "zoneId": "ZONE-B"},
        "peopleAffected": 2,
        "language": "en",
        "source": "reporter_chat",
        "summary": "Trapped person test",
        "confidence": 0.9,
        "reportedAt": clock.now(),
        "assignedUnitIds": [],
        "reporterSessionId": "SES-REP-99",
    })

    assert resolve_zone("SES-REP-99", "reporter") == "ZONE-B"

    # Set outage in ZONE-B
    scenario_service.set_outage("ZONE-B", active=True)
    assert get_channel_for_recipient("SES-REP-99", "reporter") == "sms"
    assert get_channel_for_recipient("AMB-01", "crew") == "sms"
    # Unit in ZONE-C is still on chat
    assert get_channel_for_recipient("RES-01", "crew") == "chat"

    reporter_events: list[dict] = []
    bus.subscribe("reporter.message_sent", lambda e: reporter_events.append(e))

    # Dispatch to reporter without specifying zone_id explicitly
    res = dispatch("SES-REP-99", "Rescue team en route via SMS.", kind="reporter")
    assert res["channel"] == "sms"
    assert res["zoneId"] == "ZONE-B"

    # Verify reporter.message_sent was published with channel 'sms'
    assert len(reporter_events) >= 1
    last_rep_msg = reporter_events[-1]["payload"]
    assert last_rep_msg["sessionId"] == "SES-REP-99"
    assert last_rep_msg["channel"] == "sms"
    assert last_rep_msg["from"] == "system"
    assert last_rep_msg["text"] == "Rescue team en route via SMS."
