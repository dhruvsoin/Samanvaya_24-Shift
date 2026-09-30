"""
tests/test_bus.py — Tests for app.bus.EventBus and ScenarioClock integration.

Verifies:
  - publish ten events, check ids, order, ts monotonic
  - time-warp speed x5 advances scenario time 5x faster
  - subscribe(types, callback) for agents
  - subscribe_queue() for WebSocket clients
  - events for the same entity delivered in order
  - never block the publisher
  - get_events_since(event_id) for optional replay
"""
import asyncio
import time

import pytest

from app.bus import bus
from app.clock import clock


@pytest.fixture(autouse=True)
def reset_bus_and_clock():
    """Reset bus and clock before every test."""
    bus.reset()
    clock.reset()
    yield
    bus.reset()
    clock.reset()


def test_publish_ten_events_ids_order_ts_monotonic():
    """
    Publish ten events, check ids (evt_001..evt_010), order, and monotonic timestamps.
    """
    published = []
    for i in range(1, 11):
        envelope = bus.publish(
            "incident.reported",
            {"incidentId": f"INC-{i:02d}", "order": i},
        )
        published.append(envelope)

    # 1. Check ids
    expected_ids = [f"evt_{i:03d}" for i in range(1, 11)]
    actual_ids = [e["id"] for e in published]
    assert actual_ids == expected_ids

    # 2. Check order in log
    log = bus.get_events_since(None)
    assert len(log) == 10
    assert [e["payload"]["order"] for e in log] == list(range(1, 11))

    # 3. Check ts monotonic
    timestamps = [e["ts"] for e in published]
    for i in range(len(timestamps) - 1):
        assert timestamps[i] <= timestamps[i + 1], (
            f"Timestamp not monotonic: {timestamps[i]} > {timestamps[i + 1]}"
        )


def test_time_warp_speed_x5_advances_scenario_time_5x_faster():
    """
    Time-warp speed x5 advances scenario time 5x faster than speed 1.
    """
    # Baseline at 1x speed
    clock.set_speed(1)
    t0 = clock.now_dt()
    time.sleep(0.1)
    t1 = clock.now_dt()
    delta_1x = (t1 - t0).total_seconds()

    # Time-warp at 5x speed
    clock.set_speed(5)
    t2 = clock.now_dt()
    time.sleep(0.1)
    t3 = clock.now_dt()
    delta_5x = (t3 - t2).total_seconds()

    ratio = delta_5x / delta_1x
    assert 3.8 <= ratio <= 6.5, f"Expected ratio ~5, got {ratio:.2f}"
    assert clock.speed == 5


@pytest.mark.asyncio
async def test_subscribe_queue_websocket_clients():
    """
    subscribe_queue() returns an asyncio.Queue that receives events in order.
    """
    q = bus.subscribe_queue()

    for i in range(1, 11):
        bus.publish("status.updated", {"step": i})

    received = []
    for _ in range(10):
        evt = await asyncio.wait_for(q.get(), timeout=1.0)
        received.append(evt)

    assert len(received) == 10
    assert [e["id"] for e in received] == [f"evt_{i:03d}" for i in range(1, 11)]
    assert [e["payload"]["step"] for e in received] == list(range(1, 11))

    bus.unsubscribe_queue(q)


@pytest.mark.asyncio
async def test_events_for_same_entity_delivered_in_order():
    """
    Events for the same entity are strictly delivered to agent callbacks in order,
    even when callbacks are asynchronous.
    """
    processed_steps = []
    received_event = asyncio.Event()

    async def on_unit_event(envelope: dict):
        # Simulate slight async processing delay
        await asyncio.sleep(0.01)
        step = envelope["payload"]["step"]
        processed_steps.append(step)
        if len(processed_steps) == 5:
            received_event.set()

    unsub = bus.subscribe("unit.status_changed", on_unit_event)

    # Publish 5 events for the exact same unit
    for i in range(1, 6):
        bus.publish("unit.status_changed", {"unitId": "AMB-01", "step": i})

    await asyncio.wait_for(received_event.wait(), timeout=2.0)
    assert processed_steps == [1, 2, 3, 4, 5]

    unsub()


@pytest.mark.asyncio
async def test_never_block_publisher():
    """
    Publishing an event never blocks the caller even if a subscriber callback is slow.
    """
    async def slow_callback(envelope: dict):
        await asyncio.sleep(0.3)

    unsub = bus.subscribe("incident.reported", slow_callback)

    t0 = time.monotonic()
    envelope = bus.publish("incident.reported", {"incidentId": "INC-01"})
    publish_duration = time.monotonic() - t0

    # Publisher returns practically instantaneously (< 50ms)
    assert publish_duration < 0.05
    assert envelope["id"] == "evt_001"

    unsub()
    bus.reset()


def test_get_events_since_replay():
    """
    get_events_since(event_id) replays events after event_id.
    """
    for i in range(1, 11):
        bus.publish("agent.activity", {"step": i})

    # None returns all events
    all_events = bus.get_events_since(None)
    assert len(all_events) == 10

    # Since evt_005 returns evt_006..evt_010
    after_5 = bus.get_events_since("evt_005")
    assert len(after_5) == 5
    assert [e["id"] for e in after_5] == ["evt_006", "evt_007", "evt_008", "evt_009", "evt_010"]

    # Since last event returns empty list
    after_10 = bus.get_events_since("evt_010")
    assert after_10 == []
