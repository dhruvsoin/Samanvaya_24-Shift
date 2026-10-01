"""
config.py — Central configuration via environment variables.

Usage anywhere in the app:
    from app.config import settings
    print(settings.cors_origins)

All values have safe defaults so the server starts with no .env file.
"""
from __future__ import annotations

import os
from functools import lru_cache


class Settings:
    # ── Server ────────────────────────────────────────────────────────
    app_title: str = "Samanvaya API"
    app_version: str = "0.1.0"

    # ── CORS ──────────────────────────────────────────────────────────
    # Comma-separated list of allowed origins.
    # Default includes the Vite dev server used by Person 3.
    cors_origins: list[str] = [
        "http://localhost:5173",   # Vite (P3-Face)
        "http://localhost:3000",   # Next.js fallback
        "http://localhost:8080",
    ]

    # ── Auth / JWT ────────────────────────────────────────────────────
    secret_key: str = os.getenv("SECRET_KEY", "samanvaya-stub-secret-change-in-prod")
    algorithm: str = os.getenv("ALGORITHM", "HS256")
    access_token_expire_minutes: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480")
    )

    # ── Scenario clock ────────────────────────────────────────────────
    scenario_start_time: str = os.getenv(
        "SCENARIO_START_TIME", "2026-10-10T09:00:00"
    )
    time_warp_speed: int = int(os.getenv("TIME_WARP_SPEED", "1"))

    # ── Database (not used in stub — here for P1 to wire up later) ───
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./samanvaya.db")

    # ── Dev mode ──────────────────────────────────────────────────────
    dev_mode: bool = os.getenv("DEV_MODE", "false").lower() in ("true", "1", "yes")

    def __init__(self) -> None:
        # Allow overriding cors_origins via CORS_ORIGINS env var
        env_origins = os.getenv("CORS_ORIGINS", "")
        if env_origins.strip():
            self.cors_origins = [o.strip() for o in env_origins.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


# convenience singleton
settings = get_settings()
