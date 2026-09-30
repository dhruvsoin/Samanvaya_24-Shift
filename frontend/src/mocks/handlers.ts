/**
 * MSW Handlers — mock backend responses for VITE_USE_MOCKS=true mode.
 *
 * Beginner note:
 * MSW (Mock Service Worker) intercepts fetch() calls in the browser
 * before they go to the actual backend. This lets us develop and demo
 * with no backend running at all.
 *
 * Each handler says "when the app calls GET /incidents, return this mock data".
 */
import { http, HttpResponse } from 'msw';
import type { AuthResponse } from '@contracts/types';
import seedUnits from './data/units.json';
import seedFacilities from './data/facilities.json';
import seedRoads from './data/roads.json';
import seedZones from './data/zones.json';

const BASE = 'http://localhost:8000';

// Tactical templates tailored to each unit's specialty
export const UNIT_MISSION_TEMPLATES: Record<string, { summary: string; location: { lat: number; lng: number; label: string; zoneId: string }; peopleAffected: number; eta: number; instructions: string }> = {
  'AMB-01': {
    summary: 'Critical Medical: Senior patient with oxygen concentrator failure in inundated ground floor',
    location: { lat: 12.9248, lng: 77.6201, label: 'Building 12, 5th Cross, Koramangala 4th Block', zoneId: 'ZONE-A' },
    peopleAffected: 2,
    eta: 6,
    instructions: 'Primary access via Inner Ring Road flyover. Avoid 80ft Road (water depth 0.9m). Carry portable oxygen unit and high-water stretcher.',
  },
  'AMB-02': {
    summary: 'Medical Trauma: Fractured limb during flood evacuation at residential complex',
    location: { lat: 12.9150, lng: 77.6100, label: 'BTM 2nd Stage, 7th Main Rd', zoneId: 'ZONE-B' },
    peopleAffected: 1,
    eta: 8,
    instructions: 'Proceed via Ring Road West corridor. Road clear of debris. Prepare splinting kit.',
  },
  'BOAT-01': {
    summary: 'Water Rescue: Family of 4 trapped on roof due to stormwater drain breach',
    location: { lat: 12.9300, lng: 77.6100, label: 'Lakeside Enclave, Bellandur Catchment', zoneId: 'ZONE-A' },
    peopleAffected: 4,
    eta: 5,
    instructions: 'Launch rescue inflatable from Lakeside ramp. Watch for submerged fence poles and electrical wiring. Equip 4 life vests.',
  },
  'BOAT-02': {
    summary: 'Evacuation: 6 residents stranded at submerged bus terminus',
    location: { lat: 12.9300, lng: 77.6400, label: 'Canal Launch Point, Sector 2', zoneId: 'ZONE-A' },
    peopleAffected: 6,
    eta: 7,
    instructions: 'Approach canal junction against the current. High water flow (1.2m/s). Use safety towlines.',
  },
  'RES-01': {
    summary: 'Structural Extrication: Collapsed boundary wall trapping basement occupants',
    location: { lat: 12.9200, lng: 77.6300, label: 'Silk Board Junction Service Rd', zoneId: 'ZONE-B' },
    peopleAffected: 3,
    eta: 9,
    instructions: 'Deploy hydraulic spreader and concrete cutters. Team to establish secondary escape route.',
  },
  'RES-02': {
    summary: 'Hazmat & Extraction: Submerged electrical transformer smoking near residential gates',
    location: { lat: 12.9280, lng: 77.6350, label: 'Koramangala 6th Block, 1st Cross', zoneId: 'ZONE-A' },
    peopleAffected: 5,
    eta: 6,
    instructions: 'BESCOM has isolated grid feeder 4. Verify with voltage tester before wading through waters.',
  },
  'PUMP-01': {
    summary: 'Emergency De-watering: Hospital power generator room flooding rapidly',
    location: { lat: 12.9150, lng: 77.6400, label: 'City General Hospital, Sub-station 2', zoneId: 'ZONE-B' },
    peopleAffected: 12,
    eta: 4,
    instructions: 'Deploy 2500 GPM high-capacity dewatering pump. Route discharge hose to western storm canal.',
  },
  'PUMP-02': {
    summary: 'Road Clearance: Underpass completely submerged, blocking emergency ambulance artery',
    location: { lat: 12.9320, lng: 77.6250, label: 'Madiwala Underpass South', zoneId: 'ZONE-B' },
    peopleAffected: 0,
    eta: 10,
    instructions: 'Clear trash screen blockage at intake manifold. Continuous high-volume pumping required.',
  },
};

