'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { CAMPAIGN_CHANNELS, CHANNEL_LABELS, toDateInput } from './campaignLabels';

/* MKT-003 — create/edit a campaign. Mirrors the Comercial AccountFormModal overlay
   shell exactly (same tokens, same Field helper, same modal-vs-page choice accounts
   made). Deliberately NOT exposed: `status` (forced BORRADOR on create; changed only
   via the status endpoint) and `ownerId` (the accounts form does not expose its
   ownerId — mirror, don't innovate). Dates travel as YYYY-MM-DD (UTC-safe, HR-004b);
   the server stays authoritative on endDate ≥ startDate — the client check is a
   convenience. Backend 4xx messages are shown VERBATIM (they are already Spanish). */

export interface CampaignForForm {
  id: string;
  name: string;
  channel: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  budgetAmount: string | null;
  notes: string | null;
}

const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

export function CampaignFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: CampaignForForm | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [channel, setChannel] = useState(editing?.channel ?? 'FERIA_EVENTO');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [startDate, setStartDate] = useState(toDateInput(editing?.startDate));
  const [endDate, setEndDate] = useState(toDateInput(editing?.endDate));
  const [budgetAmount, setBudgetAmount] = useState(
    editing?.budgetAmount != null ? String(Number(editing.budgetAmount)) : '',
  );
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setErr('El nombre es obligatorio.');
      return;
    }
    // Convenience mirror of the server rule (server stays authoritative).
    if (startDate && endDate && endDate < startDate) {
      setErr('La fecha de término no puede ser anterior a la fecha de inicio.');
      return;
    }
    setSaving(true);
    setErr(null);
    const body = {
      name: name.trim(),
      channel,
      description: description.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      budgetAmount: budgetAmount.trim() === '' ? undefined : Number(budgetAmount),
      notes: notes.trim() || undefined,
    };
    try {
      if (editing) await apiClient.patch(`/api/marketing/campaigns/${editing.id}`, body);
      else await apiClient.post('/api/marketing/campaigns', body);
      onSaved();
    } catch (e) {
      // Surface the backend's Spanish 4xx message verbatim (e.g. date-order error).
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar la campaña.');
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
            {editing ? 'Editar campaña' : 'Nueva campaña'}
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
              placeholder="Ej. Feria Expomin 2026"
            />
          </Field>
          <Field label="Canal">
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className={INPUT}>
              {CAMPAIGN_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Descripción">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={INPUT}
              placeholder="Objetivo de la campaña (opcional)"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Fecha de inicio">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="Fecha de término">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>
          <Field label="Presupuesto (CLP, neto)">
            <input
              type="number"
              min={0}
              step={1}
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              className={INPUT}
              placeholder="Ej. 2500000"
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

export default CampaignFormModal;
