"""
engine_loader.py — Dynamically loads Person 2's engine or the engine_stub based on ENGINE_MODE.

Usage:
  from .engine_loader import get_engine
  engine = get_engine()
  etas = engine.compute_etas(...)
"""
from __future__ import annotations

import logging
import os
import pathlib
import sys
from types import ModuleType

logger = logging.getLogger(__name__)

# Ensure backend root is on sys.path
backend_root = str(pathlib.Path(__file__).parent.parent.parent)
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)


def get_engine() -> ModuleType:
    """
    Selects between Person 2's backend/engine/ package and backend/engine_stub.py
    using the ENGINE_MODE environment variable ('real' vs 'stub', default 'stub').
    """
    mode = os.getenv("ENGINE_MODE", "stub").strip().lower()

    if mode == "real":
        # Attempt to import Person 2's real engine package
        for mod_name in ("engine", "backend.engine", "app.engine"):
            try:
                mod = __import__(mod_name, fromlist=["compute_etas", "apply_rain", "solve", "diff_plans"])
                if hasattr(mod, "compute_etas") and hasattr(mod, "solve"):
                    return mod
            except ImportError:
                continue
        logger.warning("ENGINE_MODE='real' specified, but backend/engine/ not found. Falling back to engine_stub.")

    import engine_stub
    return engine_stub
