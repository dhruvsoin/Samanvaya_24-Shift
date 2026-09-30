/**
 * CrewPage — tactical mobile-first interface for emergency rescue crews.
 *
 * Features:
 * - High-contrast Tactical HUD for low-light & outdoor visibility
 * - Ongoing Tasks overview: lists assigned missions + active sector calls
 * - Interactive Leaflet Route Map: visualizes route from unit staging to emergency target
 * - Step-by-step tactical mission tracker (Accept -> En Route -> Arrived -> Completed)
 * - Telemetry & readiness controls (Available / Restocking / Standby)
 * - Rapid field hazard reporting (road blocked, vehicle stuck)
 * - Multi-unit switcher for seamless demonstration across unit types
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
  ShieldAlert,
  ChevronRight,
  ExternalLink,
  LifeBuoy,
  PhoneCall,
  Flame,
  Truck,
  Anchor,
  Droplet,
  Layers,
  ArrowLeft,
  ListFilter,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
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
  { id: 'AMB-01', name: 'Ambulance 1', icon: Truck, iconChar: '🚑', role: 'Medical Trauma & Oxygen', zone: 'ZONE-B', lat: 12.9150, lng: 77.6400, staging: 'City General Hospital' },
  { id: 'BOAT-01', name: 'Boat 1', icon: Anchor, iconChar: '⛵', role: 'Water Rescue & Evacuation', zone: 'ZONE-A', lat: 12.9300, lng: 77.6100, staging: 'Lakeside Launch Point' },
  { id: 'RES-01', name: 'Rescue Squad 1', icon: Flame, iconChar: '🚒', role: 'Structural Extrication', zone: 'ZONE-B', lat: 12.9200, lng: 77.6300, staging: 'Silk Board Command Post' },
  { id: 'PUMP-01', name: 'Water Pump 1', icon: Droplet, iconChar: '💧', role: 'High-Capacity Dewatering', zone: 'ZONE-B', lat: 12.9150, lng: 77.6400, staging: 'Sub-station Staging Depot' },
];

/**
 * Tactical Leaflet Route Map Component
 * Renders high-contrast dark route from unit staging coordinates to target incident coordinates.
 */
