/**
 * AfterActionPage — post-incident review, performance baseline, and audit report.
 *
 * Shows:
 * - Executive summary with KPI metrics
 * - Samanvaya vs Baseline comparison (speed, efficiency, lives saved)
 * - LIVE chronological operation audit log (opLog from store — real session events)
 * - Plan change evolutions and triggers
 * - Unresolved incidents requiring follow-up
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
  TrendingDown,
  Award,
  Layers,
  Download,
  Radio,
  MapPin,
  Flag,
  Truck,
  ShieldAlert,
  Trash2,
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

const CATEGORY_CONFIG: Record<OpLogCategory, { icon: typeof Radio; color: string; bg: string; label: string }> = {
  sos_received: {
    icon: ShieldAlert,
    color: 'hsl(0,84%,65%)',
    bg: 'hsl(0,84%,60%,0.1)',
    label: 'SOS Received',
  },
  operator_dispatched: {
    icon: Radio,
    color: 'hsl(217,91%,65%)',
    bg: 'hsl(217,91%,60%,0.1)',
    label: 'Operator Dispatched',
  },
  crew_en_route: {
    icon: Truck,
    color: 'hsl(48,96%,53%)',
    bg: 'hsl(48,96%,53%,0.1)',
    label: 'Crew En Route',
  },
  crew_arrived: {
    icon: MapPin,
    color: 'hsl(271,81%,65%)',
    bg: 'hsl(271,81%,60%,0.1)',
    label: 'Crew Arrived',
  },
  task_complete: {
    icon: Flag,
    color: 'hsl(142,71%,45%)',
    bg: 'hsl(142,71%,45%,0.1)',
    label: 'Task Complete',
  },
  incident_updated: {
    icon: RefreshCw,
    color: 'hsl(215,20%,55%)',
    bg: 'hsl(215,20%,50%,0.07)',
    label: 'Incident Updated',
  },
  system: {
    icon: Award,
    color: 'hsl(215,20%,55%)',
    bg: 'hsl(215,20%,50%,0.07)',
    label: 'System',
  },
};

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  } catch {
    return ts;
  }
}

export function AfterActionPage() {
  const [activeTab, setActiveTab] = useState<'baseline' | 'timeline' | 'plans' | 'unresolved'>('timeline');
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

  // Helper to force re-render (opLog is live from store so it auto-updates, but refresh button gives feedback)
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const _ = refreshKey; // suppress unused warning

  return (
    <div className="h-full overflow-y-auto bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Navigation & Actions */}
        <div className="flex items-center justify-between">
          <Link
            to="/command"
            className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
            style={{ color: 'hsl(217,91%,65%)' }}
          >
            <ArrowLeft className="w-4 h-4" /> Back to Command Center
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (window.confirm('Clear all logged actions from the After-Action history?')) {
                  clearOpLog();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-rose-800/60 bg-rose-950/40 text-rose-300 hover:bg-rose-900/50 font-semibold transition"
              title="Clear all recorded operational events"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Actions
            </button>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold transition"
            >
              <Download className="w-3.5 h-3.5" />
              Export / Print
            </button>
          </div>
        </div>

        {/* Page Header */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/30 border border-slate-800 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <FileText className="w-5 h-5" />
                </span>
                <h1 className="text-2xl font-bold tracking-tight text-white">After-Action Review (AAR)</h1>
              </div>
              <p className="text-sm text-slate-400">
                Official operational analysis, live emergency coordination audit log, and AI optimization benchmarks.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800 self-start md:self-auto">
              <Clock className="w-4 h-4 text-blue-400" />
              <span>Live session · <strong className="text-slate-200">{opLog.length} events logged</strong></span>
            </div>
          </div>
        </div>

        {/* Executive KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">SOS Received</span>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-bold text-white">{totalSosCount || incidents.length || 0}</div>
            <div className="mt-1 text-xs text-slate-400">from citizens this session</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Dispatched</span>
              <TrendingDown className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white">{dispatchedCount}</div>
            <div className="mt-1 text-xs text-blue-400">operator decisions made</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Missions Complete</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-white">{completedCount || resolvedCount}</div>
            <div className="mt-1 text-xs text-emerald-400">crews reported task done</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Pending Follow-ups</span>
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-bold text-white">{unresolvedList.length}</div>
            <div className="mt-1 text-xs text-rose-400">active monitoring required</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 space-x-2">
          {[
            { id: 'timeline', label: `📋 Live Operation Log (${opLog.length})` },
            { id: 'baseline', label: '📊 Benchmark vs Baseline' },
            { id: 'plans', label: '🗂 Plan Evolutionary Steps' },
            { id: 'unresolved', label: `⚠️ Unresolved (${unresolvedList.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── LIVE OPERATION LOG TAB ── */}
        {activeTab === 'timeline' && (
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">Live Operations & Decision Audit Log</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time record of every event in this session: citizen SOS → operator dispatch → crew actions → task completion.
              </p>
            </div>

            {opLog.length === 0 ? (
              <div className="text-center py-12 flex flex-col items-center gap-3">
                <div className="text-5xl">📋</div>
                <p className="font-semibold text-slate-300">No operations recorded yet in this session</p>
                <p className="text-xs text-slate-500 max-w-sm text-center">
                  Submit an SOS at <Link to="/sos" className="text-blue-400 hover:underline">/sos</Link>, then dispatch a unit from Command Center, and have crew complete the mission. All events will appear here.
                </p>
                <Link
                  to="/sos"
                  className="mt-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition"
                >
                  → Submit Test SOS
                </Link>
              </div>
            ) : (
              <div className="relative pl-6 border-l-2 border-slate-800 space-y-4">
                {opLog.map((entry) => {
                  const cfg = CATEGORY_CONFIG[entry.category] || CATEGORY_CONFIG.system;
                  const Icon = cfg.icon;
                  return (
                    <div key={entry.id} className="relative group">
                      {/* Timeline dot */}
                      <div
                        className="absolute -left-[31px] top-2 w-4 h-4 rounded-full border-2 border-slate-950 flex items-center justify-center"
                        style={{ background: cfg.color }}
                      >
                        <Icon className="w-2.5 h-2.5 text-white" />
                      </div>

                      <div
                        className="p-3 rounded-xl border transition-all group-hover:border-opacity-60"
                        style={{ background: cfg.bg, borderColor: cfg.color + '30' }}
                      >
                        {/* Header row */}
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                              style={{ background: cfg.color + '20', color: cfg.color }}
                            >
                              {cfg.label}
                            </span>
                            {entry.incidentId && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                {entry.incidentId}
                              </span>
                            )}
                            {entry.unitId && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                {entry.unitId}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            {formatTs(entry.ts)}
                          </span>
                        </div>

                        {/* Main text */}
                        <p className="text-sm font-semibold text-white">{entry.text}</p>

                        {/* Detail */}
                        {entry.detail && (
                          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{entry.detail}</p>
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
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">System Efficiency vs Traditional Response</h2>
              <p className="text-xs text-slate-400">
                Direct benchmark comparing Samanvaya autonomous coordination against legacy standard operating procedures.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4">Performance Metric</th>
                    <th className="py-3 px-4">Samanvaya AI</th>
                    <th className="py-3 px-4">Legacy Baseline</th>
                    <th className="py-3 px-4">Improvement / Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {MOCK_BASELINE_METRICS.map((item, idx) => {
                    const isLowerBetter = item.unit === 'minutes' || item.unit === 'seconds';
                    const diff = isLowerBetter
                      ? ((item.baseline - item.samanvaya) / item.baseline) * 100
                      : ((item.samanvaya - item.baseline) / item.baseline) * 100;
                    return (
                      <tr key={idx} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-4 font-semibold text-slate-200">{item.metric}</td>
                        <td className="py-3 px-4 font-mono font-bold text-blue-400">
                          {item.samanvaya} {item.unit}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400">
                          {item.baseline} {item.unit}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
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
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <h2 className="text-lg font-bold text-white">Dynamic Plan Transitions</h2>
            {planChangesData.length === 0 ? (
              <p className="text-sm text-slate-400 py-4">No plan reallocations recorded during this session.</p>
            ) : (
              <div className="space-y-4">
                {planChangesData.map((p, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-blue-400" />
                        <span className="font-bold font-mono text-white">{p.planId}</span>
                      </div>
                      <span className="text-xs text-amber-400 font-medium">Trigger: {p.trigger}</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Modifications: {p.changes?.length ?? 0} assignment shifts executed.
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* UNRESOLVED TAB */}
        {activeTab === 'unresolved' && (
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <h2 className="text-lg font-bold text-white">Remaining / Unresolved Incidents</h2>
            {unresolvedList.length === 0 ? (
              <div className="text-center py-8 text-emerald-400 flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8" />
                <p className="font-semibold">All incidents have been successfully resolved!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {unresolvedList.map((inc) => (
                  <div key={inc.incidentId} className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm text-white">{inc.incidentId}</span>
                      <span className="text-xs uppercase font-semibold text-amber-400">{inc.status}</span>
                    </div>
                    <p className="text-xs text-slate-300 mb-2">{inc.location.label}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>People affected: {inc.peopleAffected}</span>
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
