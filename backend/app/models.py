"""
models.py — Pydantic v2 models mirroring contracts/types.ts exactly.
Rule: camelCase JSON (alias_generator=to_camel). Never rename a field
without updating types.ts first and getting team agreement.
"""
from __future__ import annotations
from typing import Any, Literal, Optional
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _Base(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ── Primitives ────────────────────────────────────────────────────────
Role = Literal["operator", "crew", "reviewer", "reporter"]
Language = Literal["en", "kn", "hi"]
Severity = Literal["low", "medium", "high", "critical"]
IncidentType = Literal[
    "flooded_home", "stranded_vehicle", "medical",
    "trapped_person", "road_blocked", "other"
]
IncidentStatus = Literal[
    "reported", "assessed", "assigned", "en_route",
    "on_scene", "resolved", "closed", "unserved"
]
IncidentSource = Literal["reporter_chat", "reporter_voice", "phone_in", "scenario"]
UnitType = Literal["ambulance", "boat", "rescue_team", "pump"]
UnitStatus = Literal["available", "assigned", "en_route", "on_scene", "unreachable", "offline"]
RoadStatus = Literal["open", "slow", "closed"]
CommsStatus = Literal["ok", "degraded"]
Channel = Literal["chat", "sms", "phone"]
AgentName = Literal["intake", "assessment", "route", "allocation", "command"]
RainIntensity = Literal["none", "light", "moderate", "heavy", "extreme"]
DataFreshness = Literal["live", "cached", "stale"]


# ── Domain objects ────────────────────────────────────────────────────
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
    severity: Optional[Severity]
    severity_score: Optional[float]
    time_window_minutes: Optional[int]
    location: Place
    people_affected: int
    language: Language
    source: IncidentSource
    summary: str
    confidence: float
    reported_at: str
    assigned_unit_ids: list[str]
    reporter_session_id: Optional[str]


class Unit(_Base):
    unit_id: str
    type: UnitType
    name: str
    status: UnitStatus
    location: Place
    assigned_incident_id: Optional[str]
    last_heartbeat_at: str


class Facility(_Base):
    facility_id: str
    name: str
    type: Literal["shelter", "hospital", "depot"]
    location: Place
    capacity: Optional[int]


class RoadNode(_Base):
    node_id: str
    lat: float
    lng: float


class Road(_Base):
    road_id: str
    name: str
    from_node: str
    to_node: str
    status: RoadStatus
    length_km: float
    geometry: list[list[float]]


class RoadNetwork(_Base):
    nodes: list[RoadNode]
    roads: list[Road]


class Zone(_Base):
    zone_id: str
    name: str
    polygon: list[list[float]]
    comms_status: CommsStatus


class RainStatus(_Base):
    intensity: RainIntensity
    mm_per_hour: float
    freshness: DataFreshness
    observed_at: str


class SystemStatus(_Base):
    scenario_time: str
    speed: int
    overall_severity: Severity
    rain: RainStatus
    comms_overall: CommsStatus


# ── Plan and diff ─────────────────────────────────────────────────────
class PlanEntry(_Base):
    incident_id: str
    unit_id: str
    eta_minutes: int
    eta_range: list[int]


class UnitEta(_Base):
    unit_id: str
    eta_minutes: int


class PlanChange(_Base):
    incident_id: str
    change: Literal["added", "changed", "removed", "unchanged"]
    before: Optional[UnitEta]
    after: Optional[UnitEta]
    reason: str


class Unserved(_Base):
    incident_id: str
    reason: str


class Plan(_Base):
    plan_id: str
    version: int
    previous_plan_id: Optional[str]
    trigger: str
    published_at: str
    entries: list[PlanEntry]
    unserved: list[Unserved]
    changes: list[PlanChange]
    pending_approval_ids: list[str]


# ── Approvals and assignments ─────────────────────────────────────────
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
    chosen_option_id: Optional[str]
    decided_by: Optional[str]
    decided_at: Optional[str]


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
    responded_at: Optional[str]


# ── Logs and reports ──────────────────────────────────────────────────
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
    zone_id: Optional[str]


class DecisionLogEntry(_Base):
    decision_id: str
    ts: str
    agent: str   # AgentName | "operator"
    decision: str
    reason: str
    incident_id: Optional[str]
    plan_id: Optional[str]
    approval_id: Optional[str]


class ResponseTime(_Base):
    incident_id: str
    reported_to_arrived_minutes: Optional[float]


class BaselineMetric(_Base):
    metric: str
    unit: str
    samanvaya: float
    baseline: float


class TimelineEntry(_Base):
    ts: str
    text: str
    incident_id: Optional[str]


class PlanChangeSummary(_Base):
    plan_id: str
    trigger: str
    changes: list[PlanChange]


class AfterActionReport(_Base):
    generated_at: str
    timeline: list[TimelineEntry]
    plan_changes: list[PlanChangeSummary]
    approvals: list[Approval]
    response_times: list[ResponseTime]
    baseline: list[BaselineMetric]
    unresolved: list[Incident]


# ── Auth request / response ───────────────────────────────────────────
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
    unit_id: Optional[str]


# ── Approval decision ─────────────────────────────────────────────────
class ApprovalDecisionRequest(_Base):
    decision: Literal["approve", "reject", "choose_other"]
    option_id: Optional[str] = None
    note: Optional[str] = None


# ── Reporter ──────────────────────────────────────────────────────────
class ReporterSessionRequest(_Base):
    language: Optional[Language] = None


class ReporterSession(_Base):
    session_id: str
    token: str
    language: Language


class ReporterMessageRequest(_Base):
    session_id: str
    text: str
    language: Optional[Language] = None


class ReporterMessageResponse(_Base):
    message_id: str


# ── Crew ──────────────────────────────────────────────────────────────
class CrewRespondRequest(_Base):
    accept: bool
    reason: Optional[str] = None
    client_request_id: str


class CrewStatusRequest(_Base):
    action: Literal["en_route", "arrived", "task_complete"]
    client_request_id: str


class CrewProblemRequest(_Base):
    kind: Literal["road_blocked", "vehicle_stuck", "other"]
    note: Optional[str] = None
    client_request_id: str


# ── Phone-in / Scenario ───────────────────────────────────────────────
class PhoneInRequest(_Base):
    location: dict[str, Any]   # {lat, lng, label}
    type: IncidentType
    people_affected: int
    language: Language
    note: Optional[str] = None


class UnitStatusRequest(_Base):
    status: UnitStatus
    note: Optional[str] = None


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
    speed: int


# ── Errors ────────────────────────────────────────────────────────────
class ApiError(_Base):
    error: dict[str, str]
