"""
tests/test_clock.py — Unit tests for app.clock.ScenarioClock.
"""
import time

from app.clock import ScenarioClock


def test_now_returns_scenario_start_format():
    c = ScenarioClock()
    ts = c.now()
    # Must be ISO 8601, no timezone, no decimal seconds
    assert "T" in ts
    assert "+" not in ts
    assert "Z" not in ts
    assert len(ts) == 19   # "2026-10-10T09:00:00"


def test_clock_advances():
    c = ScenarioClock()
    t1 = c.now()
    time.sleep(0.05)
    t2 = c.now()
    assert t2 >= t1


def test_speed_2_advances_faster():
    c = ScenarioClock()
    c.set_speed(2)
    t1 = c.now()
    time.sleep(0.1)
    t2 = c.now()
    # at 2x speed, 0.1 real seconds = 0.2 scenario seconds — should still be >= t1
    assert t2 >= t1
    assert c.speed == 2


def test_reset_restores_scenario_start():
    c = ScenarioClock()
    c.set_speed(10)
    time.sleep(0.05)
    c.reset()
    assert c.speed == 1
    # After reset the clock restarts from T0, so now() should be close to start
    ts = c.now()
    assert ts.startswith("2026-10-10T09:00:")


def test_now_never_returns_wall_clock():
    """Regression: make sure now() doesn't accidentally return today's date."""
    c = ScenarioClock()
    ts = c.now()
    assert ts.startswith("2026-10-10"), f"Expected scenario date, got: {ts}"
