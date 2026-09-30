/**
 * Zustand store — single source of truth for all live state.
 *
 * Simple rule: components READ from this store and NEVER calculate domain
 * logic. All values come from events dispatched by the backend / replay.
 */
import { create } from 'zustand';
import type {
  Incident,
  Unit,
  Facility,
  Road,
  Zone,
  Plan,
  Approval,
  Assignment,
  SystemStatus,
  CommsLogEntry,
} from '@contracts/types';

// Shape of the agent activity stream item
export interface AgentStreamItem {
  id: string;
  ts: string; // scenario time
  agent: string;
  message: string;
  incidentId: string | null;
  planId: string | null;
}

// ── Operation audit log entry ──
export type OpLogCategory =
  | 'sos_received'
  | 'operator_dispatched'
  | 'crew_en_route'
  | 'crew_arrived'
  | 'task_complete'
  | 'incident_updated'
  | 'system';

export interface OpLogEntry {
  id: string;
  ts: string;               // wall-clock ISO timestamp
  category: OpLogCategory;
  incidentId: string | null;
  unitId: string | null;
  text: string;             // human-readable one-liner
  detail?: string;          // optional extra context (location, type, etc.)
}

interface AppState {
  // ── Incidents keyed by incidentId ──
  incidentsById: Record<string, Incident>;
  // ── Units keyed by unitId ──
  unitsById: Record<string, Unit>;
  // ── Facilities ──
  facilitiesById: Record<string, Facility>;
  // ── Roads keyed by roadId ──
  roadsById: Record<string, Road>;
  // ── Zones keyed by zoneId ──
  zonesById: Record<string, Zone>;
  // ── Current plan ──
  currentPlan: Plan | null;
  planHistory: Plan[];
  // ── Approvals keyed by approvalId ──
  approvalsById: Record<string, Approval>;
  // ── Assignments keyed by assignmentId ──
  assignmentsById: Record<string, Assignment>;
  // ── System status (top bar) ──
  systemStatus: SystemStatus | null;
  // ── Agent activity stream (newest first) ──
  agentStream: AgentStreamItem[];
  // ── Comms log ──
  commsLog: CommsLogEntry[];
  // ── Operation audit log ──
  opLog: OpLogEntry[];

  // ── Actions (called by the event mapper, never by UI components) ──
  setIncident: (incident: Incident) => void;
  closeIncident: (id: string, outcome: string) => void;
  setUnit: (unitId: string, patch: Partial<Unit>) => void;
  setFacilities: (facilities: Facility[]) => void;
  setRoads: (roads: Road[]) => void;
  setRoad: (roadId: string, patch: Partial<Road>) => void;
  setZone: (zoneId: string, patch: Partial<Zone>) => void;
  setZones: (zones: Zone[]) => void;
  setUnits: (units: Unit[]) => void;
  publishPlan: (plan: Plan) => void;
  setApproval: (approval: Approval) => void;
  resolveApproval: (approvalId: string, patch: Partial<Approval>) => void;
  setAssignment: (assignment: Assignment) => void;
  patchAssignment: (assignmentId: string, patch: Partial<Assignment>) => void;
  setSystemStatus: (status: SystemStatus) => void;
  pushAgentActivity: (item: AgentStreamItem) => void;
  pushCommsLog: (entry: CommsLogEntry) => void;
  pushOpLog: (entry: Omit<OpLogEntry, 'id' | 'ts'>) => void;
  clearOpLog: () => void;
  reset: () => void;
}

const initialState = {
  incidentsById: {},
  unitsById: {},
  facilitiesById: {},
  roadsById: {},
  zonesById: {},
  currentPlan: null,
  planHistory: [],
  approvalsById: {},
  assignmentsById: {},
  systemStatus: null,
  agentStream: [],
  commsLog: [],
  opLog: [] as OpLogEntry[],
};

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  setIncident: (incident) =>
    set((s) => ({
      incidentsById: { ...s.incidentsById, [incident.incidentId]: incident },
    })),

  closeIncident: (id, outcome) =>
    set((s) => {
      const existing = s.incidentsById[id];
      if (!existing) return s;
      return {
        incidentsById: {
          ...s.incidentsById,
          [id]: {
            ...existing,
            status: outcome === 'resolved' ? 'resolved' : 'closed',
            assignedUnitIds: [],
          },
        },
      };
    }),

  setUnit: (unitId, patch) =>
    set((s) => {
      const existing = s.unitsById[unitId];
      if (!existing) return s;
      return { unitsById: { ...s.unitsById, [unitId]: { ...existing, ...patch } } };
    }),

  setUnits: (units) =>
    set(() => {
      const byId: Record<string, Unit> = {};
      for (const u of units) byId[u.unitId] = u;
      return { unitsById: byId };
    }),

  setFacilities: (facilities) =>
    set(() => {
      const byId: Record<string, Facility> = {};
      for (const f of facilities) byId[f.facilityId] = f;
      return { facilitiesById: byId };
    }),

  setRoads: (roads) =>
    set(() => {
      const byId: Record<string, Road> = {};
      for (const r of roads) byId[r.roadId] = r;
      return { roadsById: byId };
    }),

  setRoad: (roadId, patch) =>
    set((s) => {
      const existing = s.roadsById[roadId];
      if (!existing) return s;
      return { roadsById: { ...s.roadsById, [roadId]: { ...existing, ...patch } } };
    }),

  setZone: (zoneId, patch) =>
    set((s) => {
      const existing = s.zonesById[zoneId];
      if (!existing) return s;
      return { zonesById: { ...s.zonesById, [zoneId]: { ...existing, ...patch } } };
    }),

  setZones: (zones) =>
    set(() => {
      const byId: Record<string, Zone> = {};
      for (const z of zones) byId[z.zoneId] = z;
      return { zonesById: byId };
    }),

  publishPlan: (plan) =>
    set((s) => ({
      currentPlan: plan,
      planHistory: [...s.planHistory, plan],
    })),

  setApproval: (approval) =>
    set((s) => ({
      approvalsById: { ...s.approvalsById, [approval.approvalId]: approval },
    })),

  resolveApproval: (approvalId, patch) =>
    set((s) => {
      const existing = s.approvalsById[approvalId];
      if (!existing) return s;
      return {
        approvalsById: {
          ...s.approvalsById,
          [approvalId]: { ...existing, ...patch },
        },
      };
    }),

  setAssignment: (assignment) =>
    set((s) => ({
      assignmentsById: { ...s.assignmentsById, [assignment.assignmentId]: assignment },
    })),

  patchAssignment: (assignmentId, patch) =>
    set((s) => {
      const existing = s.assignmentsById[assignmentId];
      if (!existing) return s;
      return {
        assignmentsById: {
          ...s.assignmentsById,
          [assignmentId]: { ...existing, ...patch },
        },
      };
    }),

  setSystemStatus: (status) => set(() => ({ systemStatus: status })),

  pushAgentActivity: (item) =>
    set((s) => ({
      // Keep only the latest 100 items
      agentStream: [item, ...s.agentStream].slice(0, 100),
    })),

  pushCommsLog: (entry) =>
    set((s) => ({
      commsLog: [entry, ...s.commsLog].slice(0, 200),
    })),

  pushOpLog: (entry) =>
    set((s) => ({
      opLog: [
        {
          ...entry,
          id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ts: new Date().toISOString(),
        },
        ...s.opLog,
      ].slice(0, 500),
    })),

  clearOpLog: () => set(() => ({ opLog: [] })),

  reset: () => set(() => initialState),
}));
