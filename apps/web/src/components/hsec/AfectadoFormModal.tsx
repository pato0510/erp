'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import type { IncidentPerson, RosterEntry } from './incidentTypes';

/* HSEC-005 — add/edit an afectado. The picker consumes GET /hsec/roster (the RrhhEmployeeRead
 * leaf's two-key signed contract — ACTIVO employees only; a historic DESVINCULADO afectado is
 * added by the backend rule, not this picker). On EDIT the employee is FIXED (the row's
 * identity — swapping the person is quitar + agregar). The duplicate 409 and the
 * unknown-employee 400 surface VERBATIM. */

const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

export function AfectadoFormModal({
  incidentId,
  roster,
  editing,
  onClose,
  onSaved,
}: {
  incidentId: string;
  roster: RosterEntry[];
  editing: IncidentPerson | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ?? '');
  const [injuryType, setInjuryType] = useState(editing?.injuryType ?? '');
  const [bodyPart, setBodyPart] = useState(editing?.bodyPart ?? '');
  const [medicalAttention, setMedicalAttention] = useState(editing?.medicalAttention ?? false);
  const [lostDays, setLostDays] = useState(
    editing?.lostDays !== null && editing?.lostDays !== undefined ? String(editing.lostDays) : '',
  );
  const [detail, setDetail] = useState(editing?.detail ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!editing && !employeeId) {
      setErr('Selecciona un trabajador.');
      return;
    }
    if (lostDays !== '' && (!/^\d+$/.test(lostDays) || Number(lostDays) < 0)) {
      setErr('Los días perdidos deben ser un número entero no negativo.');
      return;
    }
    setSaving(true);
    setErr(null);
    const fields = {
      injuryType: injuryType.trim() || null,
      bodyPart: bodyPart.trim() || null,
      medicalAttention,
      lostDays: lostDays === '' ? null : Number(lostDays),
      detail: detail.trim() || null,
    };
    try {
      if (editing) {
        await apiClient.patch(`/api/hsec/incidents/${incidentId}/persons/${editing.id}`, fields);
      } else {
        await apiClient.post(`/api/hsec/incidents/${incidentId}/persons`, {
          employeeId,
          injuryType: fields.injuryType ?? undefined,
          bodyPart: fields.bodyPart ?? undefined,
          medicalAttention,
          lostDays: fields.lostDays ?? undefined,
          detail: fields.detail ?? undefined,
        });
      }
      onSaved();
    } catch (e) {
      // Verbatim: the duplicate 409 and the unknown-employee 400 come straight through.
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar el afectado.');
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
            {editing ? `Editar afectado — ${editing.fullName ?? ''}` : 'Agregar afectado'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {!editing && (
            <Field label="Trabajador">
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className={INPUT}
              >
                <option value="">— Seleccionar —</option>
                {roster.map((r) => (
                  <option key={r.employeeId} value={r.employeeId}>
                    {r.fullName}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo de lesión">
              <input
                value={injuryType}
                onChange={(e) => setInjuryType(e.target.value)}
                className={INPUT}
                placeholder="Ej. Contusión"
              />
            </Field>
            <Field label="Parte del cuerpo">
              <input
                value={bodyPart}
                onChange={(e) => setBodyPart(e.target.value)}
                className={INPUT}
                placeholder="Ej. Mano izquierda"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Atención médica">
              <label className="flex items-center gap-2 py-2 text-sm text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={medicalAttention}
                  onChange={(e) => setMedicalAttention(e.target.checked)}
                />
                Recibió atención médica
              </label>
            </Field>
            <Field label="Días perdidos">
              <input
                type="number"
                min={0}
                value={lostDays}
                onChange={(e) => setLostDays(e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>

          <Field label="Detalle">
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
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

export default AfectadoFormModal;
