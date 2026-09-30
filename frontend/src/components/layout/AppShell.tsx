/**
 * AppShell — the outer frame for operator/reviewer screens.
 *
 * Beginner note:
 * The AppShell renders the TopBar at the top, then the current page below it.
 * React Router puts the current page into the <Outlet /> slot.
 * So AppShell is like a picture frame — the page is the picture inside.
 */
import { Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { TopBar } from './TopBar';
import { useAuthStore } from '@/store/auth';
import { useAppStore } from '@/store';
import { api } from '@/api/client';
import { startSocket, stopSocket, type ConnectionStatus } from '@/realtime/socket';

export function AppShell() {
  const { role, unitId } = useAuthStore();
  const { setUnits, setFacilities, setRoads, setZones, setSystemStatus } = useAppStore();
  const [wsStatus, setWsStatus] = useState<ConnectionStatus>('connecting');

  // Load initial state from REST on mount
  useEffect(() => {
    async function loadInitialState() {
      try {
        const [units, facilities, roadNetwork, zones, status] = await Promise.all([
          api.units.list(),
          api.facilities.list(),
          api.roads.get(),
          api.zones.list(),
          api.status.get(),
        ]);
        setUnits(units);
        setFacilities(facilities);
        setRoads(roadNetwork.roads);
        setZones(zones);
        setSystemStatus(status);
      } catch {
        // In mock mode this is fine, state will be populated by replay
      }
    }
    loadInitialState();
  }, [setUnits, setFacilities, setRoads, setZones, setSystemStatus]);

  // Connect WebSocket (skip in mock mode — replay handles events instead)
  useEffect(() => {
    if (import.meta.env.VITE_USE_MOCKS === 'true') {
      setWsStatus('connected'); // mock mode shows "connected"
      return;
    }
    const socketRole = role === 'crew' ? 'crew' : 'operator';
    startSocket(socketRole, unitId, setWsStatus);
    return () => stopSocket();
  }, [role, unitId]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar wsStatus={wsStatus} />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
