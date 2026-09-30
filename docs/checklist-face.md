# Face checklist (Person 3) — `frontend/`

Tick every box, then send the "Report back" block at the bottom to Person 1.
Source of truth: `contracts/types.ts`, `contracts/endpoints.md`, `contracts/events.md`. If the backend disagrees with them, tell Person 1. Do not work around it silently.

## A. Setup
- [ ] Vite + React + TypeScript, Tailwind, shadcn/ui, React Router, TanStack Query, Zustand, React Hook Form + zod, Leaflet (used directly), Recharts, i18next, MSW installed.
- [ ] `@contracts` alias points to `../contracts`; types are **imported from `types.ts`**, not retyped by hand.
- [ ] `VITE_USE_MOCKS=true` uses MSW handlers returning `contracts/seed/*.json`; `false` uses the real backend. Switching is only a config change.
- [ ] `replay.ts` plays `contracts/seed/events.json` through the same socket layer and stores as the real WebSocket, honouring the `ts` gaps with a speed control.
- [ ] `npm run build` has no TypeScript errors and the console shows no errors on the demo path.

## B. API client (exact paths, methods, bodies)
- [ ] Token sent as `Authorization: Bearer <token>`. Errors parsed as `{ error: { code, message } }`.
- [ ] Auth: `POST /auth/login` `{username,password}`; `POST /auth/crew-login` `{unitCode,pin}`; `POST /auth/demo`. Responses are `{token, role, displayName, unitId}`.
- [ ] State: `GET /incidents`, `/units`, `/facilities`, `/roads` (returns `{nodes, roads}`), `/zones`, `/status`.
- [ ] Plan: `GET /plan/current` (may be `null`), `/plan/history`, `/plan/diff?from=&to=`.
- [ ] Approvals: `GET /approvals?status=pending`; `POST /approvals/{id}/decision` body `{decision: 'approve'|'reject'|'choose_other', optionId?, note?}`.
- [ ] Phone-in: `POST /incidents/phone-in` body `{location:{lat,lng,label}, type, peopleAffected, language, note?}`; `POST /units/{id}/status` body `{status, note?}`.
- [ ] Crew: `GET /crew/assignment` (may be `null`); `POST /crew/assignment/{id}/respond` `{accept, reason?, clientRequestId}`; `POST /crew/status` `{action:'en_route'|'arrived'|'task_complete', clientRequestId}`; `POST /crew/problem` `{kind, note?, clientRequestId}`.
- [ ] Reports: `GET /reports/after-action`, `/comms/log`, `/decisions`.
- [ ] Reviewer gets 403 on every POST; the UI hides those controls instead of showing errors.

## C. WebSocket and events
- [ ] URLs: `/ws/operator?token=`, `/ws/crew/{unitId}?token=`. Reporter socket is Person 4's.
- [ ] Envelope is `{ id, type, ts, payload }`. `ts` is scenario time; **no `Date.now()` for anything shown**.
- [ ] Sends the text `ping` every 20 seconds and treats `pong` as plain text (not an envelope).
- [ ] On reconnect: show a reconnect banner, **refetch REST state**, then continue applying events.
- [ ] Event to store mapping is implemented for all of these, with payload keys exactly as in `EventPayloads`:
  - [ ] `incident.reported | assessed | updated | closed` → incidents (upsert by `incidentId`; `updated` carries `incident` and `changedFields`; `closed` carries `incidentId`, `closedAt`, `outcome`)
  - [ ] `plan.published` → plan (`payload.plan`: `planId`, `version`, `previousPlanId`, `trigger`, `publishedAt`, `entries`, `unserved`, `changes`, `pendingApprovalIds`)
  - [ ] `approval.requested` (`payload.approval`) and `approval.resolved` (`approvalId`, `decision`, `chosenOptionId`, `decidedBy`, `decidedAt`, `note`)
  - [ ] `assignment.sent` (`payload.assignment`), `assignment.accepted | declined | timeout | cancelled` (`assignmentId`, `unitId`, `incidentId`)
  - [ ] `unit.status_changed` (`unitId`, `status`, `previousStatus`, `location`), `unit.heartbeat_lost`, `unit.unavailable`
  - [ ] `road.status_changed` (`roadId`, `status`, `previousStatus`, `reason`) → road overlay colour
  - [ ] `zone.comms_degraded` (`zoneId`, `fallbackChannel`) and `zone.comms_restored` → amber zone shading
  - [ ] `status.updated` (`payload.status`) → top bar
  - [ ] `agent.activity` (`agent`, `message`, `incidentId`, `planId`) → agent stream, newest first
  - [ ] `comms.delivery_failed`, `comms.channel_switched`, `reporter.message_sent` → comms log
- [ ] Events with the same `ts` are applied in the order received.

