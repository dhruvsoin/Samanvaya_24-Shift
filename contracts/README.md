# Samanvaya contracts

Everything the four of you must agree on **before** writing code. If a shape here is unclear, fix it here first, then code.

| File | What it is |
|---|---|
| `types.ts` | **Authoritative data shapes**: domain objects, plan and diff, events, request bodies. |
| `events.md` | Event catalogue: who emits each event, who listens, when. |
| `endpoints.md` | REST endpoints and WebSocket channels with request and response types. |
| `seed/` | Shared demo world: units, facilities, roads, zones, users, and `events.json` (the scripted 3-minute demo, replayable by the frontend mocks). |

## Ground rules

1. **camelCase JSON.** Python side: Pydantic models with `alias_generator=to_camel`.
2. **ID formats:** `INC-01`, `AMB-01` / `BOAT-01` / `RES-01` / `PUMP-01`, `FAC-01`, `ZONE-A`, `ROAD-04`, `N1`, `PLAN-001`, `APR-001`, `ASN-001`, `SES-01`, `MSG-001`, `evt_001`.
3. **Time is scenario time.** ISO 8601, no timezone (`2026-10-10T09:05:00`). Never `Date.now()` or server wall-clock in payloads.
4. **The backend decides.** ETAs, severities, plan diffs and change reasons come from the backend. The browser only renders them.
5. **Event envelope:** `{ id, type, ts, payload }`. Payload shapes live in `EventPayloads` in `types.ts`.
6. **Errors:** `{ "error": { "code": "not_found", "message": "..." } }` with a normal HTTP status.
7. **Auth:** `Authorization: Bearer <token>` on REST. WebSockets take `?token=<token>`.
8. **Nullable vs optional:** nullable fields are always present (value may be `null`). Optional keys (`?`) may be absent.

## Additions to the handoff's event catalogue

The handoff lists the core events and asks Person 1 to add `agent.activity`. The demo script also needs these, so agree them in hour 0:

- `agent.activity`: one line per agent action, for the agent stream.
- `road.status_changed`: the map's road overlay and ETA changes depend on it.
- `status.updated`: top bar (severity, rain with live/cached/stale, comms, scenario clock).
- `reporter.status_updated`: the reporter's status card (received, assigned, on the way, arrived) and ETA range.
- `assignment.cancelled`: when a plan change takes an assignment away from a crew.

## Who owns what

| Person | Owns (must implement exactly as specified) |
|---|---|
| 1 Brain | Gateway, auth, event bus, WebSockets, Command agent, approvals, decisions, after-action data, `GET /status` |
| 2 Engine | Road graph and ETAs, allocation solver, plan and `changes` (diff + reasons), `road.status_changed` |
| 3 Face | Consumes everything above. Builds mocks from `seed/`. |
| 4 Comms | Reporter session/message/voice, language tools, channel layer and SMS fallback, scenario endpoints, `reporter.*` and `comms.*` events |

## Changing a contract

1. Post the change in the team chat with the exact new type.
2. Everyone affected says OK.
3. One person edits `types.ts` (and the seed if needed) in a small commit titled `contract: ...`.
4. Backend updates Pydantic to match. Frontend regenerates types. Do not change a shape locally without doing this.

## Using Antigravity (or any coding agent) with these files

Start every agent session with: *"Read `contracts/README.md` and `contracts/types.ts`. Follow them exactly. Do not rename fields or invent new events. If a shape looks wrong, stop and tell me instead of changing it."*

## The demo seed

- `seed/units.json`: 8 units (2 ambulances, 2 boats, 2 rescue teams, 2 pumps), all `available` at start.
- `seed/facilities.json`: shelter, hospital, depot.
- `seed/roads.json`: 8 nodes, 10 roads (all `open` at start). **ROAD-04** is the Hosur Rd underpass that closes in the demo.
- `seed/zones.json`: ZONE-A, ZONE-B (the outage zone), ZONE-C.
- `seed/users.json`: demo logins. Operator `operator` / `demo1234`; crew login is the unit code (`AMB-01`) with PIN `1111`; reviewer uses `POST /auth/demo`.
- `seed/events.json`: 70 events over 26 scenario minutes. It plays: three incidents (one Kannada voice note), PLAN-001, assignments, rain surge, ROAD-04 closed, approval APR-001, PLAN-002 with the diff, Zone B outage with SMS fallback and approval APR-002, arrivals, closures.

**All coordinates, names and ETAs are demo data.** Person 2's engine replaces the ETA numbers with computed ones. If the team uses a real road extract, keep the IDs and swap the geometry.

Not exercised by the replay (but defined): `assignment.declined`, `assignment.timeout`, `unit.unavailable`, `incident.updated` for most status changes. Trigger them from the scenario panel.
