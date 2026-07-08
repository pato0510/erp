import React from 'react';

/* COM-013a — service order status badge. Mirrors DocumentStatusBadge: ASCII enum keys →
   Spanish display labels (never render the raw enum) + inline-styled pill with a colored
   dot. Reused by the órdenes-de-servicio list and detail. */

export const SERVICE_ORDER_STATUSES = [
  'RECIBIDA',
  'EN_EJECUCION',
  'COMPLETADA',
  'CANCELADA',
] as const;
export type ServiceOrderStatus = (typeof SERVICE_ORDER_STATUSES)[number];

export const SERVICE_ORDER_STATUS_LABELS: Record<string, string> = {
  RECIBIDA: 'Recibida',
  EN_EJECUCION: 'En ejecución',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
};

interface Meta {
  bg: string;
  fg: string;
  dot: string;
}
const STATUS_META: Record<string, Meta> = {
  RECIBIDA: { bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8', dot: '#2563eb' }, // blue — new
  EN_EJECUCION: { bg: 'rgba(234, 179, 8, 0.14)', fg: '#a16207', dot: '#ca8a04' }, // amber — in progress
  COMPLETADA: { bg: 'rgba(34, 197, 94, 0.12)', fg: '#15803d', dot: '#16a34a' }, // green — done
  CANCELADA: { bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569', dot: '#64748b' }, // slate — aborted
};

export function ServiceOrderStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.RECIBIDA;
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
      <span style={{ width: 6, height: 6, borderRadius: 999, background: meta.dot }} />
      {SERVICE_ORDER_STATUS_LABELS[status] ?? status}
    </span>
  );
}
