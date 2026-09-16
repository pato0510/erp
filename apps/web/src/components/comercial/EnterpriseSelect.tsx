'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { useComercialPermissions } from '../../hooks/useCanWrite';

/* COM-018 — the "Empresa" select (the client's parent company — Enterprise, never the
 * tenant Company). Reused by the account form (mode="form": "Sin empresa" + actives,
 * plus an inline "Crear empresa" affordance gated on enterprise.create) and by the
 * list filter (mode="filter": "Todas las empresas" / "Sin empresa" / actives).
 * Self-loading from GET comercial/enterprises; mutate → refetch (creating an
 * enterprise refetches the options and selects the new one). */

export interface EnterpriseOption {
  id: string;
  name: string;
  rut: string | null;
  isActive: boolean;
}

/** Filter-mode sentinel for "accounts without an enterprise" (→ ?noEnterprise=true). */
export const NO_ENTERPRISE = '__none__';

const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

function errMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return 'No tienes permiso para esta acción.';
    const data = (e.data ?? {}) as { message?: string | string[] };
    const raw = Array.isArray(data.message) ? data.message.join(' ') : data.message;
    return raw || e.message || fallback;
  }
  return fallback;
}

export function EnterpriseSelect({
  mode,
  value,
  onChange,
  id,
  className,
  disabled,
}: {
  mode: 'form' | 'filter';
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [options, setOptions] = useState<EnterpriseOption[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const perms = useComercialPermissions();
  const canCreate = mode === 'form' && (perms?.enterprise.create ?? false);

  const load = useCallback(async () => {
    try {
      // includeInactive so an account already linked to a deactivated enterprise keeps
      // showing its current value (labelled) instead of silently clearing on edit.
      const rows = await apiClient.get<EnterpriseOption[]>(
        '/api/comercial/enterprises?includeInactive=true',
      );
      setOptions(rows);
    } catch {
      setOptions([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const actives = options.filter((o) => o.isActive);
  const current = value && value !== NO_ENTERPRISE ? options.find((o) => o.id === value) : null;
  const currentInactive = current && !current.isActive ? current : null;

  return (
    <div className={mode === 'form' ? 'flex items-start gap-2' : undefined}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={className ?? INPUT}
        aria-label={id ? undefined : 'Empresa'}
      >
        {mode === 'filter' && <option value="">Todas las empresas</option>}
        <option value={mode === 'filter' ? NO_ENTERPRISE : ''}>Sin empresa</option>
        {currentInactive && (
          <option value={currentInactive.id}>{currentInactive.name} (inactiva)</option>
        )}
        {actives.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {canCreate && (
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={disabled}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60"
          title="Crear empresa"
        >
          <Plus size={14} /> Crear empresa
        </button>
      )}
      {createOpen && (
        <EnterpriseFormModal
          onClose={() => setCreateOpen(false)}
          onSaved={async (created) => {
            setCreateOpen(false);
            await load();
            onChange(created.id);
          }}
        />
      )}
    </div>
  );
}

/* Small create modal in the AccountFormModal style: name, RUT (optional, Módulo-11
 * validated by the API), industria. Backend 400/409 messages are shown verbatim. */
function EnterpriseFormModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (created: EnterpriseOption) => void;
}) {
  const [name, setName] = useState('');
  const [rut, setRut] = useState('');
  const [industry, setIndustry] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setErr('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const created = await apiClient.post<EnterpriseOption>('/api/comercial/enterprises', {
        name: name.trim(),
        rut: rut.trim() || undefined,
        industry: industry.trim() || undefined,
      });
      onSaved(created);
    } catch (e) {
      setErr(errMessage(e, 'No se pudo crear la empresa.'));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="enterprise-form-title"
        className="w-full max-w-md rounded-xl bg-card-solid shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            id="enterprise-form-title"
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            Nueva empresa
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

export default EnterpriseSelect;
