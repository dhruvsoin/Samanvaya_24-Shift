/**
 * AgentStream — shows live AI agent activity (newest first).
 */
import { Bot } from 'lucide-react';
import { useAppStore } from '@/store';

const AGENT_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  intake:     { text: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD' },
  assessment: { text: '#7E22CE', bg: '#FAF5FF', border: '#E9D5FF' },
  route:      { text: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  allocation: { text: '#047857', bg: '#ECFDF5', border: '#A7F3D0' },
  command:    { text: '#BE123C', bg: '#FFF1F2', border: '#FECDD3' },
};

export function AgentStream() {
  const agentStream = useAppStore((s) => s.agentStream);

  return (
    <div className="flex flex-col h-full bg-white select-none">
      {/* Header */}
      <div className="px-3.5 py-2.5 flex items-center justify-between shrink-0 border-b border-slate-200 bg-slate-50/80">
        <div className="flex items-center gap-2">
          <Bot className="w-3.5 h-3.5 text-blue-600" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">System Activity</h2>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Active
        </span>
      </div>

      {/* Stream */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 bg-slate-50/40">
        {agentStream.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-1 px-4 py-8 text-center">
            <p className="text-[11px] font-medium text-slate-400">System standby — no automated events</p>
          </div>
        ) : (
          agentStream.map((item) => {
            const theme = AGENT_COLORS[item.agent] ?? { text: '#475569', bg: '#F1F5F9', border: '#CBD5E1' };
            const timeStr = item.ts.includes('T') ? item.ts.substring(11, 19) : item.ts;

            return (
              <div
                key={item.id}
                className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs transition-all hover:border-slate-300 hover:shadow-xs shadow-none space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider"
                    style={{ color: theme.text, background: theme.bg, border: `1px solid ${theme.border}` }}
                  >
                    {item.agent}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 font-medium">
                    {timeStr}
                  </span>
                </div>
                <p className="text-[11px] text-slate-700 leading-relaxed font-sans font-medium">
                  {item.message}
                </p>
                {(item.incidentId || item.planId) && (
                  <div className="pt-1 border-t border-slate-100 flex items-center gap-1.5 font-mono text-[10px] text-blue-600">
                    <span className="text-slate-400 font-medium">REF:</span>
                    <span className="font-bold">{[item.incidentId, item.planId].filter(Boolean).join(' · ')}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
