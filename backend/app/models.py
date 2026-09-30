"""
models.py — Pydantic v2 models mirroring contracts/types.ts exactly.

Rules (from contracts/README.md):
  - JSON fields are camelCase via alias_generator=to_camel + populate_by_name=True.
  - IDs are strings with fixed prefixes (INC-01, AMB-01, PLAN-001, …).
  - Timestamps are scenario time (ISO 8601, no timezone), never wall clock.
  - Nullable means "always present, value may be null".
  - Optional (?) means "key may be absent" → use Optional with a default.

Never rename a field without updating contracts/types.ts first and getting
team agreement (contracts/README.md §Changing a contract).
"""
from __future__ import annotations

from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

# ── Base ─────────────────────────────────────────────────────────────────────
_CFG = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class _Base(BaseModel):
    model_config = _CFG


# ══════════════════════════════════════════════════════════════════════════════
# Primitive type aliases  (mirroring the type aliases in types.ts)
# ══════════════════════════════════════════════════════════════════════════════

Role            = Literal["operator", "crew", "reviewer", "reporter"]
Language        = Literal["en", "kn", "hi"]
Severity        = Literal["low", "medium", "high", "critical"]
IncidentType    = Literal[
    "flooded_home", "stranded_vehicle", "medical",
    "trapped_person", "road_blocked", "other",
]
IncidentStatus  = Literal[
    "reported", "assessed", "assigned", "en_route",
    "on_scene", "resolved", "closed", "unserved",
]
IncidentSource  = Literal["reporter_chat", "reporter_voice", "phone_in", "scenario"]
UnitType        = Literal["ambulance", "boat", "rescue_team", "pump"]
UnitStatus      = Literal["available", "assigned", "en_route", "on_scene", "unreachable", "offline"]
RoadStatus      = Literal["open", "slow", "closed"]
CommsStatus     = Literal["ok", "degraded"]
Channel         = Literal["chat", "sms", "phone"]
AgentName       = Literal["intake", "assessment", "route", "allocation", "command"]
RainIntensity   = Literal["none", "light", "moderate", "heavy", "extreme"]
DataFreshness   = Literal["live", "cached", "stale"]


# ══════════════════════════════════════════════════════════════════════════════
# Domain objects
# ══════════════════════════════════════════════════════════════════════════════

class LatLng(_Base):
    lat: float
    lng: float


class Place(_Base):
    lat: float
    lng: float
    label: str
    zone_id: str


class Incident(_Base):
    incident_id: str
    type: IncidentType
    status: IncidentStatus
    severity: Optional[Severity]           # nullable — always present
    severity_score: Optional[float]        # nullable
    time_window_minutes: Optional[int]     # nullable
    location: Place
    people_affected: int
    language: Language
    source: IncidentSource
    summary: str
    confidence: float
    reported_at: str
    assigned_unit_ids: list[str]
    reporter_session_id: Optional[str]     # nullable


class Unit(_Base):
    unit_id: str
    type: UnitType
    name: str
    status: UnitStatus
    location: Place
    assigned_incident_id: Optional[str]    # nullable
    last_heartbeat_at: str


class Facility(_Base):
    facility_id: str
    name: str
    type: Literal["shelter", "hospital", "depot"]
    location: Place
    capacity: Optional[int]                # nullable


class RoadNode(_Base):
    node_id: str
    lat: float
    lng: float


class Road(_Base):
    road_id: str
    name: str
    from_node: str                         # camelCase alias: fromNode
    to_node: str                           # camelCase alias: toNode
    status: RoadStatus
    length_km: float
    geometry: list[list[float]]            # LatLngTuple[]


class RoadNetwork(_Base):
    nodes: list[RoadNode]
    roads: list[Road]


class Zone(_Base):
    zone_id: str
    name: str
    polygon: list[list[float]]
    comms_status: CommsStatus


class RainInfo(_Base):
    """Nested rain object inside SystemStatus."""
    intensity: RainIntensity
    mm_per_hour: float
    freshness: DataFreshness
    observed_at: str


