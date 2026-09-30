/**
 * AgentStream — shows live AI agent activity (newest first).
 */
import { Bot } from 'lucide-react';
import { useAppStore } from '@/store';

const AGENT_COLORS: Record<string, string> = {
  intake:     'hsl(217,91%,60%)',
  assessment: 'hsl(280,70%,65%)',
  route:      'hsl(48,96%,53%)',
  allocation: 'hsl(142,71%,45%)',
  command:    'hsl(25,95%,53%)',
};

const AGENT_ICONS: Record<string, string> = {
  intake: '📥', assessment: '🔍', route: '🗺️', allocation: '🧠', command: '⚡',
};

export function AgentStream() {
  const agentStream = useAppStore((s) => s.agentStream);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 flex items-center gap-2 shrink-0"
        style={{ borderBottom: '1px solid hsl(217,33%,18%)' }}>
        <Bot className="w-3.5 h-3.5" style={{ color: 'hsl(217,91%,60%)' }} />
        <h2 className="text-xs font-semibold text-white">Agent Activity</h2>
      </div>

      {/* Stream */}
      <div className="flex-1 overflow-y-auto py-1">
        {agentStream.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-xs" style={{ color: 'hsl(215,20%,40%)' }}>Waiting for events…</p>
          </div>
        ) : (
          agentStream.map((item) => {
            const color = AGENT_COLORS[item.agent] ?? 'hsl(215,20%,55%)';
            const icon = AGENT_ICONS[item.agent] ?? '🤖';
            return (
              <div
                key={item.id}
                className="px-3 py-2 border-l-2 mx-2 my-1 rounded-r-lg text-xs animate-fade-in"
                style={{
                  borderLeftColor: color,
                  background: `${color}08`,
                }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span role="img" aria-label={item.agent}>{icon}</span>
                  <span className="font-semibold capitalize" style={{ color }}>
                    {item.agent}
                  </span>
                  <span className="mono ml-auto" style={{ color: 'hsl(215,20%,40%)', fontSize: '0.65rem' }}>
                    {item.ts.substring(11, 19)}
                  </span>
                </div>
                <p className="leading-snug" style={{ color: 'hsl(215,20%,70%)' }}>
                  {item.message}
                </p>
                {(item.incidentId || item.planId) && (
                  <p className="mt-0.5 mono" style={{ color: 'hsl(217,91%,55%)', fontSize: '0.65rem' }}>
                    {[item.incidentId, item.planId].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
