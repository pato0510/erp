'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import type { CatalogService, LineForForm } from './ServiceLineModal';

/* COM-011 — add / edit a QUOTE line (COM-010 backend, BORRADOR only). Mirrors the
   bundle's ServiceLineModal: ADD picks an ACTIVE catalog service with basePrice
   pre-fill (editable); EDIT keeps the service fixed (remove + add to change it) and
   edits qty/price/notes. Quote lines have NO serviceId uniqueness (a quote may repeat a
   service), so — unlike the bundle — services are NOT disabled in the picker. Every
   mutation is relayed straight from the backend; the parent refreshes the quote so the
   money block (Neto/IVA/Total) reflects the recomputed persisted amounts. */

const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

export function QuoteLineModal({
  quoteId,
  editing,
  catalog,
  onClose,
  onSaved,
}: {
  quoteId: string;
  editing?: LineForForm | null;
  catalog: CatalogService[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!editing;
  const [serviceId, setServiceId] = useState(editing?.serviceId ?? '');
  const [quantity, setQuantity] = useState(editing ? String(Number(editing.quantity)) : '1');
  const [unitPrice, setUnitPrice] = useState(editing ? String(Number(editing.unitPrice)) : '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pickService = (sid: string) => {
    setServiceId(sid);
    const s = catalog.find((c) => c.id === sid);
    if (s) setUnitPrice(String(Number(s.basePrice))); // pre-fill the price snapshot (editable)
  };

  const save = async () => {
    const q = Number(quantity);
    const p = Number(unitPrice);
    if (!isEdit && !serviceId) {
      setErr('Selecciona un servicio.');
      return;
    }
    if (!(q > 0)) {
      setErr('La cantidad debe ser mayor que 0.');
      return;
    }
    if (unitPrice === '' || !(p >= 0)) {
      setErr('El precio unitario debe ser 0 o mayor.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (isEdit) {
        await apiClient.patch(`/api/comercial/quotes/${quoteId}/lines/${editing!.id}`, {
          quantity: q,
          unitPrice: p,
          notes: notes.trim() || undefined,
        });
      } else {
        await apiClient.post(`/api/comercial/quotes/${quoteId}/lines`, {
          serviceId,
          quantity: q,
          unitPrice: p,
          notes: notes.trim() || undefined,
        });
      }
      onSaved();
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? e.status === 403
            ? 'No tienes permiso para esta acción.'
            : e.message
          : 'No se pudo guardar el servicio.',
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
            {isEdit ? 'Editar servicio' : 'Agregar servicio'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <Field label="Servicio">
            {isEdit ? (
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                {editing!.serviceName}
              </div>
            ) : (
              <select
                value={serviceId}
                onChange={(e) => pickService(e.target.value)}
                className={INPUT}
              >
                <option value="">Seleccionar servicio…</option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.code ? ` (${c.code})` : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Cantidad">
              <input
                type="number"
                min={0}
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={INPUT}
                placeholder="Ej. 2.5"
              />
            </Field>
            <Field label="Precio unitario (CLP)">
              <input
                type="number"
                min={0}
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className={INPUT}
                placeholder="Ej. 450000"
              />
            </Field>
          </div>
          {!isEdit && serviceId && (
            <p className="text-xs text-[var(--text-secondary)]">
              Precio pre-cargado del catálogo; puedes ajustarlo para esta cotización.
            </p>
          )}

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
            {saving ? 'Guardando…' : isEdit ? 'Guardar' : 'Agregar'}
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

export default QuoteLineModal;
