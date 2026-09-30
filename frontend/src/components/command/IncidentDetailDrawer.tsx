import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  X,
  MapPin,
  Users,
  Clock,
  Zap,
  Radio,
  CheckCircle,
  Loader2,
  LifeBuoy,
  Flame,
  Droplets,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { useAppStore } from '@/store';
import { api } from '@/api/client';
import { SeverityBadge, INCIDENT_TYPE_LABELS } from '@/components/common/StatusBadges';

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
  { id: 'AMB-01', name: 'AMB-01', label: 'Ambulance 1', role: 'Medical & Oxygen', icon: Activity, zone: 'ZONE-B' },
  { id: 'BOAT-01', name: 'BOAT-01', label: 'Rescue Boat 1', role: 'Flood Evacuation', icon: LifeBuoy, zone: 'ZONE-A' },
  { id: 'RES-01', name: 'RES-01', label: 'Rescue Squad 1', role: 'Structural Extrication', icon: Flame, zone: 'ZONE-B' },
  { id: 'PUMP-01', name: 'PUMP-01', label: 'Water Pump 1', role: 'High-Volume Drainage', icon: Droplets, zone: 'ZONE-B' },
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
        text: `Operator dispatched ${selectedUnitId} → ${incident.incidentId}`,
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
        text: `Operator dispatched ${selectedUnitId} → ${incident.incidentId} (offline)`,
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
    <div className="h-full flex flex-col overflow-y-auto bg-obsidian-canvas border-l border-obsidian-border text-slate-200">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3.5 border-b border-obsidian-border bg-obsidian-well/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-semibold text-sky-400">{incident.incidentId}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-obsidian-surface border border-obsidian-border text-slate-400">
              {STATUS_LABELS[incident.status] ?? incident.status}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-white mt-1">
            {INCIDENT_TYPE_LABELS[incident.type] ?? incident.type}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-obsidian-surface border border-transparent hover:border-obsidian-border transition-colors"
          title="Close drawer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 p-4 space-y-4">
        {/* Severity */}
        <div className="flex items-center gap-2">
          <SeverityBadge severity={incident.severity} size="md" />
          <span className="text-xs font-mono text-slate-400">
            {incident.location.zoneId}
          </span>
        </div>

        {/* Summary */}
        <p className="text-xs text-slate-300 leading-relaxed font-sans bg-obsidian-well/40 p-3 rounded border border-obsidian-border/60">
          {incident.summary}
        </p>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-2">
          <InfoItem icon={<Users className="w-3.5 h-3.5" />} label="People Affected" value={`${incident.peopleAffected}`} />
          <InfoItem icon={<Clock className="w-3.5 h-3.5" />} label="Time Window" value={incident.timeWindowMinutes ? `${incident.timeWindowMinutes} min` : 'TBD'} />
          <InfoItem icon={<MapPin className="w-3.5 h-3.5" />} label="Sector Zone" value={incident.location.zoneId} />
          <InfoItem icon={<Zap className="w-3.5 h-3.5" />} label="Severity Score" value={incident.severityScore != null ? `${incident.severityScore}/100` : 'TBD'} />
        </div>

        {/* Location Details */}
        <div className="p-3 rounded bg-obsidian-well border border-obsidian-border space-y-1">
          <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500">Location Coordinates</p>
          <p className="text-xs font-medium text-slate-200">{incident.location.label}</p>
          <p className="text-[11px] font-mono text-slate-400">
            {incident.location.lat.toFixed(5)}, {incident.location.lng.toFixed(5)}
          </p>
        </div>

        {/* Plan Entry Preview */}
        {planEntry && (
          <div className="p-3 rounded bg-sky-950/20 border border-sky-500/25 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-sky-400">Assigned In Plan</span>
              <span className="text-[11px] font-mono text-slate-400">ETA {planEntry.etaMinutes}m</span>
            </div>
            <p className="text-xs font-semibold text-white">{planEntry.unitId}</p>
            <p className="text-[11px] text-slate-400">
              Confidence window: {planEntry.etaRange[0]}–{planEntry.etaRange[1]} min
            </p>
          </div>
        )}

        {/* OPERATOR DISPATCH CONSOLE */}
        {!isReadOnly && incident.status !== 'closed' && incident.status !== 'resolved' && (
          <div className="p-3.5 rounded-lg bg-obsidian-well border border-obsidian-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-slate-200 uppercase tracking-wider">
                <Radio className="w-3.5 h-3.5 text-sky-400" />
                <span>Tactical Dispatch</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                AUTHORIZED
              </span>
            </div>

            <p className="text-xs text-slate-400">
              Direct dispatch instruction to field unit:
            </p>

            {/* Unit selection options */}
            <div className="grid grid-cols-2 gap-2">
              {DISPATCHABLE_UNITS.map((u) => {
                const isSelected = selectedUnitId === u.id;
                const Icon = u.icon;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUnitId(u.id)}
                    className={`p-2.5 rounded border text-left transition-all ${
                      isSelected
                        ? 'bg-sky-500/10 border-sky-500/50 text-white'
                        : 'bg-obsidian-surface/60 border-obsidian-border text-slate-400 hover:text-slate-200 hover:border-obsidian-muted'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold">
                      <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-sky-400' : 'text-slate-400'}`} />
                      <span className="truncate">{u.id}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate">{u.role}</p>
                  </button>
                );
              })}
            </div>

            {/* Decision button */}
            <button
              type="button"
              onClick={handleOperatorDispatchDecision}
              disabled={dispatching}
              className="w-full py-2.5 rounded font-mono text-xs font-semibold tracking-wide bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {dispatching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5" />
              )}
              <span>DISPATCH {selectedUnitId}</span>
            </button>

            {/* Success notification */}
            {dispatchSuccess && (
              <div className="p-3 rounded bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-medium">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Dispatched to {dispatchSuccess}</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Mission orders transmitted to mobile unit terminal.
                </p>
                <Link
                  to="/crew"
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 hover:text-emerald-300 pt-1"
                >
                  <span>Open Crew Page to monitor route</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Assigned units */}
        {assignedUnits.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-obsidian-border">
            <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500">Currently Assigned Units</p>
            <div className="space-y-1.5">
              {assignedUnits.map((unit) => (
                <div key={unit.unitId} className="flex items-center justify-between p-2 rounded bg-obsidian-well border border-obsidian-border text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-white">{unit.unitId}</span>
                    <span className="text-slate-400">{unit.name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 uppercase">{unit.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="pt-3 border-t border-obsidian-border/60 space-y-1.5">
          <MetaRow label="Reported At" value={incident.reportedAt.replace('T', ' ')} />
          <MetaRow label="Ingest Source" value={incident.source.replace('_', ' ')} />
          <MetaRow label="Audio/Text Lang" value={incident.language.toUpperCase()} />
          <MetaRow label="Model Confidence" value={`${Math.round(incident.confidence * 100)}%`} />
        </div>
      </div>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="p-2.5 rounded bg-obsidian-well border border-obsidian-border">
      <div className="flex items-center gap-1.5 mb-1 text-slate-400">
        {icon}
        <span className="text-[11px] font-mono uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xs font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono text-slate-300">{value}</span>
    </div>
  );
}
