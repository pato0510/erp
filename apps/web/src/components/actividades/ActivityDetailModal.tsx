'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, Play, RotateCcw, Send, Trash2, X, XCircle } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { STATUS_LABEL, STATUS_STYLE } from './statusMachine';
import type {
  ActivityArea,
  ActivityNote,
  ActivityStatus,
  CalendarActivity,
  MemberOption,
} from './activityTypes';

/* CAL-005 — activity detail + curated status actions. Every write affordance is conditional on
   `canWrite` (a real conditional render, not a hidden handler) — a VIEWER/ANALYST/ACCOUNTANT
   sees the full read view and ZERO buttons. Status moves go through the CAL-003 machine
   (PATCH /:id/status); backend 4xx messages surface VERBATIM. Editar is offered in ANY status
   (the deliberate contrast with campaigns); Eliminar is any status with a confirm. */

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
  members,
  canWrite,
  onClose,
  onChanged,
  onEdit,
}: {
  activity: CalendarActivity;
  area: ActivityArea | undefined;
  members: MemberOption[];
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (a: CalendarActivity) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const memberName = (userId: string | null): string | null =>
    userId ? (members.find((m) => m.userId === userId)?.displayName ?? '—') : null;
  const responsable = memberName(activity.assigneeId);

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
          <Row label="Responsable">{responsable ?? 'Sin responsable'}</Row>
          {activity.notes && (
            <Row label="Notas">
              <span className="whitespace-pre-wrap text-[var(--text-primary)]">
                {activity.notes}
              </span>
            </Row>
          )}

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <BitacoraSection activityId={activity.id} members={members} canWrite={canWrite} />

        {canWrite && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border-color)] px-5 py-4">
            {activity.status === 'PENDIENTE' && (
              <>
                <ActionBtn onClick={() => changeStatus('EN_EJECUCION')} disabled={busy} icon={Play}>
                  Iniciar
                </ActionBtn>
                <ActionBtn onClick={() => changeStatus('HECHA')} disabled={busy} icon={Check}>
                  Marcar hecha
                </ActionBtn>
                <ActionBtn onClick={() => changeStatus('CANCELADA')} disabled={busy} icon={XCircle}>
                  Cancelar
                </ActionBtn>
              </>
            )}
            {activity.status === 'EN_EJECUCION' && (
              <>
                <ActionBtn onClick={() => changeStatus('HECHA')} disabled={busy} icon={Check}>
                  Marcar hecha
                </ActionBtn>
                <ActionBtn
                  onClick={() => changeStatus('PENDIENTE')}
                  disabled={busy}
                  icon={RotateCcw}
                >
                  Volver a pendiente
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

/* CAL-009 — the bitácora: entries newest-first, author resolved via the members map (fetched
   once per page — NOT re-fetched per entry), append box for writers only, ZERO edit/delete
   affordances for every role. Backend 400s (empty text) surface verbatim. */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function BitacoraSection({
  activityId,
  members,
  canWrite,
}: {
  activityId: string;
  members: MemberOption[];
  canWrite: boolean;
}) {
  const [notes, setNotes] = useState<ActivityNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const authorName = (userId: string): string =>
    members.find((m) => m.userId === userId)?.displayName ?? 'Usuario';

  const load = useCallback(() => {
    setLoading(true);
    apiClient
      .get<ActivityNote[]>(`/api/actividades/activities/${activityId}/notes`)
      .then((data) => setNotes(data))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false));
  }, [activityId]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    setPosting(true);
    setErr(null);
    try {
      await apiClient.post(`/api/actividades/activities/${activityId}/notes`, { text });
      setText('');
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo agregar la entrada.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="border-t border-[var(--border-color)] px-5 py-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        Bitácora
      </h3>

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">Cargando…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm italic text-[var(--text-secondary)] opacity-70">
          Sin entradas todavía.
        </p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-[var(--text-primary)]">
                  {authorName(n.authorId)}
                </span>
                <span className="shrink-0 text-[11px] text-[var(--text-secondary)]">
                  {formatDateTime(n.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-[var(--text-primary)]">{n.text}</p>
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <div className="mt-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Nueva entrada…"
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />
          {err && <p className="mt-1 text-sm text-red-600">{err}</p>}
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={add}
              disabled={posting}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              style={{ background: '#2563eb' }}
            >
              <Send size={13} /> Agregar entrada
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ActivityDetailModal;
