'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';

/* COM-007 — create an opportunity from the pipeline board. Mirrors the
   AccountFormModal overlay shell. Stage is NOT a field: the backend always starts a
   new opportunity at PROSPECTO (all stage movement goes through the canonical stage
   endpoints), so the card lands in the Prospecto column. accountId is required;
   estimatedValue / expectedCloseDate / probability / owner / notes are optional. */

export interface AccountOption {
  id: string;
  name: string;
}
export interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
}

const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

export function NewOpportunityModal({
  accounts,
  users,
  onClose,
  onCreated,
}: {
  accounts: AccountOption[];
  users: UserOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [probability, setProbability] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setErr('El nombre es obligatorio.');
      return;
    }
    if (!accountId) {
      setErr('Debes seleccionar una cuenta.');
      return;
    }
    setSaving(true);
    setErr(null);
    const body: Record<string, unknown> = { name: name.trim(), accountId };
    if (estimatedValue.trim() !== '') body.estimatedValue = Number(estimatedValue);
    if (expectedCloseDate) body.expectedCloseDate = expectedCloseDate;
    if (probability.trim() !== '') body.probability = Number(probability);
    if (ownerId) body.ownerId = ownerId;
    if (notes.trim()) body.notes = notes.trim();
    try {
      await apiClient.post('/api/comercial/opportunities', body);
      onCreated();
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? e.status === 403
            ? 'No tienes permiso para crear oportunidades.'
            : e.message
          : 'No se pudo crear la oportunidad.',
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
            Nueva oportunidad
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
              placeholder="Ej. Servicio de aseo faena norte"
            />
          </Field>
          <Field label="Cuenta">
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className={INPUT}
            >
              <option value="">Seleccionar cuenta…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Valor estimado (CLP)">
              <input
                type="number"
                min={0}
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
                className={INPUT}
                placeholder="Ej. 4500000"
              />
            </Field>
            <Field label="Cierre estimado">
              <input
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Probabilidad (%)">
              <input
                type="number"
                min={0}
                max={100}
                value={probability}
                onChange={(e) => setProbability(e.target.value)}
                className={INPUT}
                placeholder="0–100"
              />
            </Field>
            <Field label="Responsable">
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className={INPUT}
              >
                <option value="">Sin asignar</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
            </Field>
          </div>
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
            {saving ? 'Creando…' : 'Crear oportunidad'}
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

export default NewOpportunityModal;
