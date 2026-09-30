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
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="px-3 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: '1px solid hsl(217,33%,18%)' }}>
        <div>
          <h2 className="text-sm font-semibold text-white">Incidents</h2>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(215,20%,50%)' }}>
            {activeIncidents.length} active · {closedCount} closed
          </p>
        </div>
        {!isReadOnly && (
          <button
            onClick={onPhoneIn}
            id="btn-phone-in"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: 'hsl(217,91%,60%,0.12)', color: 'hsl(217,91%,70%)', border: '1px solid hsl(217,91%,60%,0.2)' }}
            title="Log a phone-in incident"
          >
            <Phone className="w-3.5 h-3.5" />
            Phone-in
          </button>
        )}
      </div>

      {/* Incident list */}
      <div className="flex-1 overflow-y-auto py-1">
        {activeIncidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4">
            <div className="text-2xl">✅</div>
            <p className="text-sm font-medium text-center" style={{ color: 'hsl(215,20%,55%)' }}>No active incidents</p>
            <p className="text-xs text-center" style={{ color: 'hsl(215,20%,40%)' }}>
              {import.meta.env.VITE_USE_MOCKS === 'true'
                ? 'Start the replay below to see incidents appear'
                : 'Waiting for events…'}
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

  return (
    <button
      onClick={onClick}
      id={`incident-card-${incident.incidentId}`}
      className="w-full text-left px-3 py-2.5 flex gap-2.5 transition-all group"
      style={{
        background: isSelected ? 'hsl(217,91%,60%,0.08)' : 'transparent',
        borderLeft: isSelected ? '2px solid hsl(217,91%,60%)' : '2px solid transparent',
      }}
    >
      {/* Severity indicator */}
      <div className="mt-0.5 shrink-0">
        <SeverityBadge severity={incident.severity} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1">
          <p className="text-xs font-semibold text-white leading-tight truncate">{typeLabel}</p>
          <ChevronRight className="w-3 h-3 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: 'hsl(217,91%,60%)' }} />
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <MapPin className="w-3 h-3 shrink-0" style={{ color: 'hsl(215,20%,45%)' }} />
          <p className="text-xs truncate" style={{ color: 'hsl(215,20%,55%)' }}>
            {incident.location.label}
          </p>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3" style={{ color: 'hsl(215,20%,45%)' }} />
            <span className="text-xs" style={{ color: 'hsl(215,20%,60%)' }}>{incident.peopleAffected}</span>
          </div>
          <span className="text-xs mono" style={{ color: 'hsl(217,91%,50%)' }}>{incident.incidentId}</span>
          {incident.assignedUnitIds.length > 0 && (
            <span className="text-xs" style={{ color: 'hsl(142,71%,50%)' }}>
              ✓ {incident.assignedUnitIds.join(', ')}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
