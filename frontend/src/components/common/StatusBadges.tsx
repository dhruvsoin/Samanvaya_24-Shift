/**
 * Shared helper to display severity consistently (icon/dot + text, never color alone).
 * Clean Enterprise Light palette: high-contrast, professional, readable.
 */
import type { Severity } from '@contracts/types';

export const SEVERITY_CONFIG: Record<NonNullable<Severity>, { label: string; text: string; bg: string; border: string; dot: string }> = {
  critical: { label: 'CRITICAL', text: '#BE123C', bg: '#FFF1F2', border: '#FECDD3', dot: '#E11D48' },
  high:     { label: 'HIGH',     text: '#B45309', bg: '#FFFBEB', border: '#FDE68A', dot: '#D97706' },
  medium:   { label: 'MEDIUM',   text: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', dot: '#2563EB' },
  low:      { label: 'LOW',      text: '#047857', bg: '#ECFDF5', border: '#A7F3D0', dot: '#059669' },
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
  available:   { label: 'Available',   color: '#047857', bg: '#ECFDF5', border: '#A7F3D0' },
  assigned:    { label: 'Assigned',    color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  en_route:    { label: 'En Route',    color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  on_scene:    { label: 'On Scene',    color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  unreachable: { label: 'Unreachable', color: '#BE123C', bg: '#FFF1F2', border: '#FECDD3' },
  offline:     { label: 'Offline',     color: '#475569', bg: '#F1F5F9', border: '#E2E8F0' },
};

interface SeverityBadgeProps {
  severity: Severity | null;
  size?: 'sm' | 'md';
}

export function SeverityBadge({ severity, size = 'sm' }: SeverityBadgeProps) {
  if (!severity) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono font-medium bg-slate-100 text-slate-600 border border-slate-200 ${
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
    color: '#475569',
    bg: '#F1F5F9',
    border: '#E2E8F0',
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