class SystemStatus(_Base):
    scenario_time: str
    speed: int
    overall_severity: Severity
    rain: RainInfo
    comms_overall: CommsStatus


# ── Plan and diff ─────────────────────────────────────────────────────────────

class PlanEntry(_Base):
    incident_id: str
    unit_id: str
    eta_minutes: int
    eta_range: list[int]                   # [min, max]


class UnitEtaSnapshot(_Base):
    """before / after inside PlanChange."""
    unit_id: str
    eta_minutes: int


class PlanChange(_Base):
    incident_id: str
    change: Literal["added", "changed", "removed", "unchanged"]
    before: Optional[UnitEtaSnapshot]      # nullable
    after: Optional[UnitEtaSnapshot]       # nullable
    reason: str


class Unserved(_Base):
    incident_id: str
    reason: str


class Plan(_Base):
    plan_id: str
    version: int
    previous_plan_id: Optional[str]        # nullable
    trigger: str
    published_at: str
    entries: list[PlanEntry]
    unserved: list[Unserved]
    changes: list[PlanChange]
    pending_approval_ids: list[str]


# ── Approvals and assignments ─────────────────────────────────────────────────

class ApprovalOption(_Base):
    option_id: str
    label: str
    description: str


class Approval(_Base):
    approval_id: str
    kind: Literal["reassign_unit", "crew_check", "plan_publish", "other"]
    status: Literal["pending", "approved", "rejected", "superseded"]
    summary: str
    reason: str
    options: list[ApprovalOption]
    recommended_option_id: str
    related_incident_ids: list[str]
    requested_at: str
    chosen_option_id: Optional[str]        # nullable
    decided_by: Optional[str]             # nullable
    decided_at: Optional[str]             # nullable


class Assignment(_Base):
    assignment_id: str
    plan_id: str
    incident_id: str
    unit_id: str
    status: Literal["sent", "accepted", "declined", "timed_out", "cancelled", "completed"]
    incident_summary: str
    location: Place
    people_affected: int
    eta_minutes: int
    instructions: str
    sent_at: str
    responded_at: Optional[str]            # nullable


# ── Logs and reports ──────────────────────────────────────────────────────────

class RecipientRef(_Base):
    kind: Literal["reporter", "crew", "operator"]
    id: str


class CommsLogEntry(_Base):
    entry_id: str
    ts: str
    direction: Literal["in", "out"]
    channel: Channel
    recipient: RecipientRef
    text: str
    delivery: Literal["sent", "delivered", "failed"]
    zone_id: Optional[str]                 # nullable


class DecisionLogEntry(_Base):
    decision_id: str
    ts: str
    agent: str                             # AgentName | "operator"
    decision: str
    reason: str
    incident_id: Optional[str]             # nullable
    plan_id: Optional[str]                 # nullable
    approval_id: Optional[str]             # nullable


class TimelineEntry(_Base):
    ts: str
    text: str
    incident_id: Optional[str]


class PlanChangeSummary(_Base):
    plan_id: str
    trigger: str
    changes: list[PlanChange]


class ResponseTime(_Base):
    incident_id: str
    reported_to_arrived_minutes: Optional[float]


class BaselineMetric(_Base):
    metric: str
    unit: str
    samanvaya: float
    baseline: float


class AfterActionReport(_Base):
    generated_at: str
    timeline: list[TimelineEntry]
    plan_changes: list[PlanChangeSummary]
    approvals: list[Approval]
    response_times: list[ResponseTime]
    baseline: list[BaselineMetric]
    unresolved: list[Incident]


# ══════════════════════════════════════════════════════════════════════════════
# Event payload models  (one per EventType in contracts/types.ts §EventPayloads)
# ══════════════════════════════════════════════════════════════════════════════
#
# Field naming rules:
#   • Python name → camelCase JSON alias automatically via alias_generator.
#   • Exception: "from" and "to" are Python keywords; they get explicit aliases.

