'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  BookMarked,
  BookOpen,
  Calendar,
  CheckCircle2,
  ExternalLink,
  FileText,
  Info,
  ShieldCheck,
  ShieldOff,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatDate, formatRelativeDate } from '../../../lib/formatters';
import { SEVERITY_META, TYPE_META } from './types';
import type { CalendarEvent, CalendarEventType, CalendarSeverity } from './types';

interface EventDetailModalProps {
  event: CalendarEvent | null;
  onClose: () => void;
}

const TYPE_ICON: Record<CalendarEventType, LucideIcon> = {
  document_expiration: FileText,
  permit_expiration: ShieldCheck,
  work_permit_scheduled: ShieldCheck,
  acknowledgment_deadline: BookMarked,
  exception_expiration: ShieldOff,
  procedure_published: BookOpen,
};

const SEVERITY_ICON: Record<CalendarSeverity, LucideIcon> = {
  INFO: Info,
  WARNING: AlertTriangle,
  CRITICAL: AlertCircle,
  BLOCKING: Ban,
};

export function EventDetailModal({ event, onClose }: EventDetailModalProps) {
  /* Esc to close — standard modal affordance. */
  useEffect(() => {
    if (!event) return;
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [event, onClose]);

  if (!event) return null;

  const TypeIcon = TYPE_ICON[event.type];
  const SevIcon = SEVERITY_ICON[event.severity];
  const typeMeta = TYPE_META[event.type];
  const sevMeta = SEVERITY_META[event.severity];
  const meta = event.metadata as Record<string, unknown>;

  const startDate = new Date(event.date);
  const endDate = event.endDate ? new Date(event.endDate) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--bg-card)] w-full max-w-lg rounded-xl border border-[var(--border-color)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md"
              style={{ backgroundColor: typeMeta.bg, color: typeMeta.color }}
            >
              <TypeIcon size={18} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide"
                  style={{ backgroundColor: typeMeta.bg, color: typeMeta.color }}
                >
                  {typeMeta.short}
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide"
                  style={{ backgroundColor: sevMeta.bg, color: sevMeta.color }}
                >
                  <SevIcon size={10} />
                  {sevMeta.label}
                </span>
              </div>
              <h2 className="mt-1 text-base font-semibold text-[var(--text-primary)]">
                {event.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1 text-[var(--text-secondary)] hover:bg-[var(--hover-bg,rgba(0,0,0,0.04))]"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-5 py-4">
          <div className="mb-4 flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <Calendar size={14} className="text-[var(--text-secondary)]" />
            <span>
              {formatDate(startDate)}
              {endDate ? ` – ${formatDate(endDate)}` : ''}
              <span className="ml-2 text-xs text-[var(--text-secondary)]">
                ({formatRelativeDate(startDate)})
              </span>
            </span>
          </div>

          <DetailRows event={event} meta={meta} />
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--border-color)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
          >
            Cerrar
          </button>
          <Link
            href={event.linkPath}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Ver detalle completo
            <ExternalLink size={12} />
          </Link>
        </footer>
      </div>
    </div>
  );
}

