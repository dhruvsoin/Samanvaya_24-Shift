# Event catalogue

Envelope for every event: `{ "id": "evt_001", "type": "...", "ts": "<scenario time>", "payload": { ... } }`.
Payload shapes: see `EventPayloads` in `types.ts`. Examples: `seed/events.json`.

Emitters: **P1** Brain, **P2** Engine, **P4** Comms and Simulation. Listeners: **Op** operator screens, **Crew** crew page, **Rep** reporter chat.

| Event | Emitted by | Listeners | When |
|---|---|---|---|
| `incident.reported` | P1 (Intake) | Op | A new incident is structured from chat, voice, phone-in or scenario. |
| `incident.assessed` | P1 (Assessment) | Op | Severity, score and time window are set. |
| `incident.updated` | P1 | Op | Any field change (status, assigned units, people count). `changedFields` lists them. |
| `incident.closed` | P1 | Op | Resolved, unserved, duplicate or false alarm. |
| `plan.published` | P1 (Command) using P2's solver output | Op | A new plan version exists. Contains entries, unserved list and the diff. |
| `approval.requested` | P1 (Command) | Op | A risky action is held for the operator. |
| `approval.resolved` | P1 | Op | Operator decided. Includes who and when. |
| `assignment.sent` | P1 | Op, Crew (own unit) | A unit is told to go. |
| `assignment.accepted` | P1 (from crew action) | Op, Crew | Crew accepted. |
| `assignment.declined` | P1 (from crew action) | Op, Crew | Crew said "Can't take it". |
| `assignment.timeout` | P1 | Op, Crew | No response within the limit. |
| `assignment.cancelled` | P1 | Op, Crew (own unit) | Plan change removed the assignment. |
| `unit.status_changed` | P1 | Op, Crew (own unit) | Any unit status change. |
| `unit.unavailable` | P1 / P4 (scenario) | Op | Unit taken out of the pool. |
| `unit.heartbeat_lost` | P1 | Op | No heartbeat within the limit. |
| `road.status_changed` | P2 | Op | Road becomes open, slow or closed. |
| `zone.comms_degraded` | P4 | Op | Outage starts in a zone. `fallbackChannel` is `sms`. |
| `zone.comms_restored` | P4 | Op | Outage ends. |
| `comms.delivery_failed` | P4 | Op | A message to a reporter or crew failed. |
| `comms.channel_switched` | P4 | Op | Message resent on the fallback channel. |
| `reporter.message_sent` | P4 | Op (comms log), Rep (own session) | Any chat message in either direction. `translatedText` is English for non-English text. |
| `reporter.status_updated` | P1 / P4 | Rep (own session) | Status card stage, ETA range and safety tips. |
| `status.updated` | P1 | Op | Top bar: overall severity, rain and its freshness, comms, scenario clock. |
| `agent.activity` | P1, P2, P4 (any agent) | Op | One human-readable line per agent action. |

## WebSocket channels

| Channel | Receives |
|---|---|
| `/ws/operator` | All events (operator and reviewer). Reviewers are read-only. |
| `/ws/crew/{unitId}` | `assignment.*`, `unit.status_changed`, `unit.unavailable` for that unit only. |
| `/ws/reporter/{sessionId}` | `reporter.message_sent` and `reporter.status_updated` for that session only. |

## Connection rules

- Load state through REST first, then apply events. On reconnect, **refetch REST state**, then continue.
- Client sends the text `ping` every 20 seconds; server replies `pong` (plain text, not an envelope).
- Optional: `?since=<lastEventId>` lets the server replay missed events. If unsupported, the client just refetches.
- Events for the same entity arrive in order. Throttle map redraws on the client.
