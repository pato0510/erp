import React from 'react';

/* COM-004b — shared Comercial account label maps + badges. ASCII enum keys →
   Spanish display labels (never render the raw enum). Colors are inline
   React.CSSProperties (same convention as the operations/movements badges), not
   Tailwind color classes. Reused by the cuentas list and the account ficha. */

export const ACCOUNT_STATUSES = ['PROSPECTO', 'ACTIVA', 'INACTIVA'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export const STATUS_LABELS: Record<string, string> = {
  PROSPECTO: 'Prospecto',
  ACTIVA: 'Activa',
  INACTIVA: 'Inactiva',
};

export const PRIORITIES = ['ALTA', 'MEDIA', 'BAJA'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<string, string> = {
  ALTA: 'Alta',
  MEDIA: 'Media',
  BAJA: 'Baja',
};

export function statusStyle(status: string): React.CSSProperties {
  switch (status) {
    case 'ACTIVA':
      return { background: 'rgba(34,197,94,0.12)', color: '#15803d' };
    case 'PROSPECTO':
      return { background: 'rgba(37,99,235,0.12)', color: '#1d4ed8' };
    default: // INACTIVA
      return { background: 'rgba(100,116,139,0.12)', color: '#475569' };
  }
}

export function priorityStyle(priority: string): React.CSSProperties {
  switch (priority) {
    case 'ALTA':
      return { background: 'rgba(239,68,68,0.12)', color: '#b91c1c' };
    case 'MEDIA':
      return { background: 'rgba(234,179,8,0.14)', color: '#a16207' };
    default: // BAJA
      return { background: 'rgba(100,116,139,0.12)', color: '#475569' };
  }
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={statusStyle(status)}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={priorityStyle(priority)}
    >
      {PRIORITY_LABELS[priority] ?? priority}
    </span>
  );
}