function TacticalRouteMap({
  unitLocation,
  targetLocation,
  unitCode,
  unitIconChar = '🚑',
}: {
  unitLocation: { lat: number; lng: number };
  targetLocation: { lat: number; lng: number; label: string };
  unitCode: string;
  unitIconChar?: string;
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

    // Unit Marker
    const unitIcon = L.divIcon({
      className: '',
      html: `
        <div style="
          width:36px;height:36px;border-radius:10px;
          background:#1e3a8a;border:2.5px solid #60a5fa;
          display:flex;align-items:center;justify-content:center;
          font-size:17px;box-shadow:0 0 16px rgba(96,165,250,0.8);
        ">
          ${unitIconChar}
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    // Emergency Target Marker with Radar Pulse
    const targetIcon = L.divIcon({
      className: '',
      html: `
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:42px;height:42px;">
          <div class="marker-pulse-critical" style="position:absolute;inset:-4px;border-radius:50%;"></div>
          <div style="
            width:36px;height:36px;border-radius:50%;
            background:#881337;border:2.5px solid #fda4af;
            display:flex;align-items:center;justify-content:center;
            font-size:17px;box-shadow:0 0 16px #f43f5e;position:relative;z-index:2;
          ">
            🚨
          </div>
        </div>
      `,
      iconSize: [42, 42],
      iconAnchor: [21, 21],
    });

    L.marker([unitLocation.lat, unitLocation.lng], { icon: unitIcon })
      .addTo(map)
      .bindPopup(`<div style="font-family:sans-serif;color:#0f172a;font-weight:bold;font-size:12px;">📍 ${unitCode} Staging Origin</div>`);

    L.marker([targetLocation.lat, targetLocation.lng], { icon: targetIcon })
      .addTo(map)
      .bindPopup(`<div style="font-family:sans-serif;color:#0f172a;font-weight:bold;font-size:12px;">🚨 Destination: ${targetLocation.label}</div>`);

    // Realistic multi-point route path avoiding deep flood zones
    const midLat = (unitLocation.lat + targetLocation.lat) / 2 + 0.003;
    const midLng = (unitLocation.lng + targetLocation.lng) / 2 - 0.002;
    const routeCoords: [number, number][] = [
      [unitLocation.lat, unitLocation.lng],
      [midLat, midLng],
      [targetLocation.lat, targetLocation.lng],
    ];

    // Neon Route polyline glow under-layer
    L.polyline(routeCoords, {
      color: '#38bdf8',
      weight: 8,
      opacity: 0.35,
    }).addTo(map);

    // High-visibility cyan navigation line
    L.polyline(routeCoords, {
      color: '#06b6d4',
      weight: 4,
      dashArray: '8, 8',
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
  }, [unitLocation, targetLocation, unitCode, unitIconChar]);

  return (
    <div
      ref={mapContainerRef}
      className="w-full h-64 sm:h-72 rounded-2xl overflow-hidden border border-cyan-500/40 shadow-2xl relative z-10"
      style={{ background: '#020617' }}
    />
  );
}

export function CrewPage() {
  const { displayName, unitId: authUnitId, logout } = useAuthStore();
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
  const [unitReadiness, setUnitReadiness] = useState<'ready' | 'restock' | 'standby'>('ready');
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
          text: `🚗 ${activeUnitId} en route to ${targetIncidentId ?? 'incident'}`,
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
          text: `📍 ${activeUnitId} arrived on scene at ${targetIncidentId ?? 'incident'}`,
          detail: currAssignment?.location?.label ?? '',
        });
      } else if (action === 'task_complete') {
        setStatusStep('completed');

        // 1. Immediately mark incident resolved in store so it disappears from queues & tasks lists
        if (targetIncidentId) {
          closeIncident(targetIncidentId, 'resolved');
        }

        // 2. Mark assignment completed in store so it won't be matched by storeAssignments selector
        if (targetAssignmentId) {
          patchAssignment(targetAssignmentId, { status: 'completed' });
        }

        // 3. Free up unit to available standby
        setUnit(activeUnitId, { status: 'available', assignedIncidentId: null });

        // 4. Log completion to operation audit log
        pushOpLog({
          category: 'task_complete',
          incidentId: targetIncidentId ?? null,
          unitId: activeUnitId,
          text: `✅ ${activeUnitId} completed mission — ${targetIncidentId ?? 'incident'} RESOLVED`,
          detail: `${currAssignment?.incidentSummary ?? ''} · ${currAssignment?.peopleAffected ?? 0} people assisted`,
        });

        // 5. Clear active assignment and return to tasks view
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
    alert('Hazard report transmitted to Central Command EOC.');
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
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-blue-600">
      {/* ── Top Tactical HUD Header ── */}
      <header className="px-4 py-3 bg-slate-900/95 backdrop-blur border-b border-slate-800 flex items-center justify-between shrink-0 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold">
            <UnitIcon className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black tracking-widest text-blue-400 uppercase">CREW TACTICAL HUD</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <p className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>{activeUnitConfig.id}</span>
              <span className="text-slate-500 font-normal">·</span>
              <span className="text-slate-300 text-xs font-medium">{activeUnitConfig.name} ({activeUnitConfig.role})</span>
            </p>
          </div>
        </div>

        {/* Telemetry & Network */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
            <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
            <span>94%</span>
            <span className="text-slate-600">|</span>
            <Compass className="w-3.5 h-3.5 text-blue-400" />
            <span>GPS FIX</span>
          </div>

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">ONLINE</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">OFFLINE (MESH)</span>
              </>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Active Responder Switcher Bar ── */}
      <div className="bg-slate-900/80 border-b border-slate-800 px-4 sm:px-6 py-3.5 sm:py-4 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm shadow-inner">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <span className="text-slate-100 font-bold block leading-tight text-xs sm:text-sm">Active Responder Unit:</span>
            <span className="text-[11px] text-slate-400 font-medium">Select field vehicle profile</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
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
                className={`py-2 px-3.5 sm:px-4 rounded-xl font-bold flex items-center gap-2 transition-all duration-150 active:scale-95 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50 border border-blue-400/50 ring-2 ring-blue-500/30'
                    : 'bg-slate-950/80 text-slate-300 hover:text-white hover:bg-slate-900 border border-slate-800 hover:border-slate-700'
                }`}
                title={`${u.name} — ${u.role}`}
              >
                <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                <span className="tracking-wide text-xs sm:text-sm">{u.id}</span>
                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Offline Queue / Error Alerts ── */}
      {queue.length > 0 && (
        <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
            <span><strong>{queue.length} actions queued locally.</strong> Will automatically sync when reconnecting to central node.</span>
          </div>
          <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-[10px] font-mono font-bold">LORA MESH READY</span>
        </div>
      )}

      {error && (
        <div className="px-4 py-2 bg-rose-500/15 border-b border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="underline text-[11px] font-semibold">Dismiss</button>
        </div>
      )}

      {/* ── Main Container ── */}
      <main className="flex-1 p-4 max-w-2xl w-full mx-auto flex flex-col gap-4">

        {/* ── Unit Readiness & View Switcher Bar ── */}
        <section className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status:</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
              unitReadiness === 'ready'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : unitReadiness === 'restock'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              {unitReadiness === 'ready' ? '● AVAILABLE' : unitReadiness === 'restock' ? '▲ RESTOCKING' : '■ OFF DUTY'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveView('tasks')}
              className={`px-3 py-1 text-xs font-bold rounded-lg flex items-center gap-1 transition ${
                activeView === 'tasks' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Ongoing Tasks ({activeSectorIncidents.length + (assignment ? 1 : 0)})</span>
            </button>
            {assignment && (
              <button
                onClick={() => setActiveView('route')}
                className={`px-3 py-1 text-xs font-bold rounded-lg flex items-center gap-1 transition ${
                  activeView === 'route' ? 'bg-cyan-600 text-white shadow-sm' : 'bg-slate-800 text-slate-400 hover:text-white'
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
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm text-slate-400">Syncing telemetry with Operations Command…</p>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            VIEW 1: ACTIVE ROUTE & NAVIGATION CONSOLE (SELECTED TASK)
            ═══════════════════════════════════════════════════════════════════════ */}
        {activeView === 'route' && assignment && (
          <div className={`rounded-2xl border transition-all duration-300 shadow-2xl overflow-hidden ${
            notificationPing ? 'ring-4 ring-rose-500 animate-pulse' : 'border-slate-800 bg-slate-900/90'
          }`}>
            {/* Header: Emergency Mission Header with Back to Tasks Button */}
            <div className="p-4 bg-gradient-to-r from-rose-950/70 via-slate-900 to-cyan-950/40 border-b border-slate-800 flex items-center justify-between">
              <button
                onClick={() => setActiveView('tasks')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold transition active:scale-95"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Ongoing Tasks List</span>
              </button>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  {statusStep.replace('_', ' ')}
                </span>
                <span className="text-xs font-mono text-cyan-400 font-bold">{assignment.assignmentId}</span>
              </div>
            </div>

            {/* Mission Title */}
            <div className="px-4 py-3 bg-slate-900 border-b border-slate-800">
              <h2 className="text-lg sm:text-xl font-extrabold text-white leading-tight">
                {assignment.incidentSummary}
              </h2>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-400" />
                <span>{assignment.location.label} · {assignment.location.zoneId}</span>
              </p>
            </div>

            {/* Tactical Step Tracker */}
            <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800/80">
              <div className="grid grid-cols-4 gap-1 text-center">
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
                        isCurrent ? 'bg-cyan-500 shadow-lg shadow-cyan-500/50' : isPassed ? 'bg-emerald-500' : 'bg-slate-800'
                      }`} />
                      <span className={`text-[10px] font-semibold uppercase ${
                        isCurrent ? 'text-cyan-400' : isPassed ? 'text-emerald-400' : 'text-slate-500'
                      }`}>
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* ── Interactive Leaflet Route Map ── */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Navigation className="w-4 h-4 text-cyan-400 animate-pulse" />
                    Interactive Tactical Route Map
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Staging: {activeUnitConfig.staging} → Destination
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
                  unitIconChar={activeUnitConfig.iconChar}
                />
              </div>

              {/* Key Mission Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
                    <Users className="w-4 h-4 text-amber-400" /> Citizens at Risk
                  </span>
                  <p className="text-xl font-extrabold text-white mt-1">
                    {assignment.peopleAffected} <span className="text-xs font-normal text-slate-400">people</span>
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
                    <Clock className="w-4 h-4 text-blue-400" /> Optimal ETA
                  </span>
                  <p className="text-xl font-extrabold text-cyan-400 mt-1">
                    {assignment.etaMinutes} <span className="text-xs font-normal text-slate-400">minutes</span>
                  </p>
                </div>
              </div>

              {/* AI Dispatch Guidance & Flood Avoidance */}
              {assignment.instructions && (
                <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-500/30 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-400 uppercase tracking-wider">
                    <Compass className="w-4 h-4" /> AI Tactical Route Advisory
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed font-medium">
                    {assignment.instructions}
                  </p>
                </div>
              )}

              {/* External GPS Route Button */}
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${assignment.location.lat},${assignment.location.lng}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                <span>Open Destination Coordinates in Google Maps App</span>
              </a>

              {/* ── Primary Action Controls ── */}
              <div className="pt-2 space-y-3">
                {/* 1. When newly Dispatched: Accept or Decline */}
                {statusStep === 'sent' && (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleRespond(true)}
                      disabled={!!loading}
                      id="btn-accept-assignment"
                      className="py-3.5 px-4 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
                    >
                      {loading === 'accept' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      ACCEPT MISSION
                    </button>
                    <button
                      onClick={() => handleRespond(false)}
                      disabled={!!loading}
                      id="btn-decline-assignment"
                      className="py-3.5 px-4 rounded-xl font-bold text-sm bg-rose-950/60 hover:bg-rose-900/50 text-rose-300 border border-rose-800/60 flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
                    >
                      {loading === 'decline' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      CANNOT TAKE
                    </button>
                  </div>
                )}

                {/* 2. When Accepted: Mark En Route */}
                {statusStep === 'accepted' && (
                  <button
                    onClick={() => handleStatusUpdate('en_route')}
                    disabled={!!loading}
                    id="btn-en-route"
                    className="w-full py-4 rounded-xl font-bold text-base bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/50 flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
                  >
                    {loading === 'en_route' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Navigation className="w-5 h-5" />}
                    START NAVIGATION · EN ROUTE
                  </button>
                )}

                {/* 3. When En Route: Mark Arrived */}
                {statusStep === 'en_route' && (
                  <button
                    onClick={() => handleStatusUpdate('arrived')}
                    disabled={!!loading}
                    id="btn-arrived"
                    className="w-full py-4 rounded-xl font-bold text-base bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-900/40 flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
                  >
                    {loading === 'arrived' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Flag className="w-5 h-5" />}
                    ARRIVED ON SCENE · COMMENCE RESCUE
                  </button>
                )}

                {/* 4. When On Scene: Complete Task */}
                {statusStep === 'on_scene' && (
                  <button
                    onClick={() => handleStatusUpdate('task_complete')}
                    disabled={!!loading}
                    id="btn-task-complete"
                    className="w-full py-4 rounded-xl font-bold text-base bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/50 flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
                  >
                    {loading === 'task_complete' ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                    PATIENT SECURED · MISSION COMPLETE
                  </button>
                )}

                {/* 5. When Completed */}
                {statusStep === 'completed' && (
                  <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-center space-y-1">
                    <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto" />
                    <p className="font-bold text-white">Mission successfully logged!</p>
                    <p className="text-xs text-slate-400">Returning unit to active standby patrol…</p>
                  </div>
                )}

                {/* Problem Reporter Trigger */}
                <div className="pt-2 flex items-center justify-between border-t border-slate-800/80 text-xs">
                  <span className="text-slate-400">Ground hazard encountered?</span>
                  <button
                    onClick={() => setShowProblemDialog(true)}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold flex items-center gap-1 transition"
                  >
                    <AlertOctagon className="w-3.5 h-3.5" />
                    Report Road Block / Stuck
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            VIEW 2: ONGOING TASKS LIST & STANDBY SECTOR FEED
            ═══════════════════════════════════════════════════════════════════════ */}
        {activeView === 'tasks' && (
          <div className="space-y-4">
            {/* Active Mission Banner (if one is currently assigned) */}
            {assignment && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/80 via-slate-900 to-cyan-950/50 border border-cyan-500/40 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded bg-cyan-500 text-slate-950 font-black text-[10px] uppercase">
                      ASSIGNED TO {activeUnitId}
                    </span>
                    <span className="text-xs font-mono font-bold text-cyan-300">{assignment.assignmentId}</span>
                  </div>
                  <h3 className="text-sm font-bold text-white line-clamp-1">{assignment.incidentSummary}</h3>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-rose-400" />
                    <span>{assignment.location.label} · ETA {assignment.etaMinutes}m</span>
                  </p>
                </div>

                <button
                  onClick={() => setActiveView('route')}
                  className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-900/40 flex items-center justify-center gap-1.5 transition shrink-0 active:scale-95"
                >
                  <Navigation className="w-4 h-4" />
                  <span>GO TO ROUTE MAP →</span>
                </button>
              </div>
            )}

            {/* Standby Status Hero */}
            <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl relative overflow-hidden">
              <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                      <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                      SECTOR PATROL ACTIVE
                    </span>
                    <span className="text-xs font-mono text-slate-400">{activeUnitConfig.zone}</span>
                  </div>
                  <h2 className="text-lg font-black text-white">Ongoing Emergency Tasks in Sector</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Select any task below to inspect its coordinates and follow the tactical navigation route.
                  </p>
                </div>

                <button
                  onClick={() => handleSelectTaskAndGoToRoute()}
                  disabled={!!loading}
                  className="px-4 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-900/40 flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50 shrink-0"
                >
                  {loading === 'select_task' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Radio className="w-4 h-4 text-amber-300" />
                  )}
                  <span>REQUEST DISPATCH CALL</span>
                </button>
              </div>
            </div>

            {/* ── List of All Ongoing Tasks ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs px-1">
                <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <ListFilter className="w-4 h-4 text-blue-400" />
                  Available Tasks ({activeSectorIncidents.length})
                </span>
                <span className="text-slate-500">Tap to select task & open route</span>
              </div>

              {activeSectorIncidents.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-900/50 border border-slate-800 text-center space-y-2">
                  <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p className="text-sm font-bold text-white">No active emergency calls</p>
                  <p className="text-xs text-slate-400">All sector calls resolved or standby patrol active.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {activeSectorIncidents.map((inc) => {
                    const isAlreadyAssignedToMe = inc.assignedUnitIds.includes(activeUnitId);
                    return (
                      <div
                        key={inc.incidentId}
                        className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isAlreadyAssignedToMe
                            ? 'bg-blue-950/30 border-blue-500/40 shadow-lg'
                            : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              inc.severity === 'critical' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                              inc.severity === 'high' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                              'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            }`}>
                              {inc.severity || 'Critical'}
                            </span>
                            <span className="text-xs font-mono font-bold text-white">{inc.incidentId}</span>
                            {isAlreadyAssignedToMe && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                ASSIGNED TO YOU
                              </span>
                            )}
                          </div>

                          <h4 className="text-sm font-bold text-white leading-tight">{inc.summary}</h4>

                          <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                              <span className="truncate">{inc.location?.label || 'Sector Location'}</span>
                            </span>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span>{inc.peopleAffected ?? 1} citizens at risk</span>
                            </span>
                          </div>
                        </div>

                        {/* Action: Select task and go to route */}
                        <button
                          onClick={() => handleSelectTaskAndGoToRoute(inc)}
                          disabled={!!loading}
                          className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shrink-0 shadow-md shadow-blue-900/40 active:scale-95 disabled:opacity-50"
                        >
                          <Navigation className="w-3.5 h-3.5 text-cyan-300" />
                          <span>Select Task & Go to Route →</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Resolved / Completed Missions History ── */}
            {resolvedIncidents.length > 0 && (
              <div className="space-y-2.5 pt-3 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    Resolved / Completed Missions ({resolvedIncidents.length})
                  </span>
                  <span className="text-slate-500 font-medium">Recorded in Central Log</span>
                </div>

                <div className="space-y-2">
                  {resolvedIncidents.map((inc) => (
                    <div
                      key={inc.incidentId}
                      className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800/70 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            RESOLVED
                          </span>
                          <span className="font-mono font-bold text-slate-300">{inc.incidentId}</span>
                        </div>
                        <p className="font-semibold text-slate-200 truncate">{inc.summary}</p>
                        <p className="text-slate-400 flex items-center gap-1 text-[11px]">
                          <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="truncate">{inc.location?.label}</span>
                          <span>·</span>
                          <Users className="w-3 h-3 text-slate-500 shrink-0" />
                          <span>{inc.peopleAffected} citizens assisted</span>
                        </p>
                      </div>
                      <span className="shrink-0 px-2.5 py-1 rounded-lg bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold">
                        COMPLETED
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Field Sector Intelligence & Hazards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">
                  <AlertTriangle className="w-4 h-4" /> Live Sector Hazards
                </div>
                <ul className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-start gap-1.5">
                    <span className="text-rose-400">●</span>
                    <span>100 Feet Ring Road closed due to 1.2m water logging.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-amber-400">●</span>
                    <span>Submerged culvert near Sony World Signal — slow crawl.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-emerald-400">●</span>
                    <span>Inner Ring Road flyover clear for high-clearance units.</span>
                  </li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">
                  <LifeBuoy className="w-4 h-4" /> Staging & Supply Hub
                </div>
                <div className="space-y-1.5 text-xs text-slate-300">
                  <p className="font-semibold text-white">{activeUnitConfig.staging}</p>
                  <p className="text-slate-400">Current Base Staging Zone: {activeUnitConfig.zone}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                      SUPPLIES: READY
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                      CREW: DEPLOYED
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Field Hazard Broadcast */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-white">Spotted a new road blockage or road cave-in?</p>
                <p className="text-xs text-slate-400">Broadcast hazard report directly to Central Command EOC.</p>
              </div>
              <button
                onClick={() => setShowProblemDialog(true)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold transition flex items-center justify-center gap-1.5 shrink-0"
              >
                <AlertOctagon className="w-4 h-4" />
                Broadcast Field Hazard
              </button>
            </div>
          </div>
        )}

      </main>

      {/* ── Problem Reporting Modal ── */}
      {showProblemDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-rose-400 font-bold">
                <AlertTriangle className="w-5 h-5" />
                <span>Transmit Field Hazard</span>
              </div>
              <button
                onClick={() => setShowProblemDialog(false)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Select the condition encountered on the route. Central EOC will instantly re-calculate travel times and notify other units.
            </p>

            <div className="grid grid-cols-1 gap-2.5">
              {[
                { kind: 'road_blocked' as const, label: '🚧 Road Submerged / Blocked by Tree', desc: 'Water depth > 1m or debris impassable' },
                { kind: 'vehicle_stuck' as const, label: '🚨 Rescue Vehicle Disabled / Stuck', desc: 'Engine drowned or mechanical fault' },
                { kind: 'other' as const, label: '⚠️ Severe Current / Secondary Hazard', desc: 'Live powerline or crowd surge' },
              ].map((item) => (
                <button
                  key={item.kind}
                  onClick={() => handleProblem(item.kind)}
                  className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-rose-500/40 text-left transition space-y-0.5"
                >
                  <p className="text-xs font-bold text-white">{item.label}</p>
                  <p className="text-[11px] text-slate-400">{item.desc}</p>
                </button>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowProblemDialog(false)}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white"
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
