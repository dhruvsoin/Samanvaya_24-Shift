/**
 * TopBar — Clean Enterprise Light header (Stripe / Apple / Gov-Tech style).
 */
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  CloudRain,
  Radio,
  Wifi,
  WifiOff,
  Clock,
  LogOut,
  Activity,
  Inbox,
  Map,
  FileText,
  LifeBuoy,
} from 'lucide-react';
import { useAppStore } from '@/store';
import { useAuthStore } from '@/store/auth';
import type { ConnectionStatus } from '@/realtime/socket';

interface Props {
  wsStatus: ConnectionStatus;
}

const SEVERITY_CONFIG = {
  critical: { label: 'CRITICAL', bg: '#FFF1F2', border: '#FECDD3', text: '#BE123C', dot: '#E11D48' },
  high:     { label: 'HIGH',     bg: '#FFFBEB', border: '#FDE68A', text: '#B45309', dot: '#D97706' },
  medium:   { label: 'MEDIUM',   bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', dot: '#2563EB' },
  low:      { label: 'LOW',      bg: '#ECFDF5', border: '#A7F3D0', text: '#047857', dot: '#059669' },
};

const FRESHNESS_CONFIG = {
  live:   { label: 'LIVE',   color: '#059669' },
  cached: { label: 'CACHED', color: '#D97706' },
  stale:  { label: 'STALE',  color: '#DC2626' },
};

export function TopBar({ wsStatus }: Props) {
  const { systemStatus } = useAppStore();
  const { displayName, role, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const sev = systemStatus?.overallSeverity ?? 'low';
  const sevCfg = SEVERITY_CONFIG[sev];
  const rain = systemStatus?.rain;
  const freshCfg = rain ? FRESHNESS_CONFIG[rain.freshness] : null;

  const navLinks = [
    { to: '/command', label: 'Command', icon: Map },
    { to: '/command/plan', label: 'Plan Diff', icon: Activity },
    { to: '/command/approvals', label: 'Approvals', icon: Inbox },
    { to: '/after-action', label: 'After-Action', icon: FileText },
    { to: '/sos', label: 'Citizen SOS', icon: LifeBuoy },
  ];

  return (
    <header className="flex items-center justify-between px-4 h-12 shrink-0 z-50 bg-white border-b border-slate-200 select-none shadow-xs">
      {/* Brand & Platform Identity */}
      <div className="flex items-center gap-3 shrink-0">
        <Link to="/command" className="flex items-center gap-2 group">
          <div className="w-6 h-6 rounded bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 transition-colors group-hover:bg-blue-100">
            <Radio className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-slate-900 font-sans">SAMANVAYA</span>
        </Link>
        <div className="h-4 w-px bg-slate-200" />
        <span className="text-xs text-slate-500 font-medium hidden sm:inline">
          Operations Center <span className="text-blue-600 font-semibold">· Sector 7</span>
        </span>
      </div>

      {/* Center Instrument Telemetry Cluster */}
      <div className="hidden md:flex items-center gap-2">
        {/* Overall Severity Pill */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-medium tracking-wide"
          style={{ background: sevCfg.bg, border: `1px solid ${sevCfg.border}`, color: sevCfg.text }}
          title={`Overall severity: ${sev.toUpperCase()}`}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: sevCfg.dot }} />
          <span>{sevCfg.label}</span>
        </div>

        {/* Scenario Clock */}
        {systemStatus?.scenarioTime && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700"
            title="Scenario time"
          >
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="tabular-nums font-medium">
              {systemStatus.scenarioTime.replace('T', ' ').substring(0, 19)}
            </span>
          </div>
        )}

        {/* Rain Atmospheric Badge */}
        {rain && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-xs text-slate-700"
            title={`Rain: ${rain.intensity} (${rain.mmPerHour}mm/h)`}
          >
            <CloudRain className="w-3.5 h-3.5 text-blue-500" />
            <span className="font-medium capitalize">{rain.intensity} ({rain.mmPerHour} mm/h)</span>
            {freshCfg && (
              <span className="font-mono text-[10px] font-semibold ml-0.5" style={{ color: freshCfg.color }}>
                [{freshCfg.label}]
              </span>
            )}
          </div>
        )}

        {/* Live WebSocket Status */}
        <div
          className="flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded bg-slate-50 border border-slate-200"
          title={`WebSocket: ${wsStatus}`}
        >
          {wsStatus === 'connected' ? (
            <Wifi className="w-3 h-3 text-emerald-600" />
          ) : (
            <WifiOff className="w-3 h-3 text-rose-600" />
          )}
          <span className={wsStatus === 'connected' ? 'text-emerald-700 font-medium' : 'text-rose-700 font-medium'}>
            {wsStatus === 'connected' ? 'LIVE' : wsStatus.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Trailing Navigation & Controls */}
      <div className="flex items-center gap-2 shrink-0">
        {/* ── SLOT FOR PERSON 4's SCENARIO DRAWER ── */}
        <div id="p4-scenario-drawer-slot" className="shrink-0" />

        {/* Nav Links */}
        <nav className="flex items-center gap-1">
          {navLinks.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="h-4 w-px bg-slate-200 mx-1" />

        {/* User Profile */}
        <div className="flex items-center gap-2 pl-1">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-slate-800 leading-none">{displayName}</p>
            <p className="text-[10px] mt-0.5 text-slate-500 capitalize">
              {role === 'reviewer' && <span className="text-amber-600">Reviewer (Read-Only)</span>}
              {role === 'operator' && <span className="text-blue-600">Operator</span>}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
            title="Log out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
