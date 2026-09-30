"""
weather.py — Open-Meteo client for live, cached, and fallback rain data.

Provides:
  - OpenMeteoRainClient: fetches current precipitation from Open-Meteo with caching (TTL),
    freshness indicators ('live', 'cached', 'stale'), and offline fallback via JSON.
  - update_system_rain(): synchronizes state.system_status['rain'] and emits status.updated if changed.
"""
from __future__ import annotations

import copy
import json
import logging
import os
import pathlib
import time
import urllib.error
import urllib.request
from typing import Any

from .clock import clock

logger = logging.getLogger(__name__)

_DEFAULT_FALLBACK_FILE = pathlib.Path(__file__).parent.parent / "config" / "weather_fallback.json"


class OpenMeteoRainClient:
    """
    Client for Open-Meteo precipitation data with in-memory caching and offline JSON fallback.
    """

    def __init__(
        self,
        lat: float = 12.929,
        lng: float = 77.612,
        cache_ttl_seconds: float = 300.0,
        fallback_file: pathlib.Path | str | None = None,
    ) -> None:
        self.lat = lat
        self.lng = lng
        self.cache_ttl_seconds = float(os.getenv("WEATHER_CACHE_TTL", str(cache_ttl_seconds)))
        self.fallback_file = pathlib.Path(fallback_file or _DEFAULT_FALLBACK_FILE)
        self._cached_data: dict[str, Any] | None = None
        self._last_fetch_real: float = 0.0

    @staticmethod
    def mm_to_intensity(mm: float) -> str:
        """Maps mm/hour to rain intensity category."""
        if mm <= 0.0 or mm < 0.1:
            return "none"
        if mm < 7.5:
            return "light"
        if mm < 15.0:
            return "moderate"
        if mm < 30.0:
            return "heavy"
        return "extreme"

    def get_rain(
        self,
        force_refresh: bool = False,
        allow_network: bool = True,
    ) -> dict[str, Any]:
        """
        Retrieves rain data with freshness:
          - 'live': freshly fetched from Open-Meteo.
          - 'cached': served from in-memory cache within TTL.
          - 'stale': served from expired cache or offline fallback JSON.
        """
        now_real = time.monotonic()

        # 1. Return cached if valid and not forcing refresh
        if (
            not force_refresh
            and self._cached_data is not None
            and (now_real - self._last_fetch_real) < self.cache_ttl_seconds
        ):
            res = copy.deepcopy(self._cached_data)
            res["freshness"] = "cached"
            return res

        # 2. Try fetching from Open-Meteo
        if allow_network:
            url = (
                f"https://api.open-meteo.com/v1/forecast?"
                f"latitude={self.lat}&longitude={self.lng}&current=precipitation,rain"
            )
            try:
                req = urllib.request.Request(
                    url,
                    headers={"User-Agent": "Samanvaya-EmergencyResponse/1.0"},
                )
                with urllib.request.urlopen(req, timeout=2.5) as resp:
                    if resp.status == 200:
                        raw = json.loads(resp.read().decode("utf-8"))
                        curr = raw.get("current", {})
                        precip = float(curr.get("precipitation", curr.get("rain", 0.0)))
                        intensity = self.mm_to_intensity(precip)
                        ts = clock.now()
                        data = {
                            "intensity": intensity,
                            "mmPerHour": precip,
                            "freshness": "live",
                            "observedAt": ts,
                        }
                        self._cached_data = copy.deepcopy(data)
                        self._last_fetch_real = now_real
                        return data
            except Exception as exc:
                logger.warning("Open-Meteo fetch failed (%s); falling back to cached/fallback data", exc)

        # 3. Fallback on network failure or offline mode:
        if self._cached_data is not None:
            res = copy.deepcopy(self._cached_data)
            res["freshness"] = "stale"
            return res

        return self._load_fallback()

    def _load_fallback(self) -> dict[str, Any]:
        """Loads default weather from fallback JSON."""
        if self.fallback_file.is_file():
            try:
                with open(self.fallback_file, encoding="utf-8") as f:
                    data = json.load(f)
                    return {
                        "intensity": data.get("intensity", "light"),
                        "mmPerHour": float(data.get("mmPerHour", 4.0)),
                        "freshness": "stale",
                        "observedAt": clock.now(),
                    }
            except Exception as e:
                logger.warning("Failed to read fallback weather file: %s", e)

        return {
            "intensity": "light",
            "mmPerHour": 4.0,
            "freshness": "stale",
            "observedAt": clock.now(),
        }

    def set_cached_data(self, rain_info: dict[str, Any]) -> None:
        """Sets internal cache for testing/mocking."""
        self._cached_data = copy.deepcopy(rain_info)
        self._last_fetch_real = time.monotonic()

    def reset(self) -> None:
        """Clears in-memory cache."""
        self._cached_data = None
        self._last_fetch_real = 0.0


# Singleton client
weather_client = OpenMeteoRainClient()


def sync_system_rain(force_refresh: bool = False, allow_network: bool = True) -> dict[str, Any]:
    """
    Fetches rain info using weather_client, updates state if changed,
    and publishes status.updated.
    """
    from .state import state

    rain_info = weather_client.get_rain(force_refresh=force_refresh, allow_network=allow_network)
    current_status = state.get_system_status()
    current_rain = current_status.get("rain", {})

    changed = (
        current_rain.get("intensity") != rain_info["intensity"]
        or current_rain.get("mmPerHour") != rain_info["mmPerHour"]
        or current_rain.get("freshness") != rain_info["freshness"]
    )

    if changed:
        state.update_system_status({"rain": rain_info}, publish=True)
    return rain_info
