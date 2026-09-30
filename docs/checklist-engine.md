# Engine checklist (Person 2) — `backend/engine/`

Tick every box, then send the "Report back" block at the bottom to Person 1.
Source of truth: `contracts/types.ts` and `contracts/seed/`. If something here disagrees with the contracts, the contracts win; tell Person 1.

## A. Structure
- [ ] `backend/engine/` has `graph.py`, `rain.py`, `eta.py`, `allocate.py`, `diff.py`, `demo.py`, `config/` (speeds, rain rules, weights) and `tests/`.
- [ ] **No imports from `backend/app/`, FastAPI, or the event bus.** The engine is pure Python and runs from a script.
- [ ] Functions exist with these names (confirm exact signatures with Person 1, whose agent wrappers call them):
  - `build_graph(network) -> Graph`
  - `apply_rain(graph, intensity) -> list[RoadChange]`
  - `compute_etas(graph, units, incidents, rain) -> EtaMatrix`
  - `solve(etas, incidents, units, previous_plan) -> SolveResult`
  - `diff_plans(prev, new, prev_etas, new_etas, road_changes) -> list[PlanChange]`
- [ ] `python -m backend.engine.demo` prints PLAN-001 and PLAN-002 without errors.

## B. Names and shapes (must match exactly, camelCase in anything that leaves the engine as JSON)
- [ ] `PlanEntry`: `incidentId`, `unitId`, `etaMinutes` (number), `etaRange` (`[min, max]`, min <= etaMinutes <= max).
- [ ] `PlanChange`: `incidentId`, `change` (one of `added` | `changed` | `removed` | `unchanged`), `before`, `after`, `reason`.
  - `before` and `after` are `{ "unitId": "...", "etaMinutes": n }` or `null`. `added` has `before: null`. `removed` has `after: null`.
  - `reason` is never empty and is one line.
- [ ] `Unserved`: `incidentId`, `reason`.
- [ ] `RoadChange` output matches the `road.status_changed` payload: `roadId`, `status` (`open` | `slow` | `closed`), `previousStatus`, `reason`.
- [ ] IDs are used as given, never renamed: units `AMB-01 AMB-02 BOAT-01 BOAT-02 RES-01 RES-02 PUMP-01 PUMP-02`; roads `ROAD-01`..`ROAD-10`; nodes `N1`..`N8`; incidents `INC-xx`.
- [ ] Input is read from `contracts/seed/roads.json`, `units.json` (fields `unitId`, `type`, `status`, `location`) and incidents in the contract's `Incident` shape (`type`, `severity`, `severityScore`, `timeWindowMinutes`, `location`, `peopleAffected`).
- [ ] Unit types are `ambulance` | `boat` | `rescue_team` | `pump`. Incident types are `flooded_home` | `stranded_vehicle` | `medical` | `trapped_person` | `road_blocked` | `other`. Statuses are exactly as in `types.ts`.

## C. Rules implemented
- [ ] Speeds in km/h: ambulance 30, rescue team 25, boat 12. Values live in one config file, not scattered in code.
- [ ] Rain multiplier: none 1.0, light 0.9, moderate 0.75, heavy 0.55, extreme 0.4.
- [ ] Road status: `open` normal speed, `slow` half speed, `closed` removed for land vehicles. **Boats can cross closed roads.**
- [ ] ETA = shortest path time (Dijkstra) from the unit's nearest node to the incident's nearest node, plus about 1 minute last-mile. `etaRange` is returned too.
- [ ] Eligibility: medical needs an ambulance; flooded home and trapped person need a boat or rescue team; stranded vehicle needs a rescue team or boat; road blocked needs a pump.
- [ ] Only units with status `available` (or `en_route`, so they can be reassigned) are used. Never `unreachable`, `offline` or `on_scene`.
- [ ] Solver: one unit per incident, one incident per unit. Objective is severity-weighted ETA (critical 8, high 4, medium 2, low 1), a large penalty for unserved, an extra penalty for missing `timeWindowMinutes`, and a small bonus for keeping the previous assignment.
- [ ] **All `reason` text comes from templates filled with data. No LLM anywhere in the engine.**
- [ ] Reason templates exist for: added, changed unit (road closure cut the old unit off), same unit with ETA change (road slowed), unchanged, removed, unserved.

## D. Tests (`pytest`, all green)
- [ ] Three incidents (INC-01 flooded_home high, INC-02 stranded_vehicle high, INC-03 medical critical) give **INC-01 → BOAT-01, INC-02 → RES-02, INC-03 → AMB-01**.
- [ ] After `ROAD-04` closed and `ROAD-05` slow: **INC-02 → RES-01** (changed), **INC-03 → AMB-01 with a larger ETA** (changed), **INC-01 unchanged**, each with a non-empty reason.
- [ ] Known trap: in the seed positions RES-01 and RES-02 are equally far from INC-02 before the closure. Retune a speed or a position so RES-02 wins before and RES-01 wins after. Keep all IDs. If you change positions, tell Person 1 so `seed/units.json` and `seed/events.json` are updated for everyone.
- [ ] Ten incidents with three units: no crash, some incidents in `unserved` with a reason.
- [ ] No incident is assigned twice and no unit is used twice.
- [ ] Running the same input twice gives the same plan (deterministic).
- [ ] No available unit of the right type: incident goes to `unserved` with reason, no exception.
- [ ] An `unreachable` or `offline` unit is never assigned.
- [ ] `compute_etas` plus `solve` runs in under 1 second for 8 units and 10 incidents.

## E. Integration with Person 1
- [ ] Person 1's Route and Allocation agents call your functions with `ENGINE_MODE=real` and the demo flow test passes.
- [ ] Output of PLAN-001 and PLAN-002 assignments equals the seed (`contracts/seed/events.json`). If your ETA numbers differ, the **assignments** must still match. Send Person 1 the updated numbers so the seed and Person 3's mocks are updated.
- [ ] `demo.py` and the tests are committed on `p2-engine` and merged to `main` through a pull request. `main` still starts.

## Report back (copy, fill, send)
```
Engine report
- Files/functions present: yes/no (list any missing)
- pytest: X passed, Y failed
- PLAN-001 assignments: INC-01→?, INC-02→?, INC-03→?
- PLAN-002 assignments: INC-01→?, INC-02→?, INC-03→? (ETAs: ?, ?, ?)
- Seed positions changed: yes/no (which)
- Anything in contracts I could not follow: ...
```
