'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import type { HsecIncident, HsecIncidentSeverity, HsecIncidentType } from './incidentTypes';
import { SEVERITY_LABEL, TYPE_LABEL } from './incidentTypes';

/* HSEC-005 — create/edit an incident (one form, two modes). Mirrors the AreaFormModal shell
 * (same tokens, same Field helper). NO status field — the machine endpoint (PATCH /:id/status)
 * is the only path; if the backend ever answers its Spanish 400 here, it surfaces verbatim.
 * NO sourceWorkPermitId anywhere (PART1 decision 8: no picker in V1). occurredTime is a
 * wall-clock "HH:mm" STRING fed straight from the input — never parsed as a Date. Backend 4xx
 * messages surface VERBATIM. */

const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

export function IncidentFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: HsecIncident | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [type, setType] = useState<HsecIncidentType>(editing?.type ?? 'ACCIDENTE_TRABAJO');
  const [severity, setSeverity] = useState<HsecIncidentSeverity>(editing?.severity ?? 'LEVE');
  const [occurredDate, setOccurredDate] = useState(
    editing ? editing.occurredDate.slice(0, 10) : '',
  );
  const [occurredTime, setOccurredTime] = useState(editing?.occurredTime ?? '');
  const [location, setLocation] = useState(editing?.location ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [immediateCause, setImmediateCause] = useState(editing?.immediateCause ?? '');
  const [correctiveActions, setCorrectiveActions] = useState(editing?.correctiveActions ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!occurredDate || !location.trim() || !description.trim()) {
      setErr('Fecha, lugar y descripción son obligatorios.');
      return;
    }
    setSaving(true);
    setErr(null);
    const body: Record<string, unknown> = {
      type,
      severity,
      occurredDate,
      occurredTime: occurredTime || undefined,
      location: location.trim(),
      description: description.trim(),
      immediateCause: immediateCause.trim() || undefined,
      correctiveActions: correctiveActions.trim() || undefined,
    };
    if (editing) {
      // PATCH semantics: cleared optionals must travel as null (not undefined) to erase.
      body.occurredTime = occurredTime || null;
      body.immediateCause = immediateCause.trim() || null;
      body.correctiveActions = correctiveActions.trim() || null;
    }
    try {
      if (editing) {
        await apiClient.patch(`/api/hsec/incidents/${editing.id}`, body);
        onSaved(editing.id);
      } else {
        const created = await apiClient.post<HsecIncident>('/api/hsec/incidents', body);
        onSaved(created.id);
      }
    } catch (e) {
      // Backend 4xx verbatim (Spanish DTO messages, the status-edit 400, etc).
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar el incidente.');
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
            {editing ? `Editar ${editing.incidentNumber}` : 'Nuevo incidente'}
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
                onChange={(e) => setType(e.target.value as HsecIncidentType)}
                className={INPUT}
              >
                {(Object.keys(TYPE_LABEL) as HsecIncidentType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Severidad">
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as HsecIncidentSeverity)}
                className={INPUT}
              >
                {(Object.keys(SEVERITY_LABEL) as HsecIncidentSeverity[]).map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha de ocurrencia">
              <input
                type="date"
                value={occurredDate}
                onChange={(e) => setOccurredDate(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="Hora (opcional)">
              <input
                type="time"
                value={occurredTime}
                onChange={(e) => setOccurredTime(e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>

          <Field label="Lugar">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={INPUT}
              placeholder="Ej. Bodega central"
            />
          </Field>

          <Field label="Descripción">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={INPUT}
              rows={3}
              placeholder="Qué ocurrió, cómo y en qué contexto"
            />
          </Field>

          <Field label="Causa inmediata (opcional)">
            <textarea
              value={immediateCause}
              onChange={(e) => setImmediateCause(e.target.value)}
              className={INPUT}
              rows={2}
            />
          </Field>

          <Field label="Acciones correctivas (opcional)">
            <textarea
              value={correctiveActions}
              onChange={(e) => setCorrectiveActions(e.target.value)}
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

export default IncidentFormModal;
