/**
 * AfterActionPage — post-incident review, performance baseline, and audit report.
 * Obsidian Command design system: clean, minimal, human-crafted operations post-mortem.
 */
import { useCallback, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Clock,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Download,
  Radio,
  MapPin,
  Flag,
  Truck,
  ShieldAlert,
  Trash2,
  Activity,
  Award,
} from 'lucide-react';
import { useAppStore } from '@/store';
import type { OpLogCategory } from '@/store';

const MOCK_BASELINE_METRICS = [
  { metric: 'Avg Dispatch Time', unit: 'minutes', samanvaya: 1.8, baseline: 8.5 },
  { metric: 'First Responder Arrival', unit: 'minutes', samanvaya: 14.2, baseline: 42.0 },
  { metric: 'High-Risk Incident Triaged', unit: '%', samanvaya: 98.5, baseline: 64.0 },
  { metric: 'Comms Resiliency (Degraded Zones)', unit: '%', samanvaya: 94.0, baseline: 31.0 },
  { metric: 'Operator Decision Latency', unit: 'seconds', samanvaya: 45, baseline: 240 },
];

const CATEGORY_CONFIG: Record<OpLogCategory, { icon: typeof Radio; badgeClass: string; label: string }> = {
  sos_received: {
    icon: ShieldAlert,
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    label: 'SOS Received',
  },
  operator_dispatched: {
    icon: Radio,
    badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    label: 'Operator Dispatched',
  },
  crew_en_route: {
    icon: Truck,
    badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    label: 'Crew En Route',
  },
  crew_arrived: {
    icon: MapPin,
    badgeClass: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
    label: 'Crew Arrived',
  },
  task_complete: {
    icon: Flag,
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    label: 'Task Complete',
  },
  incident_updated: {
    icon: RefreshCw,
    badgeClass: 'bg-obsidian-surface text-slate-400 border-obsidian-border',
    label: 'Incident Updated',
  },
  system: {
    icon: Award,
    badgeClass: 'bg-obsidian-surface text-slate-400 border-obsidian-border',
    label: 'System',
  },
};

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch {
    return ts;
  }
}

