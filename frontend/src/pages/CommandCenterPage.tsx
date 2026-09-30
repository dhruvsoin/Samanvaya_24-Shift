/**
 * CommandCenterPage — the main screen.
 *
 * Layout: three columns
 * LEFT: Incident queue
 * CENTER: Leaflet map
 * RIGHT: Resource board + Agent stream (or IncidentDetailDrawer when incident selected)
 *
 * Plus: replay controls bar at the bottom (only in mock mode)
 */
import { useState, useEffect } from 'react';
import { IncidentQueue } from '@/components/command/IncidentQueue';
import { ResourceBoard } from '@/components/command/ResourceBoard';
import { AgentStream } from '@/components/command/AgentStream';
import { EmergencyMap } from '@/components/map/EmergencyMap';
import { ReplayControls } from '@/components/command/ReplayControls';
import { PhoneInModal } from '@/components/command/PhoneInModal';
import { IncidentDetailDrawer } from '@/components/command/IncidentDetailDrawer';
import { useAppStore } from '@/store';
import { useAuthStore } from '@/store/auth';
import { loadReplay } from '@/realtime/replay';

export function CommandCenterPage() {
  const { role } = useAuthStore();
  const isReadOnly = role === 'reviewer';
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [showPhoneIn, setShowPhoneIn] = useState(false);
  const { currentPlan } = useAppStore();

  // Pre-load replay data on mount (in mock mode)
  useEffect(() => {
    if (import.meta.env.VITE_USE_MOCKS === 'true') {
      loadReplay();
    }
  }, []);

  // Pending approvals badge
  const pendingApprovals = useAppStore((s) =>
    Object.values(s.approvalsById).filter((a) => a.status === 'pending').length
  );

  return (
    <div className="flex flex-col h-full bg-[#09090b] text-slate-100 select-none">
      {/* Pending approval banner */}
      {pendingApprovals > 0 && !isReadOnly && (
        <div
          className="flex items-center justify-between px-4 py-2 text-xs font-medium shrink-0 bg-amber-950/40 border-b border-amber-900/50 text-amber-200"
        >
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span>Action Required: {pendingApprovals} operational decision{pendingApprovals > 1 ? 's' : ''} awaiting operator sign-off</span>
          </span>
          <a href="/command/approvals" className="font-semibold text-amber-400 underline hover:text-amber-300 transition-colors">
            Review Decisions →
          </a>
        </div>
      )}

      {/* Plan trigger notification */}
      {currentPlan?.trigger && (
        <div
          className="px-4 py-1.5 text-xs shrink-0 bg-blue-950/40 border-b border-blue-900/50 text-blue-200 flex items-center justify-between"
        >
          <span>
            <span className="font-semibold text-blue-400">[{currentPlan.planId}]</span> {currentPlan.trigger}
          </span>
          <span className="text-[10px] font-medium text-blue-400 uppercase tracking-wider">Solver Active</span>
        </div>
      )}

      {/* Main three-column layout */}
      <div className="flex flex-1 overflow-hidden divide-x divide-zinc-800">
        {/* LEFT: Incident Queue (320px) */}
        <div className="w-80 shrink-0 flex flex-col overflow-hidden bg-zinc-950">
          <IncidentQueue
            isReadOnly={isReadOnly}
            onSelectIncident={setSelectedIncidentId}
            onPhoneIn={() => setShowPhoneIn(true)}
            selectedId={selectedIncidentId}
          />
        </div>

        {/* CENTER: Cartography */}
        <div className="flex-1 overflow-hidden min-w-0 relative bg-zinc-900">
          <EmergencyMap onSelectIncident={setSelectedIncidentId} />
        </div>

        {/* RIGHT: Drawer (when incident selected) OR Resource board + Agent stream */}
        <div
          className="shrink-0 flex flex-col overflow-hidden transition-all duration-300 bg-zinc-950"
          style={{
            width: selectedIncidentId ? '26rem' : '20rem',
          }}
        >
          {selectedIncidentId ? (
            <IncidentDetailDrawer
              incidentId={selectedIncidentId}
              onClose={() => setSelectedIncidentId(null)}
              isReadOnly={isReadOnly}
            />
          ) : (
            <>
              <ResourceBoard />
              <div className="flex-1 overflow-hidden border-t border-zinc-800">
                <AgentStream />
              </div>
            </>
          )}
        </div>
      </div>

      {/* BOTTOM: Replay controls (mock mode only) */}
      {import.meta.env.VITE_USE_MOCKS === 'true' && (
        <div className="shrink-0 border-t border-zinc-800 bg-zinc-950">
          <ReplayControls />
        </div>
      )}

      {/* Modals */}
      {showPhoneIn && !isReadOnly && (
        <PhoneInModal onClose={() => setShowPhoneIn(false)} />
      )}
    </div>
  );
}
