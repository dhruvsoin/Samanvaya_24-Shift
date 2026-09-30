/**
 * IncidentQueue — left panel showing all active incidents sorted by severity.
 */
import { Phone, MapPin, Users, ChevronRight } from 'lucide-react';
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
    <div className="flex flex-col h-full bg-[#0B0F17] select-none">
      {/* Panel header */}
      <div className="px-3.5 py-3 flex items-center justify-between shrink-0 border-b border-[#1E293B] bg-[#0F172A]/70">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">Incident Queue</h2>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
              {activeIncidents.length} Active
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
            {closedCount} resolved mission{closedCount === 1 ? '' : 's'}
          </p>
        </div>
        {!isReadOnly && (
          <button
            onClick={onPhoneIn}
            id="btn-phone-in"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-[#38BDF8]/10 text-[#38BDF8] border border-[#38BDF8]/30 hover:bg-[#38BDF8]/20 transition-all active:scale-95"
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
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              ✓
            </div>
            <p className="text-xs font-medium text-slate-300">All Sectors Operational</p>
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
      className={`w-full text-left p-2.5 rounded-lg border transition-all relative overflow-hidden group ${
        isSelected
          ? 'bg-[#131B2E] border-[#38BDF8] shadow-sm'
          : 'bg-[#0F172A]/80 border-[#1E293B] hover:border-[#334155] hover:bg-[#131B2E]/60'
      }`}
    >
      {/* Accent left indicator */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 ${
          isCritical
            ? 'bg-rose-500'
            : isHigh
            ? 'bg-amber-400'
            : incident.severity === 'medium'
            ? 'bg-[#38BDF8]'
            : 'bg-emerald-400'
        }`}
      />

      <div className="pl-1">
        {/* Header row: Type + Severity Badge */}
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-medium">
            {typeLabel}
          </span>
          <SeverityBadge severity={incident.severity} />
        </div>

        {/* Location Title */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
          <p className="text-xs font-medium text-slate-100 truncate group-hover:text-[#38BDF8] transition-colors">
            {incident.location.label}
          </p>
        </div>

        {/* Telemetry Row: ID, Affected, Units */}
        <div className="flex items-center justify-between pt-1 border-t border-[#1E293B]/60 text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-mono text-slate-400">{incident.incidentId}</span>
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3 text-slate-500" />
              <span>{incident.peopleAffected}</span>
            </span>
          </div>

          {incident.assignedUnitIds.length > 0 ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {incident.assignedUnitIds.join(', ')}
            </span>
          ) : (
            <span className="text-[10px] font-mono text-amber-400/80">Pending</span>
          )}
        </div>
      </div>
    </button>
  );
}
