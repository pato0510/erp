'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import type { HsecTrainingType, TrainingDetail } from './trainingTypes';
import { TRAINING_TYPE_LABEL } from './trainingTypes';

/* HSEC-007 — create/edit a training (one form, two modes; the IncidentFormModal sibling).
 * `time` is a wall-clock "HH:mm" STRING fed straight from the input — never parsed as a
 * Date. Backend 4xx messages surface VERBATIM. DIRECTOR RULING (HSEC-006 review): the
 * POST/PATCH response body is NEVER used as state — onSaved() triggers the caller's refetch
 * of the shaped GET. */

const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

export function TrainingFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: TrainingDetail | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [type, setType] = useState<HsecTrainingType>(editing?.type ?? 'CHARLA');
  const [topic, setTopic] = useState(editing?.topic ?? '');
  const [date, setDate] = useState(editing ? editing.date.slice(0, 10) : '');
  const [time, setTime] = useState(editing?.time ?? '');
  const [durationMinutes, setDurationMinutes] = useState(
    editing?.durationMinutes ? String(editing.durationMinutes) : '',
  );
  const [instructorName, setInstructorName] = useState(editing?.instructorName ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!topic.trim() || !date || !instructorName.trim()) {
      setErr('Tema, fecha y relator son obligatorios.');
      return;
    }
    if (durationMinutes !== '' && (!/^\d+$/.test(durationMinutes) || Number(durationMinutes) < 1)) {
      setErr('La duración debe ser un número entero positivo.');
      return;
    }
    setSaving(true);
    setErr(null);
    const body: Record<string, unknown> = {
      type,
      topic: topic.trim(),
      date,
      time: time || undefined,
      durationMinutes: durationMinutes === '' ? undefined : Number(durationMinutes),
      instructorName: instructorName.trim(),
      notes: notes.trim() || undefined,
    };
    if (editing) {
      // PATCH semantics: cleared optionals travel as null (not undefined) to erase.
      body.time = time || null;
      body.durationMinutes = durationMinutes === '' ? null : Number(durationMinutes);
      body.notes = notes.trim() || null;
    }
    try {
      if (editing) {
        // Response body DISCARDED (director ruling) — the caller refetches the shaped GET.
        await apiClient.patch(`/api/hsec/trainings/${editing.id}`, body);
        onSaved(editing.id);
      } else {
        // Only the new id is read (for navigation); the row state comes from the refetch.
        const created = await apiClient.post<{ id: string }>('/api/hsec/trainings', body);
        onSaved(created.id);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar la capacitación.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            {editing ? 'Editar capacitación' : 'Nueva capacitación'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as HsecTrainingType)}
                className={INPUT}
              >
                {(Object.keys(TRAINING_TYPE_LABEL) as HsecTrainingType[]).map((t) => (
                  <option key={t} value={t}>
                    {TRAINING_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Duración (minutos, opcional)">
              <input
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>

          <Field label="Tema">
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className={INPUT}
              placeholder="Ej. Charla 5 minutos — uso de arnés"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="Hora (opcional)">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>

          <Field label="Relator">
            <input
              value={instructorName}
              onChange={(e) => setInstructorName(e.target.value)}
              className={INPUT}
              placeholder="Nombre del relator (interno o externo)"
            />
          </Field>

          <Field label="Notas (opcional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={INPUT}
              rows={2}
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

export default TrainingFormModal;
