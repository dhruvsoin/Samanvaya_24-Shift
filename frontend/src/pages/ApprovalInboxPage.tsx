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
    <div className="h-full overflow-y-auto bg-obsidian-canvas text-slate-100">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-obsidian-border/60 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold tracking-tight text-white font-sans">Decision Queue</h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-obsidian-surface border border-obsidian-border text-slate-400">
                {pending.length} pending · {resolved.length} resolved
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Verify and authorize autonomous reallocations, crew safety checks, and tactical plan dispatches.
            </p>
          </div>
          {isReadOnly && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Read-only Mode (Reviewer)</span>
            </div>
          )}
        </div>

        {/* Empty State */}
        {pending.length === 0 && resolved.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-lg border border-dashed border-obsidian-border bg-obsidian-well/30 text-center">
            <div className="w-10 h-10 rounded-full bg-obsidian-surface flex items-center justify-center text-slate-400 border border-obsidian-border">
              <Inbox className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-slate-300">All clear — no pending approvals</p>
            <p className="text-xs text-slate-500 max-w-sm">
              {import.meta.env.VITE_USE_MOCKS === 'true'
                ? 'Advance or trigger the scenario replay from the control bar to generate operational approval requests.'
                : 'Awaiting autonomous agent arbitration triggers…'}
            </p>
          </div>
        )}

        {/* Pending Decisions */}
        {pending.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <h2 className="text-xs font-mono uppercase tracking-wider text-slate-300">
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
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500">
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
      className={`rounded-lg transition-all duration-150 ${
        isPending
          ? 'bg-obsidian-well border border-obsidian-border shadow-sm'
          : 'bg-obsidian-canvas/60 border border-obsidian-border/50 opacity-80 hover:opacity-100'
      }`}
    >
      {/* Header bar */}
      <div className="p-4 border-b border-obsidian-border/60">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-obsidian-surface border border-obsidian-border text-slate-300">
                <KindIcon className="w-3 h-3 text-sky-400" />
                {meta.label}
              </span>
              <span className="text-[11px] font-mono text-slate-500">ID: {approval.approvalId}</span>
            </div>
            <h3 className="text-sm font-semibold text-white tracking-tight">{approval.summary}</h3>
            <p className="text-xs text-slate-400 leading-relaxed">{approval.reason}</p>
          </div>

          {/* Status Badge */}
          <div className="shrink-0">
            {approval.status === 'pending' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
                <Clock className="w-3 h-3" /> PENDING
              </span>
            )}
            {approval.status === 'approved' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle className="w-3 h-3" /> APPROVED
              </span>
            )}
            {approval.status === 'rejected' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <XCircle className="w-3 h-3" /> REJECTED
              </span>
            )}
          </div>
        </div>

        {/* Linked incidents */}
        {approval.relatedIncidentIds.length > 0 && (
          <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-obsidian-border/40">
            <span className="text-[11px] font-mono text-slate-500">Linked Incident:</span>
            {approval.relatedIncidentIds.map((id) => {
              const inc = incidentsById[id];
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-obsidian-surface border border-obsidian-border text-slate-300"
                >
                  <span className="text-sky-400">{id}</span>
                  {inc?.severity && (
                    <span className="text-[10px] text-slate-400 uppercase">({inc.severity})</span>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Options List */}
      <div className="p-4 space-y-2">
        <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">Evaluated Alternatives</div>
        {approval.options.map((option) => {
          const isRecommended = option.optionId === approval.recommendedOptionId;
          const isChosen = option.optionId === approval.chosenOptionId;

          return (
            <div
              key={option.optionId}
              className={`p-3 rounded border transition-colors flex items-start justify-between gap-4 ${
                isRecommended
                  ? 'bg-sky-950/20 border-sky-500/30'
                  : isChosen
                  ? 'bg-emerald-950/20 border-emerald-500/30'
                  : 'bg-obsidian-surface/60 border-obsidian-border/50'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-100">{option.label}</span>
                  {isRecommended && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
                      <Sparkles className="w-2.5 h-2.5" /> RECOMMENDED
                    </span>
                  )}
                  {isChosen && !isPending && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      CHOSEN
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">{option.description}</p>
              </div>

              {isPending && !isReadOnly && isRecommended && (
                <button
                  onClick={() => decide('approve', option.optionId)}
                  disabled={!!loading}
                  id={`btn-approve-${approval.approvalId}-${option.optionId}`}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-medium bg-sky-500 hover:bg-sky-400 text-obsidian-canvas transition-colors disabled:opacity-50"
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
        <div className="px-4 pb-4 pt-1 flex items-center gap-2.5 border-t border-obsidian-border/40">
          <button
            onClick={() => decide('approve')}
            disabled={!!loading}
            id={`btn-approve-${approval.approvalId}`}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-obsidian-surface hover:bg-rose-500/10 text-slate-300 hover:text-rose-400 border border-obsidian-border hover:border-rose-500/30 transition-colors disabled:opacity-50"
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
            className="flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-slate-200 ml-auto transition-colors"
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
        <div className="px-4 pb-3 pt-1 text-[11px] font-mono text-slate-500 border-t border-obsidian-border/30">
          Decided by <span className="text-slate-300 font-medium">{approval.decidedBy}</span>
          {approval.decidedAt && <span> at {approval.decidedAt.replace('T', ' ')}</span>}
        </div>
      )}
    </div>
  );
}
