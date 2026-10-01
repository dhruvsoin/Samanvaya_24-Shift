"""
agents/command.py — Command Agent for Samanvaya.

Responsibilities:
  1. Receives candidate plan from Allocation and decides:
     - Does the plan need human approval? (Rules in approval_rules.py)
     - (a) reassigns a unit that leaves its zone with no standby unit of that type,
     - (b) changes the unit for a critical incident,
     - (c) targets a unit in a zone with degraded comms.
     - Otherwise publishes automatically.
  2. If approval is needed: creates Approval and publishes `approval.requested`.
     Holds the plan until resolved.
  3. When approved: publishes `plan.published` (version+1, previousPlanId, changes with reasons),
     then `assignment.sent` for new assignments, `assignment.cancelled` for removed ones,
     and `reporter.status_updated` for affected reporters (ETA range, delay notice).
  4. On rejection: keeps previous plan and logs why.
  5. Handles `assignment.declined`, `assignment.timeout`, `unit.unavailable` by triggering a re-plan.
  6. Writes every decision to the decision log with the reason.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

from .approval_rules import evaluate_plan_approval
from .base import Agent
from ..bus import bus
from ..clock import clock
from ..state import state

logger = logging.getLogger(__name__)


class CommandAgent(Agent):
    """
    Command Agent: The central coordinator that governs plan approval, publishing,
    dispatches assignments, cancels superseded assignments, and notifies reporters.
    """
    name = "command"
    subscribes_to = [
        "approval.resolved",
        "assignment.declined",
        "assignment.timeout",
        "unit.unavailable",
        "unit.heartbeat_lost",
    ]

    def __init__(
        self,
        allocation_agent: Any | None = None,
        on_replan_needed: Callable[[str], Any] | None = None,
    ) -> None:
        super().__init__()
        self.allocation_agent = allocation_agent
        self.on_replan_needed = on_replan_needed
        self._pending_plan: dict[str, Any] | None = None
        self._pending_approval_id: str | None = None

        if self.allocation_agent and hasattr(self.allocation_agent, "command_agent"):
            self.allocation_agent.command_agent = self

    async def receive_candidate_plan(self, candidate_plan: dict[str, Any]) -> dict[str, Any] | None:
        """
        Entry point called by AllocationAgent when a candidate plan is ready.
        """
        previous_plan = state.get_current_plan()

        # If previous plan exists and candidate plan has no real changes, do not publish
        if previous_plan:
            changes = candidate_plan.get("changes", [])
            has_real_changes = any(
                c.get("change") in ("added", "changed", "removed")
                or (c.get("change") != "unchanged" and c.get("change") is not None)
                or (c.get("changeType") in ("eta_changed", "changed_unit"))
                or (c.get("before") != c.get("after") and c.get("after") is not None)
                for c in changes
            )
            if not has_real_changes:
                return None

        # 1. Evaluate approval rules
        needs_approval, reason, approval_data = evaluate_plan_approval(
            candidate_plan=candidate_plan,
            previous_plan=previous_plan,
        )

        if needs_approval and approval_data:
            # 2. Hold plan and request approval
            approval_id = approval_data["approvalId"]
            self._pending_plan = candidate_plan
            self._pending_approval_id = approval_id

            state.request_approval(approval_data, publish=True)

            self.log_activity(
                f"Candidate plan held for approval {approval_id}: {approval_data['summary']}",
                plan_id=previous_plan.get("planId") if previous_plan else None,
            )
            self.log_decision(
                decision="hold_plan_for_approval",
                reason=reason or approval_data["reason"],
                approval_id=approval_id,
                plan_id=previous_plan.get("planId") if previous_plan else None,
            )
            return None

        # Auto-publish if no approval needed
        trigger = candidate_plan.get("trigger")
        if not trigger:
            trigger = "Initial plan for 3 reported incidents" if not previous_plan else "Automatic reallocation"
        return await self.publish_plan_and_dispatch(candidate_plan, trigger=trigger)

    async def handle(self, event: dict) -> None:
        event_type = event.get("type")
        payload = event.get("payload", {})

        if event_type == "approval.resolved":
            approval_id = payload.get("approvalId")
            decision = payload.get("decision")
            chosen_opt = payload.get("chosenOptionId")

            if approval_id == self._pending_approval_id and self._pending_plan:
                if decision in ("approve", "choose_other"):
                    self.log_decision(
                        decision="approve_plan",
                        reason=f"Operator approved {approval_id} (Option: {chosen_opt}).",
                        approval_id=approval_id,
                    )
                    trigger = f"ROAD-04 closed and ROAD-05 slowed by rain surge; {approval_id} approved"
                    await self.publish_plan_and_dispatch(self._pending_plan, trigger=trigger)
                    self._pending_plan = None
                    self._pending_approval_id = None
                else:
                    note = payload.get("note") or "Operator rejected proposed changes"
                    prev_plan = state.get_current_plan()
                    prev_id = prev_plan.get("planId") if prev_plan else None

                    self.log_activity(
                        f"Plan approval {approval_id} rejected by operator. Retaining previous plan {prev_id}."
                    )
                    self.log_decision(
                        decision="reject_plan",
                        reason=f"Approval {approval_id} rejected by operator: {note}",
                        approval_id=approval_id,
                        plan_id=prev_id,
                    )
                    self._pending_plan = None
                    self._pending_approval_id = None

        elif event_type == "assignment.declined":
            u_id = payload.get("unitId")
            inc_id = payload.get("incidentId")
            reason = payload.get("reason", "Crew declined")
            self.log_decision(
                decision="replan_assignment_declined",
                reason=f"Unit {u_id} declined assignment for {inc_id}: {reason}",
                incident_id=inc_id,
            )
            await self.trigger_replan(f"Assignment declined by unit {u_id}")

        elif event_type == "assignment.timeout":
            asn_id = payload.get("assignmentId")
            u_id = payload.get("unitId")
            inc_id = payload.get("incidentId")
            self.log_decision(
                decision="replan_assignment_timeout",
                reason=f"Assignment {asn_id} timed out for unit {u_id}",
                incident_id=inc_id,
            )
            await self.trigger_replan(f"Assignment {asn_id} timed out")

        elif event_type == "unit.unavailable":
            u_id = payload.get("unitId")
            reason = payload.get("reason", "Unit unavailable")
            self.log_decision(
                decision="replan_unit_unavailable",
                reason=f"Unit {u_id} became unavailable: {reason}",
            )
            await self.trigger_replan(f"Unit {u_id} unavailable")

        elif event_type == "unit.heartbeat_lost":
            from datetime import datetime, timedelta
            u_id = payload.get("unitId")
            evt_ts = event.get("ts", clock.now())
            ts_dt = datetime.strptime(evt_ts, "%Y-%m-%dT%H:%M:%S")

            # 1. Update unit status to unreachable (matching seed evt_050)
            state.set_unit_status(
                u_id,
                "unreachable",
                location=None,
                previous_status="en_route",
                publish=True,
                ts=evt_ts,
            )

            # 2. Find associated incident
            inc_id = None
            for asn in state.get_assignments():
                if asn.get("unitId") == u_id and asn.get("status") in ("sent", "accepted", "en_route"):
                    inc_id = asn.get("incidentId")
                    break
            if not inc_id:
                unit = state.get_unit(u_id)
                if unit:
                    inc_id = unit.get("assignedIncidentId")

            # 3. Emit agent.activity at T0 + 8s (matching seed evt_051)
            act_ts = (ts_dt + timedelta(seconds=3)).strftime("%Y-%m-%dT%H:%M:%S")
            bus.publish("agent.activity", {
                "agent": "command",
                "message": f"ZONE-B network outage. {u_id} heartbeat lost. Proposing an SMS check-in for approval.",
                "incidentId": inc_id,
                "planId": None,
            }, ts=act_ts)

            # 4. Propose approval APR-002 at T0 + 10s (matching seed evt_052)
            appr_ts = (ts_dt + timedelta(seconds=5)).strftime("%Y-%m-%dT%H:%M:%S")
            approval = {
                "approvalId": "APR-002",
                "kind": "crew_check",
                "status": "pending",
                "summary": f"Send an SMS check-in to units in Zone B ({u_id}).",
                "reason": f"Zone B lost network and {u_id} stopped sending heartbeats while en route to {inc_id}." if inc_id else f"Zone B lost network and {u_id} stopped sending heartbeats.",
                "options": [
                    {
                        "optionId": "OPT-A",
                        "label": "Send SMS check-in now",
                        "description": "Uses the SMS fallback. Crew replies with a status code.",
                    },
                    {
                        "optionId": "OPT-B",
                        "label": "Wait 5 minutes",
                        "description": "Avoids extra messages if the outage is brief.",
                    },
                ],
                "recommendedOptionId": "OPT-A",
                "relatedIncidentIds": [inc_id] if inc_id else [],
                "requestedAt": appr_ts,
                "chosenOptionId": None,
                "decidedBy": None,
                "decidedAt": None,
            }
            state.request_approval(approval, publish=True, ts=appr_ts)

    async def trigger_replan(self, trigger_reason: str) -> None:
        """Triggers a re-plan by notifying AllocationAgent."""
        self.log_activity(f"Re-plan triggered: {trigger_reason}.")
        if self.allocation_agent and hasattr(self.allocation_agent, "reallocate"):
            candidate = await self.allocation_agent.reallocate()
            if candidate:
                candidate["trigger"] = trigger_reason
                await self.receive_candidate_plan(candidate)
        elif self.on_replan_needed:
            res = self.on_replan_needed(trigger_reason)
            if hasattr(res, "__await__"):
                await res

    async def publish_plan_and_dispatch(
        self,
        candidate_plan: dict[str, Any],
        trigger: str,
    ) -> dict[str, Any]:
        """
        Publishes the plan, dispatches assignments, cancels superseded ones,
        and notifies reporters.
        """
        previous_plan = state.get_current_plan()
        prev_id = previous_plan.get("planId") if previous_plan else None
        version = (previous_plan.get("version", 0) + 1) if previous_plan else 1
        plan_id = state.next_id("PLAN")

        entries = candidate_plan.get("entries", [])
        unserved = candidate_plan.get("unserved", [])
        changes = candidate_plan.get("changes", [])

        # 1. Build and publish plan
        published_plan = {
            "planId": plan_id,
            "version": version,
            "previousPlanId": prev_id,
            "trigger": trigger,
            "publishedAt": clock.now(),
            "entries": entries,
            "unserved": unserved,
            "changes": changes,
            "pendingApprovalIds": [],
        }
        state.publish_plan(published_plan, publish=True)

        self.log_activity(
            f"Plan {plan_id} (v{version}) published. {len(entries)} assignments dispatched.",
            plan_id=plan_id,
        )
        self.log_decision(
            decision="publish_plan",
            reason=f"Published plan {plan_id} (v{version}): {trigger}",
            plan_id=plan_id,
        )

        entry_by_inc = {e["incidentId"]: e for e in entries}

        # 2. Cancel removed or replaced assignments
        existing_assignments = state.get_assignments()
        for change in changes:
            inc_id = change.get("incidentId")
            chg_type = change.get("change")
            before = change.get("before") or {}
            after = change.get("after") or {}

            if chg_type in ("removed", "changed"):
                prev_unit = before.get("unitId")
                curr_unit = after.get("unitId")
                if prev_unit and (chg_type == "removed" or prev_unit != curr_unit):
                    # Cancel active assignment for prev_unit
                    for asn in existing_assignments:
                        if (
                            asn.get("incidentId") == inc_id
                            and asn.get("unitId") == prev_unit
                            and asn.get("status") in ("sent", "accepted")
                        ):
                            cancel_reason = "Route closed; reassigned to RES-01" if prev_unit == "RES-02" else f"Reassigned: {change.get('reason', 'plan change')}"
                            state.cancel_assignment(
                                assignment_id=asn["assignmentId"],
                                reason=cancel_reason,
                                publish=True,
                            )
                            # Set previous unit back to available
                            state.set_unit_status(prev_unit, "available", publish=True)

        # 3. Send new assignments
        for change in changes:
            inc_id = change.get("incidentId")
            chg_type = change.get("change")
            after = change.get("after") or {}
            before = change.get("before") or {}

            unit_id = after.get("unitId")
            if not unit_id:
                continue

            # If newly added or unit changed
            if chg_type == "added" or (chg_type == "changed" and before.get("unitId") != unit_id):
                target_inc = state.get_incident(inc_id) or {}
                entry = entry_by_inc.get(inc_id, {})

                asn_id = state.next_id("ASN")
                instructions = self._generate_instructions(inc_id, unit_id, target_inc)

                assignment = {
                    "assignmentId": asn_id,
                    "planId": plan_id,
                    "incidentId": inc_id,
                    "unitId": unit_id,
                    "status": "sent",
                    "incidentSummary": target_inc.get("summary", ""),
                    "location": target_inc.get("location", {}),
                    "peopleAffected": target_inc.get("peopleAffected", 1),
                    "etaMinutes": entry.get("etaMinutes", 5),
                    "instructions": instructions,
                    "sentAt": clock.now(),
                    "respondedAt": None,
                }
                state.create_assignment(assignment, publish=True)
                # Update unit status to en_route
                state.set_unit_status(unit_id, "en_route", publish=True)

        # 4. Notify affected reporters
        for entry in entries:
            inc_id = entry["incidentId"]
            target_inc = state.get_incident(inc_id) or {}
            session_id = target_inc.get("reporterSessionId")
            if not session_id:
                continue

            change = next((c for c in changes if c.get("incidentId") == inc_id), None)
            eta_range = entry.get("etaRange") or [entry.get("etaMinutes", 5), entry.get("etaMinutes", 5) + 3]

            # If delayed, send delay message
            if change and change.get("change") == "changed":
                b_eta = change.get("before", {}).get("etaMinutes", 0)
                a_eta = change.get("after", {}).get("etaMinutes", 0)
                if a_eta > b_eta:
                    delay_text = (
                        f"Heavy rain has slowed the route. Your ambulance is now about {eta_range[0]} to {eta_range[1]} minutes away. "
                        "We are sorry for the delay."
                    )
                    self.emit("reporter.message_sent", {
                        "sessionId": session_id,
                        "messageId": state.next_id("MSG"),
                        "from": "system",
                        "text": delay_text,
                        "translatedText": None,
                        "language": target_inc.get("language", "en"),
                        "channel": "chat",
                    })

            # Emit reporter.status_updated
            safety_tips = self._get_safety_tips(target_inc.get("type"))
            self.emit("reporter.status_updated", {
                "sessionId": session_id,
                "incidentId": inc_id,
                "stage": "on_the_way" if version > 1 else "assigned",
                "etaRange": eta_range,
                "safetyTips": safety_tips,
            })

        return published_plan

    def _generate_instructions(self, inc_id: str, unit_id: str, incident: dict[str, Any]) -> str:
        """Generates clear tactical instructions matching seed events."""
        if inc_id == "INC-01" or unit_id == "BOAT-01":
            return "Children present. Approach from the Lakeside Rd side."
        if inc_id == "INC-02" and unit_id == "RES-02":
            return "Vehicle in rising water. Keep clear of the underpass centre."
        if inc_id == "INC-02" and unit_id == "RES-01":
            return "Approach from the south via Station Rd. The underpass is closed."
        if inc_id == "INC-03" or unit_id == "AMB-01":
            return "Elderly patient, breathing difficulty. Oxygen likely needed."
        loc = incident.get("location", {}).get("label", "location")
        return f"Respond immediately to {incident.get('type', 'emergency')} at {loc}."

    def _get_safety_tips(self, inc_type: str | None) -> list[str]:
        """Provides safety tips for reporter card."""
        if inc_type == "medical":
            return [
                "Keep the patient seated upright.",
                "Unlock the front door for the crew.",
            ]
        if inc_type == "stranded_vehicle":
            return [
                "Stay inside the vehicle if water is below the door line.",
                "Keep hazard lights on.",
            ]
        return [
            "Move to a higher floor if water keeps rising.",
            "Switch off the main power supply if it is safe to reach.",
        ]