class IncidentReportedPayload(_Base):
    incident: Incident


class IncidentAssessedPayload(_Base):
    incident: Incident


class IncidentUpdatedPayload(_Base):
    incident: Incident
    changed_fields: list[str]


class IncidentClosedPayload(_Base):
    incident_id: str
    closed_at: str
    outcome: Literal["resolved", "unserved", "duplicate", "false_alarm"]


class PlanPublishedPayload(_Base):
    plan: Plan


class ApprovalRequestedPayload(_Base):
    approval: Approval


class ApprovalResolvedPayload(_Base):
    approval_id: str
    decision: Literal["approve", "reject", "choose_other"]
    chosen_option_id: Optional[str]        # nullable
    decided_by: str
    decided_at: str
    note: Optional[str]                    # nullable


class AssignmentSentPayload(_Base):
    assignment: Assignment


class AssignmentAcceptedPayload(_Base):
    assignment_id: str
    unit_id: str
    incident_id: str


class AssignmentDeclinedPayload(_Base):
    assignment_id: str
    unit_id: str
    incident_id: str
    reason: Optional[str]                  # nullable


class AssignmentTimeoutPayload(_Base):
    assignment_id: str
    unit_id: str
    incident_id: str


class AssignmentCancelledPayload(_Base):
    assignment_id: str
    unit_id: str
    incident_id: str
    reason: str


class UnitStatusChangedPayload(_Base):
    unit_id: str
    status: UnitStatus
    previous_status: UnitStatus
    location: Optional[LatLng]             # nullable


class UnitUnavailablePayload(_Base):
    unit_id: str
    reason: Literal["operator", "crew_declined", "offline", "vehicle_stuck"]


class UnitHeartbeatLostPayload(_Base):
    unit_id: str
    last_heartbeat_at: str


class ZoneCommsDegradedPayload(_Base):
    zone_id: str
    fallback_channel: Optional[Channel]    # nullable


class ZoneCommsRestoredPayload(_Base):
    zone_id: str


class CommsDeliveryFailedPayload(_Base):
    message_id: str
    recipient: RecipientRef
    channel: Channel
    zone_id: Optional[str]                 # nullable


class CommsChannelSwitchedPayload(_Base):
    """
    'from' and 'to' are Python reserved words; use explicit Field aliases.
    alias_generator would produce 'from' → 'from' and 'to' → 'to' for
    single-word names — but since `from` can't be a Python identifier we
    name them `from_channel` and `to_channel` with explicit aliases.
    """
    recipient: RecipientRef
    from_channel: Channel = Field(alias="from")
    to_channel: Channel   = Field(alias="to")
    reason: str


class ReporterMessageSentPayload(_Base):
    session_id: str
    message_id: str
    from_: Literal["reporter", "system"] = Field(alias="from")
    text: str
    translated_text: Optional[str]         # nullable
    language: Language
    channel: Channel


class AgentActivityPayload(_Base):
    agent: AgentName
    message: str
    incident_id: Optional[str]             # nullable
    plan_id: Optional[str]                 # nullable


class RoadStatusChangedPayload(_Base):
    road_id: str
    status: RoadStatus
    previous_status: RoadStatus
    reason: str


class StatusUpdatedPayload(_Base):
    status: SystemStatus


class ReporterStatusUpdatedPayload(_Base):
    session_id: str
    incident_id: str
    stage: Literal["received", "assigned", "on_the_way", "arrived", "resolved"]
    eta_range: Optional[list[int]]         # nullable, [min, max] when present
    safety_tips: list[str]


# ══════════════════════════════════════════════════════════════════════════════
# Event envelope  — discriminated union on the `type` field
# ══════════════════════════════════════════════════════════════════════════════
#
# Each concrete event model has:
#   type: Literal["<event.type>"]   ← the discriminator value
#   payload: <PayloadModel>
#
# Pydantic v2 picks the right model by looking at "type" in the raw data.

