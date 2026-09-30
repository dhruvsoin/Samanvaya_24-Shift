"""
clock.py — Scenario clock.

All timestamps in payloads are SCENARIO time, never datetime.now().
The clock starts at SCENARIO_START (from .env or default) and advances
at `speed` × real-time rate.

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


_SCENARIO_START_DEFAULT = "2026-10-10T09:00:00"
_FMT = "%Y-%m-%dT%H:%M:%S"


class ScenarioClock:
    def __init__(self) -> None:
        start_str = os.getenv("SCENARIO_START_TIME", _SCENARIO_START_DEFAULT)
        self._scenario_start: datetime = datetime.strptime(start_str, _FMT)
        self._speed: int = int(os.getenv("TIME_WARP_SPEED", "1"))
        self._real_start: float = time.monotonic()

    # ── public API ────────────────────────────────────────────────────

    def now(self) -> str:
        """Current scenario time as ISO 8601, no timezone."""
        elapsed_real = time.monotonic() - self._real_start
        elapsed_scenario = timedelta(seconds=elapsed_real * self._speed)
        return (self._scenario_start + elapsed_scenario).strftime(_FMT)

    @property
    def speed(self) -> int:
        return self._speed

    def set_speed(self, speed: int) -> None:
        """Accepted values: 1, 2, 5, 10 (per contracts/endpoints.md)."""
        # anchor the scenario time at the current moment before changing speed
        anchor = self._current_scenario_dt()
        self._scenario_start = anchor
        self._real_start = time.monotonic()
        self._speed = speed

    def reset(self) -> None:
        """Restore scenario clock to T+0 at speed 1."""
        start_str = os.getenv("SCENARIO_START_TIME", _SCENARIO_START_DEFAULT)
        self._scenario_start = datetime.strptime(start_str, _FMT)
        self._speed = 1
        self._real_start = time.monotonic()

    # ── internal ──────────────────────────────────────────────────────

    def _current_scenario_dt(self) -> datetime:
        elapsed_real = time.monotonic() - self._real_start
        return self._scenario_start + timedelta(seconds=elapsed_real * self._speed)


# singleton
clock = ScenarioClock()
