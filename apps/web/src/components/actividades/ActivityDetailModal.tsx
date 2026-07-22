'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

/* CAL-009 / CAL-012 — the bitácora: entries newest-first (by createdAt), author resolved via the
   members map (fetched once per page). Append box for writers. CAL-012 — the founder reversed the
   signed immutability (2026-07-22): each entry now carries a pencil (edit, PREFILLED) and a trash
   (delete) for writers; an edited entry shows a "· editada" marker. Readers see the marker, zero
   controls. Backend 400s (empty text) surface verbatim; the audit trigger keeps prior content. */
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
            <NoteItem
              key={n.id}
              note={n}
              activityId={activityId}
              authorName={authorName(n.authorId)}
              canWrite={canWrite}
              onChanged={load}
            />
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

/* CAL-012 — a single bitácora entry with writer edit/delete. The edit box is PREFILLED with the
   current text (prefill is correct now — editing, not appending). Enter/blur saves, Escape
   cancels, empty → backend 400 verbatim. The "· editada" marker shows when updatedAt is set. */
function NoteItem({
  note,
  activityId,
  authorName,
  canWrite,
  onChanged,
}: {
  note: ActivityNote;
  activityId: string;
  authorName: string;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cancelled = useRef(false); // Escape / post-success blur must NOT re-submit

  const startEdit = () => {
    cancelled.current = false;
    setText(note.text); // PREFILL
    setErr(null);
    setEditing(true);
  };

  const save = async () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await apiClient.patch(`/api/actividades/activities/${activityId}/notes/${note.id}`, { text });
      cancelled.current = true; // swallow the unmount blur
      setEditing(false);
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar la entrada.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    cancelled.current = true;
    setText(note.text);
    setErr(null);
    setEditing(false);
  };

  const remove = async () => {
    if (!window.confirm('¿Eliminar esta entrada de la bitácora?')) return;
    setBusy(true);
    setErr(null);
    try {
      await apiClient.delete(`/api/actividades/activities/${activityId}/notes/${note.id}`);
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo eliminar la entrada.');
      setBusy(false);
    }
  };

  return (
    <li className="text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-[var(--text-primary)]">{authorName}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
          <span>{formatDateTime(note.createdAt)}</span>
          {note.updatedAt && <span className="italic opacity-70">· editada</span>}
          {canWrite && !editing && (
            <>
              <button
                type="button"
                onClick={startEdit}
                title="Editar entrada"
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                title="Eliminar entrada"
                className="text-red-600 hover:text-red-700 disabled:opacity-60"
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
        </span>
      </div>
      {editing ? (
        <div className="mt-1">
          <textarea
            autoFocus
            value={text}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                save();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
            }}
            rows={2}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-[var(--text-primary)]">{note.text}</p>
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        </>
      )}
    </li>
  );
}

export default ActivityDetailModal;
