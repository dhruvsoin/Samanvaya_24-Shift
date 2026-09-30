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
      className="flex items-center gap-3 px-4 h-14 shrink-0 z-50"
      style={{ background: 'hsl(222,47%,7%)', borderBottom: '1px solid hsl(217,33%,18%)' }}
    >
      {/* Brand */}
      <span className="text-white font-bold text-sm tracking-widest mr-2 shrink-0">SAMANVAYA</span>

      {/* Severity pill */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold shrink-0"
        style={{ background: sevCfg.bg, border: `1px solid ${sevCfg.border}`, color: sevCfg.text }}
        title={`Overall severity: ${sev.toUpperCase()}`}
      >
        <span className="w-2 h-2 rounded-full animate-pulse-slow" style={{ background: sevCfg.dot }} />
        {sevCfg.label}
      </div>

      {/* Rain */}
      {rain && (
        <div className="flex items-center gap-1.5 text-xs shrink-0" title={`Rain: ${rain.intensity} (${rain.mmPerHour}mm/h)`}>
          <CloudRain className="w-3.5 h-3.5" style={{ color: 'hsl(215,20%,55%)' }} />
          <span style={{ color: 'hsl(215,20%,75%)' }}>{RAIN_ICONS[rain.intensity]} {rain.intensity}</span>
          {freshCfg && (
            <span className="font-bold text-xs mono" style={{ color: freshCfg.color }}>
              [{freshCfg.label}]
            </span>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="w-px h-4 shrink-0" style={{ background: 'hsl(217,33%,22%)' }} />

      {/* Comms status */}
      <div
        className="flex items-center gap-1 text-xs shrink-0"
        style={{ color: systemStatus?.commsOverall === 'degraded' ? 'hsl(48,96%,53%)' : 'hsl(215,20%,55%)' }}
        title={`Communications: ${systemStatus?.commsOverall ?? 'unknown'}`}
      >
        <Radio className="w-3.5 h-3.5" />
        <span className="font-medium">{systemStatus?.commsOverall === 'degraded' ? 'DEGRADED · SMS' : 'COMMS OK'}</span>
      </div>

      {/* WebSocket status */}
      <div
        className="flex items-center gap-1 text-xs shrink-0"
        title={`WebSocket: ${wsStatus}`}
      >
        {wsStatus === 'connected' ? (
          <Wifi className="w-3.5 h-3.5" style={{ color: 'hsl(142,71%,45%)' }} />
        ) : wsStatus === 'connecting' || wsStatus === 'reconnecting' ? (
          <WifiOff className="w-3.5 h-3.5 animate-pulse" style={{ color: 'hsl(48,96%,53%)' }} />
        ) : (
          <WifiOff className="w-3.5 h-3.5" style={{ color: 'hsl(0,84%,60%)' }} />
        )}
        <span style={{ color: wsStatus === 'connected' ? 'hsl(142,71%,45%)' : 'hsl(215,20%,55%)' }}>
          {wsStatus === 'connected' ? 'LIVE' : wsStatus.toUpperCase()}
        </span>
      </div>

      {/* Scenario clock */}
      {systemStatus?.scenarioTime && (
        <div className="flex items-center gap-1 text-xs mono shrink-0" style={{ color: 'hsl(217,91%,70%)' }}
          title="Scenario time (not wall clock)">
          <Clock className="w-3.5 h-3.5" />
          {systemStatus.scenarioTime.replace('T', ' ').substring(0, 19)}
        </div>
      )}

      {/* Spacer — pushes right items to the far right */}
      <div className="flex-1" />

      {/* ── SLOT FOR PERSON 4's SCENARIO DRAWER ── */}
      {/* Person 4: insert your <ScenarioDrawer /> or trigger button here */}
      <div id="p4-scenario-drawer-slot" className="shrink-0" />

      {/* Nav links */}
      <nav className="flex items-center gap-1 shrink-0">
        {navLinks.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: location.pathname === to ? 'hsl(217,91%,60%,0.12)' : 'transparent',
              color: location.pathname === to ? 'hsl(217,91%,70%)' : 'hsl(215,20%,55%)',
              border: location.pathname === to ? '1px solid hsl(217,91%,60%,0.2)' : '1px solid transparent',
            }}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="w-px h-4 shrink-0" style={{ background: 'hsl(217,33%,22%)' }} />

      {/* User info */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          <p className="text-xs font-medium text-white leading-none">{displayName}</p>
          <p className="text-xs mt-0.5 capitalize" style={{ color: 'hsl(215,20%,50%)' }}>
            {role === 'reviewer' && <span title="Read-only viewer"><AlertTriangle className="w-3 h-3 inline mr-0.5" style={{ color: 'hsl(48,96%,53%)' }} />Reviewer</span>}
            {role === 'operator' && <span><CheckCircle className="w-3 h-3 inline mr-0.5" style={{ color: 'hsl(142,71%,45%)' }} />Operator</span>}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
          title="Log out"
          style={{ color: 'hsl(215,20%,50%)' }}
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