export function AfterActionPage() {
  const [activeTab, setActiveTab] = useState<'timeline' | 'baseline' | 'plans' | 'unresolved'>('timeline');
  const incidentsById = useAppStore((s) => s.incidentsById);
  const incidents = useMemo(() => Object.values(incidentsById), [incidentsById]);
  const planHistory = useAppStore((s) => s.planHistory);
  const currentPlan = useAppStore((s) => s.currentPlan);
  const opLog = useAppStore((s) => s.opLog);
  const clearOpLog = useAppStore((s) => s.clearOpLog);

  const unresolvedList = useMemo(() => incidents.filter((i) => i.status !== 'resolved' && i.status !== 'closed'), [incidents]);
  const resolvedCount = useMemo(() => incidents.filter((i) => i.status === 'resolved' || i.status === 'closed').length, [incidents]);
  const totalSosCount = useMemo(() => opLog.filter((e) => e.category === 'sos_received').length, [opLog]);
  const completedCount = useMemo(() => opLog.filter((e) => e.category === 'task_complete').length, [opLog]);
  const dispatchedCount = useMemo(() => opLog.filter((e) => e.category === 'operator_dispatched').length, [opLog]);

  const planChangesData = useMemo(() => {
    if (planHistory.length > 0) {
      return planHistory.map((p) => ({ planId: p.planId, trigger: p.trigger, changes: p.changes }));
    }
    if (currentPlan) {
      return [{ planId: currentPlan.planId, trigger: currentPlan.trigger, changes: currentPlan.changes }];
    }
    return [];
  }, [planHistory, currentPlan]);

  const [, setRefreshKey] = useState(0);
  const handleRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className="h-full overflow-y-auto bg-obsidian-canvas text-slate-100 font-sans">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Navigation & Actions */}
        <div className="flex items-center justify-between">
          <Link
            to="/command"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-sky-400 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Command Center
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (window.confirm('Clear all logged actions from the After-Action history?')) {
                  clearOpLog();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded bg-obsidian-surface hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-obsidian-border hover:border-rose-500/30 transition-colors"
              title="Clear all recorded operational events"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Actions
            </button>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded bg-obsidian-surface hover:bg-obsidian-well text-slate-300 border border-obsidian-border transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          </div>
        </div>

        {/* Page Header */}
        <div className="p-5 rounded-lg bg-obsidian-well border border-obsidian-border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-7 h-7 rounded bg-obsidian-surface border border-obsidian-border flex items-center justify-center text-sky-400">
                <FileText className="w-4 h-4" />
              </div>
              <h1 className="text-base font-semibold text-white tracking-tight">After-Action Review (AAR)</h1>
            </div>
            <p className="text-xs text-slate-400">
              Operational audit trail, autonomous dispatch decisions, and benchmark telemetry.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 px-3 py-1.5 rounded bg-obsidian-surface border border-obsidian-border self-start md:self-auto">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span>Session Events: <strong className="text-white">{opLog.length}</strong></span>
          </div>
        </div>

        {/* Executive KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-lg bg-obsidian-well border border-obsidian-border space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-mono uppercase tracking-wider">SOS Received</span>
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="text-xl font-mono font-bold text-white">{totalSosCount || incidents.length || 0}</div>
            <div className="text-[11px] text-slate-500">Citizen distress signals</div>
          </div>

          <div className="p-4 rounded-lg bg-obsidian-well border border-obsidian-border space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-mono uppercase tracking-wider">Dispatched</span>
              <Activity className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="text-xl font-mono font-bold text-white">{dispatchedCount}</div>
            <div className="text-[11px] text-sky-400 font-mono">Operator decisions logged</div>
          </div>

          <div className="p-4 rounded-lg bg-obsidian-well border border-obsidian-border space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-mono uppercase tracking-wider">Missions Complete</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-mono font-bold text-white">{completedCount || resolvedCount}</div>
            <div className="text-[11px] text-emerald-400 font-mono">Secured & resolved</div>
          </div>

          <div className="p-4 rounded-lg bg-obsidian-well border border-obsidian-border space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-mono uppercase tracking-wider">Pending Action</span>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-mono font-bold text-white">{unresolvedList.length}</div>
            <div className="text-[11px] text-amber-400 font-mono">Active monitoring</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-obsidian-border gap-2">
          {[
            { id: 'timeline', label: `Operations Audit Log (${opLog.length})` },
            { id: 'baseline', label: 'Benchmark vs Baseline' },
            { id: 'plans', label: 'Plan Evolutionary Steps' },
            { id: 'unresolved', label: `Unresolved Incidents (${unresolvedList.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-3.5 py-2 text-xs font-mono transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-sky-400 text-sky-300 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── LIVE OPERATION LOG TAB ── */}
        {activeTab === 'timeline' && (
          <div className="p-5 rounded-lg bg-obsidian-well border border-obsidian-border space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Live Operations & Dispatch Audit Log</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Deterministic chronological record of all SOS transmissions, operator dispatches, and field completions.
              </p>
            </div>

            {opLog.length === 0 ? (
              <div className="text-center py-16 flex flex-col items-center gap-2 rounded border border-dashed border-obsidian-border bg-obsidian-canvas/40">
                <FileText className="w-6 h-6 text-slate-500" />
                <p className="text-xs font-medium text-slate-300">No operational actions logged in this session yet</p>
                <p className="text-[11px] text-slate-500 max-w-sm">
                  Trigger an SOS from <Link to="/sos" className="text-sky-400 underline">/sos</Link>, dispatch a unit from the Command Center, or execute a crew task to record live events.
                </p>
              </div>
            ) : (
              <div className="relative pl-5 border-l border-obsidian-border space-y-3">
                {opLog.map((entry) => {
                  const cfg = CATEGORY_CONFIG[entry.category] || CATEGORY_CONFIG.system;
                  const Icon = cfg.icon;
                  return (
                    <div key={entry.id} className="relative">
                      {/* Timeline dot */}
                      <div className="absolute -left-[27px] top-2.5 w-3 h-3 rounded-full bg-obsidian-canvas border border-obsidian-border flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                      </div>

                      <div className="p-3 rounded bg-obsidian-surface/60 border border-obsidian-border/70 space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${cfg.badgeClass} flex items-center gap-1`}>
                              <Icon className="w-2.5 h-2.5" />
                              {cfg.label}
                            </span>
                            {entry.incidentId && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-obsidian-canvas text-sky-400 border border-obsidian-border">
                                {entry.incidentId}
                              </span>
                            )}
                            {entry.unitId && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-obsidian-canvas text-slate-300 border border-obsidian-border">
                                {entry.unitId}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-slate-500">
                            {formatTs(entry.ts)}
                          </span>
                        </div>

                        <p className="text-xs font-medium text-slate-100">{entry.text}</p>
                        {entry.detail && (
                          <p className="text-[11px] text-slate-400">{entry.detail}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* BASELINE TAB */}
        {activeTab === 'baseline' && (
          <div className="p-5 rounded-lg bg-obsidian-well border border-obsidian-border space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-white">System Efficiency vs Traditional Response</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Benchmark comparison of Samanvaya autonomous coordination against legacy SOPs.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-obsidian-border font-mono text-[11px] uppercase text-slate-500">
                    <th className="py-2.5 px-3">Performance Metric</th>
                    <th className="py-2.5 px-3">Samanvaya AI</th>
                    <th className="py-2.5 px-3">Legacy Baseline</th>
                    <th className="py-2.5 px-3">Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-obsidian-border/50">
                  {MOCK_BASELINE_METRICS.map((item, idx) => {
                    const isLowerBetter = item.unit === 'minutes' || item.unit === 'seconds';
                    const diff = isLowerBetter
                      ? ((item.baseline - item.samanvaya) / item.baseline) * 100
                      : ((item.samanvaya - item.baseline) / item.baseline) * 100;
                    return (
                      <tr key={idx} className="hover:bg-obsidian-surface/40 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-slate-200">{item.metric}</td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-sky-400">
                          {item.samanvaya} {item.unit}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">
                          {item.baseline} {item.unit}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            +{Math.abs(Math.round(diff))}% {isLowerBetter ? 'faster' : 'higher'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PLANS TAB */}
        {activeTab === 'plans' && (
          <div className="p-5 rounded-lg bg-obsidian-well border border-obsidian-border space-y-4">
            <h2 className="text-sm font-semibold text-white">Dynamic Plan Transitions</h2>
            {planChangesData.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 font-mono">No plan reallocations recorded during this session.</p>
            ) : (
              <div className="space-y-3">
                {planChangesData.map((p, idx) => (
                  <div key={idx} className="p-3.5 rounded bg-obsidian-surface/60 border border-obsidian-border space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="w-3.5 h-3.5 text-sky-400" />
                        <span className="font-mono text-xs font-semibold text-white">{p.planId}</span>
                      </div>
                      <span className="text-[11px] font-mono text-amber-400">Trigger: {p.trigger}</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Modifications: {p.changes?.length ?? 0} assignment shifts recorded.
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* UNRESOLVED TAB */}
        {activeTab === 'unresolved' && (
          <div className="p-5 rounded-lg bg-obsidian-well border border-obsidian-border space-y-4">
            <h2 className="text-sm font-semibold text-white">Remaining Unresolved Incidents</h2>
            {unresolvedList.length === 0 ? (
              <div className="text-center py-10 text-emerald-400 flex flex-col items-center gap-2">
                <CheckCircle2 className="w-6 h-6" />
                <p className="text-xs font-medium">All recorded incidents have been resolved</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {unresolvedList.map((inc) => (
                  <div key={inc.incidentId} className="p-3 rounded bg-obsidian-surface/60 border border-obsidian-border space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-white">{inc.incidentId}</span>
                      <span className="text-[10px] font-mono uppercase text-amber-400">{inc.status}</span>
                    </div>
                    <p className="text-xs text-slate-300">{inc.location.label}</p>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
                      <span>Affected: {inc.peopleAffected}</span>
                      <span>Type: {inc.type}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
