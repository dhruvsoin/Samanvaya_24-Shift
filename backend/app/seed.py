"""
seed.py — loads contracts/seed/*.json.
Paths resolve relative to this file regardless of CWD.
Only called at startup; results are consumed by state.py.
"""
from __future__ import annotations

import copy
import json
import pathlib
from typing import Any

_SEED_DIR = pathlib.Path(__file__).parent.parent.parent / "contracts" / "seed"


def _load(name: str) -> Any:
    with open(_SEED_DIR / name, encoding="utf-8") as f:
        return json.load(f)


# Raw seed data (deep-copied so state.py can mutate its copy)
def units() -> list[dict]:
    return copy.deepcopy(_load("units.json"))


def facilities() -> list[dict]:
    return copy.deepcopy(_load("facilities.json"))


def roads() -> dict:
    return copy.deepcopy(_load("roads.json"))


def zones() -> list[dict]:
    return copy.deepcopy(_load("zones.json"))


def users() -> dict:
    """
    Shape (from contracts/seed/users.json):
      {
        "note": "...",
        "operators": [{"username": "operator", "password": "demo1234", "displayName": "..."}],
        "crewPin": "1111",
        "crewCodes": ["AMB-01", ...],
        "reviewer": "..."
      }
    """
    return _load("users.json")


def events() -> list[dict]:
    return _load("events.json")
