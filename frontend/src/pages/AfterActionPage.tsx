import { useCallback, useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import type { AfterActionReport } from '@contracts/types';
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
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    label: 'SOS Received',
  },
  operator_dispatched: {
    icon: Radio,
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    label: 'Operator Dispatched',
  },
  crew_en_route: {
    icon: Truck,
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    label: 'Crew En Route',
  },
  crew_arrived: {
    icon: MapPin,
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    label: 'Crew Arrived',
  },
  task_complete: {
    icon: Flag,
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    label: 'Task Complete',
  },
  incident_updated: {
    icon: RefreshCw,
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    label: 'Incident Updated',
  },
  system: {
    icon: Award,
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
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
  const [report, setReport] = useState<AfterActionReport | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const incidentsById = useAppStore((s) => s.incidentsById);
  const incidents = useMemo(() => Object.values(incidentsById), [incidentsById]);
  const planHistory = useAppStore((s) => s.planHistory);
  const currentPlan = useAppStore((s) => s.currentPlan);
  const agentStream = useAppStore((s) => s.agentStream);
  const opLog = useAppStore((s) => s.opLog);
  const clearOpLog = useAppStore((s) => s.clearOpLog);

  // Load real backend report
  useEffect(() => {
    let active = true;
    api.reports.afterAction()
      .then((data) => {
        if (active) setReport(data);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [refreshKey]);

  const unifiedTimeline = useMemo(() => {
    const list: Array<{
      id: string;
      ts: string;
      category: OpLogCategory;
      text: string;
      detail?: string;
      incidentId?: string | null;
      unitId?: string | null;
    }> = [];

    // 1. From real backend afterAction report timeline
    if (report?.timeline && report.timeline.length > 0) {
      report.timeline.forEach((item, idx) => {
        let cat: OpLogCategory = 'system';
        const txt = item.text.toLowerCase();
        if (txt.includes('reported')) cat = 'sos_received';
        else if (txt.includes('dispatched') || txt.includes('published') || txt.includes('plan')) cat = 'operator_dispatched';
        else if (txt.includes('en route') || txt.includes('accepted')) cat = 'crew_en_route';
        else if (txt.includes('arrived')) cat = 'crew_arrived';
        else if (txt.includes('resolved') || txt.includes('complete') || txt.includes('closed')) cat = 'task_complete';
        else if (txt.includes('assessed') || txt.includes('updated')) cat = 'incident_updated';

        list.push({
          id: `rpt-${idx}-${item.ts}`,
          ts: item.ts,
          category: cat,
          text: item.text,
          incidentId: item.incidentId || null,
        });
      });
    }

    // 2. From real agentStream
    agentStream.forEach((ag) => {
      list.push({
        id: `ag-${ag.id}`,
        ts: ag.ts,
        category: 'system',
        text: `[${ag.agent.toUpperCase()} AGENT] ${ag.message}`,
        incidentId: ag.incidentId,
      });
    });

    // 3. From opLog
    opLog.forEach((op) => {
      list.push({
        id: op.id,
        ts: op.ts,
        category: op.category,
        text: op.text,
        detail: op.detail,
        incidentId: op.incidentId,
        unitId: op.unitId,
      });
    });

    return list;
  }, [report, agentStream, opLog]);

  const unresolvedList = useMemo(() => incidents.filter((i) => i.status !== 'resolved' && i.status !== 'closed'), [incidents]);
  const resolvedCount = useMemo(() => incidents.filter((i) => i.status === 'resolved' || i.status === 'closed').length, [incidents]);
  const totalSosCount = useMemo(() => {
    return unifiedTimeline.filter((e) => e.category === 'sos_received').length || incidents.length || 0;
  }, [unifiedTimeline, incidents]);
  const completedCount = useMemo(() => unifiedTimeline.filter((e) => e.category === 'task_complete').length || resolvedCount, [unifiedTimeline, resolvedCount]);
  const dispatchedCount = useMemo(() => unifiedTimeline.filter((e) => e.category === 'operator_dispatched').length || (currentPlan ? 1 : 0), [unifiedTimeline, currentPlan]);

  const planChangesData = useMemo(() => {
    if (report?.planChanges && report.planChanges.length > 0) {
      return report.planChanges;
    }
    if (planHistory.length > 0) {
      return planHistory.map((p) => ({ planId: p.planId, trigger: p.trigger, changes: p.changes }));
    }
    if (currentPlan) {
      return [{ planId: currentPlan.planId, trigger: currentPlan.trigger, changes: currentPlan.changes }];
    }
    return [];
  }, [report, planHistory, currentPlan]);

  const handleRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className="h-full overflow-y-auto bg-[#F8FAFC] text-slate-900 font-sans">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Navigation & Actions */}
        <div className="flex items-center justify-between">
          <Link
            to="/command"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 transition-colors shadow-xs"
              title="Clear all recorded operational events"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Actions
            </button>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-colors shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Export Report
            </button>
          </div>
        </div>

        {/* Page Header */}
        <div className="p-5 rounded-xl bg-white border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                <FileText className="w-4 h-4" />
              </div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">After-Action Review (AAR)</h1>
            </div>
            <p className="text-xs text-slate-500">
              Operational audit trail, autonomous dispatch decisions, and benchmark telemetry.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-600 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 self-start md:self-auto font-medium">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>Session Events: <strong className="text-slate-900">{unifiedTimeline.length}</strong></span>
          </div>
        </div>

        {/* Executive KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-semibold uppercase tracking-wider">SOS Received</span>
              <ShieldAlert className="w-4 h-4 text-rose-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{totalSosCount || incidents.length || 0}</div>
            <div className="text-[11px] text-slate-500">Citizen distress signals</div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Dispatched</span>
              <Activity className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{dispatchedCount}</div>
            <div className="text-[11px] text-blue-600 font-medium">Operator decisions logged</div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Missions Complete</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{completedCount || resolvedCount}</div>
            <div className="text-[11px] text-emerald-600 font-medium">Secured & resolved</div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Pending Action</span>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{unresolvedList.length}</div>
            <div className="text-[11px] text-amber-600 font-medium">Active monitoring</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 gap-2">
          {[
            { id: 'timeline', label: `Operations Audit Log (${unifiedTimeline.length})` },
            { id: 'baseline', label: 'Benchmark vs Baseline' },
            { id: 'plans', label: 'Plan Evolutionary Steps' },
            { id: 'unresolved', label: `Unresolved Incidents (${unresolvedList.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-3.5 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── LIVE OPERATION LOG TAB ── */}
        {activeTab === 'timeline' && (
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Live Operations & Dispatch Audit Log</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Chronological record of all SOS transmissions, operator dispatches, and field completions.
              </p>
            </div>

            {unifiedTimeline.length === 0 ? (
              <div className="text-center py-16 flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/50">
                <FileText className="w-6 h-6 text-slate-400" />
                <p className="text-xs font-semibold text-slate-800">No operational actions logged in this session yet</p>
                <p className="text-[11px] text-slate-500 max-w-sm">
                  Trigger an SOS from <Link to="/sos" className="text-blue-600 underline font-medium">/sos</Link>, dispatch a unit from the Command Center, or execute a crew task to record live events.
                </p>
              </div>
            ) : (
              <div className="relative pl-5 border-l border-slate-200 space-y-3">
                {unifiedTimeline.map((entry) => {
                  const cfg = CATEGORY_CONFIG[entry.category] || CATEGORY_CONFIG.system;
                  const Icon = cfg.icon;
                  return (
                    <div key={entry.id} className="relative">
                      {/* Timeline dot */}
                      <div className="absolute -left-[27px] top-2.5 w-3 h-3 rounded-full bg-white border-2 border-blue-600 flex items-center justify-center">
                        <div className="w-1 h-1 rounded-full bg-blue-600" />
                      </div>

                      <div className="p-3.5 rounded-lg bg-white border border-slate-200 space-y-1 shadow-xs hover:border-slate-300 transition-colors">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${cfg.badgeClass} flex items-center gap-1 font-semibold`}>
                              <Icon className="w-2.5 h-2.5" />
                              {cfg.label}
                            </span>
                            {entry.incidentId && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-blue-700 border border-slate-200 font-semibold">
                                {entry.incidentId}
                              </span>
                            )}
                            {entry.unitId && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                                {entry.unitId}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-slate-400">
                            {formatTs(entry.ts)}
                          </span>
                        </div>

                        <p className="text-xs font-semibold text-slate-900">{entry.text}</p>
                        {entry.detail && (
                          <p className="text-[11px] text-slate-500">{entry.detail}</p>
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
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">System Efficiency vs Traditional Response</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Benchmark comparison of Samanvaya autonomous coordination against legacy SOPs.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 font-semibold uppercase text-slate-500 text-[10px] bg-slate-50">
                    <th className="py-2.5 px-3">Performance Metric</th>
                    <th className="py-2.5 px-3">Samanvaya Platform</th>
                    <th className="py-2.5 px-3">Legacy Baseline</th>
                    <th className="py-2.5 px-3">Improvement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {MOCK_BASELINE_METRICS.map((item, idx) => {
                    const isLowerBetter = item.unit === 'minutes' || item.unit === 'seconds';
                    const diff = isLowerBetter
                      ? ((item.baseline - item.samanvaya) / item.baseline) * 100
                      : ((item.samanvaya - item.baseline) / item.baseline) * 100;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-slate-900">{item.metric}</td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-blue-600">
                          {item.samanvaya} {item.unit}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">
                          {item.baseline} {item.unit}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
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
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Dynamic Plan Transitions</h2>
            {planChangesData.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 font-mono">No plan reallocations recorded during this session.</p>
            ) : (
              <div className="space-y-3">
                {planChangesData.map((p, idx) => (
                  <div key={idx} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="w-3.5 h-3.5 text-blue-600" />
                        <span className="font-mono text-xs font-semibold text-slate-900">{p.planId}</span>
                      </div>
                      <span className="text-[11px] font-mono text-amber-700 font-medium">Trigger: {p.trigger}</span>
                    </div>
                    <p className="text-xs text-slate-600">
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
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Remaining Unresolved Incidents</h2>
            {unresolvedList.length === 0 ? (
              <div className="text-center py-10 text-emerald-700 flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                <p className="text-xs font-semibold">All recorded incidents have been resolved</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {unresolvedList.map((inc) => (
                  <div key={inc.incidentId} className="p-3.5 rounded-lg bg-white border border-slate-200 space-y-1 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-blue-600">{inc.incidentId}</span>
                      <span className="text-[10px] font-mono uppercase text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-semibold">{inc.status}</span>
                    </div>
                    <p className="text-xs text-slate-800 font-medium">{inc.location.label}</p>
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
