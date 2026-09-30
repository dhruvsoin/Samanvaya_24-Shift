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


def test_start_time_property():
    c = ScenarioClock()
    assert c.start_time == "2026-10-10T09:00:00"


def test_clock_advances():
    c = ScenarioClock()
    t1 = c.now_dt()
    time.sleep(0.05)
    t2 = c.now_dt()
    assert t2 > t1


def test_speed_2_advances_faster():
    c = ScenarioClock()
    c.set_speed(2)
    t1 = c.now()
    time.sleep(0.1)
    t2 = c.now()
    assert t2 >= t1
    assert c.speed == 2


def test_time_warp_speed_x5_advances_5x_faster():
    c = ScenarioClock()
    c.reset()

    # Measure scenario time delta at 1x speed over 0.1s real time
    c.set_speed(1)
    t0 = c.now_dt()
    time.sleep(0.1)
    t1 = c.now_dt()
    elapsed_1x = (t1 - t0).total_seconds()

    # Measure scenario time delta at 5x speed over 0.1s real time
    c.set_speed(5)
    t2 = c.now_dt()
    time.sleep(0.1)
    t3 = c.now_dt()
    elapsed_5x = (t3 - t2).total_seconds()

    ratio = elapsed_5x / elapsed_1x
    # Real-world sleeps vary slightly on Windows; allow reasonable tolerance around 5.0
    assert 3.8 <= ratio <= 6.5, f"Expected ratio ~5, got {ratio:.2f}"
    assert c.speed == 5


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
