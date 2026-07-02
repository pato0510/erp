'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { ACCOUNT_STATUSES, PRIORITIES, PRIORITY_LABELS, STATUS_LABELS } from './accountLabels';

/* COM-004b — create/edit an account. Mirrors the CargoModal overlay shell.
   Counterparty linking is NOT here (it lives on the ficha's Datos generales tab),
   and account creation NEVER creates a counterparty. */

export interface AccountForForm {
  id: string;
  name: string;
  status: string;
  priority: string;
  industry: string | null;
  commercialRisk: string | null;
  notes: string | null;
}

const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

export function AccountFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: AccountForForm | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [status, setStatus] = useState(editing?.status ?? 'PROSPECTO');
  const [priority, setPriority] = useState(editing?.priority ?? 'MEDIA');
  const [industry, setIndustry] = useState(editing?.industry ?? '');
  const [commercialRisk, setCommercialRisk] = useState(editing?.commercialRisk ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setErr('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setErr(null);
    const body = {
      name: name.trim(),
      status,
      priority,
      industry: industry.trim() || undefined,
      commercialRisk: commercialRisk.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    try {
      if (editing) await apiClient.patch(`/api/comercial/accounts/${editing.id}`, body);
      else await apiClient.post('/api/comercial/accounts', body);
      onSaved();
    } catch (e) {
      setErr(
        e instanceof ApiError && e.status === 403
          ? 'No tienes permiso para esta acción.'
          : 'No se pudo guardar la cuenta.',
      );
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
            {editing ? 'Editar cuenta' : 'Nueva cuenta'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <Field label="Nombre">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
              placeholder="Ej. Minera Los Andes SpA"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Estado">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={INPUT}>
                {ACCOUNT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prioridad">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={INPUT}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Industria">
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className={INPUT}
              placeholder="Ej. Minería"
            />
          </Field>
          <Field label="Riesgo comercial">
            <input
              value={commercialRisk}
              onChange={(e) => setCommercialRisk(e.target.value)}
              className={INPUT}
              placeholder="Nota libre (ej. paga a 90 días)"
            />
          </Field>
          <Field label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={INPUT}
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

export default AccountFormModal;