// Store active assignments by unit code
const mockAssignmentsByUnit: Record<string, any> = {};

function getUnitIdFromRequest(request: Request): string | null {
  const auth = request.headers.get('authorization') || '';
  const match = auth.match(/mock-crew-token-([A-Z0-9-]+)/i);
  if (match) return match[1].toUpperCase();
  try {
    const url = new URL(request.url);
    const p = url.searchParams.get('unitId');
    if (p) return p.toUpperCase();
  } catch {
    // ignore
  }
  return null;
}

// In-memory list of incidents (updated by citizen SOS and operator dispatch)
export const mockIncidents: any[] = [
  {
    incidentId: 'INC-001',
    type: 'flooded_home',
    status: 'reported',
    severity: 'critical',
    severityScore: 94,
    timeWindowMinutes: 25,
    location: {
      lat: 12.9250,
      lng: 77.6250,
      label: '14th Main Rd, Sector 4, HSR Layout',
      zoneId: 'ZONE-B',
    },
    peopleAffected: 4,
    language: 'en',
    source: 'sos_portal',
    summary: 'Family of 4 stranded on ground floor with flood water rising rapidly',
    confidence: 0.95,
    reportedAt: '2026-10-10T09:05:00',
    assignedUnitIds: [],
    reporterSessionId: null,
  },
  {
    incidentId: 'INC-002',
    type: 'medical_emergency',
    status: 'reported',
    severity: 'critical',
    severityScore: 98,
    timeWindowMinutes: 15,
    location: {
      lat: 12.9340,
      lng: 77.6180,
      label: '5th Cross, 4th Block, Koramangala',
      zoneId: 'ZONE-A',
    },
    peopleAffected: 2,
    language: 'kn',
    source: 'sos_portal',
    summary: 'Elderly cardiac patient in urgent need of oxygen concentrator in flooded premises',
    confidence: 0.98,
    reportedAt: '2026-10-10T09:08:00',
    assignedUnitIds: [],
    reporterSessionId: null,
  },
];

// ── Tactical Plans for Plan Diff & Solver Demonstration ────────
export const MOCK_PLAN_V1 = {
  planId: 'PLAN-001',
  version: 1,
  previousPlanId: null,
  trigger: 'Initial baseline emergency response deployment across Sector 1 & Sector 2',
  publishedAt: '2026-10-10T09:02:15',
  entries: [
    { incidentId: 'INC-01', unitId: 'BOAT-01', etaMinutes: 6, etaRange: [5, 8] as [number, number] },
    { incidentId: 'INC-02', unitId: 'RES-02', etaMinutes: 5, etaRange: [4, 7] as [number, number] },
    { incidentId: 'INC-03', unitId: 'AMB-01', etaMinutes: 4, etaRange: [3, 6] as [number, number] },
    { incidentId: 'INC-04', unitId: 'PUMP-01', etaMinutes: 8, etaRange: [6, 10] as [number, number] },
  ],
  unserved: [],
  changes: [
    { incidentId: 'INC-01', change: 'added' as const, before: null, after: { unitId: 'BOAT-01', etaMinutes: 6 }, reason: 'Assigned nearest available inflatable rescue boat' },
    { incidentId: 'INC-02', change: 'added' as const, before: null, after: { unitId: 'RES-02', etaMinutes: 5 }, reason: 'Direct corridor access via Hosur Road underpass' },
    { incidentId: 'INC-03', change: 'added' as const, before: null, after: { unitId: 'AMB-01', etaMinutes: 4 }, reason: 'Fastest medical ambulance dispatch from General Hospital' },
    { incidentId: 'INC-04', change: 'added' as const, before: null, after: { unitId: 'PUMP-01', etaMinutes: 8 }, reason: 'Assigned high-capacity dewatering pump unit' },
  ],
  pendingApprovalIds: [],
};

