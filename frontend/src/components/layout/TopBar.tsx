/**
 * TopBar — the header shown on all operator/reviewer screens.
 *
 * Displays:
 * - Overall severity indicator
 * - Rain status + freshness
 * - WebSocket connection status
 * - Comms status
 * - Scenario clock
 * - Operator name
 * - Navigation links
 * - [SLOT] for Person 4's scenario drawer
 */
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CloudRain, Radio, Wifi, WifiOff, AlertTriangle, CheckCircle, Clock, LogOut, Activity, Inbox, Map, FileText, LifeBuoy } from 'lucide-react';
import { useAppStore } from '@/store';
import { useAuthStore } from '@/store/auth';
import type { ConnectionStatus } from '@/realtime/socket';

interface Props {
  wsStatus: ConnectionStatus;
}

const SEVERITY_CONFIG = {
  critical: { label: 'CRITICAL', bg: 'hsl(0,84%,60%,0.15)', border: 'hsl(0,84%,60%,0.4)', text: 'hsl(0,84%,70%)', dot: 'hsl(0,84%,60%)' },
  high: { label: 'HIGH', bg: 'hsl(25,95%,53%,0.15)', border: 'hsl(25,95%,53%,0.4)', text: 'hsl(25,95%,65%)', dot: 'hsl(25,95%,53%)' },
  medium: { label: 'MEDIUM', bg: 'hsl(48,96%,53%,0.12)', border: 'hsl(48,96%,53%,0.35)', text: 'hsl(48,96%,60%)', dot: 'hsl(48,96%,53%)' },
  low: { label: 'LOW', bg: 'hsl(142,71%,45%,0.1)', border: 'hsl(142,71%,45%,0.3)', text: 'hsl(142,71%,55%)', dot: 'hsl(142,71%,45%)' },
};

const RAIN_ICONS: Record<string, string> = {
  none: '☀️', light: '🌦️', moderate: '🌧️', heavy: '⛈️', extreme: '🌊',
};

const FRESHNESS_CONFIG = {
  live: { label: 'LIVE', color: 'hsl(142,71%,45%)' },
  cached: { label: 'CACHED', color: 'hsl(48,96%,53%)' },
  stale: { label: 'STALE', color: 'hsl(0,84%,60%)' },
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
    { to: '/sos', label: 'Send SOS', icon: LifeBuoy },
  ];

  return (
    <header
      className="flex items-center justify-between px-4 h-12 shrink-0 z-50 bg-[#0B0F17] border-b border-[#1E293B] select-none"
    >
      {/* Brand & Platform Identity */}
      <div className="flex items-center gap-3 shrink-0">
        <Link to="/command" className="flex items-center gap-2 group">
          <div className="w-6 h-6 rounded bg-[#38BDF8]/10 border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8] transition-colors group-hover:bg-[#38BDF8]/20">
            <Radio className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-sm tracking-wider text-slate-100 font-sans">SAMANVAYA</span>
        </Link>
        <div className="h-3.5 w-px bg-[#1E293B]" />
        <span className="text-[11px] font-mono text-slate-400 tracking-wider hidden sm:inline">
          EOC <span className="text-[#38BDF8] font-medium">SECTOR-7</span>
        </span>
      </div>

      {/* Center Instrument Telemetry Cluster */}
      <div className="hidden md:flex items-center gap-2.5">
        {/* Overall Severity Pill */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-medium tracking-wide transition-colors"
          style={{ background: sevCfg.bg, border: `1px solid ${sevCfg.border}`, color: sevCfg.text }}
          title={`Overall severity: ${sev.toUpperCase()}`}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: sevCfg.dot }} />
          <span>{sevCfg.label}</span>
        </div>

        {/* Scenario Clock */}
        {systemStatus?.scenarioTime && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0F172A] border border-[#1E293B] text-[11px] font-mono text-slate-200"
            title="Scenario time (not wall clock)"
          >
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="tabular-nums font-semibold">
              {systemStatus.scenarioTime.replace('T', ' ').substring(0, 19)}
            </span>
          </div>
        )}

        {/* Rain Atmospheric Badge */}
        {rain && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0F172A] border border-[#1E293B] text-[11px]"
            title={`Rain: ${rain.intensity} (${rain.mmPerHour}mm/h)`}
          >
            <CloudRain className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span className="text-slate-300 font-medium capitalize">{rain.intensity} ({rain.mmPerHour} mm/h)</span>
            {freshCfg && (
              <span className="font-mono text-[10px] font-semibold ml-0.5" style={{ color: freshCfg.color }}>
                [{freshCfg.label}]
              </span>
            )}
          </div>
        )}

        {/* Comms Network Status */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0F172A] border border-[#1E293B] text-[11px]"
          title={`Communications: ${systemStatus?.commsOverall ?? 'unknown'}`}
        >
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${systemStatus?.commsOverall === 'degraded' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${systemStatus?.commsOverall === 'degraded' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
          </span>
          <span className="font-medium text-slate-300">
            {systemStatus?.commsOverall === 'degraded' ? 'SMS Fallback' : 'Mesh: 14ms'}
          </span>
        </div>

        {/* Live WebSocket Status */}
        <div
          className="flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded bg-[#0F172A] border border-[#1E293B]"
          title={`WebSocket: ${wsStatus}`}
        >
          {wsStatus === 'connected' ? (
            <Wifi className="w-3 h-3 text-emerald-400" />
          ) : (
            <WifiOff className="w-3 h-3 text-rose-400 animate-pulse" />
          )}
          <span style={{ color: wsStatus === 'connected' ? '#34D399' : '#FB7185' }}>
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
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-[#1E293B] text-[#38BDF8] border border-[#334155] shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#1E293B]/50 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="h-3.5 w-px bg-[#1E293B] mx-1" />

        {/* User Profile Pill */}
        <div className="flex items-center gap-2 pl-1">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-slate-200 leading-none">{displayName}</p>
            <p className="text-[10px] mt-0.5 text-slate-400 capitalize font-mono">
              {role === 'reviewer' && <span className="text-amber-400">Reviewer (Read-Only)</span>}
              {role === 'operator' && <span className="text-[#38BDF8]">Lead Ops</span>}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded hover:bg-[#1E293B] text-slate-400 hover:text-slate-200 transition-colors"
            title="Log out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
