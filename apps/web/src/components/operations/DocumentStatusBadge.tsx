'use client';

/* Derived status the API computes per DocumentRecord on top of the persisted
   DocumentRecordStatus. VIGENTE / POR_VENCER / VENCIDO are computed from
   expiration dates; the others are direct translations. FALTANTE is used
   only by compliance views (no record exists for the requirement). */
export type DerivedDocumentStatus =
  | 'VIGENTE'
  | 'POR_VENCER'
  | 'VENCIDO'
  | 'BORRADOR'
  | 'PENDIENTE_REVISION'
  | 'APROBADO'
  | 'RECHAZADO'
  | 'REEMPLAZADO'
  | 'ARCHIVADO'
  | 'FALTANTE';

interface Meta {
  label: string;
  bg: string;
  fg: string;
  dot: string;
}

const STATUS_META: Record<DerivedDocumentStatus, Meta> = {
  VIGENTE: {
    label: 'Vigente',
    bg: 'rgba(34, 197, 94, 0.12)',
    fg: '#15803d',
    dot: '#16a34a',
  },
  POR_VENCER: {
    label: 'Por vencer',
    bg: 'rgba(234, 179, 8, 0.14)',
    fg: '#a16207',
    dot: '#ca8a04',
  },
  VENCIDO: {
    label: 'Vencido',
    bg: 'rgba(239, 68, 68, 0.12)',
    fg: '#b91c1c',
    dot: '#dc2626',
  },
  BORRADOR: {
    label: 'Borrador',
    bg: 'rgba(100, 116, 139, 0.14)',
    fg: '#475569',
    dot: '#64748b',
  },
  PENDIENTE_REVISION: {
    label: 'Pendiente revisión',
    bg: 'rgba(37, 99, 235, 0.12)',
    fg: '#1d4ed8',
    dot: '#2563eb',
  },
  APROBADO: {
    label: 'Aprobado',
    bg: 'rgba(34, 197, 94, 0.12)',
    fg: '#15803d',
    dot: '#16a34a',
  },
  RECHAZADO: {
    label: 'Rechazado',
    bg: 'rgba(239, 68, 68, 0.12)',
    fg: '#b91c1c',
    dot: '#dc2626',
  },
  REEMPLAZADO: {
    label: 'Reemplazado',
    bg: 'rgba(100, 116, 139, 0.14)',
    fg: '#475569',
    dot: '#64748b',
  },
  ARCHIVADO: {
    label: 'Archivado',
    bg: 'rgba(100, 116, 139, 0.14)',
    fg: '#475569',
    dot: '#64748b',
  },
  FALTANTE: {
    label: 'Faltante',
    bg: 'rgba(239, 68, 68, 0.12)',
    fg: '#b91c1c',
    dot: '#dc2626',
  },
};

export const DOCUMENT_STATUS_LABELS: Record<DerivedDocumentStatus, string> = Object.fromEntries(
  Object.entries(STATUS_META).map(([k, v]) => [k, v.label]),
) as Record<DerivedDocumentStatus, string>;

interface Props {
  status: DerivedDocumentStatus;
  /* Optional suffix shown after the label, e.g. "(en 5 días)". */
  hint?: string;
}

export function DocumentStatusBadge({ status, hint }: Props) {
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
      {hint ? ` ${hint}` : ''}
    </span>
  );
}

export default DocumentStatusBadge;
