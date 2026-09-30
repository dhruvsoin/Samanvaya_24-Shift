/**
 * Event mapper — the SINGLE place where WebSocket events update the store.
 *
 * Beginner note:
 * This is the most important file in the frontend!
 * Every event from the backend (or from the replay) flows through here.
 * Nothing else should directly update the store from events.
 *
 * The pipeline is:
 *   backend event → handleEvent() → Zustand store → React UI
 */
import { useAppStore } from '@/store';
import type { ContractEvent } from '@contracts/types';

export function handleEvent(event: ContractEvent): void {
  const store = useAppStore.getState();

  switch (event.type) {
    // ── Incidents ──────────────────────────────────────────────
    case 'incident.reported':
    case 'incident.assessed':
    case 'incident.updated':
      store.setIncident(event.payload.incident);
      break;

    case 'incident.closed':
      store.closeIncident(event.payload.incidentId, event.payload.outcome);
      break;

    // ── Plans ──────────────────────────────────────────────────
    case 'plan.published':
      store.publishPlan(event.payload.plan);
      break;

    // ── Approvals ──────────────────────────────────────────────
    case 'approval.requested':
      store.setApproval(event.payload.approval);
      break;

    case 'approval.resolved': {
      const p = event.payload;
      store.resolveApproval(p.approvalId, {
        status: p.decision === 'approve' ? 'approved' : 'rejected',
        chosenOptionId: p.chosenOptionId,
        decidedBy: p.decidedBy,
        decidedAt: p.decidedAt,
      });
      break;
    }

    // ── Assignments ────────────────────────────────────────────
    case 'assignment.sent':
      store.setAssignment(event.payload.assignment);
      break;

    case 'assignment.accepted':
      store.patchAssignment(event.payload.assignmentId, { status: 'accepted' });
      break;

    case 'assignment.declined':
      store.patchAssignment(event.payload.assignmentId, { status: 'declined' });
      break;

    case 'assignment.timeout':
      store.patchAssignment(event.payload.assignmentId, { status: 'timed_out' });
      break;

    case 'assignment.cancelled':
      store.patchAssignment(event.payload.assignmentId, { status: 'cancelled' });
      break;

    // ── Units ──────────────────────────────────────────────────
    case 'unit.status_changed': {
      const u = event.payload;
      const patch: Record<string, unknown> = { status: u.status };
      if (u.location) patch.location = u.location;
      store.setUnit(u.unitId, patch);
      break;
    }

    case 'unit.heartbeat_lost':
      store.setUnit(event.payload.unitId, {
        lastHeartbeatAt: event.payload.lastHeartbeatAt,
      });
      break;

    case 'unit.unavailable':
      store.setUnit(event.payload.unitId, { status: 'offline' });
      break;

    // ── Roads ──────────────────────────────────────────────────
    case 'road.status_changed':
      store.setRoad(event.payload.roadId, { status: event.payload.status });
      break;

    // ── Zones ──────────────────────────────────────────────────
    case 'zone.comms_degraded':
      store.setZone(event.payload.zoneId, { commsStatus: 'degraded' });
      break;

    case 'zone.comms_restored':
      store.setZone(event.payload.zoneId, { commsStatus: 'ok' });
      break;

    // ── System status ──────────────────────────────────────────
    case 'status.updated':
      store.setSystemStatus(event.payload.status);
      break;

    // ── Agent activity ─────────────────────────────────────────
    case 'agent.activity':
      store.pushAgentActivity({
        id: event.id,
        ts: event.ts,
        agent: event.payload.agent,
        message: event.payload.message,
        incidentId: event.payload.incidentId,
        planId: event.payload.planId,
      });
      break;

    // ── Comms (owned by Person 4, we just log them) ────────────
    case 'comms.delivery_failed':
    case 'comms.channel_switched':
    case 'reporter.message_sent':
      // These feed into a comms log visible to operator but
      // the reporter chat UI is Person 4's responsibility.
      break;

    // ── Reporter status (Person 4 owns the reporter portal) ────
    case 'reporter.status_updated':
      break;

    default:
      // Unknown event types are ignored gracefully
      break;
  }
}
