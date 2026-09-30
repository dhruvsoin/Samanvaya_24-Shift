/**
 * AgentStream — shows live AI agent activity (newest first).
 */
import { Bot } from 'lucide-react';
import { useAppStore } from '@/store';

const AGENT_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  intake:     { text: '#38BDF8', bg: 'rgba(56, 189, 248, 0.1)', border: 'rgba(56, 189, 248, 0.2)' },
  assessment: { text: '#C084FC', bg: 'rgba(192, 132, 252, 0.1)', border: 'rgba(192, 132, 252, 0.2)' },
  route:      { text: '#FBBF24', bg: 'rgba(251, 191, 36, 0.1)', border: 'rgba(251, 191, 36, 0.2)' },
  allocation: { text: '#34D399', bg: 'rgba(52, 211, 153, 0.1)', border: 'rgba(52, 211, 153, 0.2)' },
  command:    { text: '#FB7185', bg: 'rgba(251, 113, 133, 0.1)', border: 'rgba(251, 113, 133, 0.2)' },
};

export function AgentStream() {
  const agentStream = useAppStore((s) => s.agentStream);

  return (
    <div className="flex flex-col h-full bg-zinc-950 select-none border-b border-zinc-800">
      {/* Header */}
      <div className="px-3.5 py-2.5 flex items-center justify-between shrink-0 border-b border-zinc-800 bg-zinc-900">
        <div className="flex items-center gap-2">
          <Bot className="w-3.5 h-3.5 text-blue-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-100">System Activity</h2>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Active
        </span>
      </div>

      {/* Stream */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 bg-zinc-950/50">
        {agentStream.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-1 px-4 py-8 text-center">
            <p className="text-[11px] font-medium text-zinc-500">System standby — no automated events</p>
          </div>
        ) : (
          agentStream.map((item) => {
            const theme = AGENT_COLORS[item.agent] ?? { text: '#94A3B8', bg: 'rgba(148, 163, 184, 0.1)', border: 'rgba(148, 163, 184, 0.2)' };
            const timeStr = item.ts.includes('T') ? item.ts.substring(11, 19) : item.ts;

            return (
              <div
                key={item.id}
                className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs transition-all hover:border-zinc-700 hover:bg-zinc-800/80 shadow-none space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider"
                    style={{ color: theme.text, background: theme.bg, border: `1px solid ${theme.border}` }}
                  >
                    {item.agent}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500 font-medium">
                    {timeStr}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-300 leading-relaxed font-sans font-medium">
                  {item.message}
                </p>
                {(item.incidentId || item.planId) && (
                  <div className="pt-1 border-t border-zinc-800/50 flex items-center gap-1.5 font-mono text-[10px] text-blue-400">
                    <span className="text-zinc-500 font-medium">REF:</span>
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
