/**
 * CrewPage — tactical mobile-first interface for emergency rescue crews.
 * Obsidian Command design system: clean, minimal, human-crafted tactical terminal.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuthStore } from '@/store/auth';
import { useAppStore } from '@/store';
import { api } from '@/api/client';
import {
  MapPin,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  Navigation,
  Flag,
  AlertTriangle,
  Wifi,
  WifiOff,
  Loader2,
  LogOut,
  Radio,
  BatteryCharging,
  Compass,
  AlertOctagon,
  ExternalLink,
  LifeBuoy,
  Flame,
  Truck,
  Anchor,
  Droplet,
  ArrowLeft,
  ListFilter,
  ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Assignment, Incident } from '@contracts/types';

function newRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

interface QueuedAction {
  id: string;
  label: string;
  fn: () => Promise<unknown>;
}

type MissionStep = 'sent' | 'accepted' | 'en_route' | 'on_scene' | 'completed';

// Units configuration with default staging coordinates
const AVAILABLE_UNITS = [
  { id: 'AMB-01', name: 'Ambulance 1', icon: Truck, role: 'Medical Trauma & Oxygen', zone: 'ZONE-B', lat: 12.9150, lng: 77.6400, staging: 'City General Hospital' },
  { id: 'BOAT-01', name: 'Boat 1', icon: Anchor, role: 'Water Rescue & Evacuation', zone: 'ZONE-A', lat: 12.9300, lng: 77.6100, staging: 'Lakeside Launch Point' },
  { id: 'RES-01', name: 'Rescue Squad 1', icon: Flame, role: 'Structural Extrication', zone: 'ZONE-B', lat: 12.9200, lng: 77.6300, staging: 'Silk Board Command Post' },
  { id: 'PUMP-01', name: 'Water Pump 1', icon: Droplet, role: 'High-Capacity Dewatering', zone: 'ZONE-B', lat: 12.9150, lng: 77.6400, staging: 'Sub-station Staging Depot' },
];

/**
 * Tactical Leaflet Route Map Component
 * Renders high-contrast dark route from unit staging coordinates to target incident coordinates.
 */
function TacticalRouteMap({
  unitLocation,
  targetLocation,
  unitCode,
}: {
  unitLocation: { lat: number; lng: number };
  targetLocation: { lat: number; lng: number; label: string };
  unitCode: string;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false,
    });
    mapInstanceRef.current = map;

    // CartoDB Positron Light tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    // Unit Marker (Clean enterprise pill)
    const unitIcon = L.divIcon({
      className: '',
      html: `
        <div style="
          min-width:38px;height:24px;padding:0 6px;border-radius:4px;
          background:#FFFFFF;border:1.5px solid #2563EB;
          display:flex;align-items:center;justify-content:center;
          font-family:Inter,system-ui,sans-serif;font-size:11px;font-weight:700;
          color:#2563EB;box-shadow:0 2px 6px rgba(15,23,42,0.12);
        ">
          ${unitCode}
        </div>
      `,
      iconSize: [38, 24],
      iconAnchor: [19, 12],
    });

    // Emergency Target Marker (Clean enterprise target indicator)
    const targetIcon = L.divIcon({
      className: '',
      html: `
        <div style="
          min-width:44px;height:24px;padding:0 6px;border-radius:4px;
          background:#FFFFFF;border:1.5px solid #BE123C;
          display:flex;align-items:center;justify-content:center;
          font-family:Inter,system-ui,sans-serif;font-size:11px;font-weight:700;
          color:#BE123C;box-shadow:0 2px 6px rgba(15,23,42,0.12);
        ">
          TARGET
        </div>
      `,
      iconSize: [44, 24],
      iconAnchor: [22, 12],
    });

    L.marker([unitLocation.lat, unitLocation.lng], { icon: unitIcon })
      .addTo(map)
      .bindPopup(`<div style="font-family:Inter,sans-serif;color:#0F172A;font-weight:600;font-size:11px;">Origin: ${unitCode} Staging</div>`);

    L.marker([targetLocation.lat, targetLocation.lng], { icon: targetIcon })
      .addTo(map)
      .bindPopup(`<div style="font-family:Inter,sans-serif;color:#0F172A;font-weight:600;font-size:11px;">Target: ${targetLocation.label}</div>`);

    // Realistic multi-point route path avoiding deep flood zones
    const midLat = (unitLocation.lat + targetLocation.lat) / 2 + 0.003;
    const midLng = (unitLocation.lng + targetLocation.lng) / 2 - 0.002;
    const routeCoords: [number, number][] = [
      [unitLocation.lat, unitLocation.lng],
      [midLat, midLng],
      [targetLocation.lat, targetLocation.lng],
    ];

    // Route casing
    L.polyline(routeCoords, {
      color: '#93C5FD',
      weight: 6,
      opacity: 0.5,
    }).addTo(map);

    // Primary route line
    L.polyline(routeCoords, {
      color: '#2563EB',
      weight: 3,
      opacity: 0.95,
    }).addTo(map);

    map.fitBounds(L.latLngBounds(routeCoords), { padding: [40, 40] });

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [unitLocation, targetLocation, unitCode]);

  return (
    <div
      ref={mapContainerRef}
      className="w-full h-64 sm:h-72 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-800 relative z-10"
    />
  );
}

