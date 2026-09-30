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
    <div className="flex flex-col shrink-0 bg-[#0B0F17] select-none" style={{ maxHeight: '55%' }}>
      {/* Header */}
      <div className="px-3.5 py-3 flex items-center justify-between shrink-0 border-b border-[#1E293B] bg-[#0F172A]/70">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">Resources</h2>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {available} Avail
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
            {deployed} unit{deployed === 1 ? '' : 's'} in field
          </p>
        </div>
      </div>

      {/* Unit list */}
      <div className="overflow-y-auto flex-1 p-2 space-y-1">
        {units.length === 0 ? (
          <p className="text-[11px] font-mono px-3 py-4 text-center text-slate-500">
            Awaiting fleet telemetry…
          </p>
        ) : (
          units.map((unit) => <UnitRow key={unit.unitId} unit={unit} />)
        )}
      </div>
    </div>
  );
}

function UnitRow({ unit }: { unit: Unit }) {
  const iconText = UNIT_TYPE_ICONS[unit.type] ?? 'UNIT';
  const assignmentsById = useAppStore((s) => s.assignmentsById);
  // Find current assignment for this unit
  const assignment = Object.values(assignmentsById).find(
    (a) => a.unitId === unit.unitId && ['sent', 'accepted'].includes(a.status)
  );

  return (
    <div
      className="p-2 rounded-lg bg-[#0F172A]/60 border border-[#1E293B] flex items-center gap-2.5 hover:border-[#334155] transition-all"
      id={`unit-row-${unit.unitId}`}
    >
      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[#1E293B] text-slate-300 border border-[#334155] shrink-0">
        {iconText}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className="text-xs font-mono font-semibold text-slate-100">{unit.unitId}</p>
          <UnitStatusBadge status={unit.status} />
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-0.5">
          <span className="truncate">{unit.name}</span>
          {assignment && (
            <span className="font-mono text-[#38BDF8] ml-1 shrink-0 font-medium">
              → {assignment.incidentId}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
