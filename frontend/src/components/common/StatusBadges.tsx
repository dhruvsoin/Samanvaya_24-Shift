/**
 * Shared helper to display severity consistently (icon + text, never color alone).
 */
import type { Severity } from '@contracts/types';

export const SEVERITY_CONFIG: Record<NonNullable<Severity>, { label: string; icon: string; className: string }> = {
  critical: { label: 'CRITICAL', icon: '🔴', className: 'severity-critical' },
  high:     { label: 'HIGH',     icon: '🟠', className: 'severity-high' },
  medium:   { label: 'MEDIUM',   icon: '🟡', className: 'severity-medium' },
  low:      { label: 'LOW',      icon: '🟢', className: 'severity-low' },
};

export const INCIDENT_TYPE_LABELS: Record<string, string> = {
  flooded_home: 'Flooded Home',
  stranded_vehicle: 'Stranded Vehicle',
  medical: 'Medical Emergency',
  trapped_person: 'Trapped Person',
  road_blocked: 'Road Blocked',
  other: 'Other',
};

export const UNIT_TYPE_ICONS: Record<string, string> = {
  ambulance: '🚑',
  boat: '⛵',
  rescue_team: '🚒',
  pump: '💧',
};

export const UNIT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  available: { label: 'Available', color: 'hsl(142,71%,45%)' },
  assigned:  { label: 'Assigned',  color: 'hsl(217,91%,60%)' },
  en_route:  { label: 'En Route',  color: 'hsl(217,91%,60%)' },
  on_scene:  { label: 'On Scene',  color: 'hsl(48,96%,53%)' },
  unreachable: { label: 'Unreachable', color: 'hsl(0,84%,60%)' },
  offline:   { label: 'Offline',   color: 'hsl(215,20%,45%)' },
};

interface SeverityBadgeProps {
  severity: Severity | null;
  size?: 'sm' | 'md';
}

export function SeverityBadge({ severity, size = 'sm' }: SeverityBadgeProps) {
  if (!severity) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold severity-none ${size === 'md' ? 'text-sm' : 'text-xs'}`}
      >
        ⚪ PENDING
      </span>
    );
  }
  const cfg = SEVERITY_CONFIG[severity];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold ${cfg.className} ${size === 'md' ? 'text-sm' : 'text-xs'}`}
      aria-label={`Severity: ${cfg.label}`}
    >
      {cfg.icon} {cfg.label}
    </span>
  );
}

interface UnitStatusBadgeProps {
  status: string;
}

export function UnitStatusBadge({ status }: UnitStatusBadgeProps) {
  const cfg = UNIT_STATUS_CONFIG[status] ?? { label: status, color: 'hsl(215,20%,55%)' };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
      style={{ color: cfg.color, background: `${cfg.color}18`, border: `1px solid ${cfg.color}30` }}
      aria-label={`Status: ${cfg.label}`}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  );
}
