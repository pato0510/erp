'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BookMarked,
  BookOpen,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  HardHat,
  Leaf,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { Toast } from '../../../../components/shared/Toast';
import { AcknowledgmentModal } from '../../../../components/operations/AcknowledgmentModal';

type AckStatus = 'PENDING' | 'READ' | 'ACKNOWLEDGED' | 'EXPIRED' | 'EXEMPTED';
type ProcedureCategory =
  | 'OPERATION'
  | 'MAINTENANCE'
  | 'EMERGENCY'
  | 'SAFETY'
  | 'QUALITY'
  | 'ENVIRONMENTAL'
  | 'OTHER';

interface PendingRow {
  id: string;
  procedureId: string;
  status: AckStatus;
  firstViewedAt: string | null;
  acknowledgedAt: string | null;
  dueDate: string | null;
  createdAt: string;
  reminderCount: number;
  procedure: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    category: ProcedureCategory;
    version: string;
    estimatedReadingMinutes: number | null;
  };
}

const CATEGORY_META: Record<
  ProcedureCategory,
  { label: string; color: string; icon: typeof BookOpen }
> = {
  OPERATION: { label: 'Operación', color: '#2563EB', icon: HardHat },
  MAINTENANCE: { label: 'Mantenimiento', color: '#64748B', icon: BookOpen },
  EMERGENCY: { label: 'Emergencia', color: '#EF4444', icon: AlertTriangle },
  SAFETY: { label: 'Seguridad', color: '#EAB308', icon: ShieldCheck },
  QUALITY: { label: 'Calidad', color: '#A855F7', icon: Sparkles },
  ENVIRONMENTAL: { label: 'Ambiental', color: '#22C55E', icon: Leaf },
  OTHER: { label: 'Otro', color: '#475569', icon: FileText },
};

const STATUS_LABELS: Record<AckStatus, string> = {
  PENDING: 'Por leer',
  READ: 'En lectura',
  ACKNOWLEDGED: 'Acusada',
  EXPIRED: 'Vencida',
  EXEMPTED: 'Exento',
};

const STATUS_META: Record<AckStatus, { bg: string; fg: string }> = {
  PENDING: { bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
  READ: { bg: 'rgba(234, 179, 8, 0.14)', fg: '#a16207' },
  ACKNOWLEDGED: { bg: 'rgba(34, 197, 94, 0.14)', fg: '#15803d' },
  EXPIRED: { bg: 'rgba(239, 68, 68, 0.12)', fg: '#b91c1c' },
  EXEMPTED: { bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
};

export default function MisLecturasPage() {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  const [ackTarget, setAckTarget] = useState<PendingRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<PendingRow[]>('/api/operations/acknowledgments/my-pending');
      setRows(data);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error cargando lecturas pendientes.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const now = Date.now();
    let pending = 0;
    let inWindow = 0;
    let overdue = 0;
    for (const r of rows) {
      if (r.status === 'EXPIRED') {
        overdue += 1;
      } else if (r.dueDate && new Date(r.dueDate).getTime() < now) {
        overdue += 1;
      } else {
        pending += 1;
        inWindow += 1;
      }
    }
    return { pending, inWindow, overdue };
  }, [rows]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return ad - bd;
    });
  }, [rows]);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-[var(--text-primary)]"
          style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 600,
            fontSize: 28,
            letterSpacing: '-0.01em',
            margin: '0 0 8px',
          }}
        >
          Mis lecturas pendientes
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-ibm-plex-mono), monospace',
            fontSize: 11,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
          }}
        >
          Procedimientos que debes leer y acusar
        </p>
        <p className="text-sm text-[var(--text-secondary)] mt-2">
          <strong>{rows.length}</strong> pendientes · <strong>{counts.inWindow}</strong> en plazo ·{' '}
          <strong style={{ color: '#b91c1c' }}>{counts.overdue}</strong> vencidas
        </p>
      </div>

      {/* Urgency banner */}
      {counts.overdue > 0 && (
        <div
          className="mb-5 p-4 rounded-xl flex items-start gap-3"
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
          }}
        >
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <div
              className="text-sm text-red-700"
              style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 600 }}
            >
              Tienes {counts.overdue}{' '}
              {counts.overdue === 1 ? 'lectura vencida' : 'lecturas vencidas'}.
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Algunas asignaciones podrían bloquearse hasta que las completes. Termina las lecturas
              pendientes lo antes posible.
            </p>
          </div>
        </div>
      )}

      {/* Cards list */}
      {loading ? (
        <div
          className="p-10 text-center text-[var(--text-secondary)] rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          Cargando...
        </div>
      ) : sortedRows.length === 0 ? (
        <div
          className="p-10 text-center text-[var(--text-secondary)] rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          <BookMarked size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="font-medium text-[var(--text-primary)]">¡Estás al día! 🎉</p>
          <p className="text-sm mt-1">No tienes lecturas pendientes por acusar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedRows.map((r) => (
            <PendingCard key={r.id} row={r} onAcknowledge={() => setAckTarget(r)} />
          ))}
        </div>
      )}

      {ackTarget && (
        <AcknowledgmentModal
          procedure={{
            id: ackTarget.procedure.id,
            code: ackTarget.procedure.code,
            title: ackTarget.procedure.title,
            version: ackTarget.procedure.version,
          }}
          onClose={() => setAckTarget(null)}
          onAcknowledged={() => {
            setAckTarget(null);
            setToast({ message: 'Acuse registrado correctamente.', type: 'success' });
            load();
          }}
        />
      )}
    </div>
  );
}

