import React from 'react';

/* COM-011 — shared quote status label map + badge. Mirrors stageLabels / accountLabels:
   ASCII enum keys → Spanish display labels (never render the raw enum). Distinct colors
   per status. The quote state machine lives entirely in the backend (COM-010); this
   module is pure presentation. */

export const QUOTE_STATUSES = [
  'BORRADOR',
  'ENVIADA',
  'ACEPTADA',
  'RECHAZADA',
  'SUPERSEDIDA',
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  BORRADOR: 'Borrador',
  ENVIADA: 'Enviada',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  SUPERSEDIDA: 'Supersedida',
};

// Terminal statuses admit no transitions (read-only in the UI).
export const TERMINAL_QUOTE_STATUSES: QuoteStatus[] = ['ACEPTADA', 'RECHAZADA', 'SUPERSEDIDA'];
export const isTerminalQuote = (s: string) => TERMINAL_QUOTE_STATUSES.includes(s as QuoteStatus);

export function quoteStatusStyle(status: string): React.CSSProperties {
  switch (status) {
    case 'BORRADOR':
      return { background: 'rgba(100,116,139,0.14)', color: '#475569' }; // slate — draft
    case 'ENVIADA':
      return { background: 'rgba(37,99,235,0.12)', color: '#1d4ed8' }; // blue — out for decision
    case 'ACEPTADA':
      return { background: 'rgba(34,197,94,0.12)', color: '#15803d' }; // green — won document
    case 'RECHAZADA':
      return { background: 'rgba(239,68,68,0.12)', color: '#b91c1c' }; // red — declined
    default: // SUPERSEDIDA
      return { background: 'rgba(234,179,8,0.14)', color: '#a16207' }; // amber — auto-invalidated
  }
}

export function QuoteStatusBadge({ status }: { status: string }) {
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={quoteStatusStyle(status)}
    >
      {QUOTE_STATUS_LABELS[status] ?? status}
    </span>
  );
}
