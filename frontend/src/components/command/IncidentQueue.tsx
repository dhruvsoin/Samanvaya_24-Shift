/**
 * IncidentQueue — Clean Enterprise Light left panel (Stripe/Gov-Tech style).
 */
import { useState } from 'react';
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
  const [filter, setFilter] = useState<'all' | 'critical' | 'rescue' | 'medical'>('all');

  const allActive = sortBySeverity(
    Object.values(incidentsById).filter((i) => i.status !== 'closed' && i.status !== 'resolved')
  );

  const activeIncidents = allActive.filter((i) => {
    if (filter === 'critical') return i.severity === 'critical';
    if (filter === 'rescue') return i.type === 'trapped_person' || i.type === 'flooded_home';
    if (filter === 'medical') return i.type === 'medical';
    return true;
  });

  const closedCount = Object.values(incidentsById).filter(
    (i) => i.status === 'closed' || i.status === 'resolved'
  ).length;

  return (
    <div className="flex flex-col h-full bg-zinc-950/80 border-r border-zinc-800 select-none">
      {/* Panel header */}
      <div className="p-3 shrink-0 border-b border-zinc-800 bg-zinc-900 space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-100">Incident Queue</h2>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                {allActive.length} Active
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {closedCount} resolved mission{closedCount === 1 ? '' : 's'}
            </p>
          </div>
          {!isReadOnly && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPhoneIn();
              }}
              type="button"
              id="btn-phone-in"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-xs transition-all hover:shadow-sm cursor-pointer"
              title="Log a phone-in incident"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Phone-In</span>
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1">
          {(['all', 'critical', 'rescue', 'medical'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                filter === f
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Incident list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {activeIncidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 py-8 text-center">
            <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
              ✓
            </div>
            <p className="text-xs font-bold text-zinc-300">No Incidents in Filter</p>
            <p className="text-[11px] text-zinc-500">
              {filter !== 'all' ? 'Try selecting "All" to view all active emergency cases' : 'Awaiting dispatch events…'}
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
      className={`w-full text-left p-3 rounded-xl border transition-all relative overflow-hidden group shadow-xs cursor-pointer ${
        isSelected
          ? 'bg-blue-900/30 border-blue-500/50 ring-1 ring-blue-500/20 shadow-sm'
          : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/80 hover:shadow-sm'
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

      <div className="pl-1.5 space-y-1.5">
        {/* Header row: Type + Severity Badge */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {isCritical && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />}
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold truncate">
              {typeLabel}
            </span>
          </div>
          <SeverityBadge severity={incident.severity} />
        </div>

        {/* Location Title */}
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0 group-hover:text-blue-400 transition-colors" />
          <p className="text-xs font-bold text-zinc-100 truncate group-hover:text-blue-400 transition-colors">
            {incident.location.label}
          </p>
        </div>

        {/* Telemetry Row: ID, Affected, Units */}
        <div className="flex items-center justify-between pt-1 border-t border-zinc-800/50 text-[11px] text-zinc-500">
          <div className="flex items-center gap-2 font-mono text-[10px]">
            <span className="text-zinc-500 font-semibold">{incident.incidentId}</span>
            <span className="flex items-center gap-1 text-zinc-400">
              <Users className="w-3 h-3 text-zinc-500" />
              <span>{incident.peopleAffected}</span>
            </span>
          </div>

          {incident.assignedUnitIds.length > 0 ? (
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {incident.assignedUnitIds.join(', ')}
            </span>
          ) : (
            <span className="text-[10px] font-mono text-amber-400 font-semibold bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
              Pending Dispatch
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
