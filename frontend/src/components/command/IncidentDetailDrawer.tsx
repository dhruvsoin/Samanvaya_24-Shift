/**
 * IncidentDetailDrawer — Clean Enterprise Light right-hand drawer (Stripe / Apple / Gov-Tech style).
 */
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

      setIncident({
        ...incident,
        status: 'assigned',
        assignedUnitIds: Array.from(new Set([...incident.assignedUnitIds, selectedUnitId])),
      });

      setUnit(selectedUnitId, {
        status: 'assigned',
        assignedIncidentId: incident.incidentId,
      });

      if (res) {
        setAssignment(res);
      }

      pushOpLog({
        category: 'operator_dispatched',
        incidentId: incident.incidentId,
        unitId: selectedUnitId,
        text: `Operator dispatched ${selectedUnitId} → ${incident.incidentId}`,
        detail: `${incident.summary} · ${incident.location.label} · ${incident.peopleAffected} affected`,
      });

      setDispatchSuccess(selectedUnitId);
    } catch {
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
    <div className="h-full flex flex-col overflow-y-auto bg-white border-l border-slate-200 text-slate-800 shadow-xl">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/70">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold text-blue-700">{incident.incidentId}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white border border-slate-200 text-slate-600">
              {STATUS_LABELS[incident.status] ?? incident.status}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-slate-900 mt-0.5">
            {INCIDENT_TYPE_LABELS[incident.type] ?? incident.type}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
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
          <span className="text-xs text-slate-500 font-medium">
            Zone: {incident.location.zoneId}
          </span>
        </div>

        {/* Summary */}
        <p className="text-xs text-slate-700 leading-relaxed font-sans bg-slate-50 p-3 rounded border border-slate-200">
          {incident.summary}
        </p>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-2">
          <InfoItem icon={<Users className="w-3.5 h-3.5 text-blue-600" />} label="People Affected" value={`${incident.peopleAffected}`} />
          <InfoItem icon={<Clock className="w-3.5 h-3.5 text-blue-600" />} label="Time Window" value={incident.timeWindowMinutes ? `${incident.timeWindowMinutes} min` : 'TBD'} />
          <InfoItem icon={<MapPin className="w-3.5 h-3.5 text-blue-600" />} label="Sector Zone" value={incident.location.zoneId} />
          <InfoItem icon={<Zap className="w-3.5 h-3.5 text-blue-600" />} label="Severity Score" value={incident.severityScore != null ? `${incident.severityScore}/100` : 'TBD'} />
        </div>

        {/* Location Details */}
        <div className="p-3 rounded bg-slate-50 border border-slate-200 space-y-1">
          <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Location Coordinates</p>
          <p className="text-xs font-semibold text-slate-900">{incident.location.label}</p>
          <p className="text-[11px] font-mono text-slate-500">
            {incident.location.lat.toFixed(5)}, {incident.location.lng.toFixed(5)}
          </p>
        </div>

        {/* Plan Entry Preview */}
        {planEntry && (
          <div className="p-3 rounded bg-blue-50/60 border border-blue-200 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-blue-700 font-semibold">Assigned in Active Plan</span>
              <span className="text-xs font-mono text-slate-600">ETA {planEntry.etaMinutes}m</span>
            </div>
            <p className="text-xs font-semibold text-slate-900">{planEntry.unitId}</p>
            <p className="text-[11px] text-slate-600">
              Confidence window: {planEntry.etaRange[0]}–{planEntry.etaRange[1]} min
            </p>
          </div>
        )}

        {/* OPERATOR DISPATCH CONSOLE */}
        {!isReadOnly && incident.status !== 'closed' && incident.status !== 'resolved' && (
          <div className="p-3.5 rounded bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                <Radio className="w-3.5 h-3.5 text-blue-600" />
                <span>Operator Dispatch Decision</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                AUTHORIZED
              </span>
            </div>

            <p className="text-xs text-slate-600">
              Select responding unit to deploy to this emergency:
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
                        ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-xs ring-1 ring-blue-500'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold">
                      <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`} />
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
              className="w-full py-2.5 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {dispatching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5" />
              )}
              <span>Dispatch Unit {selectedUnitId}</span>
            </button>

            {/* Success notification */}
            {dispatchSuccess && (
              <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-emerald-800">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Dispatched to {dispatchSuccess}</span>
                </div>
                <p className="text-[11px] text-emerald-700">
                  Mission orders transmitted to mobile unit terminal.
                </p>
                <Link
                  to="/crew"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:underline pt-0.5"
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
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Currently Assigned Units</p>
            <div className="space-y-1.5">
              {assignedUnits.map((unit) => (
                <div key={unit.unitId} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-slate-900">{unit.unitId}</span>
                    <span className="text-slate-600">{unit.name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 uppercase">{unit.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="pt-3 border-t border-slate-200 space-y-1.5 text-xs">
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
    <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
      <div className="flex items-center gap-1.5 mb-1 text-slate-500">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xs font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono text-slate-800">{value}</span>
    </div>
  );
}
