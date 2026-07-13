'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { toDateInput } from './campaignLabels';

/* MKT-005 — create/edit a marketing expense (a campaign ledger line). Mirrors the
   CampaignFormModal shell (same tokens, same Field helper). The amount field carries
   the caption "Monto neto, sin IVA" (decision b). Dates travel as YYYY-MM-DD (UTC-safe,
   HR-004b). Backend 4xx messages are shown VERBATIM. */

export interface ExpenseForForm {
  id: string;
  expenseDate: string | null;
  description: string;
  amount: string | null;
  vendorName: string | null;
  notes: string | null;
}

const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

export function ExpenseFormModal({
  campaignId,
  editing,
  onClose,
  onSaved,
}: {
  campaignId: string;
  editing: ExpenseForForm | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [expenseDate, setExpenseDate] = useState(toDateInput(editing?.expenseDate));
  const [description, setDescription] = useState(editing?.description ?? '');
  const [amount, setAmount] = useState(
    editing?.amount != null ? String(Number(editing.amount)) : '',
  );
  const [vendorName, setVendorName] = useState(editing?.vendorName ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!expenseDate) {
      setErr('La fecha del gasto es obligatoria.');
      return;
    }
    if (!description.trim()) {
      setErr('La descripción es obligatoria.');
      return;
    }
    const amountNum = Number(amount);
    if (amount.trim() === '' || !Number.isFinite(amountNum) || amountNum <= 0) {
      setErr('El monto debe ser mayor que 0.');
      return;
    }
    setSaving(true);
    setErr(null);
    const body = {
      expenseDate,
      description: description.trim(),
      amount: amountNum,
      vendorName: vendorName.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    const base = `/api/marketing/campaigns/${campaignId}/expenses`;
    try {
      if (editing) await apiClient.patch(`${base}/${editing.id}`, body);
      else await apiClient.post(base, body);
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar el gasto.');
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
            {editing ? 'Editar gasto' : 'Nuevo gasto'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <Field label="Fecha">
            <input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className={INPUT}
            />
          </Field>
          <Field label="Descripción">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={INPUT}
              placeholder="Ej. Stand feria, pauta digital…"
            />
          </Field>
          <Field label="Proveedor">
            <input
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              className={INPUT}
              placeholder="Nombre del proveedor (opcional)"
            />
          </Field>
          <Field label="Monto (CLP)">
            <input
              type="number"
              min={0}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={INPUT}
              placeholder="Ej. 800000"
            />
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Monto neto, sin IVA.</p>
          </Field>
          <Field label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
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

export default ExpenseFormModal;
