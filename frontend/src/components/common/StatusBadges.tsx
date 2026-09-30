/**
 * Shared helper to display severity consistently (icon/dot + text, never color alone).
 */
import type { Severity } from '@contracts/types';

export const SEVERITY_CONFIG: Record<NonNullable<Severity>, { label: string; text: string; bg: string; border: string; dot: string }> = {
  critical: { label: 'CRITICAL', text: '#FB7185', bg: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.3)', dot: '#F43F5E' },
  high:     { label: 'HIGH',     text: '#FBBF24', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', dot: '#F59E0B' },
  medium:   { label: 'MEDIUM',   text: '#7DD3FC', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)', dot: '#38BDF8' },
  low:      { label: 'LOW',      text: '#6EE7B7', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)', dot: '#10B981' },
};

export const INCIDENT_TYPE_LABELS: Record<string, string> = {
  flooded_home: 'Flooded Home',
  stranded_vehicle: 'Stranded Vehicle',
  medical: 'Medical Emergency',
  trapped_person: 'Trapped Person',
  road_blocked: 'Road Blocked',
  other: 'Incident',
};

export const UNIT_TYPE_ICONS: Record<string, string> = {
  ambulance: 'MED',
  boat: 'BOAT',
  rescue_team: 'SAR',
  pump: 'PUMP',
};

export const UNIT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  available:   { label: 'Available',   color: '#34D399', bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.25)' },
  assigned:    { label: 'Assigned',    color: '#7DD3FC', bg: 'rgba(56, 189, 248, 0.1)', border: 'rgba(56, 189, 248, 0.25)' },
  en_route:    { label: 'En Route',    color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.1)', border: 'rgba(56, 189, 248, 0.25)' },
  on_scene:    { label: 'On Scene',    color: '#FBBF24', bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.25)' },
  unreachable: { label: 'Unreachable', color: '#FB7185', bg: 'rgba(244, 63, 94, 0.1)', border: 'rgba(244, 63, 94, 0.25)' },
  offline:     { label: 'Offline',     color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.1)', border: 'rgba(148, 163, 184, 0.25)' },
};

interface SeverityBadgeProps {
  severity: Severity | null;
  size?: 'sm' | 'md';
}

export function SeverityBadge({ severity, size = 'sm' }: SeverityBadgeProps) {
  if (!severity) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono font-medium bg-[#1E293B] text-slate-400 border border-[#334155] ${
          size === 'md' ? 'text-xs' : 'text-[10px]'
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        ASSESSING
      </span>
    );
  }
  const cfg = SEVERITY_CONFIG[severity];
  const isCritical = severity === 'critical';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono font-semibold tracking-wider ${
        size === 'md' ? 'text-xs' : 'text-[10px]'
      }`}
      style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}
      aria-label={`Severity: ${cfg.label}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${isCritical ? 'animate-pulse' : ''}`}
        style={{ background: cfg.dot }}
      />
      {cfg.label}
    </span>
  );
}

interface UnitStatusBadgeProps {
  status: string;
}

export function UnitStatusBadge({ status }: UnitStatusBadgeProps) {
  const cfg = UNIT_STATUS_CONFIG[status] ?? {
    label: status,
    color: '#94A3B8',
    bg: 'rgba(148, 163, 184, 0.1)',
    border: 'rgba(148, 163, 184, 0.25)',
  };

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
      aria-label={`Status: ${cfg.label}`}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  );
}