function DetailRows({ event, meta }: { event: CalendarEvent; meta: Record<string, unknown> }) {
  const rows: Array<{ label: string; value: React.ReactNode }> = [];
  switch (event.type) {
    case 'document_expiration':
      pushIf(rows, 'Tipo de documento', meta.documentTypeName);
      pushIf(rows, 'Activo', `${meta.assetCode ?? ''} — ${meta.assetName ?? ''}`);
      if (typeof meta.daysRemaining === 'number') {
        rows.push({
          label: 'Estado',
          value: <DaysRemainingPill days={meta.daysRemaining} />,
        });
      }
      pushIf(rows, 'Crítico', meta.isCritical ? 'Sí' : 'No');
      pushIf(rows, 'Bloquea operación', meta.blocksOperation ? 'Sí' : 'No');
      break;
    case 'permit_expiration': {
      pushIf(rows, 'Permiso', meta.permitNumber);
      pushIf(rows, 'Tipo', meta.permitTypeName);
      const target = meta.asset ?? meta.location;
      if (target) pushIf(rows, 'Objetivo', describeTarget(target));
      if (typeof meta.daysRemaining === 'number') {
        rows.push({
          label: 'Estado',
          value: <DaysRemainingPill days={meta.daysRemaining} />,
        });
      }
      break;
    }
    case 'work_permit_scheduled':
      pushIf(rows, 'Permiso', meta.permitNumber);
      pushIf(rows, 'Tipo', meta.permitTypeName);
      pushIf(rows, 'Estado', String(meta.status ?? '—'));
      if (meta.plannedStart && meta.plannedEnd) {
        rows.push({
          label: 'Planificado',
          value: `${formatDate(new Date(String(meta.plannedStart)))} – ${formatDate(new Date(String(meta.plannedEnd)))}`,
        });
      }
      if (meta.actualStart || meta.actualEnd) {
        const actStart = meta.actualStart ? formatDate(new Date(String(meta.actualStart))) : '—';
        const actEnd = meta.actualEnd ? formatDate(new Date(String(meta.actualEnd))) : '—';
        rows.push({
          label: 'Real',
          value: `${actStart} – ${actEnd}`,
        });
      }
      if (meta.supervisor) {
        const sup = meta.supervisor as { name?: string; email?: string };
        pushIf(rows, 'Supervisor', sup.name ?? sup.email);
      }
      pushIf(rows, 'Activo', describeTarget(meta.asset));
      pushIf(rows, 'Ubicación', describeTarget(meta.location));
      break;
    case 'acknowledgment_deadline':
      pushIf(rows, 'Procedimiento', `${meta.code ?? ''} — ${meta.title ?? ''}`);
      pushIf(rows, 'Versión', meta.version);
      pushIf(rows, 'Categoría', meta.category);
      pushIf(rows, 'Estado actual', meta.currentStatus);
      pushIf(rows, 'Es tu lectura', meta.isMine ? 'Sí' : 'No');
      if (typeof meta.daysRemaining === 'number') {
        rows.push({
          label: 'Plazo',
          value: <DaysRemainingPill days={meta.daysRemaining} />,
        });
      }
      break;
    case 'exception_expiration':
      pushIf(rows, 'Activo', `${meta.assetCode ?? ''} — ${meta.assetName ?? ''}`);
      if (meta.validFrom && meta.validUntil) {
        rows.push({
          label: 'Vigencia',
          value: `${formatDate(new Date(String(meta.validFrom)))} – ${formatDate(new Date(String(meta.validUntil)))}`,
        });
      }
      pushIf(rows, 'Motivo aprobado', meta.approvedReason);
      break;
    case 'procedure_published':
      pushIf(rows, 'Código', meta.code);
      pushIf(rows, 'Versión', meta.version);
      pushIf(rows, 'Categoría', meta.category);
      break;
  }
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-[120px,1fr] gap-y-2 gap-x-3 text-sm">
      {rows.map((row, i) => (
        <DetailRow key={i} label={row.label} value={row.value} />
      ))}
    </dl>
  );
}

function pushIf(
  rows: Array<{ label: string; value: React.ReactNode }>,
  label: string,
  value: unknown,
) {
  if (value === null || value === undefined || value === '' || value === ' — ') return;
  /* The "${a} — ${b}" format above can produce a single em-dash with empty
     halves; guard against that pattern as well. */
  if (typeof value === 'string' && /^—\s+—$/.test(value.trim())) return;
  rows.push({ label, value: typeof value === 'object' ? JSON.stringify(value) : String(value) });
}

function describeTarget(target: unknown): string | null {
  if (!target || typeof target !== 'object') return null;
  const t = target as { code?: string; name?: string };
  if (!t.code && !t.name) return null;
  return [t.code, t.name].filter(Boolean).join(' — ');
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs uppercase tracking-wide text-[var(--text-secondary)] pt-0.5">
        {label}
      </dt>
      <dd className="text-[var(--text-primary)] break-words">{value}</dd>
    </>
  );
}

function DaysRemainingPill({ days }: { days: number }) {
  let label: string;
  let bg: string;
  let fg: string;
  if (days < 0) {
    label = `Vencido hace ${Math.abs(days)} día${Math.abs(days) === 1 ? '' : 's'}`;
    bg = 'rgba(239,68,68,0.18)';
    fg = '#b91c1c';
  } else if (days === 0) {
    label = 'Vence hoy';
    bg = 'rgba(239,68,68,0.18)';
    fg = '#b91c1c';
  } else if (days <= 7) {
    label = `Vence en ${days} día${days === 1 ? '' : 's'}`;
    bg = 'rgba(249,115,22,0.18)';
    fg = '#c2410c';
  } else if (days <= 30) {
    label = `Vence en ${days} días`;
    bg = 'rgba(234,179,8,0.18)';
    fg = '#a16207';
  } else {
    label = `Vence en ${days} días`;
    bg = 'rgba(34,197,94,0.18)';
    fg = '#15803d';
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: bg, color: fg }}
    >
      <CheckCircle2 size={10} />
      {label}
    </span>
  );
}

export default EventDetailModal;
