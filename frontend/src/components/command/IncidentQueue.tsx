/**
 * IncidentQueue — Clean Enterprise Light left panel (Stripe/Gov-Tech style).
 */
import { Phone, MapPin, Users } from 'lucide-react';
import { useAppStore } from '@/store';
import { SeverityBadge, INCIDENT_TYPE_LABELS } from '@/components/common/StatusBadges';
import type { Incident } from '@contracts/types';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function sortBySeverity(incidents: Incident[]): Incident[] {
  return [...incidents].sort((a, b) => {
    const aOrd = a.severity ? SEVERITY_ORDER[a.severity] : 4;
    const bOrd = b.severity ? SEVERITY_ORDER[b.severity] : 4;
    return aOrd - bOrd;
  });
}

interface Props {
  isReadOnly: boolean;
  selectedId: string | null;
  onSelectIncident: (id: string) => void;
  onPhoneIn: () => void;
}

export function IncidentQueue({ isReadOnly, selectedId, onSelectIncident, onPhoneIn }: Props) {
  const incidentsById = useAppStore((s) => s.incidentsById);
  const activeIncidents = sortBySeverity(
    Object.values(incidentsById).filter((i) => i.status !== 'closed' && i.status !== 'resolved')
  );
  const closedCount = Object.values(incidentsById).filter(
    (i) => i.status === 'closed' || i.status === 'resolved'
  ).length;

  return (
    <div className="flex flex-col h-full bg-slate-50 border-r border-slate-200 select-none">
      {/* Panel header */}
      <div className="px-3.5 py-2.5 flex items-center justify-between shrink-0 border-b border-slate-200 bg-white">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Incident Queue</h2>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-rose-50 text-rose-700 border border-rose-200">
              {activeIncidents.length} Active
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {closedCount} resolved mission{closedCount === 1 ? '' : 's'}
          </p>
        </div>
        {!isReadOnly && (
          <button
            onClick={onPhoneIn}
            id="btn-phone-in"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
            title="Log a phone-in incident"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Phone-In</span>
          </button>
        )}
      </div>

      {/* Incident list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {activeIncidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 py-8 text-center">
            <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 font-semibold text-xs">
              ✓
            </div>
            <p className="text-xs font-semibold text-slate-800">All Sectors Operational</p>
            <p className="text-[11px] text-slate-500">
              {import.meta.env.VITE_USE_MOCKS === 'true'
                ? 'Start the timeline scrubber to stream incoming incidents'
                : 'Awaiting dispatch events…'}
            </p>
          </div>
        ) : (
          activeIncidents.map((incident) => (
            <IncidentCard
              key={incident.incidentId}
              incident={incident}
              isSelected={selectedId === incident.incidentId}
              onClick={() => onSelectIncident(incident.incidentId)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function IncidentCard({ incident, isSelected, onClick }: {
  incident: Incident;
  isSelected: boolean;
  onClick: () => void;
}) {
  const typeLabel = INCIDENT_TYPE_LABELS[incident.type] ?? incident.type;
  const isCritical = incident.severity === 'critical';
  const isHigh = incident.severity === 'high';

  return (
    <button
      onClick={onClick}
      id={`incident-card-${incident.incidentId}`}
      className={`w-full text-left p-2.5 rounded border transition-all relative overflow-hidden group shadow-xs ${
        isSelected
          ? 'bg-blue-50/70 border-blue-500 ring-1 ring-blue-500'
          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
      }`}
    >
      {/* Accent left indicator */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 ${
          isCritical
            ? 'bg-rose-500'
            : isHigh
            ? 'bg-amber-500'
            : incident.severity === 'medium'
            ? 'bg-blue-500'
            : 'bg-emerald-500'
        }`}
      />

      <div className="pl-1">
        {/* Header row: Type + Severity Badge */}
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-medium">
            {typeLabel}
          </span>
          <SeverityBadge severity={incident.severity} />
        </div>

        {/* Location Title */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
          <p className="text-xs font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
            {incident.location.label}
          </p>
        </div>

        {/* Telemetry Row: ID, Affected, Units */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-mono text-slate-600">{incident.incidentId}</span>
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3 text-slate-400" />
              <span>{incident.peopleAffected}</span>
            </span>
          </div>

          {incident.assignedUnitIds.length > 0 ? (
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              {incident.assignedUnitIds.join(', ')}
            </span>
          ) : (
            <span className="text-[10px] font-mono text-amber-700 font-medium">Pending</span>
          )}
        </div>
      </div>
    </button>
  );
}
