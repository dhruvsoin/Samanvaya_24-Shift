/**
 * SAMANVAYA SHARED CONTRACTS: single source of truth for every data shape.
 *
 * Rules:
 *  - JSON fields are camelCase. IDs are strings with fixed prefixes (see README.md).
 *  - Every timestamp is SCENARIO time (ISO 8601, no timezone), never the browser/server wall clock.
 *  - Nullable means "always present, value may be null". Optional (?) means "key may be absent".
 *  - The backend computes ETAs, severities and plan diffs. The frontend only renders them.
 *  - Backend (Pydantic) models must mirror this file exactly. To change a shape, follow README "Changing a contract".
 */

// ───────────────────────── Primitives ─────────────────────────
export type Role = 'operator' | 'crew' | 'reviewer' | 'reporter';
export type Language = 'en' | 'kn' | 'hi';
/** e.g. "2026-10-10T09:05:00" (scenario time) */
export type ScenarioTime = string;
export type LatLngTuple = [lat: number, lng: number];

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentType =
  | 'flooded_home' | 'stranded_vehicle' | 'medical' | 'trapped_person' | 'road_blocked' | 'other';
export type IncidentStatus =
  | 'reported' | 'assessed' | 'assigned' | 'en_route' | 'on_scene' | 'resolved' | 'closed' | 'unserved';
export type IncidentSource = 'reporter_chat' | 'reporter_voice' | 'phone_in' | 'scenario';
export type UnitType = 'ambulance' | 'boat' | 'rescue_team' | 'pump';
export type UnitStatus = 'available' | 'assigned' | 'en_route' | 'on_scene' | 'unreachable' | 'offline';
export type RoadStatus = 'open' | 'slow' | 'closed';
export type CommsStatus = 'ok' | 'degraded';
export type Channel = 'chat' | 'sms' | 'phone';
export type AgentName = 'intake' | 'assessment' | 'route' | 'allocation' | 'command';
export type RainIntensity = 'none' | 'light' | 'moderate' | 'heavy' | 'extreme';
export type DataFreshness = 'live' | 'cached' | 'stale';

// ───────────────────────── Domain objects ─────────────────────────
export interface LatLng { lat: number; lng: number }
export interface Place extends LatLng { label: string; zoneId: string }

export interface Incident {
  incidentId: string;                       // INC-01
  type: IncidentType;
  status: IncidentStatus;
  severity: Severity | null;                // null until assessed
  severityScore: number | null;             // 0-100, set by Assessment
  timeWindowMinutes: number | null;         // help should arrive within this
  location: Place;
  peopleAffected: number;
  language: Language;
  source: IncidentSource;
  summary: string;                          // English, one line, written by Intake
  confidence: number;                       // 0-1, Intake's confidence in the extraction
  reportedAt: ScenarioTime;
  assignedUnitIds: string[];
  reporterSessionId: string | null;         // SES-01, null for phone-in
}

export interface Unit {
  unitId: string;                           // AMB-01 (also the crew login code)
  type: UnitType;
  name: string;
  status: UnitStatus;
  location: Place;
  assignedIncidentId: string | null;
  lastHeartbeatAt: ScenarioTime;
}

export interface Facility {
  facilityId: string;                       // FAC-01
  name: string;
  type: 'shelter' | 'hospital' | 'depot';
  location: Place;
  capacity: number | null;
}

export interface RoadNode { nodeId: string; lat: number; lng: number }              // N1
export interface Road {
  roadId: string;                           // ROAD-04
  name: string;
  fromNode: string;
  toNode: string;
  status: RoadStatus;
  lengthKm: number;
  geometry: LatLngTuple[];
}
export interface RoadNetwork { nodes: RoadNode[]; roads: Road[] }

export interface Zone {
  zoneId: string;                           // ZONE-B
  name: string;
  polygon: LatLngTuple[];
  commsStatus: CommsStatus;
}

