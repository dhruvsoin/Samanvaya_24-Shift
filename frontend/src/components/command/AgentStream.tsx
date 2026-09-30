/**
 * AgentStream — shows live AI agent activity (newest first).
 */
import { Bot } from 'lucide-react';
import { useAppStore } from '@/store';

const AGENT_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  intake:     { text: '#38BDF8', bg: 'rgba(56, 189, 248, 0.1)', border: 'rgba(56, 189, 248, 0.25)' },
  assessment: { text: '#C084FC', bg: 'rgba(192, 132, 252, 0.1)', border: 'rgba(192, 132, 252, 0.25)' },
  route:      { text: '#FBBF24', bg: 'rgba(251, 191, 36, 0.1)', border: 'rgba(251, 191, 36, 0.25)' },
  allocation: { text: '#34D399', bg: 'rgba(52, 211, 153, 0.1)', border: 'rgba(52, 211, 153, 0.25)' },
  command:    { text: '#FB7185', bg: 'rgba(251, 113, 133, 0.1)', border: 'rgba(251, 113, 133, 0.25)' },
};

export function AgentStream() {
  const agentStream = useAppStore((s) => s.agentStream);

  return (
    <div className="flex flex-col h-full bg-[#0B0F17] select-none">
      {/* Header */}
      <div className="px-3.5 py-2.5 flex items-center justify-between shrink-0 border-b border-[#1E293B] bg-[#0F172A]/70">
        <div className="flex items-center gap-2">
          <Bot className="w-3.5 h-3.5 text-[#38BDF8]" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">Agent Stream</h2>
        </div>
        <span className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] animate-pulse" />
          Live
        </span>
      </div>

      {/* Stream */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {agentStream.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-1 px-4 py-6 text-center">
            <p className="text-[11px] font-mono text-slate-500">Autonomous agents standby</p>
          </div>
        ) : (
          agentStream.map((item) => {
            const theme = AGENT_COLORS[item.agent] ?? { text: '#94A3B8', bg: 'rgba(148, 163, 184, 0.1)', border: 'rgba(148, 163, 184, 0.25)' };
            const timeStr = item.ts.includes('T') ? item.ts.substring(11, 19) : item.ts;

            return (
              <div
                key={item.id}
                className="p-2 rounded-lg bg-[#0F172A]/70 border border-[#1E293B] text-xs transition-colors hover:border-[#334155]"
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider"
                    style={{ color: theme.text, background: theme.bg, border: `1px solid ${theme.border}` }}
                  >
                    {item.agent}
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">
                    {timeStr}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                  {item.message}
                </p>
                {(item.incidentId || item.planId) && (
                  <div className="mt-1 pt-1 border-t border-[#1E293B]/60 flex items-center gap-1.5 font-mono text-[10px] text-[#38BDF8]">
                    <span>LINK:</span>
                    <span>{[item.incidentId, item.planId].filter(Boolean).join(' · ')}</span>
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