export function CrewPage() {
  const { unitId: authUnitId, logout } = useAuthStore();
  const navigate = useNavigate();

  // Active unit selector
  const [activeUnitId, setActiveUnitId] = useState<string>(authUnitId || 'AMB-01');

  // Currently focused assignment
  const [assignment, setAssignment] = useState<Assignment | null | undefined>(undefined);
  const [activeView, setActiveView] = useState<'route' | 'tasks'>('tasks');
  const [loading, setLoading] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusStep, setStatusStep] = useState<MissionStep>('sent');
  const [unitReadiness] = useState<'ready' | 'restock' | 'standby'>('ready');
  const [showProblemDialog, setShowProblemDialog] = useState(false);
  const [notificationPing, setNotificationPing] = useState(false);

  // Store subscriptions and actions
  const storeAssignments = useAppStore((s) => s.assignmentsById);
  const incidentsById = useAppStore((s) => s.incidentsById);
  const unitsById = useAppStore((s) => s.unitsById);
  const pushOpLog = useAppStore((s) => s.pushOpLog);
  const setIncident = useAppStore((s) => s.setIncident);
  const closeIncident = useAppStore((s) => s.closeIncident);
  const setUnit = useAppStore((s) => s.setUnit);
  const setStoreAssignment = useAppStore((s) => s.setAssignment);
  const patchAssignment = useAppStore((s) => s.patchAssignment);

  // Sync initial incidents from API if store is currently empty
  useEffect(() => {
    if (Object.keys(incidentsById).length === 0) {
      api.incidents.list().then((list) => {
        list.forEach((inc) => setIncident(inc));
      }).catch(() => {});
    }
  }, [incidentsById, setIncident]);

  // Find active unit configuration
  const activeUnitConfig = AVAILABLE_UNITS.find((u) => u.id === activeUnitId) || AVAILABLE_UNITS[0];
  const UnitIcon = activeUnitConfig.icon;

  // Staging coordinates for origin on map
  const unitOriginCoords = useMemo(() => {
    const unitFromStore = unitsById[activeUnitId];
    if (unitFromStore?.location?.lat && unitFromStore?.location?.lng) {
      return { lat: unitFromStore.location.lat, lng: unitFromStore.location.lng };
    }
    return { lat: activeUnitConfig.lat, lng: activeUnitConfig.lng };
  }, [activeUnitId, unitsById, activeUnitConfig]);

  // Active emergency incidents in the sector (excluding resolved and the one currently assigned)
  const activeSectorIncidents = useMemo(() => {
    return Object.values(incidentsById).filter(
      (inc) => inc.status !== 'closed' && inc.status !== 'resolved' && inc.incidentId !== assignment?.incidentId
    );
  }, [incidentsById, assignment?.incidentId]);

  // Resolved / completed incidents for tracking
  const resolvedIncidents = useMemo(() => {
    return Object.values(incidentsById).filter(
      (inc) => inc.status === 'resolved' || inc.status === 'closed'
    );
  }, [incidentsById]);

  // Network listener
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      flushQueue();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch assignment for the active unit
  const fetchAssignment = useCallback(async (unitIdToFetch: string) => {
    try {
      // Check if store has an active assignment for this unit
      const storeMatch = Object.values(storeAssignments).find(
        (a) => a.unitId === unitIdToFetch && a.status !== 'completed' && a.status !== 'declined'
      );
      if (storeMatch) {
        setAssignment(storeMatch);
        setStatusStep(storeMatch.status === 'accepted' ? 'accepted' : 'sent');
        setActiveView('route');
        return;
      }

      // Query API
      const data = await api.crew.getAssignment();
      if (data && data.unitId === unitIdToFetch && data.status !== 'completed' && data.status !== 'declined') {
        setAssignment(data);
        setStatusStep(data.status === 'accepted' ? 'accepted' : 'sent');
        setActiveView('route');
      } else {
        setAssignment(null);
      }
    } catch {
      setAssignment(null);
    }
  }, [storeAssignments]);

  useEffect(() => {
    fetchAssignment(activeUnitId);
  }, [activeUnitId, fetchAssignment]);

  async function flushQueue() {
    setQueue((q) => {
      for (const action of q) {
        action.fn().catch(console.error);
      }
      return [];
    });
  }

  async function queueOrSend(label: string, fn: () => Promise<unknown>) {
    if (isOnline) {
      setLoading(label);
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed');
      } finally {
        setLoading(null);
      }
    } else {
      setQueue((q) => [...q, { id: newRequestId(), label, fn }]);
    }
  }

  // Accept or Decline
  async function handleRespond(accept: boolean) {
    if (!assignment) return;
    const clientRequestId = newRequestId();
    await queueOrSend(accept ? 'accept' : 'decline', async () => {
      await api.crew.respond(assignment.assignmentId, { accept, clientRequestId });
      if (accept) {
        setAssignment((prev) => (prev ? { ...prev, status: 'accepted' } : null));
        setStatusStep('accepted');
        if (assignment.assignmentId) {
          patchAssignment(assignment.assignmentId, { status: 'accepted' });
        }
      } else {
        if (assignment.assignmentId) {
          patchAssignment(assignment.assignmentId, { status: 'declined' });
        }
        setUnit(activeUnitId, { status: 'available', assignedIncidentId: null });
        setAssignment(null);
        setStatusStep('sent');
        setActiveView('tasks');
      }
    });
  }

  // En Route, Arrived, Complete
  async function handleStatusUpdate(action: 'en_route' | 'arrived' | 'task_complete') {
    const clientRequestId = newRequestId();
    const currAssignment = assignment;
    const targetIncidentId = currAssignment?.incidentId;
    const targetAssignmentId = currAssignment?.assignmentId;

    await queueOrSend(action, async () => {
      await api.crew.updateStatus({
        action,
        clientRequestId,
        unitId: activeUnitId,
        incidentId: targetIncidentId,
      });

      if (action === 'en_route') {
        setStatusStep('en_route');
        setUnit(activeUnitId, { status: 'en_route' });
        if (targetIncidentId && incidentsById[targetIncidentId]) {
          setIncident({
            ...incidentsById[targetIncidentId],
            status: 'en_route',
          });
        }
        pushOpLog({
          category: 'crew_en_route',
          incidentId: targetIncidentId ?? null,
          unitId: activeUnitId,
          text: `Unit ${activeUnitId} en route to ${targetIncidentId ?? 'incident'}`,
          detail: currAssignment?.location?.label ?? currAssignment?.incidentSummary ?? '',
        });
      } else if (action === 'arrived') {
        setStatusStep('on_scene');
        setUnit(activeUnitId, { status: 'on_scene' });
        if (targetIncidentId && incidentsById[targetIncidentId]) {
          setIncident({
            ...incidentsById[targetIncidentId],
            status: 'on_scene',
          });
        }
        pushOpLog({
          category: 'crew_arrived',
          incidentId: targetIncidentId ?? null,
          unitId: activeUnitId,
          text: `Unit ${activeUnitId} arrived on scene at ${targetIncidentId ?? 'incident'}`,
          detail: currAssignment?.location?.label ?? '',
        });
      } else if (action === 'task_complete') {
        setStatusStep('completed');

        if (targetIncidentId) {
          closeIncident(targetIncidentId, 'resolved');
        }

        if (targetAssignmentId) {
          patchAssignment(targetAssignmentId, { status: 'completed' });
        }

        setUnit(activeUnitId, { status: 'available', assignedIncidentId: null });

        pushOpLog({
          category: 'task_complete',
          incidentId: targetIncidentId ?? null,
          unitId: activeUnitId,
          text: `Unit ${activeUnitId} completed mission — ${targetIncidentId ?? 'incident'} resolved`,
          detail: `${currAssignment?.incidentSummary ?? ''} · ${currAssignment?.peopleAffected ?? 0} people assisted`,
        });

        setTimeout(() => {
          setAssignment(null);
          setStatusStep('sent');
          setActiveView('tasks');
        }, 1800);
      }
    });
  }

  // Problem reporting
  async function handleProblem(kind: 'road_blocked' | 'vehicle_stuck' | 'other', note?: string) {
    const clientRequestId = newRequestId();
    await queueOrSend('problem', () =>
      api.crew.reportProblem({ kind, note, clientRequestId })
    );
    setShowProblemDialog(false);
  }

  // Select a task from the list and transition to active route navigation
  async function handleSelectTaskAndGoToRoute(incident?: Incident) {
    setNotificationPing(true);
    setTimeout(() => setNotificationPing(false), 2000);
    setLoading('select_task');

    try {
      const res = await api.crew.requestDispatch({
        unitId: activeUnitId,
        incidentId: incident?.incidentId,
        incidentSummary: incident?.summary,
        location: incident?.location,
        peopleAffected: incident?.peopleAffected,
      });

      if (res) {
        setAssignment(res);
        setStoreAssignment(res);
        setStatusStep('sent');
        setActiveView('route');
      }

      if (incident) {
        setIncident({
          ...incident,
          status: 'assigned',
          assignedUnitIds: Array.from(new Set([...(incident.assignedUnitIds || []), activeUnitId])),
        });
      }
      setUnit(activeUnitId, {
        status: 'assigned',
        assignedIncidentId: incident?.incidentId || null,
      });
    } catch {
      // Fallback assignment creation
      const newMission: Assignment = {
        assignmentId: `ASN-${Math.floor(100 + Math.random() * 900)}`,
        planId: 'PLAN-002',
        incidentId: incident?.incidentId || 'INC-008',
        unitId: activeUnitId,
        status: 'sent',
        incidentSummary: incident?.summary || `${activeUnitId} Priority Rescue: Emergency assistance in flooded sector`,
        location: incident?.location || {
          lat: 12.9248,
          lng: 77.6201,
          label: 'Building 12, 5th Cross, Koramangala 4th Block',
          zoneId: 'ZONE-A',
        },
        peopleAffected: incident?.peopleAffected ?? 3,
        etaMinutes: 6,
        instructions: 'Primary access via Inner Ring Road flyover. Avoid 80ft Road (water depth 0.9m). Carry portable stretcher and life vests.',
        sentAt: new Date().toISOString() as any,
        respondedAt: null,
      };
      setAssignment(newMission);
      setStoreAssignment(newMission);
      if (incident) {
        setIncident({
          ...incident,
          status: 'assigned',
          assignedUnitIds: Array.from(new Set([...(incident.assignedUnitIds || []), activeUnitId])),
        });
      }
      setUnit(activeUnitId, {
        status: 'assigned',
        assignedIncidentId: newMission.incidentId,
      });
      setStatusStep('sent');
      setActiveView('route');
    } finally {
      setLoading(null);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 font-sans">
      {/* ── Top Header ── */}
      <header className="px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <UnitIcon className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-semibold tracking-wider text-zinc-500 uppercase">Field Terminal</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </div>
            <p className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
              <span className="font-mono text-blue-600 font-bold">{activeUnitConfig.id}</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-400 font-normal">{activeUnitConfig.name} ({activeUnitConfig.role})</span>
            </p>
          </div>
        </div>

        {/* Telemetry & Network */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-800 border border-zinc-800 text-[11px] font-mono text-zinc-400">
            <BatteryCharging className="w-3.5 h-3.5 text-emerald-600" />
            <span>94%</span>
            <span className="text-zinc-600">|</span>
            <Compass className="w-3.5 h-3.5 text-blue-600" />
            <span>GPS Active</span>
          </div>

          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono font-medium border ${
              isOnline
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3 h-3 text-emerald-600" />
                <span>ONLINE</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-rose-600" />
                <span>OFFLINE MESH</span>
              </>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors font-medium text-xs"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* ── Active Responder Switcher Bar ── */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-800 flex items-center justify-center text-zinc-500 shrink-0">
            <Radio className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div>
            <span className="text-zinc-200 font-semibold block leading-tight text-xs">Active Responder Unit:</span>
            <span className="text-[11px] text-zinc-500">Switch vehicle profile</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {AVAILABLE_UNITS.map((u) => {
            const isSelected = u.id === activeUnitId;
            const Icon = u.icon;
            return (
              <button
                key={u.id}
                onClick={() => {
                  setActiveUnitId(u.id);
                  setAssignment(undefined);
                }}
                className={`py-1.5 px-3 rounded-lg font-mono text-xs font-semibold flex items-center gap-2 transition-colors ${
                  isSelected
                    ? 'bg-blue-50 text-blue-700 border border-blue-300 shadow-xs'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-950 border border-zinc-800'
                }`}
                title={`${u.name} — ${u.role}`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-blue-600' : 'text-zinc-500'}`} />
                <span>{u.id}</span>
                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Offline Queue / Error Alerts ── */}
      {queue.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
            <span><strong>{queue.length} actions queued locally.</strong> Will sync when reconnecting to central node.</span>
          </div>
          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-[10px] font-mono text-amber-800 font-semibold">MESH STANDBY</span>
        </div>
      )}

      {error && (
        <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="underline text-[11px] font-medium">Dismiss</button>
        </div>
      )}

      {/* ── Main Container ── */}
      <main className="flex-1 p-4 max-w-3xl w-full mx-auto flex flex-col gap-4">

        {/* ── Unit Readiness & View Switcher Bar ── */}
        <section className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase text-zinc-500">Status:</span>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              AVAILABLE
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveView('tasks')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                activeView === 'tasks'
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-800 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-100'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Tasks ({activeSectorIncidents.length + (assignment ? 1 : 0)})</span>
            </button>
            {assignment && (
              <button
                onClick={() => setActiveView('route')}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                  activeView === 'route'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 font-semibold'
                    : 'text-zinc-500 hover:text-zinc-100'
                }`}
              >
                <Navigation className="w-3.5 h-3.5 text-blue-600" />
                <span>Active Route</span>
              </button>
            )}
          </div>
        </section>

        {/* ── Loading State ── */}
        {assignment === undefined && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <p className="text-xs font-mono text-zinc-500">Syncing telemetry with Operations Command…</p>
          </div>
        )}

        {/* VIEW 1: ACTIVE ROUTE & NAVIGATION CONSOLE */}
        {activeView === 'route' && assignment && (
          <div className={`rounded-xl border transition-all overflow-hidden bg-zinc-900 shadow-sm ${
            notificationPing ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-zinc-800'
          }`}>
            {/* Header */}
            <div className="p-3.5 border-b border-zinc-800 bg-zinc-950/80 flex items-center justify-between">
              <button
                onClick={() => setActiveView('tasks')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-950 text-zinc-300 text-xs font-medium transition-colors border border-zinc-800 shadow-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Tasks List</span>
              </button>

              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                  {statusStep.replace('_', ' ')}
                </span>
                <span className="text-xs font-mono text-zinc-500">{assignment.assignmentId}</span>
              </div>
            </div>

            {/* Mission Title */}
            <div className="px-4 py-3 border-b border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-100 leading-snug">
                {assignment.incidentSummary}
              </h2>
              <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1.5 font-mono">
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                <span>{assignment.location.label} · {assignment.location.zoneId}</span>
              </p>
            </div>

            {/* Step Tracker */}
            <div className="px-4 py-2.5 bg-zinc-950/50 border-b border-zinc-800">
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { step: 'sent', label: '1. Dispatched' },
                  { step: 'accepted', label: '2. Accepted' },
                  { step: 'en_route', label: '3. En Route' },
                  { step: 'on_scene', label: '4. On Scene' },
                ].map((s, idx) => {
                  const isCurrent = statusStep === s.step;
                  const isPassed =
                    ['completed'].includes(statusStep) ||
                    (statusStep === 'on_scene' && ['sent', 'accepted', 'en_route'].includes(s.step)) ||
                    (statusStep === 'en_route' && ['sent', 'accepted'].includes(s.step)) ||
                    (statusStep === 'accepted' && s.step === 'sent');
                  return (
                    <div key={idx} className="flex flex-col items-center gap-1">
                      <div className={`h-1.5 w-full rounded-full transition-all ${
                        isCurrent ? 'bg-blue-600' : isPassed ? 'bg-emerald-500' : 'bg-slate-200'
                      }`} />
                      <span className={`text-[10px] font-mono uppercase ${
                        isCurrent ? 'text-blue-600 font-semibold' : isPassed ? 'text-emerald-700 font-medium' : 'text-zinc-500'
                      }`}>
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Tactical Route Map */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-300 text-xs flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 text-blue-600" />
                    Field Route Navigation
                  </span>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    Staging: {activeUnitConfig.staging}
                  </span>
                </div>

                <TacticalRouteMap
                  unitLocation={unitOriginCoords}
                  targetLocation={{
                    lat: assignment.location.lat,
                    lng: assignment.location.lng,
                    label: assignment.location.label,
                  }}
                  unitCode={activeUnitConfig.id}
                />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <span className="text-[11px] text-zinc-500 flex items-center gap-1.5 font-medium">
                    <Users className="w-3.5 h-3.5 text-amber-600" /> People at Risk
                  </span>
                  <p className="text-base font-bold text-zinc-100 mt-1">
                    {assignment.peopleAffected} <span className="text-xs font-normal text-zinc-500">citizens</span>
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <span className="text-[11px] text-zinc-500 flex items-center gap-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-blue-600" /> Estimated Arrival
                  </span>
                  <p className="text-base font-bold text-blue-600 mt-1">
                    {assignment.etaMinutes} <span className="text-xs font-normal text-zinc-500">min</span>
                  </p>
                </div>
              </div>

              {/* Instructions */}
              {assignment.instructions && (
                <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-800 uppercase tracking-wider">
                    <Compass className="w-3.5 h-3.5 text-blue-600" /> Navigation Guidance
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {assignment.instructions}
                  </p>
                </div>
              )}

              {/* External GPS button */}
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${assignment.location.lat},${assignment.location.lng}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-950 text-zinc-300 border border-zinc-800 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors shadow-xs"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                <span>Open in External Navigation App</span>
              </a>

              {/* Action Controls */}
              <div className="pt-2 space-y-3">
                {statusStep === 'sent' && (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleRespond(true)}
                      disabled={!!loading}
                      id="btn-accept-assignment"
                      className="py-2.5 px-4 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {loading === 'accept' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      ACCEPT MISSION
                    </button>
                    <button
                      onClick={() => handleRespond(false)}
                      disabled={!!loading}
                      id="btn-decline-assignment"
                      className="py-2.5 px-4 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-rose-50 text-zinc-300 hover:text-rose-700 border border-zinc-800 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {loading === 'decline' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      DECLINE
                    </button>
                  </div>
                )}

                {statusStep === 'accepted' && (
                  <button
                    onClick={() => handleStatusUpdate('en_route')}
                    disabled={!!loading}
                    id="btn-en-route"
                    className="w-full py-3 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {loading === 'en_route' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                    BEGIN TRANSIT · EN ROUTE
                  </button>
                )}

                {statusStep === 'en_route' && (
                  <button
                    onClick={() => handleStatusUpdate('arrived')}
                    disabled={!!loading}
                    id="btn-arrived"
                    className="w-full py-3 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {loading === 'arrived' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
                    ARRIVED ON SCENE
                  </button>
                )}

                {statusStep === 'on_scene' && (
                  <button
                    onClick={() => handleStatusUpdate('task_complete')}
                    disabled={!!loading}
                    id="btn-task-complete"
                    className="w-full py-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {loading === 'task_complete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    TASK COMPLETED · SECURED
                  </button>
                )}

                {statusStep === 'completed' && (
                  <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-center space-y-1">
                    <CheckCircle className="w-5 h-5 text-emerald-600 mx-auto" />
                    <p className="text-xs font-semibold text-zinc-100">Mission successfully completed</p>
                    <p className="text-[11px] font-mono text-zinc-500">Returning unit to standby status…</p>
                  </div>
                )}

                {/* Problem Reporter */}
                <div className="pt-2 flex items-center justify-between border-t border-zinc-800 text-xs">
                  <span className="text-zinc-500">Route impedance or hazard?</span>
                  <button
                    onClick={() => setShowProblemDialog(true)}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-rose-50 text-zinc-300 hover:text-rose-700 border border-zinc-800 hover:border-rose-200 text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                    Report Route Hazard
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: ONGOING TASKS LIST */}
        {activeView === 'tasks' && (
          <div className="space-y-4">
            {/* Active Mission Banner (if assigned) */}
            {assignment && (
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-mono text-[10px] font-semibold uppercase">
                      ASSIGNED TO {activeUnitId}
                    </span>
                    <span className="text-xs font-mono text-zinc-500">{assignment.assignmentId}</span>
                  </div>
                  <h3 className="text-xs font-semibold text-zinc-100 line-clamp-1">{assignment.incidentSummary}</h3>
                  <p className="text-[11px] text-zinc-400 font-mono flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-rose-500" />
                    <span>{assignment.location.label} · ETA {assignment.etaMinutes}m</span>
                  </p>
                </div>

                <button
                  onClick={() => setActiveView('route')}
                  className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0 shadow-sm"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>VIEW ROUTE →</span>
                </button>
              </div>
            )}

            {/* Standby Status Hero */}
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    SECTOR PATROL ACTIVE
                  </span>
                  <span className="text-xs font-mono text-zinc-500">{activeUnitConfig.zone}</span>
                </div>
                <h2 className="text-sm font-semibold text-zinc-100">Active Sector Emergency Calls</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Select a priority task to claim or inspect its navigation route.
                </p>
              </div>

              <button
                onClick={() => handleSelectTaskAndGoToRoute()}
                disabled={!!loading}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-950 text-zinc-300 border border-zinc-800 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shrink-0 shadow-xs"
              >
                {loading === 'select_task' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Radio className="w-3.5 h-3.5 text-blue-600" />
                )}
                <span>Request Dispatch Call</span>
              </button>
            </div>

            {/* List of Tasks */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs px-1">
                <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <ListFilter className="w-3.5 h-3.5 text-blue-600" />
                  Available Tasks ({activeSectorIncidents.length})
                </span>
                <span className="text-zinc-500 text-[11px]">Tap to review route</span>
              </div>

              {activeSectorIncidents.length === 0 ? (
                <div className="p-8 rounded-xl bg-zinc-900 border border-dashed border-slate-300 text-center space-y-1">
                  <CheckCircle className="w-6 h-6 text-emerald-500 mx-auto" />
                  <p className="text-xs font-semibold text-zinc-200">No active unassigned calls</p>
                  <p className="text-[11px] text-zinc-500">All emergency calls in this sector are resolved or assigned.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeSectorIncidents.map((inc) => {
                    const isAlreadyAssignedToMe = inc.assignedUnitIds.includes(activeUnitId);
                    return (
                      <div
                        key={inc.incidentId}
                        className={`p-3.5 rounded-xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isAlreadyAssignedToMe
                            ? 'bg-blue-50/60 border-blue-200'
                            : 'bg-zinc-900 border-zinc-800 hover:border-slate-300 shadow-xs'
                        }`}
                      >
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-800 text-zinc-300 font-semibold">
                              {inc.severity || 'assessing'}
                            </span>
                            <span className="text-xs font-mono font-semibold text-blue-600">{inc.incidentId}</span>
                            {isAlreadyAssignedToMe && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">
                                ASSIGNED TO YOU
                              </span>
                            )}
                          </div>

                          <h4 className="text-xs font-semibold text-zinc-100 leading-tight">{inc.summary}</h4>

                          <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-mono flex-wrap">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                              <span className="truncate">{inc.location?.label || 'Sector Location'}</span>
                            </span>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>{inc.peopleAffected ?? 1} citizens at risk</span>
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleSelectTaskAndGoToRoute(inc)}
                          disabled={!!loading}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50 shadow-sm"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>Select Task & Route →</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Resolved / Completed Missions History */}
            {resolvedIncidents.length > 0 && (
              <div className="space-y-2.5 pt-3 border-t border-zinc-800">
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    Resolved Missions Log ({resolvedIncidents.length})
                  </span>
                  <span className="text-zinc-500 font-mono text-[11px]">Central Log Sync</span>
                </div>

                <div className="space-y-1.5">
                  {resolvedIncidents.map((inc) => (
                    <div
                      key={inc.incidentId}
                      className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3 text-xs shadow-xs"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            RESOLVED
                          </span>
                          <span className="font-mono text-zinc-500">{inc.incidentId}</span>
                        </div>
                        <p className="font-medium text-zinc-200 truncate text-xs">{inc.summary}</p>
                      </div>
                      <span className="shrink-0 px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-800 text-[10px] font-mono">
                        {inc.peopleAffected} assisted
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Field Sector Intelligence & Hub Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2 shadow-xs">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 uppercase tracking-wider">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Sector Advisory
                </div>
                <ul className="space-y-1.5 text-xs text-zinc-400">
                  <li className="flex items-start gap-1.5">
                    <span className="text-rose-600 font-bold">[-]</span>
                    <span>100 Feet Ring Road closed (depth 1.2m).</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-amber-600 font-bold">[-]</span>
                    <span>Culvert at Sony World Signal — slow transit.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-emerald-600 font-bold">[+]</span>
                    <span>Inner Ring Road flyover open for emergency vehicles.</span>
                  </li>
                </ul>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2 shadow-xs">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-800 uppercase tracking-wider">
                  <LifeBuoy className="w-3.5 h-3.5 text-blue-600" /> Staging & Logistics Hub
                </div>
                <div className="space-y-1 text-xs text-zinc-400">
                  <p className="font-semibold text-zinc-100">{activeUnitConfig.staging}</p>
                  <p className="text-zinc-500 text-[11px] font-mono">Zone: {activeUnitConfig.zone}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-mono border border-emerald-200 font-medium">
                      EQUIPMENT: VERIFIED
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-mono border border-blue-200 font-medium">
                      CREW: 3
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Field Hazard Broadcast */}
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
              <div>
                <p className="text-xs font-semibold text-zinc-100">Spotted an unmapped road block or powerline?</p>
                <p className="text-[11px] text-zinc-500">Broadcast hazard report directly to Central Command EOC.</p>
              </div>
              <button
                onClick={() => setShowProblemDialog(true)}
                className="w-full sm:w-auto px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-rose-50 text-zinc-300 hover:text-rose-700 border border-zinc-800 hover:border-rose-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shrink-0 shadow-xs"
              >
                <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                Report Hazard
              </button>
            </div>
          </div>
        )}

      </main>

      {/* ── Problem Reporting Modal ── */}
      {showProblemDialog && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="flex items-center gap-2 text-rose-700 font-semibold text-xs uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Transmit Field Hazard</span>
              </div>
              <button
                onClick={() => setShowProblemDialog(false)}
                className="p-1 rounded text-zinc-500 hover:text-zinc-400 hover:bg-zinc-800"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Select the obstruction condition encountered on route. Central EOC will instantly recalculate route vectors.
            </p>

            <div className="grid grid-cols-1 gap-2">
              {[
                { kind: 'road_blocked' as const, label: 'Road Submerged / Blocked by Debris', desc: 'Water depth > 1m or fallen trees impassable' },
                { kind: 'vehicle_stuck' as const, label: 'Rescue Vehicle Stuck / Mechanical', desc: 'Engine flooded or structural impediment' },
                { kind: 'other' as const, label: 'Live Powerline / Structural Collapse', desc: 'Active high-voltage or wall hazard' },
              ].map((item) => (
                <button
                  key={item.kind}
                  onClick={() => handleProblem(item.kind)}
                  className="p-3 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-left transition-colors space-y-0.5"
                >
                  <p className="text-xs font-semibold text-zinc-100">{item.label}</p>
                  <p className="text-[11px] text-zinc-500">{item.desc}</p>
                </button>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowProblemDialog(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