export const MOCK_PLAN_V2 = {
  planId: 'PLAN-002',
  version: 2,
  previousPlanId: 'PLAN-001',
  trigger: 'ROAD-04 (Hosur Rd Underpass) submerged 1.2m & ROAD-05 slowed by flash flood surge; APR-001 approved',
  publishedAt: '2026-10-10T09:06:52',
  entries: [
    { incidentId: 'INC-01', unitId: 'BOAT-01', etaMinutes: 6, etaRange: [5, 8] as [number, number] },
    { incidentId: 'INC-02', unitId: 'RES-01', etaMinutes: 9, etaRange: [8, 12] as [number, number] },
    { incidentId: 'INC-03', unitId: 'AMB-01', etaMinutes: 7, etaRange: [6, 9] as [number, number] },
    { incidentId: 'INC-04', unitId: 'PUMP-01', etaMinutes: 14, etaRange: [12, 16] as [number, number] },
  ],
  unserved: [],
  changes: [
    {
      incidentId: 'INC-01',
      change: 'unchanged' as const,
      before: { unitId: 'BOAT-01', etaMinutes: 6 },
      after: { unitId: 'BOAT-01', etaMinutes: 6 },
      reason: 'No change; route via Lakeside Launch corridor is completely clear.',
    },
    {
      incidentId: 'INC-02',
      change: 'changed' as const,
      before: { unitId: 'RES-02', etaMinutes: 5 },
      after: { unitId: 'RES-01', etaMinutes: 9 },
      reason: 'Hosur Rd underpass closed, RES-02 cut off. RES-01 dispatched from Central Post as fastest viable alternative (Approved by operator).',
    },
    {
      incidentId: 'INC-03',
      change: 'changed' as const,
      before: { unitId: 'AMB-01', etaMinutes: 4 },
      after: { unitId: 'AMB-01', etaMinutes: 7 },
      reason: 'Same unit AMB-01 retained. Canal Access Rd slowed by heavy rain, increasing ETA by 3 min.',
    },
    {
      incidentId: 'INC-04',
      change: 'changed' as const,
      before: { unitId: 'PUMP-01', etaMinutes: 8 },
      after: { unitId: 'PUMP-01', etaMinutes: 14 },
      reason: 'Rerouted through 100ft Inner Ring Road flyover to bypass flooded culvert (+6 min).',
    },
    {
      incidentId: 'INC-05',
      change: 'added' as const,
      before: null,
      after: { unitId: 'BOAT-02', etaMinutes: 8 },
      reason: 'Urgent priority: 6 citizens stranded at flooded bus terminus allocated backup inflatable boat.',
    },
  ],
  pendingApprovalIds: ['APR-001'],
};

export const MOCK_PLAN_V3 = {
  planId: 'PLAN-003',
  version: 3,
  previousPlanId: 'PLAN-002',
  trigger: 'Bellandur lake catchment overflow; surge evacuation priority declared by Incident Commander',
  publishedAt: '2026-10-10T09:15:30',
  entries: [
    { incidentId: 'INC-01', unitId: 'BOAT-01', etaMinutes: 5, etaRange: [4, 7] as [number, number] },
    { incidentId: 'INC-02', unitId: 'RES-01', etaMinutes: 8, etaRange: [7, 10] as [number, number] },
    { incidentId: 'INC-05', unitId: 'BOAT-02', etaMinutes: 6, etaRange: [5, 8] as [number, number] },
    { incidentId: 'INC-06', unitId: 'RES-02', etaMinutes: 11, etaRange: [9, 13] as [number, number] },
  ],
  unserved: [],
  changes: [
    {
      incidentId: 'INC-01',
      change: 'changed' as const,
      before: { unitId: 'BOAT-01', etaMinutes: 6 },
      after: { unitId: 'BOAT-01', etaMinutes: 5 },
      reason: 'Secondary channel cleared, reducing boat transit time by 1 min.',
    },
    {
      incidentId: 'INC-02',
      change: 'unchanged' as const,
      before: { unitId: 'RES-01', etaMinutes: 9 },
      after: { unitId: 'RES-01', etaMinutes: 8 },
      reason: 'RES-01 proceeding on schedule via Ring Road corridor.',
    },
    {
      incidentId: 'INC-04',
      change: 'removed' as const,
      before: { unitId: 'PUMP-01', etaMinutes: 14 },
      after: null,
      reason: 'Dewatering mission completed; unit released to sector maintenance depot.',
    },
    {
      incidentId: 'INC-06',
      change: 'added' as const,
      before: null,
      after: { unitId: 'RES-02', etaMinutes: 11 },
      reason: 'Collapsed residential compound wall extracted with hydraulic gear.',
    },
  ],
  pendingApprovalIds: [],
};

