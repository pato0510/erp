'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { useComercialPermissions } from '../../hooks/useCanWrite';
// COM-021 — the create/edit modal was extracted from here; create behaviour is unchanged.
import { EnterpriseFormModal } from './EnterpriseFormModal';

/* COM-018 — the "Empresa" select (the client's parent company — Enterprise, never the
 * tenant Company). Reused by the account form (mode="form": "Sin empresa" + actives,
 * plus an inline "Crear empresa" affordance gated on enterprise.create) and by the
 * list filter (mode="filter": "Todas las empresas" / "Sin empresa" / actives).
 * Self-loading from GET comercial/enterprises; mutate → refetch (creating an
 * enterprise refetches the options and selects the new one). COM-021 extracted the
 * inline modal into EnterpriseFormModal (create + edit); this select only creates. */

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
          editing={null}
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

export default EnterpriseSelect;
