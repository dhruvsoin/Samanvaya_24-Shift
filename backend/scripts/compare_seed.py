import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.graph import build_graph
from engine.eta import compute_etas
from engine.allocate import solve
from engine.rain import apply_rain
from engine.diff import diff_plans

contracts_dir = Path("../contracts/seed")
with open(contracts_dir / "roads.json", encoding="utf-8") as f:
    roads = json.load(f)
with open(contracts_dir / "units.json", encoding="utf-8") as f:
    units = json.load(f)
with open(contracts_dir / "events.json", encoding="utf-8") as f:
    events = json.load(f)

incidents = [e["payload"]["incident"] for e in events if e["type"] == "incident.assessed"]

evt_017 = next(e["payload"]["plan"] for e in events if e["id"] == "evt_017")
evt_037 = next(e["payload"]["plan"] for e in events if e["id"] == "evt_037")

graph = build_graph(roads)
etas_1 = compute_etas(graph, units, incidents, rain="light")
p1 = solve(etas_1, incidents, units, previous_plan=None)

changes_rain = apply_rain(graph, "heavy")
etas_2 = compute_etas(graph, units, incidents, rain="heavy")
p2 = solve(etas_2, incidents, units, previous_plan=p1)

diffs = diff_plans(p1, p2, etas_1, etas_2, changes_rain)

print("=== PLAN-001 COMPARISON ===")
for se in evt_017["entries"]:
    inc_id = se["incidentId"]
    ae = next(e for e in p1["entries"] if e["incidentId"] == inc_id)
    sr = next(c["reason"] for c in evt_017["changes"] if c["incidentId"] == inc_id)
    ar = next(c["reason"] for c in p1["changes"] if c["incidentId"] == inc_id)
    print(f"[{inc_id}]")
    print(f"  Unit:   Actual={ae['unitId']} | Seed={se['unitId']}")
    print(f"  ETA:    Actual={ae['etaMinutes']}m | Seed={se['etaMinutes']}m")
    print(f"  Range:  Actual={ae['etaRange']} | Seed={se['etaRange']}")
    print(f"  Reason: Actual=\"{ar}\"")
    print(f"          Seed  =\"{sr}\"")

print("\n=== PLAN-002 COMPARISON ===")
for se in evt_037["entries"]:
    inc_id = se["incidentId"]
    ae = next(e for e in p2["entries"] if e["incidentId"] == inc_id)
    sr = next(c["reason"] for c in evt_037["changes"] if c["incidentId"] == inc_id)
    ar = next(c["reason"] for c in diffs if c["incidentId"] == inc_id)
    print(f"[{inc_id}]")
    print(f"  Unit:   Actual={ae['unitId']} | Seed={se['unitId']}")
    print(f"  ETA:    Actual={ae['etaMinutes']}m | Seed={se['etaMinutes']}m")
    print(f"  Range:  Actual={ae['etaRange']} | Seed={se['etaRange']}")
    print(f"  Reason: Actual=\"{ar}\"")
    print(f"          Seed  =\"{sr}\"")
