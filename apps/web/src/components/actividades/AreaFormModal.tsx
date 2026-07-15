'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';

/* CAL-002 — create/edit an activity area. Mirrors the CampaignFormModal shell (same tokens,
   same Field helper). Name + a FIXED hex palette (the model stores "#RRGGBB"; the UI never
   free-types a color). Backend 4xx/409 messages (esp. the duplicate-name conflict) are shown
   VERBATIM. */

export interface AreaForForm {
  id: string;
  name: string;
  color: string | null;
}

/* Fixed palette — brand-neutral, distinguishable lane colors. */
export const AREA_PALETTE = [
  '#2563eb',
  '#0891b2',
  '#0d9488',
  '#16a34a',
  '#ca8a04',
  '#ea580c',
  '#dc2626',
  '#db2777',
  '#7c3aed',
  '#475569',
];

const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

export function AreaFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: AreaForForm | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [color, setColor] = useState(editing?.color ?? AREA_PALETTE[0]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setErr('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setErr(null);
    const body = { name: name.trim(), color };
    try {
      if (editing) await apiClient.patch(`/api/actividades/areas/${editing.id}`, body);
      else await apiClient.post('/api/actividades/areas', body);
      onSaved();
    } catch (e) {
      // Surface the backend's Spanish message verbatim (e.g. duplicate-name 409).
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar el área.');
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
            {editing ? 'Editar área' : 'Nueva área'}
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
              placeholder="Ej. Operaciones"
            />
          </Field>
          <Field label="Color">
            <div className="flex flex-wrap gap-2">
              {AREA_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  className="flex h-7 w-7 items-center justify-center rounded-full"
                  style={{
                    background: c,
                    outline: color === c ? '2px solid var(--text-primary)' : 'none',
                    outlineOffset: 2,
                  }}
                >
                  {color === c && <Check size={14} color="#fff" strokeWidth={3} />}
                </button>
              ))}
            </div>
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

export default AreaFormModal;
