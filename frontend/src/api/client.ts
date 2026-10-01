/**
 * API Client — all HTTP communication goes through here.
 *
 * Beginner note:
 * - We use the native browser fetch() — no extra library needed.
 * - All requests automatically include the auth token.
 * - In MOCK mode, MSW intercepts these requests and returns fake data.
 * - In REAL mode, they go to http://localhost:8000.
 */
import { useAuthStore } from '@/store/auth';
import type {
  Incident,
  Unit,
  Facility,
  RoadNetwork,
  Zone,
  Plan,
  Approval,
  Assignment,
  SystemStatus,
  CommsLogEntry,
  AuthResponse,
  LoginRequest,
  CrewLoginRequest,
  ApprovalDecisionRequest,
  PhoneInRequest,
  AfterActionReport,
} from '@contracts/types';

const BASE = import.meta.env.VITE_API_BASE !== undefined && import.meta.env.VITE_API_BASE !== ''
  ? import.meta.env.VITE_API_BASE
  : '';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    // Try to read a structured error from the backend
    let message = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      message = err?.error?.message ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  // Handle empty responses (e.g. 204 No Content)
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ─── Auth ───────────────────────────────────────────────────────────
export const api = {
  auth: {
    login: (body: LoginRequest) =>
      request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

    crewLogin: (body: CrewLoginRequest) =>
      request<AuthResponse>('/auth/crew-login', { method: 'POST', body: JSON.stringify(body) }),

    demo: () =>
      request<AuthResponse>('/auth/demo', { method: 'POST' }),
  },

  // ─── State (initial load) ──────────────────────────────────────
  incidents: {
    list: () => request<Incident[]>('/incidents'),
  },

  units: {
    list: () => request<Unit[]>('/units'),
  },

  facilities: {
    list: () => request<Facility[]>('/facilities'),
  },

  roads: {
    get: () => request<RoadNetwork>('/roads'),
  },

  zones: {
    list: () => request<Zone[]>('/zones'),
  },

  status: {
    get: () => request<SystemStatus>('/status'),
  },

  // ─── Plan ─────────────────────────────────────────────────────
  plan: {
    current: () => request<Plan | null>('/plan/current'),
    history: () => request<Plan[]>('/plan/history'),
  },

  // ─── Approvals ────────────────────────────────────────────────
  approvals: {
    list: (status?: string) =>
      request<Approval[]>(`/approvals${status ? `?status=${status}` : ''}`),
    decide: (id: string, body: ApprovalDecisionRequest) =>
      request<Approval>(`/approvals/${id}/decision`, { method: 'POST', body: JSON.stringify(body) }),
  },

  // ─── Phone-in ─────────────────────────────────────────────────
  phoneIn: {
    submit: (body: PhoneInRequest) =>
      request<Incident>('/incidents/phone-in', { method: 'POST', body: JSON.stringify(body) }),
  },

  // ─── Crew ─────────────────────────────────────────────────────


  crew: {
    getAssignment: () => request<Assignment | null>('/crew/assignment'),
    requestDispatch: (body?: { incidentId?: string; unitId?: string; incidentSummary?: string; location?: any; peopleAffected?: number; instructions?: string }) =>
      request<Assignment>('/crew/request-dispatch', {
        method: 'POST',
        body: JSON.stringify(body || {}),
      }),
    respond: (assignmentId: string, body: { accept: boolean; clientRequestId: string }) =>
      request<Assignment>(`/crew/assignment/${assignmentId}/respond`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    updateStatus: (body: { action: string; clientRequestId: string; unitId?: string; incidentId?: string }) =>
      request<Unit>('/crew/status', { method: 'POST', body: JSON.stringify(body) }),
    reportProblem: (body: { kind: string; note?: string; clientRequestId: string }) =>
      request<{ ok: true }>('/crew/problem', { method: 'POST', body: JSON.stringify(body) }),
  },

  // ─── Reports ─────────────────────────────────────────────────
  reports: {
    afterAction: () => request<AfterActionReport>('/reports/after-action'),
    commsLog: () => request<CommsLogEntry[]>('/comms/log'),
  },
};