export interface SystemStatus {
  scenarioTime: ScenarioTime;
  speed: number;                            // time-warp multiplier, 1 = real time
  overallSeverity: Severity;
  rain: { intensity: RainIntensity; mmPerHour: number; freshness: DataFreshness; observedAt: ScenarioTime };
  commsOverall: CommsStatus;
}

// ───────────────────────── Plan and diff ─────────────────────────
export interface PlanEntry {
  incidentId: string;
  unitId: string;
  etaMinutes: number;
  etaRange: [min: number, max: number];     // shown to reporters
}
export interface PlanChange {
  incidentId: string;
  change: 'added' | 'changed' | 'removed' | 'unchanged';
  before: { unitId: string; etaMinutes: number } | null;
  after: { unitId: string; etaMinutes: number } | null;
  reason: string;                           // one line, generated from solver output
}
export interface Unserved { incidentId: string; reason: string }
export interface Plan {
  planId: string;                           // PLAN-001
  version: number;
  previousPlanId: string | null;
  trigger: string;                          // why this plan was produced
  publishedAt: ScenarioTime;
  entries: PlanEntry[];
  unserved: Unserved[];
  changes: PlanChange[];                    // diff against previousPlanId (all "added" for v1)
  pendingApprovalIds: string[];
}

// ───────────────────────── Approvals and assignments ─────────────────────────
export interface ApprovalOption { optionId: string; label: string; description: string }
export interface Approval {
  approvalId: string;                       // APR-001
  kind: 'reassign_unit' | 'crew_check' | 'plan_publish' | 'other';
  status: 'pending' | 'approved' | 'rejected' | 'superseded';
  summary: string;                          // what the system wants to do
  reason: string;                           // why
  options: ApprovalOption[];
  recommendedOptionId: string;
  relatedIncidentIds: string[];
  requestedAt: ScenarioTime;
  chosenOptionId: string | null;
  decidedBy: string | null;
  decidedAt: ScenarioTime | null;
}

export interface Assignment {
  assignmentId: string;                     // ASN-001
  planId: string;
  incidentId: string;
  unitId: string;
  status: 'sent' | 'accepted' | 'declined' | 'timed_out' | 'cancelled' | 'completed';
  incidentSummary: string;
  location: Place;
  peopleAffected: number;
  etaMinutes: number;
  instructions: string;                     // what to expect, one or two lines
  sentAt: ScenarioTime;
  respondedAt: ScenarioTime | null;
}

// ───────────────────────── Logs and reports ─────────────────────────
export interface CommsLogEntry {
  entryId: string;
  ts: ScenarioTime;
  direction: 'in' | 'out';
  channel: Channel;
  recipient: { kind: 'reporter' | 'crew' | 'operator'; id: string };
  text: string;
  delivery: 'sent' | 'delivered' | 'failed';
  zoneId: string | null;
}
export interface DecisionLogEntry {
  decisionId: string;
  ts: ScenarioTime;
  agent: AgentName | 'operator';
  decision: string;
  reason: string;
  incidentId: string | null;
  planId: string | null;
  approvalId: string | null;
}
export interface AfterActionReport {
  generatedAt: ScenarioTime;
  timeline: { ts: ScenarioTime; text: string; incidentId: string | null }[];
  planChanges: { planId: string; trigger: string; changes: PlanChange[] }[];
  approvals: Approval[];
  responseTimes: { incidentId: string; reportedToArrivedMinutes: number | null }[];
  baseline: { metric: string; unit: string; samanvaya: number; baseline: number }[];
  unresolved: Incident[];
}

