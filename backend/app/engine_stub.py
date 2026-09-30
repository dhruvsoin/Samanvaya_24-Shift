"""
backend/app/engine_stub.py — Re-export from backend/engine_stub.py
"""
import sys
import pathlib

# Ensure backend root is on sys.path if not present
backend_root = str(pathlib.Path(__file__).parent.parent)
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from engine_stub import (  # noqa: E402
    PLAN_001_CHANGES,
    PLAN_001_ENTRIES,
    PLAN_002_CHANGES,
    PLAN_002_ENTRIES,
    apply_rain,
    compute_etas,
    diff_plans,
    solve,
)

__all__ = [
    "PLAN_001_CHANGES",
    "PLAN_001_ENTRIES",
    "PLAN_002_CHANGES",
    "PLAN_002_ENTRIES",
    "apply_rain",
    "compute_etas",
    "diff_plans",
    "solve",
]
