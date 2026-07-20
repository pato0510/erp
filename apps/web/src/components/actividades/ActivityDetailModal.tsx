'use client';

import { useState } from 'react';
import { Check, Pencil, RotateCcw, Trash2, X, XCircle } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import type { ActivityArea, ActivityStatus, CalendarActivity } from './activityTypes';

/* CAL-005 — activity detail + curated status actions. Every write affordance is conditional on
   `canWrite` (a real conditional render, not a hidden handler) — a VIEWER/ANALYST/ACCOUNTANT
   sees the full read view and ZERO buttons. Status moves go through the CAL-003 machine
   (PATCH /:id/status); backend 4xx messages surface VERBATIM. Editar is offered in ANY status
   (the deliberate contrast with campaigns); Eliminar is any status with a confirm. */

const STATUS_LABEL: Record<ActivityStatus, string> = {
  PENDIENTE: 'Pendiente',
  HECHA: 'Hecha',
  CANCELADA: 'Cancelada',
};

const STATUS_STYLE: Record<ActivityStatus, { bg: string; color: string }> = {
  PENDIENTE: { bg: 'rgba(37,99,235,0.12)', color: '#1d4ed8' },
  HECHA: { bg: 'rgba(34,197,94,0.12)', color: '#15803d' },
  CANCELADA: { bg: 'rgba(100,116,139,0.14)', color: '#475569' },
};

function formatDate(iso: string): string {
  // Format from UTC parts so the stored @db.Date day never shifts.
  return new Date(iso).toLocaleDateString('es-CL', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function ActivityDetailModal({
  activity,
  area,
  canWrite,
  onClose,
  onChanged,
  onEdit,
}: {
  activity: CalendarActivity;
  area: ActivityArea | undefined;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (a: CalendarActivity) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const changeStatus = async (status: ActivityStatus) => {
    setBusy(true);
    setErr(null);
    try {
      await apiClient.patch(`/api/actividades/activities/${activity.id}/status`, { status });
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo cambiar el estado.');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (
      !window.confirm(
        `¿Eliminar la actividad "${activity.title}"? Esta acción no se puede deshacer.`,
      )
    )
      return;
    setBusy(true);
    setErr(null);
    try {
      await apiClient.delete(`/api/actividades/activities/${activity.id}`);
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo eliminar la actividad.');
      setBusy(false);
    }
  };

  const st = STATUS_STYLE[activity.status];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-start justify-between border-b border-[var(--border-color)] px-5 py-4">
          <div className="flex items-start gap-2.5">
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full border border-[var(--border-color)]"
              style={{ background: area?.color ?? '#64748b' }}
            />
            <h2
              className="text-lg font-semibold text-[var(--text-primary)]"
              style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
            >
              {activity.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm">
          <Row label="Área">{area?.name ?? '—'}</Row>
          <Row label="Estado">
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: st.bg, color: st.color }}
            >
              {STATUS_LABEL[activity.status]}
            </span>
          </Row>
          <Row label="Fecha">
            {formatDate(activity.startDate)}
            {activity.endDate ? ` → ${formatDate(activity.endDate)}` : ''}
          </Row>
          {activity.startTime && <Row label="Hora">{activity.startTime}</Row>}
          {activity.notes && (
            <Row label="Notas">
              <span className="whitespace-pre-wrap text-[var(--text-primary)]">
                {activity.notes}
              </span>
            </Row>
          )}

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        {canWrite && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border-color)] px-5 py-4">
            {activity.status === 'PENDIENTE' && (
              <>
                <ActionBtn onClick={() => changeStatus('HECHA')} disabled={busy} icon={Check}>
                  Marcar hecha
                </ActionBtn>
                <ActionBtn onClick={() => changeStatus('CANCELADA')} disabled={busy} icon={XCircle}>
                  Cancelar
                </ActionBtn>
              </>
            )}
            {activity.status === 'HECHA' && (
              <ActionBtn onClick={() => changeStatus('PENDIENTE')} disabled={busy} icon={RotateCcw}>
                Reabrir
              </ActionBtn>
            )}
            {activity.status === 'CANCELADA' && (
              <ActionBtn onClick={() => changeStatus('PENDIENTE')} disabled={busy} icon={RotateCcw}>
                Reactivar
              </ActionBtn>
            )}
            <ActionBtn onClick={() => onEdit(activity)} disabled={busy} icon={Pencil}>
              Editar
            </ActionBtn>
            <ActionBtn onClick={remove} disabled={busy} icon={Trash2} danger>
              Eliminar
            </ActionBtn>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </span>
      <span className="flex-1 text-[var(--text-primary)]">{children}</span>
    </div>
  );
}

function ActionBtn({
  onClick,
  disabled,
  icon: Icon,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ComponentType<{ size?: number }>;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium disabled:opacity-60 ${
        danger
          ? 'border-red-200 text-red-600 hover:bg-red-50'
          : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      }`}
    >
      <Icon size={13} />
      {children}
    </button>
  );
}

export default ActivityDetailModal;
