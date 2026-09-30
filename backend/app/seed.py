"""
seed.py — loads the JSON files from contracts/seed/ relative to this file.
Paths are resolved so the app works regardless of CWD.
"""
import json
import pathlib

_SEED_DIR = pathlib.Path(__file__).parent.parent.parent / "contracts" / "seed"


def _load(name: str):
    with open(_SEED_DIR / name, encoding="utf-8") as f:
        return json.load(f)


UNITS = _load("units.json")
FACILITIES = _load("facilities.json")
ROADS = _load("roads.json")
ZONES = _load("zones.json")
USERS = _load("users.json")
EVENTS = _load("events.json")
