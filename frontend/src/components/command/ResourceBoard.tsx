/**
 * ResourceBoard — right panel showing all units/resources with status.
 */
import { useAppStore } from '@/store';
import { UnitStatusBadge, UNIT_TYPE_ICONS } from '@/components/common/StatusBadges';
import type { Unit } from '@contracts/types';

const STATUS_ORDER: Record<string, number> = {
  unreachable: 0, on_scene: 1, en_route: 2, assigned: 3, available: 4, offline: 5,
};

function sortUnits(units: Unit[]): Unit[] {
  return [...units].sort((a, b) => {
    const aOrd = STATUS_ORDER[a.status] ?? 9;
    const bOrd = STATUS_ORDER[b.status] ?? 9;
    return aOrd - bOrd;
  });
}

export function ResourceBoard() {
  const unitsById = useAppStore((s) => s.unitsById);
  const units = sortUnits(Object.values(unitsById));

  const available = units.filter((u) => u.status === 'available').length;
  const deployed = units.filter((u) => ['en_route', 'on_scene', 'assigned'].includes(u.status)).length;

  return (
    <div className="flex flex-col shrink-0" style={{ maxHeight: '55%' }}>
      {/* Header */}
      <div className="px-3 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: '1px solid hsl(217,33%,18%)' }}>
        <div>
          <h2 className="text-sm font-semibold text-white">Resources</h2>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(215,20%,50%)' }}>
            {available} avail · {deployed} deployed
          </p>
        </div>
      </div>

      {/* Unit list */}
      <div className="overflow-y-auto flex-1 py-1">
        {units.length === 0 ? (
          <p className="text-xs px-3 py-4 text-center" style={{ color: 'hsl(215,20%,40%)' }}>
            Loading units…
          </p>
        ) : (
          units.map((unit) => <UnitRow key={unit.unitId} unit={unit} />)
        )}
      </div>
    </div>
  );
}

function UnitRow({ unit }: { unit: Unit }) {
  const icon = UNIT_TYPE_ICONS[unit.type] ?? '🚗';
  const assignmentsById = useAppStore((s) => s.assignmentsById);
  // Find current assignment for this unit
  const assignment = Object.values(assignmentsById).find(
    (a) => a.unitId === unit.unitId && ['sent', 'accepted'].includes(a.status)
  );

  return (
    <div
      className="px-3 py-2 flex items-center gap-2.5"
      id={`unit-row-${unit.unitId}`}
    >
      <span className="text-lg shrink-0" role="img" aria-label={unit.type}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className="text-xs font-semibold text-white mono">{unit.unitId}</p>
          <UnitStatusBadge status={unit.status} />
        </div>
        <p className="text-xs mt-0.5 truncate" style={{ color: 'hsl(215,20%,50%)' }}>
          {unit.name}
        </p>
        {assignment && (
          <p className="text-xs mono mt-0.5" style={{ color: 'hsl(217,91%,60%)' }}>
            → {assignment.incidentId}
          </p>
        )}
      </div>
    </div>
  );
}
