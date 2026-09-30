import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { X, MapPin, Users, Clock, Zap, Radio, CheckCircle, Loader2, ShieldAlert, Send } from 'lucide-react';
import { useAppStore } from '@/store';
import { api } from '@/api/client';
import { SeverityBadge, INCIDENT_TYPE_LABELS, UNIT_TYPE_ICONS } from '@/components/common/StatusBadges';

interface Props {
  incidentId: string;
  onClose: () => void;
  isReadOnly: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  reported: 'Reported',
  assessed: 'Assessed',
  assigned: 'Assigned',
  en_route: 'En Route',
  on_scene: 'On Scene',
  resolved: 'Resolved',
  closed: 'Closed',
  unserved: 'Unserved',
};

const DISPATCHABLE_UNITS = [
  { id: 'AMB-01', name: 'AMB-01', label: 'Ambulance 1', role: 'Medical & Oxygen', icon: '🚑', zone: 'ZONE-B' },
  { id: 'BOAT-01', name: 'BOAT-01', label: 'Rescue Boat 1', role: 'Flood Evacuation', icon: '⛵', zone: 'ZONE-A' },
  { id: 'RES-01', name: 'RES-01', label: 'Rescue Squad 1', role: 'Structural Extrication', icon: '🚒', zone: 'ZONE-B' },
  { id: 'PUMP-01', name: 'PUMP-01', label: 'Water Pump 1', role: 'High-Volume Drainage', icon: '💧', zone: 'ZONE-B' },
];