function PendingCard({ row, onAcknowledge }: { row: PendingRow; onAcknowledge: () => void }) {
  const meta = CATEGORY_META[row.procedure.category];
  const Icon = meta.icon;
  const statusMeta = STATUS_META[row.status];
  const due = row.dueDate ? new Date(row.dueDate) : null;
  const now = new Date();
  const overdue = due && due.getTime() < now.getTime();
  const daysToDue = due ? Math.round((due.getTime() - now.getTime()) / 86_400_000) : null;

  let dueLabel = '';
  let dueColor = 'var(--text-muted)';
  if (due) {
    if (overdue) {
      dueLabel = `Vencida hace ${Math.abs(daysToDue ?? 0)} día${
        Math.abs(daysToDue ?? 0) === 1 ? '' : 's'
      }`;
      dueColor = '#b91c1c';
    } else if (daysToDue === 0) {
      dueLabel = 'Vence hoy';
      dueColor = '#b91c1c';
    } else if ((daysToDue ?? 0) <= 3) {
      dueLabel = `Vence en ${daysToDue} día${daysToDue === 1 ? '' : 's'}`;
      dueColor = '#a16207';
    } else {
      dueLabel = `Vence en ${daysToDue} días`;
      dueColor = 'var(--text-secondary)';
    }
  }

  const canAcknowledge = row.status !== 'ACKNOWLEDGED' && row.status !== 'EXEMPTED';

  return (
    <div
      className="p-4 rounded-xl"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderLeft: `4px solid ${overdue ? '#EF4444' : meta.color}`,
      }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{
              background: `${meta.color}22`,
              color: meta.color,
              fontWeight: 600,
            }}
          >
            <Icon size={11} /> {meta.label}
          </span>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
            style={{
              background: statusMeta.bg,
              color: statusMeta.fg,
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
            }}
          >
            {STATUS_LABELS[row.status]}
          </span>
          {row.reminderCount > 0 && (
            <span className="text-xs text-[var(--text-muted)]">
              {row.reminderCount} recordatorio{row.reminderCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {dueLabel && (
          <span
            className="text-xs"
            style={{
              color: dueColor,
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
            }}
          >
            <Clock size={11} className="inline mr-1" />
            {dueLabel}
          </span>
        )}
      </div>
      <h3
        className="text-base mb-1"
        style={{
          fontFamily: 'var(--font-outfit), sans-serif',
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        {row.procedure.title}
      </h3>
      <p
        className="text-xs text-[var(--text-muted)] mb-2"
        style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
      >
        {row.procedure.code} · v{row.procedure.version}
        {row.procedure.estimatedReadingMinutes
          ? ` · ${row.procedure.estimatedReadingMinutes} min de lectura`
          : ''}
      </p>
      {row.procedure.description && (
        <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-3">
          {row.procedure.description}
        </p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href={`/operaciones/procedimientos/${row.procedure.id}`}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-full text-white"
          style={{
            background: '#2563EB',
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 600,
          }}
        >
          <BookOpen size={12} /> Leer ahora
        </Link>
        <button
          onClick={onAcknowledge}
          disabled={!canAcknowledge}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-full disabled:opacity-50"
          style={{
            background: 'rgba(34, 197, 94, 0.14)',
            color: '#15803d',
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 600,
          }}
          title={
            row.firstViewedAt
              ? 'Marca como acusado luego de leer el procedimiento.'
              : 'Idealmente abre primero el procedimiento; igual puedes acusarlo si ya lo leíste.'
          }
        >
          <CheckCircle2 size={12} /> Marcar como acusado
        </button>
        {row.firstViewedAt && (
          <span className="text-xs text-[var(--text-muted)]">
            <Eye size={11} className="inline mr-0.5" /> Visto el {formatDate(row.firstViewedAt)}
          </span>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}