// ───────────────────────── Events (WebSocket) ─────────────────────────
export interface EventPayloads {
  'incident.reported': { incident: Incident };
  'incident.assessed': { incident: Incident };
  'incident.updated': { incident: Incident; changedFields: string[] };
  'incident.closed': { incidentId: string; closedAt: ScenarioTime; outcome: 'resolved' | 'unserved' | 'duplicate' | 'false_alarm' };
  'plan.published': { plan: Plan };
  'approval.requested': { approval: Approval };
  'approval.resolved': { approvalId: string; decision: 'approve' | 'reject' | 'choose_other'; chosenOptionId: string | null; decidedBy: string; decidedAt: ScenarioTime; note: string | null };
  'assignment.sent': { assignment: Assignment };
  'assignment.accepted': { assignmentId: string; unitId: string; incidentId: string };
  'assignment.declined': { assignmentId: string; unitId: string; incidentId: string; reason: string | null };
  'assignment.timeout': { assignmentId: string; unitId: string; incidentId: string };
  'unit.status_changed': { unitId: string; status: UnitStatus; previousStatus: UnitStatus; location: LatLng | null };
  'unit.unavailable': { unitId: string; reason: 'operator' | 'crew_declined' | 'offline' | 'vehicle_stuck' };
  'unit.heartbeat_lost': { unitId: string; lastHeartbeatAt: ScenarioTime };
  'zone.comms_degraded': { zoneId: string; fallbackChannel: Channel | null };
  'zone.comms_restored': { zoneId: string };
  'comms.delivery_failed': { messageId: string; recipient: { kind: 'reporter' | 'crew'; id: string }; channel: Channel; zoneId: string | null };
  'comms.channel_switched': { recipient: { kind: 'reporter' | 'crew'; id: string }; from: Channel; to: Channel; reason: string };
  'reporter.message_sent': { sessionId: string; messageId: string; from: 'reporter' | 'system'; text: string; translatedText: string | null; language: Language; channel: Channel };
  'agent.activity': { agent: AgentName; message: string; incidentId: string | null; planId: string | null };
  // ── ADDITIONS to the handoff's catalogue (agree in hour 0) ──
  'road.status_changed': { roadId: string; status: RoadStatus; previousStatus: RoadStatus; reason: string };
  'status.updated': { status: SystemStatus };
  'reporter.status_updated': { sessionId: string; incidentId: string; stage: 'received' | 'assigned' | 'on_the_way' | 'arrived' | 'resolved'; etaRange: [number, number] | null; safetyTips: string[] };
  'assignment.cancelled': { assignmentId: string; unitId: string; incidentId: string; reason: string };
}
export type EventType = keyof EventPayloads;
export type ContractEvent = {
  [K in EventType]: { id: string; type: K; ts: ScenarioTime; payload: EventPayloads[K] };
}[EventType];

// ───────────────────────── REST request / response bodies ─────────────────────────
export interface ApiError { error: { code: string; message: string } }

export interface LoginRequest { username: string; password: string }
export interface CrewLoginRequest { unitCode: string; pin: string }
export interface AuthResponse { token: string; role: Role; displayName: string; unitId: string | null }

export interface ApprovalDecisionRequest { decision: 'approve' | 'reject' | 'choose_other'; optionId?: string; note?: string }

export interface PhoneInRequest {
  location: { lat: number; lng: number; label: string };
  type: IncidentType;
  peopleAffected: number;
  language: Language;
  note?: string;
}
export interface UnitStatusRequest { status: UnitStatus; note?: string }

export interface InjectIncidentRequest { type: IncidentType; zoneId: string; peopleAffected: number; language?: Language; lat?: number; lng?: number }
export interface UnitOfflineRequest { unitId: string }
export interface RainSurgeRequest { intensity: RainIntensity }
export interface OutageRequest { zoneId: string; active: boolean }
export interface TimeWarpRequest { speed: number }             // 1, 2, 5, 10

export interface ReporterSessionRequest { language?: Language }
export interface ReporterSession { sessionId: string; token: string; language: Language }
export interface ReporterMessageRequest { sessionId: string; text: string; language?: Language }
export interface ReporterMessageResponse { messageId: string }   // replies arrive on /ws/reporter/{session}

export interface CrewRespondRequest { accept: boolean; reason?: string; clientRequestId: string }
export interface CrewStatusRequest { action: 'en_route' | 'arrived' | 'task_complete'; clientRequestId: string }
export interface CrewProblemRequest { kind: 'road_blocked' | 'vehicle_stuck' | 'other'; note?: string; clientRequestId: string }