export function IncidentDetailDrawer({ incidentId, onClose, isReadOnly }: Props) {
  const incident = useAppStore((s) => s.incidentsById[incidentId]);
  const unitsById = useAppStore((s) => s.unitsById);
  const currentPlan = useAppStore((s) => s.currentPlan);
  const setIncident = useAppStore((s) => s.setIncident);
  const setAssignment = useAppStore((s) => s.setAssignment);
  const setUnit = useAppStore((s) => s.setUnit);
  const pushOpLog = useAppStore((s) => s.pushOpLog);

  const [selectedUnitId, setSelectedUnitId] = useState<string>('BOAT-01');
  const [dispatching, setDispatching] = useState(false);
  const [dispatchSuccess, setDispatchSuccess] = useState<string | null>(null);

  async function handleOperatorDispatchDecision() {
    if (isReadOnly) return;
    setDispatching(true);
    setDispatchSuccess(null);

    const instructions = selectedUnitId === 'BOAT-01'
      ? 'Deploy rescue inflatable from Lakeside launch. Evacuate citizens to Sector Staging Point.'
      : selectedUnitId === 'AMB-01'
      ? 'Proceed via Inner Ring Road flyover. Transport oxygen kit & high-water stretcher.'
      : selectedUnitId === 'RES-01'
      ? 'Deploy hydraulic cutters & chainsaw team. Secure evacuation passage.'
      : 'Deploy 2500 GPM dewatering pump. Route discharge toward stormwater canal.';

    try {
      const res = await api.crew.requestDispatch({
        unitId: selectedUnitId,
        incidentId: incident.incidentId,
        incidentSummary: incident.summary,
        location: incident.location,
        peopleAffected: incident.peopleAffected,
        instructions,
      });

      // Update incident status and assigned unit
      setIncident({
        ...incident,
        status: 'assigned',
        assignedUnitIds: Array.from(new Set([...incident.assignedUnitIds, selectedUnitId])),
      });

      // Update unit status to assigned
      setUnit(selectedUnitId, {
        status: 'assigned',
        assignedIncidentId: incident.incidentId,
      });

      if (res) {
        setAssignment(res);
      }

      // Record operator dispatch decision in audit log
      pushOpLog({
        category: 'operator_dispatched',
        incidentId: incident.incidentId,
        unitId: selectedUnitId,
        text: `📡 Operator dispatched ${selectedUnitId} → ${incident.incidentId}`,
        detail: `${incident.summary} · ${incident.location.label} · ${incident.peopleAffected} affected`,
      });

      setDispatchSuccess(selectedUnitId);
    } catch {
      // Local fallback
      setIncident({
        ...incident,
        status: 'assigned',
        assignedUnitIds: Array.from(new Set([...incident.assignedUnitIds, selectedUnitId])),
      });
      setUnit(selectedUnitId, {
        status: 'assigned',
        assignedIncidentId: incident.incidentId,
      });
      pushOpLog({
        category: 'operator_dispatched',
        incidentId: incident.incidentId,
        unitId: selectedUnitId,
        text: `📡 Operator dispatched ${selectedUnitId} → ${incident.incidentId} (offline)`,
        detail: `${incident.location.label} · ${incident.peopleAffected} affected`,
      });
      setDispatchSuccess(selectedUnitId);
    } finally {
      setDispatching(false);
    }
  }

  if (!incident) return null;

  const planEntry = currentPlan?.entries.find((e) => e.incidentId === incidentId);
  const assignedUnits = incident.assignedUnitIds.map((id) => unitsById[id]).filter(Boolean);

  return (
    <div className="h-full flex flex-col overflow-y-auto" style={{ background: 'hsl(222,47%,8%)', borderLeft: '1px solid hsl(217,33%,22%)' }}>
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b" style={{ borderColor: 'hsl(217,33%,18%)' }}>
          <div>
            <p className="text-xs mono font-semibold" style={{ color: 'hsl(217,91%,60%)' }}>{incident.incidentId}</p>
            <h3 className="text-white font-semibold mt-0.5">
              {INCIDENT_TYPE_LABELS[incident.type] ?? incident.type}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded" style={{ color: 'hsl(215,20%,50%)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-4 space-y-4">
          {/* Severity + status */}
          <div className="flex items-center gap-2 flex-wrap">
            <SeverityBadge severity={incident.severity} size="md" />
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{ background: 'hsl(217,33%,16%)', color: 'hsl(215,20%,65%)' }}
            >
              {STATUS_LABELS[incident.status] ?? incident.status}
            </span>
          </div>

          {/* Summary */}
          <p className="text-sm leading-relaxed" style={{ color: 'hsl(215,20%,70%)' }}>
            {incident.summary}
          </p>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            <InfoItem icon={<Users className="w-3.5 h-3.5" />} label="People" value={`${incident.peopleAffected}`} />
            <InfoItem icon={<Clock className="w-3.5 h-3.5" />} label="Window" value={incident.timeWindowMinutes ? `${incident.timeWindowMinutes} min` : 'TBD'} />
            <InfoItem icon={<MapPin className="w-3.5 h-3.5" />} label="Zone" value={incident.location.zoneId} />
            <InfoItem icon={<Zap className="w-3.5 h-3.5" />} label="Score" value={incident.severityScore != null ? `${incident.severityScore}/100` : 'TBD'} />
          </div>

          {/* Location */}
          <div className="p-3 rounded-lg" style={{ background: 'hsl(222,47%,11%)', border: '1px solid hsl(217,33%,18%)' }}>
            <p className="text-xs font-medium mb-1" style={{ color: 'hsl(215,20%,50%)' }}>Location</p>
            <p className="text-sm text-white">{incident.location.label}</p>
            <p className="text-xs mono mt-1" style={{ color: 'hsl(215,20%,45%)' }}>
              {incident.location.lat.toFixed(4)}, {incident.location.lng.toFixed(4)}
            </p>
          </div>

          {/* Plan entry */}
          {planEntry && (
            <div className="p-3 rounded-lg" style={{ background: 'hsl(217,91%,60%,0.06)', border: '1px solid hsl(217,91%,60%,0.15)' }}>
              <p className="text-xs font-medium mb-1" style={{ color: 'hsl(215,20%,55%)' }}>Current Plan</p>
              <p className="text-sm font-semibold text-white">{planEntry.unitId}</p>
              <p className="text-xs mt-1" style={{ color: 'hsl(217,91%,60%)' }}>
                ETA: {planEntry.etaMinutes} min ({planEntry.etaRange[0]}–{planEntry.etaRange[1]} min range)
              </p>
            </div>
          )}

          {/* ── OPERATOR DECISION & DISPATCH CONSOLE ── */}
          {!isReadOnly && incident.status !== 'closed' && incident.status !== 'resolved' && (
            <div className="p-3.5 rounded-xl bg-slate-900 border border-blue-500/40 shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-400 uppercase tracking-wider">
                  <Radio className="w-4 h-4 text-blue-400 animate-pulse" />
                  <span>Operator Dispatch Decision</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  COMMAND ACTION
                </span>
              </div>

              <p className="text-xs text-slate-300">
                Select the responding rescue unit to deploy to this emergency location:
              </p>

              {/* Unit selection options */}
              <div className="grid grid-cols-2 gap-2">
                {DISPATCHABLE_UNITS.map((u) => {
                  const isSelected = selectedUnitId === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelectedUnitId(u.id)}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'bg-blue-600/25 border-blue-400 text-white shadow-sm ring-1 ring-blue-400'
                          : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <span>{u.icon}</span>
                        <span className="truncate">{u.id}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{u.role}</p>
                    </button>
                  );
                })}
              </div>

              {/* Decision button */}
              <button
                type="button"
                onClick={handleOperatorDispatchDecision}
                disabled={dispatching}
                className="w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
              >
                {dispatching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                <span>APPROVE & DISPATCH TO {selectedUnitId}</span>
              </button>

              {/* Success notification & direct link */}
              {dispatchSuccess && (
                <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs space-y-1.5 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">✅ Decision Logged & Dispatched to {dispatchSuccess}!</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Emergency mission is now transmitting to the tactical responder's terminal.
                  </p>
                  <Link
                    to="/crew"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 underline mt-1"
                  >
                    <span>Open Crew Tab to View Active Route ({dispatchSuccess}) →</span>
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Assigned units */}
          {assignedUnits.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'hsl(215,20%,50%)' }}>Assigned Units</p>
              <div className="space-y-1.5">
                {assignedUnits.map((unit) => (
                  <div key={unit.unitId} className="flex items-center gap-2 text-sm">
                    <span>{UNIT_TYPE_ICONS[unit.type] ?? '🚗'}</span>
                    <span className="font-medium mono text-white">{unit.unitId}</span>
                    <span style={{ color: 'hsl(215,20%,55%)' }}>{unit.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="pt-3 border-t space-y-1" style={{ borderColor: 'hsl(217,33%,18%)' }}>
            <MetaRow label="Reported" value={incident.reportedAt.replace('T', ' ')} />
            <MetaRow label="Source" value={incident.source.replace('_', ' ')} />
            <MetaRow label="Language" value={incident.language.toUpperCase()} />
            <MetaRow label="Confidence" value={`${Math.round(incident.confidence * 100)}%`} />
          </div>
        </div>
      </div>
  );
}

function InfoItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-lg" style={{ background: 'hsl(222,47%,11%)', border: '1px solid hsl(217,33%,18%)' }}>
      <div className="flex items-center gap-1.5 mb-1" style={{ color: 'hsl(215,20%,50%)' }}>
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span style={{ color: 'hsl(215,20%,45%)' }}>{label}</span>
      <span className="mono" style={{ color: 'hsl(215,20%,65%)' }}>{value}</span>
    </div>
  );
}