export const MOCK_APPROVALS = [
  {
    approvalId: 'APR-001',
    kind: 'reassign_unit',
    status: 'pending',
    summary: 'Redirect RES-01 from depot standby to INC-02 (stranded vehicle, 3 people).',
    reason: "RES-02's route through the Hosur Rd underpass is closed. RES-01 is the fastest alternative (9 min) but leaves Zone C without a standby rescue team.",
    options: [
      { optionId: 'OPT-A', label: 'Send RES-01 (ETA 9 min)', description: 'Fastest option. Zone C has no standby rescue team afterwards.' },
      { optionId: 'OPT-B', label: 'Keep RES-02 on detour (ETA 16 min)', description: 'Keeps depot standby but misses the 25 min window by a wide margin.' },
      { optionId: 'OPT-C', label: 'Send BOAT-02 (ETA 12 min)', description: 'Boat can cross the flooded stretch, but is not equipped for vehicle recovery.' },
    ],
    recommendedOptionId: 'OPT-A',
    relatedIncidentIds: ['INC-02'],
    requestedAt: '2026-10-10T09:06:20',
    chosenOptionId: null,
    decidedBy: null,
    decidedAt: null,
  },
];

export const handlers = [
  // ── Auth ──────────────────────────────────────────────────────
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = await request.json() as { username: string; password: string };
    if (body.username === 'operator' && body.password === 'demo1234') {
      return HttpResponse.json<AuthResponse>({
        token: 'mock-operator-token',
        role: 'operator',
        displayName: 'Duty Operator',
        unitId: null,
      });
    }
    return HttpResponse.json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } }, { status: 401 });
  }),

  http.post(`${BASE}/auth/crew-login`, async ({ request }) => {
    const body = await request.json() as { unitCode: string; pin: string };
    const rawCode = String(body.unitCode ?? '').trim().toUpperCase();
    let code = rawCode;
    if (/^[A-Z]+\d+$/.test(rawCode)) {
      code = rawCode.replace(/^([A-Z]+)(\d+)$/, (_, prefix, num) => `${prefix}-${num.padStart(2, '0')}`);
    } else if (/^[A-Z]+-\d$/.test(rawCode)) {
      code = rawCode.replace(/^([A-Z]+)-(\d)$/, '$1-0$2');
    }

    const validCodes = ['AMB-01', 'AMB-02', 'BOAT-01', 'BOAT-02', 'RES-01', 'RES-02', 'PUMP-01', 'PUMP-02'];
    const matchedUnit = (seedUnits as Array<{ unitId: string; name: string }>).find(
      (u) => u.unitId.toUpperCase() === code
    );

    const isCodeValid = validCodes.includes(code) || Boolean(matchedUnit);
    const pin = String(body.pin ?? '').trim();
    const isPinValid = pin === '1111' || pin.length === 4 || pin === '';

    if (isCodeValid && isPinValid) {
      const activeUnitId = matchedUnit?.unitId ?? (validCodes.includes(code) ? code : 'AMB-01');
      return HttpResponse.json<AuthResponse>({
        token: `mock-crew-token-${activeUnitId}`,
        role: 'crew',
        displayName: matchedUnit?.name ?? `Unit ${activeUnitId}`,
        unitId: activeUnitId,
      });
    }

    return HttpResponse.json({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: `Invalid unit code "${rawCode}". Use AMB-01, BOAT-01, RES-01, or PUMP-01 (PIN: 1111)`,
      },
    }, { status: 401 });
  }),

  http.post(`${BASE}/auth/demo`, () => {
    return HttpResponse.json<AuthResponse>({
      token: 'mock-reviewer-token',
      role: 'reviewer',
      displayName: 'Demo Reviewer',
      unitId: null,
    });
  }),

  // ── State ─────────────────────────────────────────────────────
  http.get(`${BASE}/incidents`, () => {
    return HttpResponse.json(mockIncidents);
  }),

  http.get(`${BASE}/units`, () => {
    return HttpResponse.json(seedUnits);
  }),

  http.get(`${BASE}/facilities`, () => {
    return HttpResponse.json(seedFacilities);
  }),

  http.get(`${BASE}/roads`, () => {
    return HttpResponse.json(seedRoads);
  }),

  http.get(`${BASE}/zones`, () => {
    return HttpResponse.json(seedZones);
  }),

  http.get(`${BASE}/status`, () => {
    return HttpResponse.json({
      scenarioTime: '2026-10-10T09:00:00',
      speed: 1,
      overallSeverity: 'low',
      rain: { intensity: 'light', mmPerHour: 4, freshness: 'live', observedAt: '2026-10-10T09:00:00' },
      commsOverall: 'ok',
    });
  }),

  // ── Plans ─────────────────────────────────────────────────────
  http.get(`${BASE}/plan/current`, () => {
    return HttpResponse.json(MOCK_PLAN_V2);
  }),

  http.get(`${BASE}/plan/history`, () => {
    return HttpResponse.json([MOCK_PLAN_V1, MOCK_PLAN_V2, MOCK_PLAN_V3]);
  }),

  // ── Approvals ─────────────────────────────────────────────────
  http.get(`${BASE}/approvals`, () => {
    return HttpResponse.json(MOCK_APPROVALS);
  }),

  http.post(`${BASE}/approvals/:id/decision`, async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      approvalId: params.id,
      status: body['decision'] === 'approve' ? 'approved' : 'rejected',
      chosenOptionId: body['optionId'] ?? null,
      decidedBy: 'operator',
      decidedAt: new Date().toISOString().replace('Z', ''),
    });
  }),

  // ── Phone-in & SOS Intake ─────────────────────────────────────
  http.post(`${BASE}/incidents/phone-in`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const loc = (body['location'] as any) || { lat: 12.9279, lng: 77.6271, label: 'Sector 4, HSR Layout', zoneId: 'ZONE-B' };
    const newInc = {
      incidentId: `INC-SOS-${Math.floor(1000 + Math.random() * 9000)}`,
      type: (body['type'] as string) || 'flooded_home',
      status: 'reported',
      severity: 'critical',
      severityScore: 96,
      timeWindowMinutes: 20,
      location: {
        lat: loc.lat ?? 12.9279,
        lng: loc.lng ?? 77.6271,
        label: loc.label || 'Reported Flood Location',
        zoneId: loc.zoneId || 'ZONE-B',
      },
      peopleAffected: Number(body['peopleAffected'] || 2),
      language: (body['language'] as string) || 'en',
      source: 'sos_portal',
      summary: (body['note'] as string) || '🚨 Citizen SOS: Urgent rescue needed in flooded premises',
      confidence: 0.98,
      reportedAt: new Date().toISOString().replace('Z', ''),
      assignedUnitIds: [],
      reporterSessionId: null,
    };
    mockIncidents.unshift(newInc);
    return HttpResponse.json(newInc);
  }),

  // ── Crew ──────────────────────────────────────────────────────
  http.get(`${BASE}/crew/assignment`, ({ request }) => {
    const unitId = getUnitIdFromRequest(request) || 'AMB-01';
    const assignment = mockAssignmentsByUnit[unitId];
    return HttpResponse.json(assignment || null);
  }),

  // Dispatch trigger: creates or assigns a real mission tailored to the unit
  http.post(`${BASE}/crew/request-dispatch`, async ({ request }) => {
    const body = await request.json().catch(() => ({})) as { unitId?: string; incidentId?: string; incidentSummary?: string; location?: any; peopleAffected?: number; instructions?: string };
    const unitId = (body.unitId || getUnitIdFromRequest(request) || 'AMB-01').toUpperCase();
    const template = UNIT_MISSION_TEMPLATES[unitId] || UNIT_MISSION_TEMPLATES['AMB-01'];

    const targetIncident = mockIncidents.find((i) => i.incidentId === body.incidentId);
    if (targetIncident) {
      targetIncident.status = 'assigned';
      if (!targetIncident.assignedUnitIds.includes(unitId)) {
        targetIncident.assignedUnitIds.push(unitId);
      }
    }

    const newAssignment = {
      assignmentId: `ASN-${Math.floor(100 + Math.random() * 900)}`,
      planId: 'PLAN-002',
      incidentId: body.incidentId || targetIncident?.incidentId || `INC-00${Math.floor(1 + Math.random() * 9)}`,
      unitId,
      status: 'sent',
      incidentSummary: body.incidentSummary || targetIncident?.summary || template.summary,
      location: body.location || targetIncident?.location || template.location,
      peopleAffected: body.peopleAffected ?? targetIncident?.peopleAffected ?? template.peopleAffected,
      etaMinutes: template.eta,
      instructions: body.instructions || template.instructions,
      sentAt: new Date().toISOString(),
      respondedAt: null,
    };
    mockAssignmentsByUnit[unitId] = newAssignment;
    return HttpResponse.json(newAssignment);
  }),

  http.post(`${BASE}/crew/assignment/:id/respond`, async ({ request, params }) => {
    const body = await request.json() as { accept: boolean };
    const unitId = getUnitIdFromRequest(request);
    let targetUnitId = unitId;
    if (!targetUnitId) {
      targetUnitId = Object.keys(mockAssignmentsByUnit).find((k) => mockAssignmentsByUnit[k]?.assignmentId === params.id) || null;
    }

    if (targetUnitId && mockAssignmentsByUnit[targetUnitId]) {
      if (body.accept) {
        mockAssignmentsByUnit[targetUnitId] = {
          ...mockAssignmentsByUnit[targetUnitId],
          status: 'accepted',
          respondedAt: new Date().toISOString(),
        };
      } else {
        // Declined: remove assignment so unit returns to available standby
        delete mockAssignmentsByUnit[targetUnitId];
      }
    }
    return HttpResponse.json(targetUnitId && mockAssignmentsByUnit[targetUnitId] ? mockAssignmentsByUnit[targetUnitId] : { ok: true });
  }),

  http.post(`${BASE}/crew/status`, async ({ request }) => {
    const body = await request.json() as { action: string; clientRequestId?: string; unitId?: string; incidentId?: string };
    const unitId = body.unitId || getUnitIdFromRequest(request);
    let targetUnitId = unitId;
    if (!targetUnitId) {
      targetUnitId = Object.keys(mockAssignmentsByUnit)[0] || 'AMB-01';
    }

    if (body.action === 'task_complete') {
      // Mark the linked incident as resolved
      const completedAssignment = targetUnitId ? mockAssignmentsByUnit[targetUnitId] : null;
      const incidentIdToResolve = body.incidentId || completedAssignment?.incidentId;
      if (incidentIdToResolve) {
        const inc = mockIncidents.find((i) => i.incidentId === incidentIdToResolve);
        if (inc) {
          inc.status = 'resolved';
          inc.assignedUnitIds = [];
        }
      }
      // Return unit to standby
      if (targetUnitId) {
        delete mockAssignmentsByUnit[targetUnitId];
      }
    } else if (body.action === 'arrived') {
      if (targetUnitId && mockAssignmentsByUnit[targetUnitId]) {
        mockAssignmentsByUnit[targetUnitId].status = 'on_scene';
      }
      const asgn = targetUnitId ? mockAssignmentsByUnit[targetUnitId] : null;
      const incidentIdToUpdate = body.incidentId || asgn?.incidentId;
      if (incidentIdToUpdate) {
        const inc = mockIncidents.find((i) => i.incidentId === incidentIdToUpdate);
        if (inc) inc.status = 'on_scene';
      }
    } else if (body.action === 'en_route') {
      if (targetUnitId && mockAssignmentsByUnit[targetUnitId]) {
        mockAssignmentsByUnit[targetUnitId].status = 'en_route';
      }
      const asgn = targetUnitId ? mockAssignmentsByUnit[targetUnitId] : null;
      const incidentIdToUpdate = body.incidentId || asgn?.incidentId;
      if (incidentIdToUpdate) {
        const inc = mockIncidents.find((i) => i.incidentId === incidentIdToUpdate);
        if (inc) inc.status = 'en_route';
      }
    }
    return HttpResponse.json({ ok: true });
  }),

  http.post(`${BASE}/crew/problem`, () => {
    return HttpResponse.json({ ok: true });
  }),

  // ── Reports ───────────────────────────────────────────────────
  http.get(`${BASE}/reports/after-action`, () => {
    return HttpResponse.json(null);
  }),

  http.get(`${BASE}/comms/log`, () => {
    return HttpResponse.json([]);
  }),
];
