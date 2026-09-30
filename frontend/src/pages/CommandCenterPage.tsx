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
    <div className="flex flex-col h-full">
      {/* Pending approval banner */}
      {pendingApprovals > 0 && !isReadOnly && (
        <div
          className="flex items-center justify-between px-4 py-2 text-sm font-medium animate-fade-in shrink-0"
          style={{ background: 'hsl(48,96%,53%,0.12)', borderBottom: '1px solid hsl(48,96%,53%,0.25)', color: 'hsl(48,96%,65%)' }}
        >
          <span>⚡ {pendingApprovals} decision{pendingApprovals > 1 ? 's' : ''} need{pendingApprovals === 1 ? 's' : ''} your approval</span>
          <a href="/command/approvals" className="font-bold underline-offset-2 underline">Review now →</a>
        </div>
      )}

      {/* Plan trigger notification */}
      {currentPlan?.trigger && (
        <div
          className="px-4 py-1.5 text-xs shrink-0"
          style={{ background: 'hsl(217,91%,60%,0.06)', borderBottom: '1px solid hsl(217,91%,60%,0.1)', color: 'hsl(217,91%,65%)' }}
        >
          <span className="font-mono font-medium">[{currentPlan.planId}]</span> {currentPlan.trigger}
        </div>
      )}

      {/* Main three-column layout */}
      <div className="flex flex-1 overflow-hidden gap-px" style={{ background: 'hsl(217,33%,18%)' }}>
        {/* LEFT: Incident Queue */}
        <div className="w-72 shrink-0 flex flex-col overflow-hidden" style={{ background: 'hsl(222,47%,6%)' }}>
          <IncidentQueue
            isReadOnly={isReadOnly}
            onSelectIncident={setSelectedIncidentId}
            onPhoneIn={() => setShowPhoneIn(true)}
            selectedId={selectedIncidentId}
          />
        </div>

        {/* CENTER: Map — shrinks slightly when drawer is open to prevent overlap */}
        <div className="flex-1 overflow-hidden min-w-0">
          <EmergencyMap onSelectIncident={setSelectedIncidentId} />
        </div>

        {/* RIGHT: Drawer (when incident selected) OR Resource board + Agent stream */}
        <div
          className="shrink-0 flex flex-col overflow-hidden transition-all duration-300"
          style={{
            width: selectedIncidentId ? '26rem' : '18rem',
            background: 'hsl(222,47%,6%)',
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
              <div className="flex-1 overflow-hidden border-t" style={{ borderColor: 'hsl(217,33%,18%)' }}>
                <AgentStream />
              </div>
            </>
          )}
        </div>
      </div>

      {/* BOTTOM: Replay controls (mock mode only) */}
      {import.meta.env.VITE_USE_MOCKS === 'true' && (
        <div className="shrink-0" style={{ borderTop: '1px solid hsl(217,33%,18%)' }}>
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
