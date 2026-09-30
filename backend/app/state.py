"""
state.py — Central in-memory state store for Samanvaya.

Single source of truth initialized from seed/ with reset().
Holds:
  - units (seed/units.json)
  - incidents (empty at start; populated via phone-in, reporter, scenario)
  - facilities (seed/facilities.json)
  - roads & nodes (seed/roads.json)
  - zones (seed/zones.json)
  - plans & approvals & assignments
  - comms_log & decision_log
  - system_status

Every state mutation goes through dedicated methods that also publish the
corresponding contract event to the event bus.
"""
from __future__ import annotations

import copy
import threading
from typing import Any

from . import seed as _seed
from .bus import bus
from .clock import clock


class AppState:
    """Thread-safe in-memory store initialized from seed data."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._reset()

    # ── Lifecycle / Initialization ────────────────────────────────────

    def _reset(self) -> None:
        raw_users = _seed.users()

        # Seed collections
        self.units: dict[str, dict] = {u["unitId"]: copy.deepcopy(u) for u in _seed.units()}
        self.facilities: dict[str, dict] = {f["facilityId"]: copy.deepcopy(f) for f in _seed.facilities()}
        roads_raw = _seed.roads()
        self.road_nodes: list[dict] = copy.deepcopy(roads_raw["nodes"])
        self.roads: dict[str, dict] = {r["roadId"]: copy.deepcopy(r) for r in roads_raw["roads"]}
        self.zones: dict[str, dict] = {z["zoneId"]: copy.deepcopy(z) for z in _seed.zones()}

        # Runtime domain collections
        self.incidents: dict[str, dict] = {}
        self.plans: list[dict] = []
        self.approvals: dict[str, dict] = {}
        self.assignments: dict[str, dict] = {}
        self.reporter_sessions: dict[str, dict] = {}
        self.comms_log: list[dict] = []
        self.decision_log: list[dict] = []

        # System status (SystemStatus shape in types.ts)
        self.system_status: dict = {
            "scenarioTime": clock.now(),
            "speed": clock.speed,
            "overallSeverity": "low",
            "rain": {
                "intensity": "light",
                "mmPerHour": 4.0,
                "freshness": "live",
                "observedAt": "2026-10-10T09:00:00",
            },
            "commsOverall": "ok",
        }

        # ID generation counters
        self._counters: dict[str, int] = {
            "INC": 0,
            "PLAN": 0,
            "APR": 0,
            "ASN": 0,
            "SES": 0,
            "MSG": 0,
            "evt": 0,
            "DEC": 0,
            "LOG": 0,
        }

        # Auth parsed from seed/users.json
        self._operators: list[dict] = raw_users.get("operators", [])
        self._crew_pin: str = raw_users.get("crewPin", "1111")
        self._crew_codes: list[str] = raw_users.get("crewCodes", [])

    def reset(self) -> None:
        """Restore seed state and clear runtime state."""
        with self._lock:
            self._reset()

    # ── ID Generation ─────────────────────────────────────────────────

    def next_id(self, prefix: str) -> str:
        """Generate the next contract-compliant ID (e.g. INC-01, PLAN-001, evt_001)."""
        with self._lock:
            self._counters[prefix] = self._counters.get(prefix, 0) + 1
            n = self._counters[prefix]

        if prefix == "PLAN":
            return f"PLAN-{n:03d}"
        if prefix == "APR":
            return f"APR-{n:03d}"
        if prefix == "ASN":
            return f"ASN-{n:03d}"
        if prefix == "SES":
            return f"SES-{n:02d}"
        if prefix == "MSG":
            return f"MSG-{n:03d}"
        if prefix == "evt":
            return f"evt_{n:03d}"
        if prefix == "DEC":
            return f"DEC-{n:03d}"
        if prefix == "LOG":
            return f"LOG-{n:03d}"
        return f"{prefix}-{n:02d}"

    # ── Auth Helpers ──────────────────────────────────────────────────

    def verify_operator(self, username: str, password: str) -> dict | None:
        return next(
            (u for u in self._operators if u["username"] == username and u["password"] == password),
            None,
        )

    def verify_crew(self, unit_code: str, pin: str) -> bool:
        return unit_code in self._crew_codes and pin == self._crew_pin

    # ── Getters (Read operations return deep copies) ───────────────────

    def get_incidents(self) -> list[dict]:
        with self._lock:
            return copy.deepcopy(list(self.incidents.values()))

    def get_incident(self, incident_id: str) -> dict | None:
        with self._lock:
            v = self.incidents.get(incident_id)
            return copy.deepcopy(v) if v else None

    def get_units(self) -> list[dict]:
        with self._lock:
            return copy.deepcopy(list(self.units.values()))

    def get_unit(self, unit_id: str) -> dict | None:
        with self._lock:
            v = self.units.get(unit_id)
            return copy.deepcopy(v) if v else None

    def get_facilities(self) -> list[dict]:
        with self._lock:
            return copy.deepcopy(list(self.facilities.values()))

    def get_roads(self) -> dict:
        with self._lock:
            return {
                "nodes": copy.deepcopy(self.road_nodes),
                "roads": copy.deepcopy(list(self.roads.values())),
            }

    def get_road(self, road_id: str) -> dict | None:
        with self._lock:
            v = self.roads.get(road_id)
            return copy.deepcopy(v) if v else None

    def get_zones(self) -> list[dict]:
        with self._lock:
            return copy.deepcopy(list(self.zones.values()))

    def get_zone(self, zone_id: str) -> dict | None:
        with self._lock:
            v = self.zones.get(zone_id)
            return copy.deepcopy(v) if v else None

    def get_system_status(self) -> dict:
        with self._lock:
            status = copy.deepcopy(self.system_status)
        status["scenarioTime"] = clock.now()
        status["speed"] = clock.speed
        return status

    def get_current_plan(self) -> dict | None:
        with self._lock:
            return copy.deepcopy(self.plans[-1]) if self.plans else None

    def get_plan_history(self) -> list[dict]:
        with self._lock:
            return copy.deepcopy(self.plans)

    def get_plan_by_id(self, plan_id: str) -> dict | None:
        with self._lock:
            return copy.deepcopy(next((p for p in self.plans if p["planId"] == plan_id), None))

    def get_approvals(self, status: str | None = None) -> list[dict]:
        with self._lock:
            vals = list(self.approvals.values())
            if status:
                vals = [a for a in vals if a["status"] == status]
            return copy.deepcopy(vals)

    def get_approval(self, approval_id: str) -> dict | None:
        with self._lock:
            v = self.approvals.get(approval_id)
            return copy.deepcopy(v) if v else None

    def get_assignments(self, status: str | None = None) -> list[dict]:
        with self._lock:
            vals = list(self.assignments.values())
            if status:
                vals = [a for a in vals if a["status"] == status]
            return copy.deepcopy(vals)

    def get_assignment(self, assignment_id: str) -> dict | None:
        with self._lock:
            v = self.assignments.get(assignment_id)
            return copy.deepcopy(v) if v else None

    def get_assignments_for_unit(self, unit_id: str) -> list[dict]:
        with self._lock:
            return copy.deepcopy([a for a in self.assignments.values() if a["unitId"] == unit_id])

    def get_reporter_session(self, session_id: str) -> dict | None:
        with self._lock:
            v = self.reporter_sessions.get(session_id)
            return copy.deepcopy(v) if v else None

    def get_comms_log(self) -> list[dict]:
        with self._lock:
            return copy.deepcopy(self.comms_log)

    def get_decision_log(self) -> list[dict]:
        with self._lock:
            return copy.deepcopy(self.decision_log)

    # ── Mutators (Publish events on the bus) ───────────────────────────

    def set_unit_status(
        self,
        unit_id: str,
        new_status: str,
        location: dict | None = None,
        publish: bool = True,
    ) -> dict | None:
        """
        Updates a unit's status and publishes unit.status_changed on the bus.
        """
        with self._lock:
            unit = self.units.get(unit_id)
            if unit is None:
                return None
            previous_status = unit.get("status")
            unit["status"] = new_status
            unit["lastHeartbeatAt"] = clock.now()
            if location:
                unit["location"] = copy.deepcopy(location)
            unit_copy = copy.deepcopy(unit)

        if publish:
            loc = location or unit_copy.get("location")
            lat_lng = {"lat": loc["lat"], "lng": loc["lng"]} if loc and "lat" in loc else None
            bus.publish("unit.status_changed", {
                "unitId": unit_id,
                "status": new_status,
                "previousStatus": previous_status,
                "location": lat_lng,
            })
        return unit_copy

    def add_incident(self, incident: dict, publish: bool = True) -> dict:
        """
        Adds an incident to the store and emits incident.reported.
        """
        with self._lock:
            self.incidents[incident["incidentId"]] = copy.deepcopy(incident)
            incident_copy = copy.deepcopy(incident)

        if publish:
            bus.publish("incident.reported", {"incident": incident_copy})
        return incident_copy

    def create_phone_in_incident(
        self,
        location: dict,
        incident_type: str,
        people_affected: int,
        language: str = "en",
        note: str | None = None,
        publish: bool = True,
    ) -> dict:
        """
        Operator enters a phone-in call as an incident.
        Publishes incident.reported. Intake is skipped because the structure is already provided.
        """
        incident_id = self.next_id("INC")
        ts = clock.now()
        loc = {
            "lat": location["lat"],
            "lng": location["lng"],
            "label": location.get("label", ""),
            "zoneId": location.get("zoneId", "ZONE-A"),
        }
        incident = {
            "incidentId": incident_id,
            "type": incident_type,
            "status": "reported",
            "severity": None,
            "severityScore": None,
            "timeWindowMinutes": None,
            "location": loc,
            "peopleAffected": people_affected,
            "language": language,
            "source": "phone_in",
            "summary": note or f"Phone-in: {incident_type} at {loc['label']}",
            "confidence": 1.0,
            "reportedAt": ts,
            "assignedUnitIds": [],
            "reporterSessionId": None,
        }

        with self._lock:
            self.incidents[incident_id] = copy.deepcopy(incident)

        if publish:
            bus.publish("incident.reported", {"incident": copy.deepcopy(incident)})
            bus.publish("agent.activity", {
                "agent": "intake",
                "message": f"Phone-in entered by operator: {incident_type} at {loc['label']}.",
                "incidentId": incident_id,
                "planId": None,
            })
        return incident

    def update_incident(
        self,
        incident_id: str,
        patch: dict,
        changed_fields: list[str] | None = None,
        publish: bool = True,
    ) -> dict | None:
        """
        Updates an incident and emits incident.updated.
        """
        with self._lock:
            incident = self.incidents.get(incident_id)
            if incident is None:
                return None
            incident.update(patch)
            incident_copy = copy.deepcopy(incident)

        if publish:
            fields = changed_fields if changed_fields is not None else list(patch.keys())
            bus.publish("incident.updated", {
                "incident": incident_copy,
                "changedFields": fields,
            })
        return incident_copy

    def assess_incident(
        self,
        incident_id: str,
        severity: str,
        severity_score: int,
        time_window_minutes: int,
        publish: bool = True,
    ) -> dict | None:
        """
        Marks an incident as assessed with severity, severityScore, and timeWindowMinutes,
        and emits incident.assessed.
        """
        with self._lock:
            incident = self.incidents.get(incident_id)
            if incident is None:
                return None
            incident["status"] = "assessed"
            incident["severity"] = severity
            incident["severityScore"] = severity_score
            incident["timeWindowMinutes"] = time_window_minutes
            incident_copy = copy.deepcopy(incident)

        if publish:
            bus.publish("incident.assessed", {"incident": incident_copy})
        return incident_copy

    def close_incident(
        self,
        incident_id: str,
        outcome: str = "resolved",
        publish: bool = True,
    ) -> dict | None:
        """
        Closes an incident and emits incident.closed.
        """
        ts = clock.now()
        with self._lock:
            incident = self.incidents.get(incident_id)
            if incident is None:
                return None
            incident["status"] = "closed"
            incident_copy = copy.deepcopy(incident)

        if publish:
            bus.publish("incident.closed", {
                "incidentId": incident_id,
                "closedAt": ts,
                "outcome": outcome,
            })
        return incident_copy

    def set_road_status(
        self,
        road_id: str,
        new_status: str,
        reason: str = "",
        publish: bool = True,
    ) -> dict | None:
        """
        Updates a road's status and publishes road.status_changed.
        """
        with self._lock:
            road = self.roads.get(road_id)
            if road is None:
                return None
            previous_status = road["status"]
            road["status"] = new_status
            road_copy = copy.deepcopy(road)

        if publish:
            bus.publish("road.status_changed", {
                "roadId": road_id,
                "status": new_status,
                "previousStatus": previous_status,
                "reason": reason,
            })
        return road_copy

    def set_zone_comms(
        self,
        zone_id: str,
        active_outage: bool,
        fallback_channel: str = "sms",
        publish: bool = True,
    ) -> dict | None:
        """
        Updates zone communications status and publishes zone.comms_degraded or zone.comms_restored.
        """
        with self._lock:
            zone = self.zones.get(zone_id)
            if zone is None:
                return None
            zone["commsStatus"] = "degraded" if active_outage else "ok"
            zone_copy = copy.deepcopy(zone)

        if publish:
            if active_outage:
                bus.publish("zone.comms_degraded", {
                    "zoneId": zone_id,
                    "fallbackChannel": fallback_channel,
                })
            else:
                bus.publish("zone.comms_restored", {
                    "zoneId": zone_id,
                })
        return zone_copy

    def publish_plan(self, plan: dict, publish: bool = True) -> dict:
        """
        Stores a plan and emits plan.published.
        """
        with self._lock:
            # Replace if already exists, else append
            for i, p in enumerate(self.plans):
                if p["planId"] == plan["planId"]:
                    self.plans[i] = copy.deepcopy(plan)
                    break
            else:
                self.plans.append(copy.deepcopy(plan))
            plan_copy = copy.deepcopy(plan)

        if publish:
            bus.publish("plan.published", {"plan": plan_copy})
        return plan_copy

    def request_approval(self, approval: dict, publish: bool = True) -> dict:
        """
        Stores an approval and emits approval.requested.
        """
        with self._lock:
            self.approvals[approval["approvalId"]] = copy.deepcopy(approval)
            appr_copy = copy.deepcopy(approval)

        if publish:
            bus.publish("approval.requested", {"approval": appr_copy})
        return appr_copy

    def resolve_approval(
        self,
        approval_id: str,
        decision: str,
        chosen_option_id: str | None = None,
        decided_by: str = "operator",
        note: str | None = None,
        publish: bool = True,
    ) -> dict | None:
        """
        Resolves an approval and emits approval.resolved.
        """
        ts = clock.now()
        with self._lock:
            approval = self.approvals.get(approval_id)
            if approval is None:
                return None
            approval["status"] = "approved" if decision == "approve" else "rejected"
            approval["chosenOptionId"] = chosen_option_id
            approval["decidedBy"] = decided_by
            approval["decidedAt"] = ts
            appr_copy = copy.deepcopy(approval)

        if publish:
            bus.publish("approval.resolved", {
                "approvalId": approval_id,
                "decision": decision,
                "chosenOptionId": chosen_option_id,
                "decidedBy": decided_by,
                "decidedAt": ts,
                "note": note,
            })
        return appr_copy

    def create_assignment(self, assignment: dict, publish: bool = True) -> dict:
        """
        Stores an assignment and emits assignment.sent.
        """
        with self._lock:
            self.assignments[assignment["assignmentId"]] = copy.deepcopy(assignment)
            asn_copy = copy.deepcopy(assignment)

        if publish:
            bus.publish("assignment.sent", {"assignment": asn_copy})
        return asn_copy

    def cancel_assignment(
        self,
        assignment_id: str,
        reason: str = "plan_change",
        publish: bool = True,
    ) -> dict | None:
        """
        Cancels an assignment and emits assignment.cancelled.
        """
        with self._lock:
            asn = self.assignments.get(assignment_id)
            if asn is None:
                return None
            asn["status"] = "cancelled"
            asn_copy = copy.deepcopy(asn)

        if publish:
            bus.publish("assignment.cancelled", {
                "assignmentId": assignment_id,
                "unitId": asn_copy["unitId"],
                "incidentId": asn_copy["incidentId"],
                "reason": reason,
            })
        return asn_copy

    def update_system_status(self, patch: dict, publish: bool = True) -> dict:
        """
        Updates system status and emits status.updated.
        """
        with self._lock:
            self.system_status.update(patch)
            status_copy = copy.deepcopy(self.system_status)

        status_copy["scenarioTime"] = clock.now()
        status_copy["speed"] = clock.speed

        if publish:
            bus.publish("status.updated", {"status": status_copy})
        return status_copy

    def append_comms_log(self, entry: dict) -> None:
        with self._lock:
            self.comms_log.append(copy.deepcopy(entry))

    def append_decision_log(self, entry: dict) -> None:
        with self._lock:
            self.decision_log.append(copy.deepcopy(entry))

    def upsert_reporter_session(self, session: dict) -> dict:
        with self._lock:
            self.reporter_sessions[session["sessionId"]] = copy.deepcopy(session)
        return copy.deepcopy(session)

    # ── Backward Compatibility Aliases ────────────────────────────────

    def upsert_unit(self, unit: dict) -> dict:
        with self._lock:
            self.units[unit["unitId"]] = copy.deepcopy(unit)
        return copy.deepcopy(unit)

    def upsert_incident(self, incident: dict) -> dict:
        return self.add_incident(incident, publish=False)

    def upsert_plan(self, plan: dict) -> dict:
        return self.publish_plan(plan, publish=False)

    def upsert_approval(self, approval: dict) -> dict:
        return self.request_approval(approval, publish=False)

    def upsert_assignment(self, assignment: dict) -> dict:
        return self.create_assignment(assignment, publish=False)

    def update_road_status(self, road_id: str, status: str) -> dict | None:
        return self.set_road_status(road_id, status)

    def update_zone_comms(self, zone_id: str, comms_status: str) -> dict | None:
        active = (comms_status == "degraded")
        return self.set_zone_comms(zone_id, active)


# Singleton state store instance
state = AppState()
