/**
 * WebSocket client — connects to the backend and feeds events into the store.
 *
 * Beginner note:
 * WebSocket is a "live pipe" between your browser and the server.
 * Unlike normal HTTP, it stays open so the server can push updates instantly.
 *
 * This module:
 * 1. Opens a WebSocket connection
 * 2. Sends "ping" every 20 seconds (server replies "pong")
 * 3. Reconnects automatically if the connection drops
 * 4. Passes every received event to handleEvent()
 */
import { handleEvent } from './eventMapper';
import { api } from '@/api/client';
import { useAppStore } from '@/store';
import type { ContractEvent } from '@contracts/types';

function getWsBase(): string {
  if (import.meta.env.VITE_WS_BASE) {
    return import.meta.env.VITE_WS_BASE;
  }
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }
  return 'ws://localhost:8000';
}
const WS_BASE = getWsBase();
const PING_INTERVAL_MS = 20_000;
const RECONNECT_DELAY_MS = 3_000;

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

let ws: WebSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _role: 'operator' | 'crew' | null = null;
let _unitId: string | null = null;
import { useAuthStore } from '@/store/auth';

let _onStatusChange: ((s: ConnectionStatus) => void) | null = null;

function clearTimers() {
  if (pingTimer) clearInterval(pingTimer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  pingTimer = null;
  reconnectTimer = null;
}

async function refetchState() {
  // After reconnect, reload REST state to catch anything we missed
  try {
    const [incidents, units, zones, approvals, status] = await Promise.all([
      api.incidents.list().catch(() => []),
      api.units.list().catch(() => []),
      api.zones.list().catch(() => []),
      api.approvals.list().catch(() => []),
      api.status.get().catch(() => null),
    ]);
    if (units.length) useAppStore.getState().setUnits(units);
    if (zones.length) useAppStore.getState().setZones(zones);
    const incMap: Record<string, any> = {};
    for (const inc of incidents) {
      incMap[inc.incidentId] = inc;
    }
    const appMap: Record<string, any> = {};
    for (const appr of approvals) {
      appMap[appr.approvalId] = appr;
    }
    useAppStore.setState({
      incidentsById: incMap,
      approvalsById: appMap,
    });
    if (status) useAppStore.getState().setSystemStatus(status);
    const plan = await api.plan.current().catch(() => null);
    useAppStore.setState({ currentPlan: plan });
  } catch {
    // Best effort — don't crash on refetch failure
  }
}

function connect() {
  const token = useAuthStore.getState().token;
  const path =
    _role === 'crew' && _unitId
      ? `/ws/crew/${_unitId}`
      : '/ws/operator';

  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';

  try {
    ws = new WebSocket(`${WS_BASE}${path}${tokenParam}`);
  } catch {
    scheduleReconnect();
    return;
  }

  _onStatusChange?.('connecting');

  ws.onopen = () => {
    _onStatusChange?.('connected');
    // Start ping heartbeat
    pingTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send('ping');
      }
    }, PING_INTERVAL_MS);
    // Refetch state to catch missed events
    refetchState();
  };

  ws.onmessage = (evt) => {
    const data = evt.data;
    // Server sends "pong" as a plain text keepalive — ignore it
    if (data === 'pong') return;
    try {
      const event: ContractEvent = JSON.parse(data);
      handleEvent(event);
    } catch {
      // Malformed message — ignore
    }
  };

  ws.onclose = () => {
    _onStatusChange?.('disconnected');
    clearTimers();
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function scheduleReconnect() {
  _onStatusChange?.('reconnecting');
  reconnectTimer = setTimeout(() => {
    connect();
  }, RECONNECT_DELAY_MS);
}

export function startSocket(
  role: 'operator' | 'crew',
  unitId: string | null,
  onStatusChange: (s: ConnectionStatus) => void
) {
  _role = role;
  _unitId = unitId;
  _onStatusChange = onStatusChange;
  connect();
}

export function stopSocket() {
  clearTimers();
  ws?.close();
  ws = null;
  _onStatusChange = null;
}

export type { ConnectionStatus };
