'use client';

export type AssetStatus =
  | 'OPERATIONAL'
  | 'WITH_OBSERVATIONS'
  | 'NON_OPERATIONAL'
  | 'IN_MAINTENANCE'
  | 'BLOCKED_DOCUMENTAL'
  | 'BLOCKED_PERMIT'
  | 'OUT_OF_SERVICE'
  | 'DECOMMISSIONED';

const STATUS_META: Record<AssetStatus, { label: string; bg: string; fg: string; dot: string }> = {
  OPERATIONAL: {
    label: 'Operativo',
    bg: 'rgba(34, 197, 94, 0.12)',
    fg: '#15803d',
    dot: '#16a34a',
  },
  WITH_OBSERVATIONS: {
    label: 'Con observaciones',
    bg: 'rgba(234, 179, 8, 0.14)',
    fg: '#a16207',
    dot: '#ca8a04',
  },
  NON_OPERATIONAL: {
    label: 'No operativo',
    bg: 'rgba(239, 68, 68, 0.12)',
    fg: '#b91c1c',
    dot: '#dc2626',
  },
  IN_MAINTENANCE: {
    label: 'En mantención',
    bg: 'rgba(37, 99, 235, 0.12)',
    fg: '#1d4ed8',
    dot: '#2563eb',
  },
  BLOCKED_DOCUMENTAL: {
    label: 'Bloq. documental',
    bg: 'rgba(239, 68, 68, 0.12)',
    fg: '#b91c1c',
    dot: '#dc2626',
  },
  BLOCKED_PERMIT: {
    label: 'Bloq. permiso',
    bg: 'rgba(239, 68, 68, 0.12)',
    fg: '#b91c1c',
    dot: '#dc2626',
  },
  OUT_OF_SERVICE: {
    label: 'Fuera de servicio',
    bg: 'rgba(100, 116, 139, 0.14)',
    fg: '#475569',
    dot: '#64748b',
  },
  DECOMMISSIONED: {
    label: 'Dado de baja',
    bg: 'rgba(100, 116, 139, 0.14)',
    fg: '#475569',
    dot: '#64748b',
  },
};

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = Object.fromEntries(
  Object.entries(STATUS_META).map(([k, v]) => [k, v.label]),
) as Record<AssetStatus, string>;

interface Props {
  status: AssetStatus;
}

export function AssetStatusBadge({ status }: Props) {
  const meta = STATUS_META[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 9px',
        borderRadius: 999,
        background: meta.bg,
        color: meta.fg,
        fontFamily: 'var(--font-jetbrains-mono), monospace',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: meta.dot,
        }}
      />
      {meta.label}
    </span>
  );
}

export default AssetStatusBadge;
