"""
state.py — In-memory application state.

Single source of truth for runtime state (seeded from contracts/seed/).
All mutators emit the relevant event via the bus (imported lazily to
avoid circular imports).

Rules from contracts/README.md:
  - camelCase JSON via Pydantic alias_generator (done in models.py).
  - IDs: INC-01, AMB-01 / BOAT-01 / RES-01 / PUMP-01, FAC-01, ZONE-A,
    ROAD-04, N1, PLAN-001, APR-001, ASN-001, SES-01, MSG-001, evt_001.
  - Scenario time only — never datetime.now().

No SQLite for the stub. Persistence is a P1-Brain stretch goal.
"""
from __future__ import annotations

import copy
import threading
from typing import Any

from . import seed as _seed


class AppState:
    """Thread-safe in-memory store.  Accessed via the `state` singleton."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._reset()

    # ── lifecycle ─────────────────────────────────────────────────────

    def _reset(self) -> None:
        raw_users = _seed.users()

        # incidents: built up at runtime (empty at scenario start)
        self.incidents: dict[str, dict] = {}

        # seed collections (keyed by primary ID for O(1) lookup)
        self.units: dict[str, dict] = {u["unitId"]: u for u in _seed.units()}
        self.facilities: dict[str, dict] = {f["facilityId"]: f for f in _seed.facilities()}
        roads_raw = _seed.roads()
        self.road_nodes: list[dict] = roads_raw["nodes"]
        self.roads: dict[str, dict] = {r["roadId"]: r for r in roads_raw["roads"]}
        self.zones: dict[str, dict] = {z["zoneId"]: z for z in _seed.zones()}

        # plans (ordered list, latest last)
        self.plans: list[dict] = []
        # approvals keyed by approvalId
        self.approvals: dict[str, dict] = {}
        # assignments keyed by assignmentId
        self.assignments: dict[str, dict] = {}
        # reporter sessions keyed by sessionId
        self.reporter_sessions: dict[str, dict] = {}
        # comms log and decision log (append-only)
        self.comms_log: list[dict] = []
        self.decision_log: list[dict] = []

        # system status (matches SystemStatus shape in types.ts)
        self.system_status: dict = {
            "scenarioTime": "2026-10-10T09:00:00",
            "speed": 1,
            "overallSeverity": "low",
            "rain": {
                "intensity": "light",
                "mmPerHour": 4.0,
                "freshness": "live",
                "observedAt": "2026-10-10T09:00:00",
            },
            "commsOverall": "ok",
        }

        # ID counters
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

        # auth: parsed from seed
        self._operators: list[dict] = raw_users.get("operators", [])
        self._crew_pin: str = raw_users.get("crewPin", "1111")
        self._crew_codes: list[str] = raw_users.get("crewCodes", [])

    def reset(self) -> None:
        """Restore seed state (called by POST /scenario/reset)."""
        with self._lock:
            self._reset()

    # ── ID generation ─────────────────────────────────────────────────

    def next_id(self, prefix: str) -> str:
        """
        Generate the next ID for a prefix.
        INC → INC-01, PLAN → PLAN-001, evt → evt_001 etc.
        Follows the format table in contracts/README.md.
        """
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
        # INC, others → two-digit
        return f"{prefix}-{n:02d}"

    # ── auth helpers ──────────────────────────────────────────────────

    def verify_operator(self, username: str, password: str) -> dict | None:
        return next(
            (u for u in self._operators
             if u["username"] == username and u["password"] == password),
            None,
        )

    def verify_crew(self, unit_code: str, pin: str) -> bool:
        return unit_code in self._crew_codes and pin == self._crew_pin

    # ── read helpers (return deep copies so callers can't mutate) ─────

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

    def get_zones(self) -> list[dict]:
        with self._lock:
            return copy.deepcopy(list(self.zones.values()))

    def get_zone(self, zone_id: str) -> dict | None:
        with self._lock:
            v = self.zones.get(zone_id)
            return copy.deepcopy(v) if v else None

    def get_system_status(self) -> dict:
        with self._lock:
            return copy.deepcopy(self.system_status)

    def get_current_plan(self) -> dict | None:
        with self._lock:
            return copy.deepcopy(self.plans[-1]) if self.plans else None

    def get_plan_history(self) -> list[dict]:
        with self._lock:
            return copy.deepcopy(self.plans)

    def get_plan_by_id(self, plan_id: str) -> dict | None:
        with self._lock:
            return copy.deepcopy(
                next((p for p in self.plans if p["planId"] == plan_id), None)
            )

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

    def get_assignment(self, assignment_id: str) -> dict | None:
        with self._lock:
            v = self.assignments.get(assignment_id)
            return copy.deepcopy(v) if v else None

    def get_assignments_for_unit(self, unit_id: str) -> list[dict]:
        with self._lock:
            return copy.deepcopy(
                [a for a in self.assignments.values() if a["unitId"] == unit_id]
            )

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

    # ── write helpers ─────────────────────────────────────────────────

    def upsert_incident(self, incident: dict) -> dict:
        with self._lock:
            self.incidents[incident["incidentId"]] = copy.deepcopy(incident)
        return copy.deepcopy(incident)

    def upsert_unit(self, unit: dict) -> dict:
        with self._lock:
            self.units[unit["unitId"]] = copy.deepcopy(unit)
        return copy.deepcopy(unit)

    def upsert_plan(self, plan: dict) -> dict:
        with self._lock:
            # replace if exists, else append
            for i, p in enumerate(self.plans):
                if p["planId"] == plan["planId"]:
                    self.plans[i] = copy.deepcopy(plan)
                    return copy.deepcopy(plan)
            self.plans.append(copy.deepcopy(plan))
        return copy.deepcopy(plan)

    def upsert_approval(self, approval: dict) -> dict:
        with self._lock:
            self.approvals[approval["approvalId"]] = copy.deepcopy(approval)
        return copy.deepcopy(approval)

    def upsert_assignment(self, assignment: dict) -> dict:
        with self._lock:
            self.assignments[assignment["assignmentId"]] = copy.deepcopy(assignment)
        return copy.deepcopy(assignment)

    def upsert_reporter_session(self, session: dict) -> dict:
        with self._lock:
            self.reporter_sessions[session["sessionId"]] = copy.deepcopy(session)
        return copy.deepcopy(session)

    def update_road_status(self, road_id: str, status: str) -> dict | None:
        with self._lock:
            road = self.roads.get(road_id)
            if road:
                road["status"] = status
            return copy.deepcopy(road)

    def update_zone_comms(self, zone_id: str, comms_status: str) -> dict | None:
        with self._lock:
            zone = self.zones.get(zone_id)
            if zone:
                zone["commsStatus"] = comms_status
            return copy.deepcopy(zone)

    def update_system_status(self, patch: dict) -> dict:
        with self._lock:
            self.system_status.update(patch)
            return copy.deepcopy(self.system_status)

    def append_comms_log(self, entry: dict) -> None:
        with self._lock:
            self.comms_log.append(copy.deepcopy(entry))

    def append_decision_log(self, entry: dict) -> None:
        with self._lock:
            self.decision_log.append(copy.deepcopy(entry))


# singleton
state = AppState()
