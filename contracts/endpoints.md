# REST endpoints

Base path `/api` is optional; keep it consistent. Request and response types are in `types.ts`. Role columns: **Op** operator, **Rev** reviewer (read-only), **Crew**, **Rep** reporter (anonymous session token).

| Group | Method and path | Roles | Request | Response |
|---|---|---|---|---|
| Auth | `POST /auth/login` | none | `LoginRequest` | `AuthResponse` |
| Auth | `POST /auth/crew-login` | none | `CrewLoginRequest` | `AuthResponse` (`unitId` set) |
| Auth | `POST /auth/demo` | none | none | `AuthResponse` (`role: "reviewer"`) |
| State | `GET /incidents` | Op, Rev | none | `Incident[]` |
| State | `GET /units` | Op, Rev | none | `Unit[]` |
| State | `GET /facilities` | Op, Rev | none | `Facility[]` |
| State | `GET /roads` | Op, Rev | none | `RoadNetwork` |
| State | `GET /zones` | Op, Rev | none | `Zone[]` |
| State | `GET /status` | Op, Rev | none | `SystemStatus` (top bar; new) |
| Plan | `GET /plan/current` | Op, Rev | none | `Plan` or `null` |
| Plan | `GET /plan/history` | Op, Rev | none | `Plan[]` (oldest first) |
| Plan | `GET /plan/diff?from=PLAN-001&to=PLAN-002` | Op, Rev | none | `PlanChange[]` |
| Approvals | `GET /approvals?status=pending` | Op | none | `Approval[]` |
| Approvals | `POST /approvals/{id}/decision` | Op | `ApprovalDecisionRequest` | `Approval` (updated) |
| Phone-in | `POST /incidents/phone-in` | Op | `PhoneInRequest` | `Incident` |
| Phone-in | `POST /units/{id}/status` | Op | `UnitStatusRequest` | `Unit` |
| Scenario | `POST /scenario/inject-incident` | Op | `InjectIncidentRequest` | `Incident` |
| Scenario | `POST /scenario/unit-offline` | Op | `UnitOfflineRequest` | `Unit` |
| Scenario | `POST /scenario/rain-surge` | Op | `RainSurgeRequest` | `SystemStatus` |
| Scenario | `POST /scenario/outage` | Op | `OutageRequest` | `Zone` |
| Scenario | `POST /scenario/time-warp` | Op | `TimeWarpRequest` | `SystemStatus` |
| Scenario | `POST /scenario/reset` | Op | none | `SystemStatus` |
| Reporter | `POST /reporter/session` | none | `ReporterSessionRequest` | `ReporterSession` |
| Reporter | `POST /reporter/message` | Rep | `ReporterMessageRequest` | `ReporterMessageResponse` |
| Reporter | `POST /reporter/voice` | Rep | multipart: `sessionId`, `audio` (file) | `ReporterMessageResponse` |
| Crew | `GET /crew/assignment` | Crew | none | `Assignment` or `null` |
| Crew | `POST /crew/assignment/{id}/respond` | Crew | `CrewRespondRequest` | `Assignment` |
| Crew | `POST /crew/status` | Crew | `CrewStatusRequest` | `Unit` |
| Crew | `POST /crew/problem` | Crew | `CrewProblemRequest` | `{ ok: true }` |
| Reports | `GET /reports/after-action` | Op, Rev | none | `AfterActionReport` |
| Reports | `GET /comms/log` | Op, Rev | none | `CommsLogEntry[]` (also feeds the simulated SMS panel) |
| Reports | `GET /decisions` | Op, Rev | none | `DecisionLogEntry[]` |

## Behaviour notes

- **Replies to reporters are not in the HTTP response.** `POST /reporter/message` returns a `messageId`. The reply and status updates arrive on `/ws/reporter/{sessionId}`.
- **Crew actions are idempotent.** Every crew POST carries a `clientRequestId`. The crew page queues actions offline and resends on reconnect; the backend must ignore duplicates.
- **`rain-surge`** with `heavy` or `extreme` should make the Route agent close `ROAD-04` and slow `ROAD-05` (this is what the demo script shows).
- **`outage`** with `{ zoneId: "ZONE-B", active: true }` emits `zone.comms_degraded`, and messages then flow over SMS. `active: false` restores it.
- **`reset`** restores the seed state (units, roads, zones all as in `seed/`) and clears incidents, plans and approvals.
- **`time-warp`** speeds allowed: 1, 2, 5, 10. All `ts` values continue to be scenario time.
- **Approving** `POST /approvals/{id}/decision` with `approve` executes the option, then emits `approval.resolved` followed by `plan.published`.
- **Reviewer** role gets `403` on every `POST` except `/auth/demo`.
- **Roles on state endpoints:** crew and reporters get `403` on the operator state endpoints.
