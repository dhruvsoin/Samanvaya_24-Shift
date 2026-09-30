"""
clock.py — Scenario clock.

All timestamps in payloads are SCENARIO time, never datetime.now().
The clock starts at SCENARIO_START (from config or default 2026-10-10T09:00:00)
and advances at `speed` × real-time rate.

Usage:
    from app.clock import clock
    ts: str = clock.now()          # "2026-10-10T09:05:12" — no timezone
    clock.set_speed(5)
    clock.reset()
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timedelta

from .config import settings

_FMT = "%Y-%m-%dT%H:%M:%S"


class ScenarioClock:
    def __init__(self, start_time: str | None = None, initial_speed: int | float | None = None) -> None:
        cfg_start = getattr(settings, "scenario_start_time", "2026-10-10T09:00:00")
        self._start_time_str: str = start_time or os.getenv("SCENARIO_START_TIME", cfg_start)
        self._start_dt: datetime = datetime.strptime(self._start_time_str, _FMT)
        
        cfg_speed = getattr(settings, "time_warp_speed", 1)
        speed_val = initial_speed if initial_speed is not None else int(os.getenv("TIME_WARP_SPEED", str(cfg_speed)))
        
        self._speed: float = float(speed_val)
        self._anchor_scenario_dt: datetime = self._start_dt
        self._anchor_real: float = time.monotonic()

    # ── public API ────────────────────────────────────────────────────

    @property
    def start_time(self) -> str:
        """Configured scenario start time string (e.g. '2026-10-10T09:00:00')."""
        return self._start_time_str

    @property
    def speed(self) -> int | float:
        """Current scenario speed multiplier."""
        return int(self._speed) if self._speed.is_integer() else self._speed

    def now(self) -> str:
        """Current scenario time as ISO 8601 string without timezone (YYYY-MM-DDTHH:MM:SS)."""
        return self.now_dt().strftime(_FMT)

    def now_dt(self) -> datetime:
        """Current scenario time as a datetime object."""
        elapsed_real = time.monotonic() - self._anchor_real
        return self._anchor_scenario_dt + timedelta(seconds=elapsed_real * self._speed)

    def elapsed_scenario_seconds(self) -> float:
        """Total scenario seconds elapsed since start_time."""
        return (self.now_dt() - self._start_dt).total_seconds()

    def set_speed(self, speed: int | float) -> None:
        """
        Change speed multiplier, anchoring scenario time at the current moment
        so scenario time advances continuously without jumps or regression.
        Accepted values typically: 1, 2, 5, 10.
        """
        current_dt = self.now_dt()
        self._anchor_scenario_dt = current_dt
        self._anchor_real = time.monotonic()
        self._speed = float(speed)

    def set_time(self, time_str: str) -> None:
        """Explicitly set current scenario time (used in deterministic tests and warp)."""
        self._anchor_scenario_dt = datetime.strptime(time_str, _FMT)
        self._anchor_real = time.monotonic()

    def reset(self) -> None:
        """Restore scenario clock to start_time at speed 1."""
        self._anchor_scenario_dt = self._start_dt
        self._anchor_real = time.monotonic()
        self._speed = 1.0


# singleton instance
clock = ScenarioClock()
