/**
 * ApprovalInboxPage — operator approves or rejects AI-proposed decisions.
 */
import { useState } from 'react';
import { CheckCircle, XCircle, ChevronDown, Loader2, Clock } from 'lucide-react';
import { useAppStore } from '@/store';
import { useAuthStore } from '@/store/auth';
import { api } from '@/api/client';
import { SeverityBadge } from '@/components/common/StatusBadges';
import type { Approval } from '@contracts/types';

export function ApprovalInboxPage() {
  const approvalsById = useAppStore((s) => s.approvalsById);
  const { role } = useAuthStore();
  const isReadOnly = role === 'reviewer';

  const pending = Object.values(approvalsById).filter((a) => a.status === 'pending');
  const resolved = Object.values(approvalsById).filter((a) => a.status !== 'pending');

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">Approval Inbox</h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(215,20%,55%)' }}>
            {pending.length} pending · {resolved.length} resolved
            {isReadOnly && <span className="ml-2 px-2 py-0.5 rounded text-xs"
              style={{ background: 'hsl(48,96%,53%,0.1)', color: 'hsl(48,96%,55%)' }}>
              👁 Read-only (reviewer)
            </span>}
          </p>
        </div>

        {pending.length === 0 && resolved.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="text-4xl">✅</div>
            <p className="font-semibold" style={{ color: 'hsl(215,20%,55%)' }}>No pending approvals</p>
            <p className="text-sm" style={{ color: 'hsl(215,20%,40%)' }}>
              {import.meta.env.VITE_USE_MOCKS === 'true'
                ? 'Run the replay to see approval requests appear'
                : 'Waiting for the system to request decisions…'}
            </p>
          </div>
        )}

        {pending.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'hsl(48,96%,53%)' }} />
              Pending Decisions
            </h2>
            {pending.map((approval) => (
              <ApprovalCard key={approval.approvalId} approval={approval} isReadOnly={isReadOnly} />
            ))}
          </section>
        )}

        {resolved.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold" style={{ color: 'hsl(215,20%,50%)' }}>
              Resolved ({resolved.length})
            </h2>
            {resolved.map((approval) => (
              <ApprovalCard key={approval.approvalId} approval={approval} isReadOnly={true} />
            ))}
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

  const KIND_LABELS: Record<string, string> = {
    reassign_unit: '🔄 Reassign Unit',
    crew_check: '📡 Crew Check-in',
    plan_publish: '📋 Plan Publish',
    other: '⚡ Action',
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        border: isPending ? '1px solid hsl(48,96%,53%,0.3)' : '1px solid hsl(217,33%,18%)',
        background: isPending ? 'hsl(48,96%,53%,0.04)' : 'hsl(222,47%,8%)',
      }}
    >
      {/* Card header */}
      <div className="p-4 border-b" style={{ borderColor: isPending ? 'hsl(48,96%,53%,0.15)' : 'hsl(217,33%,18%)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium" style={{ color: 'hsl(215,20%,50%)' }}>
                {KIND_LABELS[approval.kind] ?? approval.kind}
              </span>
              <span className="mono text-xs" style={{ color: 'hsl(217,91%,55%)' }}>{approval.approvalId}</span>
            </div>
            <p className="font-semibold text-white">{approval.summary}</p>
            <p className="text-sm mt-1" style={{ color: 'hsl(215,20%,60%)' }}>{approval.reason}</p>
          </div>
          <div className="shrink-0">
            {approval.status === 'pending' && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                style={{ background: 'hsl(48,96%,53%,0.12)', color: 'hsl(48,96%,65%)', border: '1px solid hsl(48,96%,53%,0.25)' }}>
                <Clock className="w-3 h-3" /> PENDING
              </div>
            )}
            {approval.status === 'approved' && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                style={{ background: 'hsl(142,71%,45%,0.1)', color: 'hsl(142,71%,55%)', border: '1px solid hsl(142,71%,45%,0.2)' }}>
                <CheckCircle className="w-3 h-3" /> APPROVED
              </div>
            )}
            {approval.status === 'rejected' && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                style={{ background: 'hsl(0,84%,60%,0.1)', color: 'hsl(0,84%,65%)', border: '1px solid hsl(0,84%,60%,0.2)' }}>
                <XCircle className="w-3 h-3" /> REJECTED
              </div>
            )}
          </div>
        </div>

        {/* Related incidents */}
        {approval.relatedIncidentIds.length > 0 && (
          <div className="flex gap-2 mt-2">
            {approval.relatedIncidentIds.map((id) => {
              const inc = incidentsById[id];
              return (
                <span key={id} className="px-2 py-0.5 rounded text-xs mono"
                  style={{ background: 'hsl(222,47%,13%)', color: 'hsl(217,91%,60%)', border: '1px solid hsl(217,91%,60%,0.15)' }}>
                  {id} {inc && `(${inc.severity?.toUpperCase() ?? 'PENDING'})`}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Options */}
      <div className="p-4 space-y-2">
        <p className="text-xs font-medium mb-3" style={{ color: 'hsl(215,20%,50%)' }}>Options:</p>
        {approval.options.map((option) => {
          const isRecommended = option.optionId === approval.recommendedOptionId;
          const isChosen = option.optionId === approval.chosenOptionId;
          return (
            <div
              key={option.optionId}
              className="flex items-start gap-3 p-3 rounded-lg"
              style={{
                background: isRecommended ? 'hsl(217,91%,60%,0.06)' : 'hsl(222,47%,11%)',
                border: `1px solid ${isRecommended ? 'hsl(217,91%,60%,0.2)' : isChosen ? 'hsl(142,71%,45%,0.3)' : 'hsl(217,33%,18%)'}`,
              }}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">{option.label}</p>
                  {isRecommended && (
                    <span className="px-1.5 py-0.5 rounded text-xs font-bold"
                      style={{ background: 'hsl(217,91%,60%,0.15)', color: 'hsl(217,91%,65%)' }}>
                      ⭐ RECOMMENDED
                    </span>
                  )}
                  {isChosen && !isPending && (
                    <span className="px-1.5 py-0.5 rounded text-xs font-bold"
                      style={{ background: 'hsl(142,71%,45%,0.1)', color: 'hsl(142,71%,55%)' }}>
                      ✓ CHOSEN
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(215,20%,55%)' }}>{option.description}</p>
              </div>
              {isPending && !isReadOnly && isRecommended && (
                <button
                  onClick={() => decide('approve', option.optionId)}
                  disabled={!!loading}
                  id={`btn-approve-${approval.approvalId}-${option.optionId}`}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                  style={{ background: 'hsl(217,91%,60%)', color: 'hsl(222,47%,6%)' }}
                >
                  {loading === 'approve' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                  Approve
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Action buttons (pending only, operator only) */}
      {isPending && !isReadOnly && (
        <div className="px-4 pb-4 flex items-center gap-2">
          <button
            onClick={() => decide('approve')}
            disabled={!!loading}
            id={`btn-approve-${approval.approvalId}`}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: 'hsl(142,71%,45%)', color: 'hsl(222,47%,6%)' }}
          >
            {loading === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Approve Recommended
          </button>
          <button
            onClick={() => decide('reject')}
            disabled={!!loading}
            id={`btn-reject-${approval.approvalId}`}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: 'hsl(0,84%,60%,0.15)', color: 'hsl(0,84%,65%)', border: '1px solid hsl(0,84%,60%,0.25)' }}
          >
            {loading === 'reject' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Reject
          </button>
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="flex items-center gap-1 text-xs ml-auto"
            style={{ color: 'hsl(215,20%,50%)' }}
          >
            Other options <ChevronDown className={`w-3 h-3 transition-transform ${showOptions ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}

      {/* Resolved footer */}
      {!isPending && approval.decidedBy && (
        <div className="px-4 pb-3 text-xs" style={{ color: 'hsl(215,20%,45%)' }}>
          Decided by <span className="text-white font-medium">{approval.decidedBy}</span>
          {approval.decidedAt && <span> at {approval.decidedAt.replace('T', ' ')}</span>}
        </div>
      )}
    </div>
  );
}
