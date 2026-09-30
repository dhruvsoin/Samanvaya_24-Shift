"""
main.py — FastAPI entry point.
Stub: every GET endpoint returns seed data. POST endpoints return plausible stubs.
Person 3 can hit /openapi.json immediately to generate TypeScript types.
"""
from fastapi import FastAPI, Depends, HTTPException, Header, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
import uuid

from .seed import UNITS, FACILITIES, ROADS, ZONES, USERS, EVENTS
from .models import (
    AuthResponse, LoginRequest, CrewLoginRequest,
    SystemStatus, RainStatus,
    Plan, PlanChange, UnitEta, PlanEntry, Unserved,
    Approval, ApprovalDecisionRequest,
    ReporterSession, ReporterSessionRequest, ReporterMessageRequest, ReporterMessageResponse,
    Assignment, CrewRespondRequest, CrewStatusRequest, CrewProblemRequest,
    AfterActionReport, CommsLogEntry, DecisionLogEntry,
    PhoneInRequest, UnitStatusRequest,
    InjectIncidentRequest, UnitOfflineRequest, RainSurgeRequest, OutageRequest, TimeWarpRequest,
    Incident, Unit, Facility, Zone, RoadNetwork,
)

app = FastAPI(
    title="Samanvaya API",
    version="0.1.0-stub",
    description=(
        "Stub backend for Samanvaya flood-response coordination. "
        "All GET endpoints return seed data. "
        "Fetch /openapi.json to generate TypeScript types."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Stub auth helper ──────────────────────────────────────────────────
STUB_TOKEN = "stub-token-replace-in-production"


def _require_token(authorization: Optional[str] = Header(default=None)):
    """Accept any non-empty bearer token in stub mode."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    return authorization.split(" ", 1)[1]


# ── Seed helpers ──────────────────────────────────────────────────────
def _first_status_updated():
    for evt in EVENTS:
        if evt["type"] == "status.updated":
            return evt["payload"]["status"]
    return None


def _seed_incidents() -> list[dict]:
    """Extract latest state of each incident from the seed event stream."""
    seen: dict[str, dict] = {}
    for evt in EVENTS:
        if evt["type"] in ("incident.reported", "incident.assessed", "incident.updated"):
            inc = evt["payload"]["incident"]
            seen[inc["incidentId"]] = inc
    return list(seen.values())


def _seed_plan(plan_id: str = "PLAN-001") -> dict | None:
    for evt in EVENTS:
        if evt["type"] == "plan.published" and evt["payload"]["plan"]["planId"] == plan_id:
            return evt["payload"]["plan"]
    return None


def _seed_approvals(status_filter: Optional[str] = None) -> list[dict]:
    seen: dict[str, dict] = {}
    for evt in EVENTS:
        if evt["type"] == "approval.requested":
            a = evt["payload"]["approval"]
            seen[a["approvalId"]] = a
        if evt["type"] == "approval.resolved":
            aid = evt["payload"]["approvalId"]
            if aid in seen:
                seen[aid]["status"] = "approved" if evt["payload"]["decision"] == "approve" else "rejected"
                seen[aid]["chosenOptionId"] = evt["payload"]["chosenOptionId"]
                seen[aid]["decidedBy"] = evt["payload"]["decidedBy"]
                seen[aid]["decidedAt"] = evt["payload"]["decidedAt"]
    result = list(seen.values())
    if status_filter:
        result = [a for a in result if a["status"] == status_filter]
    return result


# ══════════════════════════════════════════════════════════════════════
# Auth
# ══════════════════════════════════════════════════════════════════════
@app.post("/auth/login", response_model=AuthResponse, tags=["Auth"])
def login(body: LoginRequest):
    """Operator login. Demo: operator / demo1234"""
    user = next((u for u in USERS if u.get("username") == body.username), None)
    if not user or body.password not in (user.get("password", ""), user.get("pin", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return AuthResponse(
        token=STUB_TOKEN,
        role=user.get("role", "operator"),
        display_name=user.get("displayName", body.username),
        unit_id=user.get("unitId"),
    )


@app.post("/auth/crew-login", response_model=AuthResponse, tags=["Auth"])
def crew_login(body: CrewLoginRequest):
    """Crew login. Demo: unit code (e.g. AMB-01) + PIN 1111"""
    user = next((u for u in USERS if u.get("username") == body.unit_code), None)
    if not user or body.pin != user.get("pin", ""):
        raise HTTPException(status_code=401, detail="Invalid crew credentials")
    return AuthResponse(
        token=STUB_TOKEN,
        role="crew",
        display_name=user.get("displayName", body.unit_code),
        unit_id=body.unit_code,
    )


@app.post("/auth/demo", response_model=AuthResponse, tags=["Auth"])
def demo_login():
    """Reviewer demo login (no credentials needed)."""
    return AuthResponse(
        token=STUB_TOKEN,
        role="reviewer",
        display_name="Demo Reviewer",
        unit_id=None,
    )


# ══════════════════════════════════════════════════════════════════════
# State
# ══════════════════════════════════════════════════════════════════════
@app.get("/incidents", tags=["State"])
def get_incidents(_token=Depends(_require_token)):
    """Returns all incidents extracted from seed event stream."""
    return _seed_incidents()


@app.get("/units", tags=["State"])
def get_units(_token=Depends(_require_token)):
    return UNITS


@app.get("/facilities", tags=["State"])
def get_facilities(_token=Depends(_require_token)):
    return FACILITIES


@app.get("/roads", tags=["State"])
def get_roads(_token=Depends(_require_token)):
    return ROADS


@app.get("/zones", tags=["State"])
def get_zones(_token=Depends(_require_token)):
    return ZONES


@app.get("/status", tags=["State"])
def get_status(_token=Depends(_require_token)):
    return _first_status_updated()


# ══════════════════════════════════════════════════════════════════════
# Plan
# ══════════════════════════════════════════════════════════════════════
@app.get("/plan/current", tags=["Plan"])
def get_plan_current(_token=Depends(_require_token)):
    """Returns PLAN-002 (latest from seed)."""
    return _seed_plan("PLAN-002")


@app.get("/plan/history", tags=["Plan"])
def get_plan_history(_token=Depends(_require_token)):
    plans = []
    for plan_id in ["PLAN-001", "PLAN-002"]:
        p = _seed_plan(plan_id)
        if p:
            plans.append(p)
    return plans


@app.get("/plan/diff", tags=["Plan"])
def get_plan_diff(
    from_plan: str = "PLAN-001",
    to_plan: str = "PLAN-002",
    _token=Depends(_require_token),
):
    p = _seed_plan(to_plan)
    if not p:
        raise HTTPException(status_code=404, detail="Plan not found")
    return p.get("changes", [])


# ══════════════════════════════════════════════════════════════════════
# Approvals
# ══════════════════════════════════════════════════════════════════════
@app.get("/approvals", tags=["Approvals"])
def get_approvals(
    status: Optional[str] = None,
    _token=Depends(_require_token),
):
    return _seed_approvals(status)


@app.post("/approvals/{approval_id}/decision", tags=["Approvals"])
def post_approval_decision(
    approval_id: str,
    body: ApprovalDecisionRequest,
    _token=Depends(_require_token),
):
    approvals = _seed_approvals()
    a = next((x for x in approvals if x["approvalId"] == approval_id), None)
    if not a:
        raise HTTPException(status_code=404, detail="Approval not found")
    a["status"] = "approved" if body.decision == "approve" else "rejected"
    a["chosenOptionId"] = body.option_id
    a["decidedBy"] = "operator"
    a["decidedAt"] = "2026-10-10T09:07:00"
    return a


# ══════════════════════════════════════════════════════════════════════
# Phone-in / Unit status
# ══════════════════════════════════════════════════════════════════════
@app.post("/incidents/phone-in", tags=["Phone-in"])
def post_phone_in(body: PhoneInRequest, _token=Depends(_require_token)):
    return {
        "incidentId": "INC-STUB",
        "type": body.type,
        "status": "reported",
        "severity": None,
        "severityScore": None,
        "timeWindowMinutes": None,
        "location": {**body.location, "zoneId": "ZONE-A"},
        "peopleAffected": body.people_affected,
        "language": body.language,
        "source": "phone_in",
        "summary": body.note or "Phone-in incident",
        "confidence": 0.9,
        "reportedAt": "2026-10-10T09:00:00",
        "assignedUnitIds": [],
        "reporterSessionId": None,
    }


@app.post("/units/{unit_id}/status", tags=["Phone-in"])
def update_unit_status(unit_id: str, body: UnitStatusRequest, _token=Depends(_require_token)):
    unit = next((u for u in UNITS if u["unitId"] == unit_id), None)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    return {**unit, "status": body.status}


# ══════════════════════════════════════════════════════════════════════
# Scenario control
# ══════════════════════════════════════════════════════════════════════
@app.post("/scenario/inject-incident", tags=["Scenario"])
def inject_incident(body: InjectIncidentRequest, _token=Depends(_require_token)):
    return {
        "incidentId": f"INC-{uuid.uuid4().hex[:4].upper()}",
        "type": body.type,
        "status": "reported",
        "severity": None,
        "severityScore": None,
        "timeWindowMinutes": None,
        "location": {
            "lat": body.lat or 12.929,
            "lng": body.lng or 77.612,
            "label": "Injected location",
            "zoneId": body.zone_id,
        },
        "peopleAffected": body.people_affected,
        "language": body.language or "en",
        "source": "scenario",
        "summary": "Injected incident",
        "confidence": 1.0,
        "reportedAt": "2026-10-10T09:00:00",
        "assignedUnitIds": [],
        "reporterSessionId": None,
    }


@app.post("/scenario/unit-offline", tags=["Scenario"])
def unit_offline(body: UnitOfflineRequest, _token=Depends(_require_token)):
    unit = next((u for u in UNITS if u["unitId"] == body.unit_id), None)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    return {**unit, "status": "offline"}


@app.post("/scenario/rain-surge", tags=["Scenario"])
def rain_surge(body: RainSurgeRequest, _token=Depends(_require_token)):
    base = _first_status_updated()
    return {**base, "rain": {**base["rain"], "intensity": body.intensity}}


@app.post("/scenario/outage", tags=["Scenario"])
def outage(body: OutageRequest, _token=Depends(_require_token)):
    zone = next((z for z in ZONES if z["zoneId"] == body.zone_id), None)
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    return {**zone, "commsStatus": "degraded" if body.active else "ok"}


@app.post("/scenario/time-warp", tags=["Scenario"])
def time_warp(body: TimeWarpRequest, _token=Depends(_require_token)):
    base = _first_status_updated()
    return {**base, "speed": body.speed}


@app.post("/scenario/reset", tags=["Scenario"])
def reset(_token=Depends(_require_token)):
    return _first_status_updated()


# ══════════════════════════════════════════════════════════════════════
# Reporter
# ══════════════════════════════════════════════════════════════════════
@app.post("/reporter/session", tags=["Reporter"])
def create_reporter_session(body: ReporterSessionRequest):
    return {
        "sessionId": "SES-STUB",
        "token": STUB_TOKEN,
        "language": body.language or "en",
    }


@app.post("/reporter/message", tags=["Reporter"])
def reporter_message(body: ReporterMessageRequest):
    return {"messageId": f"MSG-{uuid.uuid4().hex[:6].upper()}"}


@app.post("/reporter/voice", tags=["Reporter"])
def reporter_voice():
    """Multipart: sessionId + audio file. Stub returns a dummy messageId."""
    return {"messageId": f"MSG-{uuid.uuid4().hex[:6].upper()}"}


# ══════════════════════════════════════════════════════════════════════
# Crew
# ══════════════════════════════════════════════════════════════════════
@app.get("/crew/assignment", tags=["Crew"])
def get_crew_assignment(_token=Depends(_require_token)):
    """Returns ASN-001 from seed."""
    for evt in EVENTS:
        if evt["type"] == "assignment.sent":
            return evt["payload"]["assignment"]
    return None


@app.post("/crew/assignment/{assignment_id}/respond", tags=["Crew"])
def crew_respond(
    assignment_id: str,
    body: CrewRespondRequest,
    _token=Depends(_require_token),
):
    for evt in EVENTS:
        if evt["type"] == "assignment.sent":
            a = evt["payload"]["assignment"]
            if a["assignmentId"] == assignment_id:
                return {**a, "status": "accepted" if body.accept else "declined",
                        "respondedAt": "2026-10-10T09:03:40"}
    raise HTTPException(status_code=404, detail="Assignment not found")


@app.post("/crew/status", tags=["Crew"])
def crew_status(body: CrewStatusRequest, _token=Depends(_require_token)):
    unit = UNITS[0] if UNITS else {}
    return unit


@app.post("/crew/problem", tags=["Crew"])
def crew_problem(body: CrewProblemRequest, _token=Depends(_require_token)):
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════
# Reports
# ══════════════════════════════════════════════════════════════════════
@app.get("/reports/after-action", tags=["Reports"])
def after_action_report(_token=Depends(_require_token)):
    return {
        "generatedAt": "2026-10-10T09:26:00",
        "timeline": [
            {"ts": evt["ts"], "text": evt["payload"].get("message", evt["type"]),
             "incidentId": evt["payload"].get("incidentId")}
            for evt in EVENTS if evt["type"] == "agent.activity"
        ],
        "planChanges": [],
        "approvals": _seed_approvals(),
        "responseTimes": [],
        "baseline": [],
        "unresolved": [],
    }


@app.get("/comms/log", tags=["Reports"])
def comms_log(_token=Depends(_require_token)):
    return []   # P4-Comms will populate


@app.get("/decisions", tags=["Reports"])
def decisions(_token=Depends(_require_token)):
    return []   # P1-Brain will populate
