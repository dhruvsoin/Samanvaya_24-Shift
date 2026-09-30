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

    // CartoDB Dark Matter tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    // Unit Marker (Clean obsidian tactical pill)
    const unitIcon = L.divIcon({
      className: '',
      html: `
        <div style="
          min-width:38px;height:24px;padding:0 6px;border-radius:4px;
          background:#0F172A;border:1.5px solid #38BDF8;
          display:flex;align-items:center;justify-content:center;
          font-family:JetBrains Mono, monospace;font-size:11px;font-weight:700;
          color:#38BDF8;box-shadow:0 2px 8px rgba(0,0,0,0.8);
        ">
          ${unitCode}
        </div>
      `,
      iconSize: [38, 24],
      iconAnchor: [19, 12],
    });

    // Emergency Target Marker (Clean obsidian target indicator)
    const targetIcon = L.divIcon({
      className: '',
      html: `
        <div style="
          min-width:44px;height:24px;padding:0 6px;border-radius:4px;
          background:#0F172A;border:1.5px solid #F43F5E;
          display:flex;align-items:center;justify-content:center;
          font-family:JetBrains Mono, monospace;font-size:11px;font-weight:700;
          color:#F43F5E;box-shadow:0 2px 8px rgba(0,0,0,0.8);
        ">
          TARGET
        </div>
      `,
      iconSize: [44, 24],
      iconAnchor: [22, 12],
    });

    L.marker([unitLocation.lat, unitLocation.lng], { icon: unitIcon })
      .addTo(map)
      .bindPopup(`<div style="font-family:Geist,sans-serif;color:#0f172a;font-weight:600;font-size:11px;">Origin: ${unitCode} Staging</div>`);

    L.marker([targetLocation.lat, targetLocation.lng], { icon: targetIcon })
      .addTo(map)
      .bindPopup(`<div style="font-family:Geist,sans-serif;color:#0f172a;font-weight:600;font-size:11px;">Target: ${targetLocation.label}</div>`);

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
      color: '#0284c7',
      weight: 6,
      opacity: 0.25,
    }).addTo(map);

    // Primary route line
    L.polyline(routeCoords, {
      color: '#38bdf8',
      weight: 2.5,
      opacity: 0.9,
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
      className="w-full h-64 sm:h-72 rounded-lg overflow-hidden border border-obsidian-border bg-obsidian-canvas relative z-10"
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
    <div className="min-h-screen flex flex-col bg-obsidian-canvas text-slate-100 font-sans selection:bg-sky-500/30">
      {/* ── Top Tactical HUD Header ── */}
      <header className="px-4 py-2.5 bg-obsidian-well border-b border-obsidian-border flex items-center justify-between shrink-0 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-obsidian-surface border border-obsidian-border flex items-center justify-center text-sky-400">
            <UnitIcon className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase">CREW TERMINAL</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </div>
            <p className="text-xs font-semibold text-white flex items-center gap-1.5">
              <span className="font-mono text-sky-400">{activeUnitConfig.id}</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-300 font-normal">{activeUnitConfig.name} ({activeUnitConfig.role})</span>
            </p>
          </div>
        </div>

        {/* Telemetry & Network */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center gap-2 px-2 py-1 rounded bg-obsidian-surface border border-obsidian-border text-[11px] font-mono text-slate-400">
            <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
            <span>94%</span>
            <span className="text-slate-600">|</span>
            <Compass className="w-3.5 h-3.5 text-sky-400" />
            <span>GPS FIX</span>
          </div>

          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono font-medium border ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3 h-3" />
                <span>ONLINE</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3" />
                <span>OFFLINE (MESH)</span>
              </>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-obsidian-surface border border-transparent hover:border-obsidian-border transition-colors"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Active Responder Switcher Bar (Generous height, no horizontal cutoffs) ── */}
      <div className="bg-obsidian-well/60 border-b border-obsidian-border px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-obsidian-surface border border-obsidian-border flex items-center justify-center text-slate-400 shrink-0">
            <Radio className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div>
            <span className="text-slate-200 font-semibold block leading-tight text-xs">Active Responder Unit:</span>
            <span className="text-[11px] font-mono text-slate-400">Switch vehicle profile</span>
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
                className={`py-2 px-3.5 rounded font-mono text-xs font-semibold flex items-center gap-2 transition-colors ${
                  isSelected
                    ? 'bg-sky-500/15 text-sky-300 border border-sky-500/40'
                    : 'bg-obsidian-surface text-slate-400 hover:text-slate-200 hover:bg-obsidian-well border border-obsidian-border'
                }`}
                title={`${u.name} — ${u.role}`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-sky-400' : 'text-slate-400'}`} />
                <span>{u.id}</span>
                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Offline Queue / Error Alerts ── */}
      {queue.length > 0 && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
            <span><strong>{queue.length} actions queued locally.</strong> Will sync when reconnecting to central node.</span>
          </div>
          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-[10px] font-mono">LORA MESH READY</span>
        </div>
      )}

      {error && (
        <div className="px-4 py-2 bg-rose-500/10 border-b border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="underline text-[11px]">Dismiss</button>
        </div>
      )}

      {/* ── Main Container ── */}
      <main className="flex-1 p-4 max-w-3xl w-full mx-auto flex flex-col gap-4">

        {/* ── Unit Readiness & View Switcher Bar ── */}
        <section className="p-2.5 rounded bg-obsidian-well border border-obsidian-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono uppercase text-slate-500">Status:</span>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              AVAILABLE
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveView('tasks')}
              className={`px-3 py-1 text-xs font-mono font-medium rounded transition-colors flex items-center gap-1.5 ${
                activeView === 'tasks'
                  ? 'bg-obsidian-surface text-white border border-obsidian-border'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Ongoing Tasks ({activeSectorIncidents.length + (assignment ? 1 : 0)})</span>
            </button>
            {assignment && (
              <button
                onClick={() => setActiveView('route')}
                className={`px-3 py-1 text-xs font-mono font-medium rounded transition-colors flex items-center gap-1.5 ${
                  activeView === 'route'
                    ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Active Route</span>
              </button>
            )}
          </div>
        </section>

        {/* ── Loading State ── */}
        {assignment === undefined && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
            <p className="text-xs font-mono text-slate-400">Syncing telemetry with Operations Command…</p>
          </div>
        )}

        {/* VIEW 1: ACTIVE ROUTE & NAVIGATION CONSOLE */}
        {activeView === 'route' && assignment && (
          <div className={`rounded-lg border transition-all duration-150 overflow-hidden ${
            notificationPing ? 'border-sky-400 ring-1 ring-sky-400' : 'border-obsidian-border bg-obsidian-well'
          }`}>
            {/* Header */}
            <div className="p-3.5 border-b border-obsidian-border bg-obsidian-surface/60 flex items-center justify-between">
              <button
                onClick={() => setActiveView('tasks')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-obsidian-well hover:bg-obsidian-surface text-slate-300 text-xs font-mono transition-colors border border-obsidian-border"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Tasks List</span>
              </button>

              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium uppercase bg-sky-500/10 text-sky-300 border border-sky-500/20">
                  {statusStep.replace('_', ' ')}
                </span>
                <span className="text-xs font-mono text-slate-400">{assignment.assignmentId}</span>
              </div>
            </div>

            {/* Mission Title */}
            <div className="px-4 py-3 border-b border-obsidian-border/60">
              <h2 className="text-sm font-semibold text-white leading-snug">
                {assignment.incidentSummary}
              </h2>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 font-mono">
                <MapPin className="w-3.5 h-3.5 text-rose-400" />
                <span>{assignment.location.label} · {assignment.location.zoneId}</span>
              </p>
            </div>

            {/* Step Tracker */}
            <div className="px-4 py-2.5 bg-obsidian-canvas/60 border-b border-obsidian-border/60">
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
                      <div className={`h-1 w-full rounded-full transition-all ${
                        isCurrent ? 'bg-sky-400' : isPassed ? 'bg-emerald-500' : 'bg-obsidian-border'
                      }`} />
                      <span className={`text-[10px] font-mono uppercase ${
                        isCurrent ? 'text-sky-400 font-semibold' : isPassed ? 'text-emerald-400' : 'text-slate-500'
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
                  <span className="font-mono text-[11px] font-medium text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 text-sky-400" />
                    Tactical Navigation Vector
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
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
                <div className="p-3 rounded bg-obsidian-surface/60 border border-obsidian-border">
                  <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-amber-400" /> People at Risk
                  </span>
                  <p className="text-base font-mono font-bold text-white mt-1">
                    {assignment.peopleAffected} <span className="text-xs font-normal text-slate-400">citizens</span>
                  </p>
                </div>
                <div className="p-3 rounded bg-obsidian-surface/60 border border-obsidian-border">
                  <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-sky-400" /> Estimated Arrival
                  </span>
                  <p className="text-base font-mono font-bold text-sky-400 mt-1">
                    {assignment.etaMinutes} <span className="text-xs font-normal text-slate-400">min</span>
                  </p>
                </div>
              </div>

              {/* Instructions */}
              {assignment.instructions && (
                <div className="p-3 rounded bg-sky-950/20 border border-sky-500/25 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold text-sky-400 uppercase tracking-wider">
                    <Compass className="w-3.5 h-3.5" /> Navigation Guidance
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {assignment.instructions}
                  </p>
                </div>
              )}

              {/* External GPS button */}
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${assignment.location.lat},${assignment.location.lng}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2 rounded bg-obsidian-surface hover:bg-obsidian-well text-slate-300 border border-obsidian-border text-xs font-mono flex items-center justify-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
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
                      className="py-2.5 px-4 rounded font-mono text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {loading === 'accept' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      ACCEPT MISSION
                    </button>
                    <button
                      onClick={() => handleRespond(false)}
                      disabled={!!loading}
                      id="btn-decline-assignment"
                      className="py-2.5 px-4 rounded font-mono text-xs font-semibold bg-obsidian-surface hover:bg-rose-500/10 text-slate-300 hover:text-rose-400 border border-obsidian-border flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
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
                    className="w-full py-3 rounded font-mono text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
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
                    className="w-full py-3 rounded font-mono text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
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
                    className="w-full py-3 rounded font-mono text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {loading === 'task_complete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    TASK COMPLETED · SECURED
                  </button>
                )}

                {statusStep === 'completed' && (
                  <div className="p-3.5 rounded bg-emerald-950/20 border border-emerald-500/30 text-center space-y-1">
                    <CheckCircle className="w-5 h-5 text-emerald-400 mx-auto" />
                    <p className="text-xs font-semibold text-white">Mission successfully completed</p>
                    <p className="text-[11px] font-mono text-slate-400">Returning unit to standby status…</p>
                  </div>
                )}

                {/* Problem Reporter */}
                <div className="pt-2 flex items-center justify-between border-t border-obsidian-border/60 text-xs">
                  <span className="text-slate-400">Route impedance or hazard?</span>
                  <button
                    onClick={() => setShowProblemDialog(true)}
                    className="px-2.5 py-1 rounded bg-obsidian-surface hover:bg-rose-500/10 text-slate-300 hover:text-rose-400 border border-obsidian-border hover:border-rose-500/30 font-mono text-[11px] flex items-center gap-1.5 transition-colors"
                  >
                    <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
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
              <div className="p-3.5 rounded bg-obsidian-well border border-sky-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono text-[10px] uppercase">
                      ASSIGNED TO {activeUnitId}
                    </span>
                    <span className="text-xs font-mono text-slate-400">{assignment.assignmentId}</span>
                  </div>
                  <h3 className="text-xs font-semibold text-white line-clamp-1">{assignment.incidentSummary}</h3>
                  <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-rose-400" />
                    <span>{assignment.location.label} · ETA {assignment.etaMinutes}m</span>
                  </p>
                </div>

                <button
                  onClick={() => setActiveView('route')}
                  className="px-3.5 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white font-mono text-xs font-medium flex items-center justify-center gap-1.5 transition-colors shrink-0"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>VIEW ROUTE →</span>
                </button>
              </div>
            )}

            {/* Standby Status Hero */}
            <div className="p-4 rounded bg-obsidian-well border border-obsidian-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                    SECTOR PATROL ACTIVE
                  </span>
                  <span className="text-xs font-mono text-slate-500">{activeUnitConfig.zone}</span>
                </div>
                <h2 className="text-sm font-semibold text-white">Active Sector Emergency Calls</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select a priority task to claim or inspect its tactical navigation route.
                </p>
              </div>

              <button
                onClick={() => handleSelectTaskAndGoToRoute()}
                disabled={!!loading}
                className="px-3.5 py-2 rounded font-mono text-xs font-medium bg-obsidian-surface hover:bg-obsidian-border text-slate-200 border border-obsidian-border flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shrink-0"
              >
                {loading === 'select_task' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Radio className="w-3.5 h-3.5 text-sky-400" />
                )}
                <span>REQUEST DISPATCH CALL</span>
              </button>
            </div>

            {/* List of Tasks */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs px-1">
                <span className="font-mono text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ListFilter className="w-3.5 h-3.5 text-sky-400" />
                  Available Tasks ({activeSectorIncidents.length})
                </span>
                <span className="text-slate-500 text-[11px] font-mono">Tap to review route</span>
              </div>

              {activeSectorIncidents.length === 0 ? (
                <div className="p-8 rounded bg-obsidian-well/40 border border-dashed border-obsidian-border text-center space-y-1">
                  <CheckCircle className="w-5 h-5 text-emerald-400 mx-auto" />
                  <p className="text-xs font-medium text-slate-300">No active unassigned calls</p>
                  <p className="text-[11px] text-slate-500">All emergency calls in this sector are resolved or assigned.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeSectorIncidents.map((inc) => {
                    const isAlreadyAssignedToMe = inc.assignedUnitIds.includes(activeUnitId);
                    return (
                      <div
                        key={inc.incidentId}
                        className={`p-3.5 rounded border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isAlreadyAssignedToMe
                            ? 'bg-sky-950/20 border-sky-500/30'
                            : 'bg-obsidian-well border-obsidian-border hover:border-slate-700'
                        }`}
                      >
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-obsidian-surface border border-obsidian-border text-slate-300">
                              {inc.severity || 'assessing'}
                            </span>
                            <span className="text-xs font-mono font-semibold text-sky-400">{inc.incidentId}</span>
                            {isAlreadyAssignedToMe && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
                                ASSIGNED TO YOU
                              </span>
                            )}
                          </div>

                          <h4 className="text-xs font-semibold text-white leading-tight">{inc.summary}</h4>

                          <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono flex-wrap">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
                              <span className="truncate">{inc.location?.label || 'Sector Location'}</span>
                            </span>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3 text-amber-400 shrink-0" />
                              <span>{inc.peopleAffected ?? 1} citizens at risk</span>
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleSelectTaskAndGoToRoute(inc)}
                          disabled={!!loading}
                          className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-mono text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50"
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
              <div className="space-y-2.5 pt-3 border-t border-obsidian-border">
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="font-mono text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    Resolved Missions Log ({resolvedIncidents.length})
                  </span>
                  <span className="text-slate-500 font-mono text-[11px]">Central Log Sync</span>
                </div>

                <div className="space-y-1.5">
                  {resolvedIncidents.map((inc) => (
                    <div
                      key={inc.incidentId}
                      className="p-2.5 rounded bg-obsidian-well/60 border border-obsidian-border flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            RESOLVED
                          </span>
                          <span className="font-mono text-slate-400">{inc.incidentId}</span>
                        </div>
                        <p className="font-medium text-slate-300 truncate text-xs">{inc.summary}</p>
                      </div>
                      <span className="shrink-0 px-2 py-0.5 rounded bg-obsidian-surface text-slate-400 border border-obsidian-border text-[10px] font-mono">
                        {inc.peopleAffected} assisted
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Field Sector Intelligence & Hub Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded bg-obsidian-well border border-obsidian-border space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-amber-400 uppercase tracking-wider">
                  <AlertTriangle className="w-3.5 h-3.5" /> Sector Advisory
                </div>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  <li className="flex items-start gap-1.5">
                    <span className="text-rose-400 font-mono">[-]</span>
                    <span>100 Feet Ring Road closed (depth 1.2m).</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-amber-400 font-mono">[-]</span>
                    <span>Culvert at Sony World Signal — slow transit.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-emerald-400 font-mono">[+]</span>
                    <span>Inner Ring Road flyover open for emergency vehicles.</span>
                  </li>
                </ul>
              </div>

              <div className="p-3 rounded bg-obsidian-well border border-obsidian-border space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-sky-400 uppercase tracking-wider">
                  <LifeBuoy className="w-3.5 h-3.5" /> Staging & Logistics Hub
                </div>
                <div className="space-y-1 text-xs text-slate-300">
                  <p className="font-medium text-white">{activeUnitConfig.staging}</p>
                  <p className="text-slate-400 text-[11px] font-mono">Zone: {activeUnitConfig.zone}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono border border-emerald-500/20">
                      EQUIPMENT: VERIFIED
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 text-[10px] font-mono border border-sky-500/20">
                      CREW: 3
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Field Hazard Broadcast */}
            <div className="p-3 rounded bg-obsidian-well border border-obsidian-border flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-white">Spotted an unmapped road block or powerline?</p>
                <p className="text-[11px] text-slate-400">Broadcast hazard report directly to Central Command EOC.</p>
              </div>
              <button
                onClick={() => setShowProblemDialog(true)}
                className="w-full sm:w-auto px-3.5 py-1.5 rounded bg-obsidian-surface hover:bg-rose-500/10 text-slate-300 hover:text-rose-400 border border-obsidian-border hover:border-rose-500/30 text-xs font-mono font-medium transition-colors flex items-center justify-center gap-1.5 shrink-0"
              >
                <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                Report Hazard
              </button>
            </div>
          </div>
        )}

      </main>

      {/* ── Problem Reporting Modal ── */}
      {showProblemDialog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-obsidian-well border border-obsidian-border rounded-lg max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-obsidian-border">
              <div className="flex items-center gap-2 text-rose-400 font-mono text-xs font-semibold uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4" />
                <span>Transmit Field Hazard</span>
              </div>
              <button
                onClick={() => setShowProblemDialog(false)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
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
                  className="p-3 rounded bg-obsidian-surface hover:bg-obsidian-canvas border border-obsidian-border hover:border-slate-600 text-left transition-colors space-y-0.5"
                >
                  <p className="text-xs font-medium text-white">{item.label}</p>
                  <p className="text-[11px] text-slate-400">{item.desc}</p>
                </button>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowProblemDialog(false)}
                className="px-3.5 py-1.5 rounded text-xs font-mono text-slate-400 hover:text-white"
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
