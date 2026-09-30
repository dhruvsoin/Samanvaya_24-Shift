/**
 * TopBar — Premium Dark Enterprise header.
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
  critical: { label: 'CRITICAL', bg: 'rgba(225, 29, 72, 0.1)', border: 'rgba(225, 29, 72, 0.2)', text: '#FDA4AF', dot: '#E11D48' },
  high:     { label: 'HIGH',     bg: 'rgba(217, 119, 6, 0.1)', border: 'rgba(217, 119, 6, 0.2)', text: '#FCD34D', dot: '#D97706' },
  medium:   { label: 'MEDIUM',   bg: 'rgba(37, 99, 235, 0.1)', border: 'rgba(37, 99, 235, 0.2)', text: '#93C5FD', dot: '#2563EB' },
  low:      { label: 'LOW',      bg: 'rgba(5, 150, 105, 0.1)', border: 'rgba(5, 150, 105, 0.2)', text: '#6EE7B7', dot: '#059669' },
};

const FRESHNESS_CONFIG = {
  live:   { label: 'LIVE',   color: '#34D399' },
  cached: { label: 'CACHED', color: '#FBBF24' },
  stale:  { label: 'STALE',  color: '#F87171' },
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
    <header className="flex items-center justify-between px-4 h-14 shrink-0 z-50 bg-zinc-950 border-b border-zinc-800 sticky top-0 select-none">
      {/* ── LEFT: Brand & Navigation ── */}
      <div className="flex items-center gap-6 shrink-0">
        <Link to="/command" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.2)]">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <span className="font-extrabold text-[13px] tracking-tight text-zinc-100">SAMANVAYA</span>
            <span className="text-[9px] font-mono text-blue-400 font-semibold ml-1.5 px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">EOC</span>
          </div>
        </Link>

        {/* Nav Links */}
        <nav className="hidden lg:flex items-center gap-1.5 pl-4 border-l border-zinc-800">
          {navLinks.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                  isActive
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-400' : ''}`} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── RIGHT: Telemetry, Profile, Logout ── */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Telemetry Cluster */}
        <div className="hidden xl:flex items-center gap-2">
          {/* Overall Severity Pill */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono font-medium tracking-wide whitespace-nowrap"
            style={{ background: sevCfg.bg, border: `1px solid ${sevCfg.border}`, color: sevCfg.text }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: sevCfg.dot }} />
            <span>{sevCfg.label}</span>
          </div>

          {/* Scenario Clock */}
          {systemStatus?.scenarioTime && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-900 text-[10px] font-mono text-zinc-300 whitespace-nowrap">
              <Clock className="w-3 h-3 text-zinc-500" />
              <span>{systemStatus.scenarioTime.replace('T', ' ').substring(0, 19)}</span>
            </div>
          )}

          {/* Rain Atmospheric Badge */}
          {rain && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-900 text-[10px] text-zinc-300 whitespace-nowrap">
              <CloudRain className="w-3 h-3 text-blue-400" />
              <span>{rain.intensity} ({rain.mmPerHour}mm/h)</span>
            </div>
          )}

          {/* Live WebSocket Status */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-900 text-[10px] font-mono whitespace-nowrap">
            {wsStatus === 'connected' ? (
              <Wifi className="w-3 h-3 text-emerald-400" />
            ) : (
              <WifiOff className="w-3 h-3 text-rose-400" />
            )}
            <span className={wsStatus === 'connected' ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
              {wsStatus === 'connected' ? 'LIVE' : wsStatus.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="h-6 w-px bg-zinc-800 hidden md:block" />

        {/* User Profile */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block whitespace-nowrap">
            <p className="text-[12px] font-bold text-zinc-100 leading-none">{displayName}</p>
            <p className="text-[10px] mt-1 text-zinc-500 font-medium">
              Sector 4 · {role === 'operator' ? <span className="text-blue-400">Operator</span> : <span className="text-amber-400">Reviewer</span>}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-[11px] text-rose-500 hover:bg-rose-500/10 border border-rose-500/20 transition-colors whitespace-nowrap"
            title="Log out securely"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>LOGOUT</span>
          </button>
        </div>
      </div>
    </header>
  );
}
