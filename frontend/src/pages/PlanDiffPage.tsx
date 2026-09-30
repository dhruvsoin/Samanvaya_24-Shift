import { useState, useEffect } from 'react';
import { useAppStore } from '@/store';
import { Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Plus, AlertTriangle, Sparkles, Layers, RefreshCw, CheckCircle2 } from 'lucide-react';
import { UNIT_TYPE_ICONS } from '@/components/common/StatusBadges';
import { api } from '@/api/client';
import { MOCK_PLAN_V1, MOCK_PLAN_V2, MOCK_PLAN_V3 } from '@/mocks/handlers';
import type { Plan, PlanChange } from '@contracts/types';

const CHANGE_CONFIG = {
  added:     { icon: Plus,         label: 'Added',     color: 'hsl(142,71%,45%)', bg: 'hsl(142,71%,45%,0.08)' },
  removed:   { icon: Minus,        label: 'Removed',   color: 'hsl(0,84%,60%)',   bg: 'hsl(0,84%,60%,0.08)' },
  changed:   { icon: TrendingUp,   label: 'Changed',   color: 'hsl(48,96%,53%)',  bg: 'hsl(48,96%,53%,0.08)' },
  unchanged: { icon: Minus,        label: 'Unchanged', color: 'hsl(215,20%,45%)', bg: 'transparent' },
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
        trigger: `Live solver optimization at ${timeStr}: 80ft Road water recession detected; ambulance response corridor expedited`,
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
        text: `🤖 AI Dispatch Solver: Published updated tactical plan ${dynamicPlan.planId}`,
        detail: dynamicPlan.trigger,
      });
      setSimulating(false);
    }, 400);
  }

  const changedRows = activePlan.changes.filter((c) => c.change !== 'unchanged');
  const unchangedRows = activePlan.changes.filter((c) => c.change === 'unchanged');
  const pendingApprovalCount = activePlan.pendingApprovalIds.length;

  return (
    <div className="h-full overflow-y-auto bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Navigation & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Link to="/command" className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline text-blue-400">
            <ArrowLeft className="w-4 h-4" /> Back to Command Center
          </Link>

          {/* Interactive Simulation Action */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSimulateDynamicSolve}
              disabled={simulating}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-900/40 transition active:scale-95 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-spin" />
              <span>{simulating ? 'Re-solving...' : '⚡ Simulate Solver Re-route'}</span>
            </button>
          </div>
        </div>

        {/* ── Plan Version Switcher Bar ── */}
        <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
            <Layers className="w-4 h-4 text-blue-400" />
            <span>Select Tactical Plan:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'PLAN-002', label: 'Plan v2 (Flooded Underpass Reroute Diff)', plan: MOCK_PLAN_V2 as unknown as Plan },
              { id: 'PLAN-003', label: 'Plan v3 (Surge Evacuation Optimization)', plan: MOCK_PLAN_V3 as unknown as Plan },
              { id: 'PLAN-001', label: 'Plan v1 (Initial Baseline Deployment)', plan: MOCK_PLAN_V1 as unknown as Plan },
            ].map((p) => {
              const isSelected = activePlan.planId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectPlan(p.plan)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50 border border-blue-400/40 ring-2 ring-blue-500/20'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Plan Header Card */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/40 border border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="p-2 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  <TrendingUp className="w-5 h-5" />
                </span>
                <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
                  Tactical Plan Diff
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {activePlan.planId} v{activePlan.version}
                  </span>
                </h1>
              </div>

              <p className="mt-2 text-sm text-slate-300">
                <strong className="text-white">Trigger:</strong> {activePlan.trigger}
              </p>

              <div className="flex items-center gap-3 mt-2 text-xs font-mono text-slate-400">
                <span>Published: {activePlan.publishedAt.replace('T', ' ')}</span>
                {activePlan.previousPlanId && (
                  <>
                    <span>·</span>
                    <span className="text-cyan-400">Diff Against: {activePlan.previousPlanId}</span>
                  </>
                )}
              </div>
            </div>

            {/* Quick Metrics Badges */}
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                {changedRows.length} Changed
              </span>
              <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                {activePlan.changes.filter((c) => c.change === 'added').length} Added
              </span>
              <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5">
                <Minus className="w-3.5 h-3.5" />
                {unchangedRows.length} Unchanged
              </span>
            </div>
          </div>
        </div>

        {/* Pending approval banner */}
        {pendingApprovalCount > 0 && (
          <div className="flex items-center justify-between p-4 rounded-xl bg-amber-500/10 border-2 border-amber-500/30 text-amber-300">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="font-bold text-white text-sm">
                  ⚡ Operator Decision Required
                </p>
                <p className="text-xs text-amber-200/80">
                  {pendingApprovalCount} tactical recommendation pending operator review before plan execution.
                </p>
              </div>
            </div>
            <Link to="/command/approvals" className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-400 text-slate-950 hover:bg-amber-300 transition shadow-md shrink-0">
              Review Approvals →
            </Link>
          </div>
        )}

        {/* Changed rows table */}
        {changedRows.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-3 text-white">Changed Assignments</h2>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid hsl(217,33%,18%)' }}>
              {/* Table header */}
              <div className="grid grid-cols-[24px_1fr_1fr_1fr_2fr] gap-0"
                style={{ background: 'hsl(222,47%,10%)' }}>
                <div />
                <div className="py-2.5 px-3 text-xs font-semibold" style={{ color: 'hsl(215,20%,50%)' }}>Incident</div>
                <div className="py-2.5 px-3 text-xs font-semibold border-l" style={{ color: 'hsl(215,20%,50%)', borderColor: 'hsl(217,33%,18%)' }}>BEFORE</div>
                <div className="py-2.5 px-3 text-xs font-semibold border-l" style={{ color: 'hsl(215,20%,50%)', borderColor: 'hsl(217,33%,18%)' }}>AFTER</div>
                <div className="py-2.5 px-3 text-xs font-semibold border-l" style={{ color: 'hsl(215,20%,50%)', borderColor: 'hsl(217,33%,18%)' }}>Reason</div>
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
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'hsl(215,20%,50%)' }}>
              Unchanged ({unchangedRows.length})
            </h2>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid hsl(217,33%,14%)' }}>
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
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" style={{ color: 'hsl(0,84%,60%)' }} />
              <span style={{ color: 'hsl(0,84%,60%)' }}>Unserved Incidents ({activePlan.unserved.length})</span>
            </h2>
            <div className="space-y-2">
              {activePlan.unserved.map((u) => {
                const inc = incidentsById[u.incidentId];
                return (
                  <div key={u.incidentId} className="flex items-center gap-3 p-3 rounded-lg"
                    style={{ background: 'hsl(0,84%,60%,0.08)', border: '1px solid hsl(0,84%,60%,0.2)' }}>
                    <span className="font-bold mono text-sm" style={{ color: 'hsl(0,84%,60%)' }}>{u.incidentId}</span>
                    <span className="text-sm text-white">{inc?.location.label ?? '—'}</span>
                    <span className="text-sm ml-auto" style={{ color: 'hsl(215,20%,55%)' }}>{u.reason}</span>
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
  const isHighlighted = change.change !== 'unchanged';

  return (
    <div
      className={`grid grid-cols-[24px_1fr_1fr_1fr_2fr] gap-0 ${!isLast ? 'border-b' : ''} ${isHighlighted ? 'diff-highlight' : ''}`}
      style={{
        borderColor: 'hsl(217,33%,14%)',
        background: isHighlighted ? cfg.bg : 'transparent',
      }}
    >
      {/* Change type indicator */}
      <div className="flex items-center justify-center py-3" style={{ background: `${cfg.color}15` }}>
        <Icon className="w-3 h-3" style={{ color: cfg.color }} aria-label={cfg.label} />
      </div>

      {/* Incident */}
      <div className="py-3 px-3">
        <p className="text-xs font-bold mono" style={{ color: 'hsl(217,91%,60%)' }}>{change.incidentId}</p>
        <p className="text-xs mt-0.5 truncate" style={{ color: 'hsl(215,20%,55%)' }}>
          {incident?.location.label ?? '—'}
        </p>
      </div>

      {/* Before */}
      <div className="py-3 px-3 border-l" style={{ borderColor: 'hsl(217,33%,14%)' }}>
        {change.before ? (
          <>
            <UnitChip unitId={change.before.unitId} unitsById={unitsById} />
            <p className="text-xs mt-1 mono" style={{ color: 'hsl(215,20%,50%)' }}>ETA {change.before.etaMinutes} min</p>
          </>
        ) : (
          <span className="text-xs" style={{ color: 'hsl(215,20%,35%)' }}>—</span>
        )}
      </div>

      {/* After */}
      <div className="py-3 px-3 border-l" style={{ borderColor: 'hsl(217,33%,14%)' }}>
        {change.after ? (
          <>
            <UnitChip unitId={change.after.unitId} unitsById={unitsById} />
            <p className="text-xs mt-1 mono" style={{ color: cfg.color }}>ETA {change.after.etaMinutes} min</p>
          </>
        ) : (
          <span className="text-xs" style={{ color: 'hsl(0,84%,60%)' }}>Removed</span>
        )}
      </div>

      {/* Reason */}
      <div className="py-3 px-3 border-l flex items-center" style={{ borderColor: 'hsl(217,33%,14%)' }}>
        <p className="text-xs leading-snug" style={{ color: isHighlighted ? 'hsl(215,20%,70%)' : 'hsl(215,20%,40%)' }}>
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
  const icon = unit ? UNIT_TYPE_ICONS[unit.type] ?? '🚗' : '🚗';
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: 'hsl(222,47%,14%)', color: 'white', border: '1px solid hsl(217,33%,22%)' }}>
      <span>{icon}</span>
      <span className="mono">{unitId}</span>
    </div>
  );
}