## D. Field traps (these cause blank screens)
- [ ] `incident.severity` and `severityScore` are **`null` until assessed**; UI handles null (no crash, shows "Assessing").
- [ ] `plan.changes[].before` / `after` can be `null`. `pendingApprovalIds` can be empty.
- [ ] `GET /plan/current` returns `null` before the first plan. Empty states exist everywhere.
- [ ] `etaRange` is a two-number array `[min, max]`; `polygon` and road `geometry` are `[lat, lng]` (**not** `[lng, lat]`). Leaflet takes `[lat, lng]`.
- [ ] Field names are camelCase exactly: `incidentId`, `unitId`, `etaMinutes`, `peopleAffected`, `assignedUnitIds`, `zoneId`, `commsStatus`, `lastHeartbeatAt`, `recommendedOptionId`, `chosenOptionId`, `relatedIncidentIds`.
- [ ] Status and enum values are used exactly as in `types.ts` (for example `en_route`, `on_scene`, `stranded_vehicle`, `rescue_team`, `task_complete`).

## E. Screens
- [ ] **Login** (`/login`): operator form, crew unit code + PIN, Demo mode button. Seeded: operator / demo1234, crew code such as `AMB-01` with PIN `1111`.
- [ ] **Role guards:** operator, reviewer (read-only, hides approve buttons and scenario drawer), crew, anonymous `/report`.
- [ ] **Top bar:** overall severity (icon + label), rain intensity with **live / cached / stale** label, comms indicator, scenario clock, operator name, and slots for the phone-in button and Person 4's scenario drawer.
- [ ] **Incident queue:** cards with severity icon + label, type, place, status, assigned units; detail drawer.
- [ ] **Map (Leaflet):** incidents, units with status, facilities, roads coloured open / slow / closed, amber shading for degraded zones, legend, **OpenStreetMap attribution visible**. Custom marker icons (default Leaflet icons break under Vite). Updates throttled so bursts do not flicker.
- [ ] **Resource board:** unit rows with status pills (icon + label).
- [ ] **Agent stream:** newest first, agent name, one line, link to the incident.
- [ ] **Plan diff** (hero): before and after columns, changed rows highlighted with an animation, one reason per row, unserved list, "needs your decision" banner when `pendingApprovalIds` is not empty. Rows come straight from `plan.changes`; nothing is computed in the browser.
- [ ] **Approval inbox:** summary, reason, options with the recommended one marked, Approve / Reject / Choose another; after a decision shows who and when.
- [ ] **Phone-in modal:** map location picker, type, people affected, language, validated with zod.
- [ ] **Comms log and Decision log tabs;** Reports tab (after-action timeline, baseline chart) is cut first if time is short.
- [ ] **Crew page** (`/crew`, mobile-first): assignment card, Accept / Can't take it, En route / Arrived / Task complete, problem report, **offline queue banner**. Every POST carries a `clientRequestId` and is queued when offline.

## F. Rules
- [ ] Never colour alone: severity and status always have an icon or label too.
- [ ] Timestamps from the scenario clock only.
- [ ] Data freshness labelled (live / cached / stale).
- [ ] Components stay dumb; state lives in one Zustand store per resource.
- [ ] Nothing computes ETAs, severities or diffs in the browser.

## G. Replay test (mocks) — all must happen
| Scenario time | Expected on screen |
|---|---|
| 09:01:14 to 09:02:50 | Three incidents appear in the queue and on the map; INC-01 marked for a Kannada report |
| 09:03:10 | PLAN-001 appears; three assignments |
| 09:06:05 | ROAD-04 turns closed on the map; ROAD-05 slow |
| 09:06:20 | Approval APR-001 in the inbox, recommended option marked |
| 09:06:52 | PLAN-002 diff: INC-02 (RES-02 → RES-01) and INC-03 (ETA 4 → 7) highlighted with reasons; INC-01 unchanged |
| 09:08:00 | Zone B amber; comms log shows failed delivery and switch to SMS; APR-002 appears |
| 09:25:00 | All incidents closed; after-action report renders |

## H. Against the real backend (one flow at a time, `VITE_USE_MOCKS=false`)
- [ ] Login as operator, crew, reviewer.
- [ ] State loads (incidents, units, roads, zones, status).
- [ ] Operator WebSocket connected; killing and restarting the backend triggers the reconnect banner and a refetch.
- [ ] Approve APR-001 from the UI: the plan updates and the diff shows.
- [ ] Crew page: accept, en route, arrived, task complete.
- [ ] Phone-in creates an incident on the map.
- [ ] On a phone, crew page and operator view are usable; no console errors through the whole demo.

## Report back (copy, fill, send)
```
Face report
- Screens done: (list) / missing: (list)
- Mocks replay works end to end: yes/no
- Real backend flows working: login / state / socket / approvals / crew / phone-in
- Contract mismatches found (field, expected, actual): ...
- Console errors on demo path: none / (list)
```
