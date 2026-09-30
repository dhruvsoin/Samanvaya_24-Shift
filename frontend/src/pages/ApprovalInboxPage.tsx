/**
 * ApprovalInboxPage — operator approves or rejects AI-proposed decisions.
 * Obsidian Command design system: clean, minimal, human-crafted decision workspace.
 */
import { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  ChevronDown,
  Loader2,
  Clock,
  Shuffle,
  Radio,
  FileText,
  Zap,
  ShieldAlert,
  Inbox,
  Sparkles,
} from 'lucide-react';
import { useAppStore } from '@/store';
import { useAuthStore } from '@/store/auth';
import { api } from '@/api/client';
import type { Approval } from '@contracts/types';

export function ApprovalInboxPage() {
  const approvalsById = useAppStore((s) => s.approvalsById);
  const { role } = useAuthStore();
  const isReadOnly = role === 'reviewer';

  const pending = Object.values(approvalsById).filter((a) => a.status === 'pending');
  const resolved = Object.values(approvalsById).filter((a) => a.status !== 'pending');

  return (
    <div className="h-full overflow-y-auto bg-[#F8FAFC] text-slate-900">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans">Decision Queue</h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-medium">
                {pending.length} pending · {resolved.length} resolved
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Verify and authorize resource reallocations, crew safety checks, and tactical plan dispatches.
            </p>
          </div>
          {isReadOnly && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              <span>Read-only Mode (Reviewer)</span>
            </div>
          )}
        </div>

        {/* Empty State */}
        {pending.length === 0 && resolved.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-xl border border-dashed border-slate-300 bg-white text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
              <Inbox className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-800">All clear — no pending approvals</p>
            <p className="text-xs text-slate-500 max-w-sm">
              {import.meta.env.VITE_USE_MOCKS === 'true'
                ? 'Advance or trigger scenario events from the control bar to generate operational approval requests.'
                : 'Awaiting operational approval triggers…'}
            </p>
          </div>
        )}

        {/* Pending Decisions */}
        {pending.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Pending Actions Requiring Operator Sign-off ({pending.length})
              </h2>
            </div>
            <div className="space-y-4">
              {pending.map((approval) => (
                <ApprovalCard key={approval.approvalId} approval={approval} isReadOnly={isReadOnly} />
              ))}
            </div>
          </section>
        )}

        {/* Resolved Decisions */}
        {resolved.length > 0 && (
          <section className="space-y-3 pt-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Resolved Decisions History ({resolved.length})
            </h2>
            <div className="space-y-3">
              {resolved.map((approval) => (
                <ApprovalCard key={approval.approvalId} approval={approval} isReadOnly={true} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ApprovalCard({ approval, isReadOnly }: { approval: Approval; isReadOnly: boolean }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const resolveApproval = useAppStore((s) => s.resolveApproval);
  const incidentsById = useAppStore((s) => s.incidentsById);

  const isPending = approval.status === 'pending';

  async function decide(decision: 'approve' | 'reject' | 'choose_other', optionId?: string) {
    setLoading(decision);
    try {
      await api.approvals.decide(approval.approvalId, { decision, optionId });
      resolveApproval(approval.approvalId, {
        status: decision === 'approve' ? 'approved' : 'rejected',
        chosenOptionId: optionId ?? approval.recommendedOptionId,
        decidedBy: 'operator',
        decidedAt: new Date().toISOString().replace('Z', ''),
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to submit decision');
    } finally {
      setLoading(null);
    }
  }

  const kindMeta: Record<string, { label: string; icon: typeof Shuffle }> = {
    reassign_unit: { label: 'Reassign Unit', icon: Shuffle },
    crew_check: { label: 'Crew Safety Check', icon: Radio },
    plan_publish: { label: 'Plan Publish', icon: FileText },
    other: { label: 'Operational Action', icon: Zap },
  };

  const meta = kindMeta[approval.kind] ?? { label: approval.kind, icon: Zap };
  const KindIcon = meta.icon;

  return (
    <div
      className={`rounded-xl transition-all border ${
        isPending
          ? 'bg-white border-slate-200 shadow-sm'
          : 'bg-white/70 border-slate-200 text-slate-600'
      }`}
    >
      {/* Header bar */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                <KindIcon className="w-3 h-3 text-blue-600" />
                {meta.label}
              </span>
              <span className="text-[11px] font-mono text-slate-400">ID: {approval.approvalId}</span>
            </div>
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">{approval.summary}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">{approval.reason}</p>
          </div>

          {/* Status Badge */}
          <div className="shrink-0">
            {approval.status === 'pending' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                <Clock className="w-3 h-3 text-amber-600" /> PENDING
              </span>
            )}
            {approval.status === 'approved' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle className="w-3 h-3 text-emerald-600" /> APPROVED
              </span>
            )}
            {approval.status === 'rejected' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                <XCircle className="w-3 h-3 text-rose-600" /> REJECTED
              </span>
            )}
          </div>
        </div>

        {/* Linked incidents */}
        {approval.relatedIncidentIds.length > 0 && (
          <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-100">
            <span className="text-[11px] font-medium text-slate-400">Linked Incident:</span>
            {approval.relatedIncidentIds.map((id) => {
              const inc = incidentsById[id];
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-slate-50 border border-slate-200 text-slate-700"
                >
                  <span className="text-blue-600 font-semibold">{id}</span>
                  {inc?.severity && (
                    <span className="text-[10px] text-slate-400 uppercase font-sans">({inc.severity})</span>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Options List */}
      <div className="p-4 space-y-2 bg-slate-50/50">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Evaluated Alternatives</div>
        {approval.options.map((option) => {
          const isRecommended = option.optionId === approval.recommendedOptionId;
          const isChosen = option.optionId === approval.chosenOptionId;

          return (
            <div
              key={option.optionId}
              className={`p-3 rounded-lg border transition-colors flex items-start justify-between gap-4 ${
                isRecommended
                  ? 'bg-blue-50/80 border-blue-200'
                  : isChosen
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-900">{option.label}</span>
                  {isRecommended && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                      <Sparkles className="w-2.5 h-2.5 text-blue-600" /> Recommended
                    </span>
                  )}
                  {isChosen && !isPending && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Chosen
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600">{option.description}</p>
              </div>

              {isPending && !isReadOnly && isRecommended && (
                <button
                  onClick={() => decide('approve', option.optionId)}
                  disabled={!!loading}
                  id={`btn-approve-${approval.approvalId}-${option.optionId}`}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 shadow-sm"
                >
                  {loading === 'approve' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" />
                  )}
                  Execute
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Primary Action Buttons (Pending only) */}
      {isPending && !isReadOnly && (
        <div className="px-4 py-3 flex items-center gap-2.5 border-t border-slate-100 bg-white">
          <button
            onClick={() => decide('approve')}
            disabled={!!loading}
            id={`btn-approve-${approval.approvalId}`}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 shadow-sm"
          >
            {loading === 'approve' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5" />
            )}
            Approve Recommended
          </button>
          <button
            onClick={() => decide('reject')}
            disabled={!!loading}
            id={`btn-reject-${approval.approvalId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-200 transition-colors disabled:opacity-50"
          >
            {loading === 'reject' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <XCircle className="w-3.5 h-3.5" />
            )}
            Reject
          </button>
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-900 ml-auto transition-colors"
          >
            {showOptions ? 'Hide alternatives' : 'View alternatives'}{' '}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${showOptions ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      )}

      {/* Resolved info footer */}
      {!isPending && approval.decidedBy && (
        <div className="px-4 py-2.5 text-[11px] font-mono text-slate-500 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
          Decided by <span className="text-slate-800 font-semibold">{approval.decidedBy}</span>
          {approval.decidedAt && <span> at {approval.decidedAt.replace('T', ' ')}</span>}
        </div>
      )}
    </div>
  );
}
