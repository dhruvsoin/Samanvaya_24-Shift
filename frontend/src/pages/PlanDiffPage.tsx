import { useState, useEffect } from 'react';
import { useAppStore } from '@/store';
import { Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Plus, AlertTriangle, Sparkles, Layers, RefreshCw, CheckCircle2 } from 'lucide-react';
import { UNIT_TYPE_ICONS } from '@/components/common/StatusBadges';
import { api } from '@/api/client';
import { MOCK_PLAN_V1, MOCK_PLAN_V2, MOCK_PLAN_V3 } from '@/mocks/handlers';
import type { Plan, PlanChange } from '@contracts/types';

const CHANGE_CONFIG = {
  added:     { icon: Plus,         label: 'Added',     color: '#059669', bg: '#ECFDF5' },
  removed:   { icon: Minus,        label: 'Removed',   color: '#DC2626', bg: '#FEF2F2' },
  changed:   { icon: TrendingUp,   label: 'Changed',   color: '#D97706', bg: '#FFFBEB' },
  unchanged: { icon: Minus,        label: 'Unchanged', color: '#64748B', bg: '#F8FAFC' },
};

export function PlanDiffPage() {
  const currentPlan = useAppStore((s) => s.currentPlan);
  const planHistory = useAppStore((s) => s.planHistory);
  const publishPlan = useAppStore((s) => s.publishPlan);
  const incidentsById = useAppStore((s) => s.incidentsById);
  const unitsById = useAppStore((s) => s.unitsById);
  const pushOpLog = useAppStore((s) => s.pushOpLog);

  const [activePlanId, setActivePlanId] = useState<string>('PLAN-002');
  const [simulating, setSimulating] = useState(false);

  // Auto-initialize plan on mount if empty
  useEffect(() => {
    if (!currentPlan) {
      api.plan.current()
        .then((plan) => {
          if (plan) {
            publishPlan(plan);
          } else {
            publishPlan(MOCK_PLAN_V2 as unknown as Plan);
          }
        })
        .catch(() => {
          publishPlan(MOCK_PLAN_V2 as unknown as Plan);
        });
    }
  }, [currentPlan, publishPlan]);

  const activePlan: Plan = currentPlan || (MOCK_PLAN_V2 as unknown as Plan);

  function handleSelectPlan(plan: Plan) {
    setActivePlanId(plan.planId);
    publishPlan(plan);
  }

  // Simulate dynamic AI solver re-solve
  function handleSimulateDynamicSolve() {
    setSimulating(true);
    setTimeout(() => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dynamicPlan: Plan = {
        planId: `PLAN-00${Math.floor(4 + Math.random() * 5)}`,
        version: (activePlan.version || 2) + 1,
        previousPlanId: activePlan.planId,
        trigger: `Live solver optimization at ${timeStr}: 80ft Road water recession detected; ambulance corridor expedited`,
        publishedAt: new Date().toISOString().replace('Z', ''),
        entries: [
          { incidentId: 'INC-01', unitId: 'BOAT-01', etaMinutes: 4, etaRange: [3, 6] },
          { incidentId: 'INC-02', unitId: 'RES-01', etaMinutes: 7, etaRange: [6, 9] },
          { incidentId: 'INC-03', unitId: 'AMB-01', etaMinutes: 5, etaRange: [4, 7] },
          { incidentId: 'INC-04', unitId: 'PUMP-01', etaMinutes: 11, etaRange: [9, 14] },
          { incidentId: 'INC-05', unitId: 'BOAT-02', etaMinutes: 6, etaRange: [5, 8] },
        ],
        unserved: [],
        changes: [
          {
            incidentId: 'INC-03',
            change: 'changed',
            before: { unitId: 'AMB-01', etaMinutes: 7 },
            after: { unitId: 'AMB-01', etaMinutes: 5 },
            reason: `Drainage pump cleared 80ft Road. Medical ambulance route shortened by 2 min. (Generated at ${timeStr})`,
          },
          {
            incidentId: 'INC-01',
            change: 'changed',
            before: { unitId: 'BOAT-01', etaMinutes: 6 },
            after: { unitId: 'BOAT-01', etaMinutes: 4 },
            reason: 'Calmer floodwaters enable higher-speed navigation along Bellandur canal axis.',
          },
          {
            incidentId: 'INC-02',
            change: 'unchanged',
            before: { unitId: 'RES-01', etaMinutes: 9 },
            after: { unitId: 'RES-01', etaMinutes: 7 },
            reason: 'Detour proceeding smoothly; rescue crew approaching staging point.',
          },
          {
            incidentId: 'INC-06',
            change: 'added',
            before: null,
            after: { unitId: 'AMB-02', etaMinutes: 9 },
            reason: 'Emergency backup trauma ambulance assigned to newly assessed senior citizen distress call.',
          },
        ],
        pendingApprovalIds: [],
      };

      publishPlan(dynamicPlan);
      setActivePlanId(dynamicPlan.planId);
      pushOpLog({
        category: 'system',
        incidentId: null,
        unitId: null,
        text: `Automated Dispatch: Published updated tactical plan ${dynamicPlan.planId}`,
        detail: dynamicPlan.trigger,
      });
      setSimulating(false);
    }, 400);
  }

  const changedRows = activePlan.changes.filter((c) => c.change !== 'unchanged');
  const unchangedRows = activePlan.changes.filter((c) => c.change === 'unchanged');
  const pendingApprovalCount = activePlan.pendingApprovalIds.length;

  return (
    <div className="h-full overflow-y-auto bg-[#F8FAFC] text-slate-900">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Navigation & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Link to="/command" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline">
            <ArrowLeft className="w-4 h-4" /> Back to Command Center
          </Link>

          {/* Action */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSimulateDynamicSolve}
              disabled={simulating}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${simulating ? 'animate-spin' : ''}`} />
              <span>{simulating ? 'Re-optimizing...' : 'Simulate Solver Re-route'}</span>
            </button>
          </div>
        </div>

        {/* ── Plan Version Switcher Bar ── */}
        <div className="p-3 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Layers className="w-4 h-4 text-blue-600" />
            <span>Select Tactical Plan:</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'PLAN-002', label: 'Plan v2 (Flooded Underpass Reroute)', plan: MOCK_PLAN_V2 as unknown as Plan },
              { id: 'PLAN-003', label: 'Plan v3 (Surge Evacuation Optimization)', plan: MOCK_PLAN_V3 as unknown as Plan },
              { id: 'PLAN-001', label: 'Plan v1 (Initial Baseline)', plan: MOCK_PLAN_V1 as unknown as Plan },
            ].map((p) => {
              const isSelected = activePlan.planId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectPlan(p.plan)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                    isSelected
                      ? 'bg-blue-50 text-blue-700 border border-blue-300 font-semibold'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Plan Header Card */}
        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200">
                  <TrendingUp className="w-4 h-4" />
                </span>
                <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  Tactical Plan Diff
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    {activePlan.planId} v{activePlan.version}
                  </span>
                </h1>
              </div>

              <p className="mt-2 text-xs text-slate-600 font-sans leading-relaxed">
                <span className="text-slate-400 font-mono uppercase tracking-wider text-[10px] mr-1">Trigger:</span>
                {activePlan.trigger}
              </p>

              <div className="flex items-center gap-2 mt-2 text-[11px] font-mono text-slate-500">
                <span>Published: {activePlan.publishedAt.replace('T', ' ')}</span>
                {activePlan.previousPlanId && (
                  <>
                    <span>·</span>
                    <span className="text-blue-600 font-semibold">Diff Against: {activePlan.previousPlanId}</span>
                  </>
                )}
              </div>
            </div>

            {/* Quick Metrics Badges */}
            <div className="flex flex-wrap gap-1.5 shrink-0">
              <span className="px-2.5 py-1 rounded text-xs font-mono font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {changedRows.length} Changed
              </span>
              <span className="px-2.5 py-1 rounded text-xs font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {activePlan.changes.filter((c) => c.change === 'added').length} Added
              </span>
              <span className="px-2.5 py-1 rounded text-xs font-mono font-semibold bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                {unchangedRows.length} Unchanged
              </span>
            </div>
          </div>
        </div>

        {/* Pending approval banner */}
        {pendingApprovalCount > 0 && (
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <p className="font-semibold text-slate-900 text-xs">
                  Operator Decision Required
                </p>
                <p className="text-[11px] text-amber-700">
                  {pendingApprovalCount} tactical recommendation pending operator review before solver publish.
                </p>
              </div>
            </div>
            <Link to="/command/approvals" className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 transition-colors shadow-sm shrink-0">
              Review Approvals →
            </Link>
          </div>
        )}

        {/* Changed rows table */}
        {changedRows.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Changed Tactical Assignments</h2>
              <span className="text-[11px] font-mono text-slate-500">{changedRows.length} entries modified</span>
            </div>
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
              {/* Table header */}
              <div className="grid grid-cols-[28px_1.2fr_1fr_1fr_2fr] gap-0 bg-slate-50 border-b border-slate-200">
                <div />
                <div className="py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Incident</div>
                <div className="py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600 border-l border-slate-200">Previous</div>
                <div className="py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600 border-l border-slate-200">New Assignment</div>
                <div className="py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600 border-l border-slate-200">Optimization Reason</div>
              </div>

              {changedRows.map((change, i) => (
                <PlanChangeRow
                  key={change.incidentId + i}
                  change={change}
                  incident={incidentsById[change.incidentId]}
                  unitsById={unitsById}
                  isLast={i === changedRows.length - 1}
                />
              ))}
            </div>
          </section>
        )}

        {/* Unchanged rows (collapsed) */}
        {unchangedRows.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-2 text-slate-500">
              Unchanged Baseline ({unchangedRows.length})
            </h2>
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
              {unchangedRows.map((change, i) => (
                <PlanChangeRow
                  key={change.incidentId + i}
                  change={change}
                  incident={incidentsById[change.incidentId]}
                  unitsById={unitsById}
                  isLast={i === unchangedRows.length - 1}
                />
              ))}
            </div>
          </section>
        )}

        {/* Unserved incidents */}
        {activePlan.unserved.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-2 text-rose-700 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>Unserved Incidents ({activePlan.unserved.length})</span>
            </h2>
            <div className="space-y-1.5">
              {activePlan.unserved.map((u) => {
                const inc = incidentsById[u.incidentId];
                return (
                  <div key={u.incidentId} className="flex items-center gap-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs">
                    <span className="font-mono font-semibold text-rose-700">{u.incidentId}</span>
                    <span className="text-slate-800">{inc?.location.label ?? '—'}</span>
                    <span className="text-slate-500 ml-auto font-mono text-[11px]">{u.reason}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function PlanChangeRow({ change, incident, unitsById, isLast }: {
  change: PlanChange;
  incident: ReturnType<typeof useAppStore.getState>['incidentsById'][string] | undefined;
  unitsById: ReturnType<typeof useAppStore.getState>['unitsById'];
  isLast: boolean;
}) {
  const cfg = CHANGE_CONFIG[change.change];
  const Icon = cfg.icon;

  return (
    <div
      className={`grid grid-cols-[28px_1.2fr_1fr_1fr_2fr] gap-0 text-xs ${!isLast ? 'border-b border-slate-200' : ''} ${
        change.change === 'changed'
          ? 'bg-amber-50/40'
          : change.change === 'added'
          ? 'bg-emerald-50/40'
          : ''
      }`}
    >
      {/* Change type indicator */}
      <div className="flex items-center justify-center py-3" style={{ background: cfg.bg }}>
        <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} aria-label={cfg.label} />
      </div>

      {/* Incident */}
      <div className="py-3 px-3">
        <p className="text-xs font-mono font-semibold text-blue-600">{change.incidentId}</p>
        <p className="text-[11px] text-slate-700 mt-0.5 truncate font-medium">
          {incident?.location.label ?? '—'}
        </p>
      </div>

      {/* Before */}
      <div className="py-2.5 px-3 border-l border-slate-200">
        {change.before ? (
          <>
            <UnitChip unitId={change.before.unitId} unitsById={unitsById} />
            <p className="text-[11px] mt-1 font-mono text-slate-500">ETA {change.before.etaMinutes} min</p>
          </>
        ) : (
          <span className="text-xs text-slate-400 font-mono">—</span>
        )}
      </div>

      {/* After */}
      <div className="py-2.5 px-3 border-l border-slate-200">
        {change.after ? (
          <>
            <UnitChip unitId={change.after.unitId} unitsById={unitsById} />
            <p className="text-[11px] mt-1 font-mono font-semibold" style={{ color: cfg.color }}>ETA {change.after.etaMinutes} min</p>
          </>
        ) : (
          <span className="text-xs text-rose-600 font-mono font-medium">Removed</span>
        )}
      </div>

      {/* Reason */}
      <div className="py-2.5 px-3 border-l border-slate-200 flex items-center">
        <p className="text-xs leading-relaxed text-slate-600">
          {change.reason}
        </p>
      </div>
    </div>
  );
}

function UnitChip({ unitId, unitsById }: {
  unitId: string;
  unitsById: ReturnType<typeof useAppStore.getState>['unitsById'];
}) {
  const unit = unitsById[unitId];
  const tag = unit ? UNIT_TYPE_ICONS[unit.type] ?? 'UNIT' : 'UNIT';
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-800 border border-slate-200">
      <span className="text-[9px] text-blue-600 font-bold">{tag}</span>
      <span className="font-semibold">{unitId}</span>
    </div>
  );
}