class _EventBase(BaseModel):
    """Common envelope fields shared by every event."""
    model_config = _CFG
    id: str
    ts: str


class IncidentReportedEvent(_EventBase):
    type: Literal["incident.reported"]
    payload: IncidentReportedPayload


class IncidentAssessedEvent(_EventBase):
    type: Literal["incident.assessed"]
    payload: IncidentAssessedPayload


class IncidentUpdatedEvent(_EventBase):
    type: Literal["incident.updated"]
    payload: IncidentUpdatedPayload


class IncidentClosedEvent(_EventBase):
    type: Literal["incident.closed"]
    payload: IncidentClosedPayload


class PlanPublishedEvent(_EventBase):
    type: Literal["plan.published"]
    payload: PlanPublishedPayload


class ApprovalRequestedEvent(_EventBase):
    type: Literal["approval.requested"]
    payload: ApprovalRequestedPayload


class ApprovalResolvedEvent(_EventBase):
    type: Literal["approval.resolved"]
    payload: ApprovalResolvedPayload


class AssignmentSentEvent(_EventBase):
    type: Literal["assignment.sent"]
    payload: AssignmentSentPayload


class AssignmentAcceptedEvent(_EventBase):
    type: Literal["assignment.accepted"]
    payload: AssignmentAcceptedPayload


class AssignmentDeclinedEvent(_EventBase):
    type: Literal["assignment.declined"]
    payload: AssignmentDeclinedPayload


class AssignmentTimeoutEvent(_EventBase):
    type: Literal["assignment.timeout"]
    payload: AssignmentTimeoutPayload


class AssignmentCancelledEvent(_EventBase):
    type: Literal["assignment.cancelled"]
    payload: AssignmentCancelledPayload


class UnitStatusChangedEvent(_EventBase):
    type: Literal["unit.status_changed"]
    payload: UnitStatusChangedPayload


class UnitUnavailableEvent(_EventBase):
    type: Literal["unit.unavailable"]
    payload: UnitUnavailablePayload


class UnitHeartbeatLostEvent(_EventBase):
    type: Literal["unit.heartbeat_lost"]
    payload: UnitHeartbeatLostPayload


class ZoneCommsDegradedEvent(_EventBase):
    type: Literal["zone.comms_degraded"]
    payload: ZoneCommsDegradedPayload


class ZoneCommsRestoredEvent(_EventBase):
    type: Literal["zone.comms_restored"]
    payload: ZoneCommsRestoredPayload


class CommsDeliveryFailedEvent(_EventBase):
    type: Literal["comms.delivery_failed"]
    payload: CommsDeliveryFailedPayload


class CommsChannelSwitchedEvent(_EventBase):
    type: Literal["comms.channel_switched"]
    payload: CommsChannelSwitchedPayload


class ReporterMessageSentEvent(_EventBase):
    type: Literal["reporter.message_sent"]
    payload: ReporterMessageSentPayload


class AgentActivityEvent(_EventBase):
    type: Literal["agent.activity"]
    payload: AgentActivityPayload


class RoadStatusChangedEvent(_EventBase):
    type: Literal["road.status_changed"]
    payload: RoadStatusChangedPayload


class StatusUpdatedEvent(_EventBase):
    type: Literal["status.updated"]
    payload: StatusUpdatedPayload


class ReporterStatusUpdatedEvent(_EventBase):
    type: Literal["reporter.status_updated"]
    payload: ReporterStatusUpdatedPayload


# ── ContractEvent: discriminated union ────────────────────────────────────────

