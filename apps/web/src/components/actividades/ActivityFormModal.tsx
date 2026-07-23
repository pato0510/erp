'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import type { ActivityArea, ActivityKind, CalendarActivity, MemberOption } from './activityTypes';

/* CAL-005 — create / edit a calendar activity. Editing is allowed in ANY status (the deliberate
   contrast with campaigns — CAL-003). The área select offers ACTIVE areas only; when editing an
   activity whose area was since deactivated, that area is injected as the current option so the
   value is preserved (the CAL-003 backend rule: unchanged areaId is not re-validated).

   THE TIME-ON-RANGE RULE IS NOT PRE-BLOCKED HERE (MKT-009 precedent): the user may set "Varios
   días" AND a time; on save the backend's verbatim 400 ("La hora solo puede indicarse en
   actividades de un único día.") surfaces below — the message IS the validation UX. The date
   picker's min=start is a courtesy; the server stays authoritative on endDate ≥ startDate. */

const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

/** UTC day slice of an @db.Date ISO ("YYYY-MM-DDT00:00:00.000Z" → "YYYY-MM-DD") — the value
 *  an <input type="date"> expects, with no timezone shift. */
function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

export function ActivityFormModal({
  editing,
  areas,
  members,
  onClose,
  onSaved,
}: {
  editing: CalendarActivity | null;
  areas: ActivityArea[];
  members: MemberOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [kind, setKind] = useState<ActivityKind>(editing?.kind ?? 'ACTIVIDAD');
  const [areaId, setAreaId] = useState(editing?.areaId ?? '');
  const [assigneeId, setAssigneeId] = useState(editing?.assigneeId ?? '');
  const [startDate, setStartDate] = useState(toDateInput(editing?.startDate ?? null));
  const [multiDay, setMultiDay] = useState(!!editing?.endDate);
  const [endDate, setEndDate] = useState(toDateInput(editing?.endDate ?? null));
  const [startTime, setStartTime] = useState(editing?.startTime ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Active areas for the select; when editing an activity whose area is now inactive, keep it
  // visible as the current option (otherwise the value would vanish from the dropdown).
  const activeAreas = areas.filter((a) => a.active);
  const editingArea = editing ? areas.find((a) => a.id === editing.areaId) : undefined;
  const areaOptions =
    editingArea && !editingArea.active ? [editingArea, ...activeAreas] : activeAreas;

  const save = async () => {
    if (!title.trim()) {
      setErr('El título es obligatorio.');
      return;
    }
    if (!areaId) {
      setErr('Debes elegir un área.');
      return;
    }
    if (!startDate) {
      setErr('Debes indicar la fecha de inicio.');
      return;
    }
    setSaving(true);
    setErr(null);
    // Send explicit nulls so editing can CLEAR endDate/startTime (the CAL-003 update semantics:
    // a provided field — including null — is applied; an absent field is left unchanged).
    const body = {
      title: title.trim(),
      kind,
      areaId,
      assigneeId: assigneeId || null,
      startDate,
      endDate: multiDay && endDate ? endDate : null,
      startTime: startTime || null,
      notes: notes.trim() || null,
    };
    try {
      if (editing) await apiClient.patch(`/api/actividades/activities/${editing.id}`, body);
      else await apiClient.post('/api/actividades/activities', body);
      onSaved();
    } catch (e) {
      // Surface the backend's Spanish message verbatim (esp. the time-on-range 400).
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar la actividad.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            {editing ? 'Editar actividad' : 'Nueva actividad'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <Field label="Título">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={INPUT}
              placeholder="Ej. Reunión de coordinación"
            />
          </Field>

          <Field label="Tipo">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ActivityKind)}
              className={INPUT}
            >
              <option value="ACTIVIDAD">Actividad</option>
              <option value="SERVICIO">Servicio</option>
            </select>
          </Field>

          <Field label="Área">
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className={INPUT}>
              <option value="">Selecciona un área…</option>
              {areaOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {!a.active ? ' (inactiva)' : ''}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Responsable (opcional)">
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className={INPUT}
            >
              <option value="">Sin responsable</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Fecha de inicio">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={INPUT}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={multiDay}
              onChange={(e) => setMultiDay(e.target.checked)}
            />
            Varios días
          </label>

          {multiDay && (
            <Field label="Fecha de término">
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className={INPUT}
              />
            </Field>
          )}

          <Field label="Hora (opcional)">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={INPUT}
            />
          </Field>

          <Field label="Notas (opcional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={INPUT}
              placeholder="Detalles, participantes, enlaces…"
            />
          </Field>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)]"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: '#2563eb' }}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </label>
      {children}
    </div>
  );
}

export default ActivityFormModal;
