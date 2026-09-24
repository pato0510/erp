'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';

/* COM-021 — create/edit an enterprise (the client's parent company; Enterprise ≠ Company,
 * the tenant). Extracted from the inline modal COM-018 shipped inside EnterpriseSelect,
 * which keeps using it for create. Fields: name, RUT (optional, Módulo-11 validated by
 * the API), industria, notas. Backend 400 (RUT) / 409 (duplicate name or RUT) messages
 * are shown verbatim. Mirrors the AccountFormModal overlay shell; Escape closes. */

export interface EnterpriseForForm {
  id: string;
  name: string;
  rut: string | null;
  industry: string | null;
  notes: string | null;
}

export interface EnterpriseSaved {
  id: string;
  name: string;
  rut: string | null;
  isActive: boolean;
}

const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

export function enterpriseErrMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return 'No tienes permiso para hacer esto.';
    const data = (e.data ?? {}) as { message?: string | string[] };
    const raw = Array.isArray(data.message) ? data.message.join(' ') : data.message;
    return raw || e.message || fallback;
  }
  return fallback;
}

export function EnterpriseFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: EnterpriseForForm | null;
  onClose: () => void;
  onSaved: (saved: EnterpriseSaved) => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [rut, setRut] = useState(editing?.rut ?? '');
  const [industry, setIndustry] = useState(editing?.industry ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    if (!name.trim()) {
      setErr('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setErr(null);
    const body = {
      name: name.trim(),
      // Empty clears the RUT on edit; omitted on create.
      rut: editing ? rut.trim() : rut.trim() || undefined,
      industry: editing ? industry.trim() : industry.trim() || undefined,
      notes: editing ? notes.trim() : notes.trim() || undefined,
    };
    try {
      const saved = editing
        ? await apiClient.patch<EnterpriseSaved>(`/api/comercial/enterprises/${editing.id}`, body)
        : await apiClient.post<EnterpriseSaved>('/api/comercial/enterprises', body);
      onSaved(saved);
    } catch (e) {
      setErr(enterpriseErrMessage(e, 'No se pudo guardar la empresa.'));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="enterprise-form-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-card-solid shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            id="enterprise-form-title"
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            {editing ? 'Editar empresa' : 'Nueva empresa'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <Field label="Nombre" htmlFor="enterprise-form-name">
            <input
              id="enterprise-form-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
              placeholder="Ej. Minera Los Andes S.A."
              autoFocus
            />
          </Field>
          <Field label="RUT (opcional)" htmlFor="enterprise-form-rut">
            <input
              id="enterprise-form-rut"
              value={rut}
              onChange={(e) => setRut(e.target.value)}
              className={INPUT}
              placeholder="12.345.678-5"
            />
          </Field>
          <Field label="Industria (opcional)" htmlFor="enterprise-form-industry">
            <input
              id="enterprise-form-industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className={INPUT}
              placeholder="Ej. Minería"
            />
          </Field>
          <Field label="Notas (opcional)" htmlFor="enterprise-form-notes">
            <textarea
              id="enterprise-form-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={INPUT}
            />
          </Field>
          {err && (
            <p role="alert" className="text-sm text-red-600">
              {err}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: 'var(--color-accent)' }}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export default EnterpriseFormModal;