ContractEvent = Annotated[
    Union[
        IncidentReportedEvent,
        IncidentAssessedEvent,
        IncidentUpdatedEvent,
        IncidentClosedEvent,
        PlanPublishedEvent,
        ApprovalRequestedEvent,
        ApprovalResolvedEvent,
        AssignmentSentEvent,
        AssignmentAcceptedEvent,
        AssignmentDeclinedEvent,
        AssignmentTimeoutEvent,
        AssignmentCancelledEvent,
        UnitStatusChangedEvent,
        UnitUnavailableEvent,
        UnitHeartbeatLostEvent,
        ZoneCommsDegradedEvent,
        ZoneCommsRestoredEvent,
        CommsDeliveryFailedEvent,
        CommsChannelSwitchedEvent,
        ReporterMessageSentEvent,
        AgentActivityEvent,
        RoadStatusChangedEvent,
        StatusUpdatedEvent,
        ReporterStatusUpdatedEvent,
    ],
    Field(discriminator="type"),
]

# TypeAdapter lets us validate a raw dict → ContractEvent without wrapping it
# in another model.  Used in tests and wherever events arrive off the wire.
from pydantic import TypeAdapter          # noqa: E402 (kept near its usage)
ContractEventAdapter: TypeAdapter[ContractEvent] = TypeAdapter(ContractEvent)


# ══════════════════════════════════════════════════════════════════════════════
# REST request / response bodies  (contracts/types.ts §REST request/response)
# ══════════════════════════════════════════════════════════════════════════════

class ApiError(_Base):
    error: dict[str, str]


class LoginRequest(_Base):
    username: str
    password: str


class CrewLoginRequest(_Base):
    unit_code: str
    pin: str


class AuthResponse(_Base):
    token: str
    role: Role
    display_name: str
    unit_id: Optional[str]                 # nullable


class ApprovalDecisionRequest(_Base):
    decision: Literal["approve", "reject", "choose_other"]
    option_id: Optional[str] = None        # optional (key may be absent)
    note: Optional[str] = None             # optional


class PhoneInLocation(_Base):
    lat: float
    lng: float
    label: str


class PhoneInRequest(_Base):
    location: PhoneInLocation              # {lat, lng, label}
    type: IncidentType
    people_affected: int
    language: Language
    note: Optional[str] = None             # optional


class UnitStatusRequest(_Base):
    status: UnitStatus
    note: Optional[str] = None             # optional


class InjectIncidentRequest(_Base):
    type: IncidentType
    zone_id: str
    people_affected: int
    language: Optional[Language] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class UnitOfflineRequest(_Base):
    unit_id: str


class RainSurgeRequest(_Base):
    intensity: RainIntensity


class OutageRequest(_Base):
    zone_id: str
    active: bool


class TimeWarpRequest(_Base):
    speed: int                             # 1, 2, 5, 10


class ReporterSessionRequest(_Base):
    language: Optional[Language] = None    # optional


class ReporterSession(_Base):
    session_id: str
    token: str
    language: Language


class ReporterMessageRequest(_Base):
    session_id: str
    text: str
    language: Optional[Language] = None    # optional


class ReporterMessageResponse(_Base):
    message_id: str


class CrewRespondRequest(_Base):
    accept: bool
    reason: Optional[str] = None           # optional
    client_request_id: str


class CrewStatusRequest(_Base):
    action: Literal["en_route", "arrived", "task_complete"]
    client_request_id: str


class CrewProblemRequest(_Base):
    kind: Literal["road_blocked", "vehicle_stuck", "other"]
    note: Optional[str] = None             # optional
    client_request_id: str


# ── Logs & Reports ───────────────────────────────────────────────────

class DecisionLogEntry(_Base):
    decision_id: str
    ts: str
    agent: Union[AgentName, Literal["operator"]]
    decision: str
    reason: str
    incident_id: Optional[str]
    plan_id: Optional[str]
    approval_id: Optional[str]


class CommsLogRecipient(_Base):
    kind: Literal["reporter", "crew", "operator"]
    id: str


class CommsLogEntry(_Base):
    entry_id: str
    ts: str
    direction: Literal["in", "out"]
    channel: Channel
    recipient: CommsLogRecipient
    text: str
    delivery: Literal["sent", "delivered", "failed"]
    zone_id: Optional[str]
