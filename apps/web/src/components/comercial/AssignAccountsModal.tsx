'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { StatusBadge } from './accountLabels';

/* COM-021 — bulk-assign UNLINKED accounts to an enterprise. Loads
 * GET comercial/accounts?noEnterprise=true (only accounts with no enterprise are
 * offered — already-linked accounts are reassigned from the account form, never here),
 * shows a searchable checkbox list, "Seleccionar todos (filtrados)", a counter and the
 * "Asignar N cuentas" button, then calls POST comercial/enterprises/:id/accounts and
 * reports { assigned, skipped }. Keyboard: labelled checkboxes, Escape closes, Tab cycles
 * inside the dialog (same pattern as the other modals). Mutate → the caller refetches. */

interface UnlinkedAccount {
  id: string;
  name: string;
  status: string;
}

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

export function AssignAccountsModal({
  enterprise,
  onClose,
  onAssigned,
}: {
  enterprise: { id: string; name: string };
  onClose: () => void;
  onAssigned: (result: { assigned: number; skipped: number }) => void;
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [accounts, setAccounts] = useState<UnlinkedAccount[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const rows = await apiClient.get<UnlinkedAccount[]>(
        '/api/comercial/accounts?noEnterprise=true',
      );
      setAccounts(rows);
      setState('ok');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Escape closes; Tab cycles within the dialog (focus trap).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? accounts.filter((a) => a.name.toLowerCase().includes(q)) : accounts;
  }, [accounts, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.id));

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllFiltered = () =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (allFilteredSelected) filtered.forEach((a) => next.delete(a.id));
      else filtered.forEach((a) => next.add(a.id));
      return next;
    });

  const count = selected.size;
  const canSubmit = count > 0 && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setErr(null);
    try {
      const result = await apiClient.post<{ assigned: number; skipped: number }>(
        `/api/comercial/enterprises/${enterprise.id}/accounts`,
        { accountIds: Array.from(selected) },
      );
      onAssigned(result);
    } catch (e) {
      setErr(errMessage(e, 'No se pudieron asignar las cuentas.'));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-accounts-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-card-solid shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            id="assign-accounts-title"
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            Asignar cuentas a {enterprise.name}
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

        <div className="space-y-3 px-5 py-4">
          <p className="text-xs text-[var(--text-secondary)]">
            Solo se listan cuentas sin empresa. Para cambiar una cuenta ya vinculada, edítala desde
            su formulario.
          </p>
          <label htmlFor="assign-accounts-search" className="sr-only">
            Buscar cuenta
          </label>
          <input
            id="assign-accounts-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre…"
            className={INPUT}
            autoFocus
          />
          <div className="flex items-center justify-between gap-3 text-sm">
            <label className="flex items-center gap-2 text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                disabled={filtered.length === 0}
                onChange={toggleAllFiltered}
                className="h-4 w-4 rounded border-[var(--border-color)]"
              />
              Seleccionar todos (filtrados)
            </label>
            <span className="text-[var(--text-secondary)]" aria-live="polite">
              {count} seleccionada{count === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--border-color)] px-5 py-2">
          {state === 'loading' && (
            <p className="py-6 text-sm text-[var(--text-secondary)]">Cargando cuentas…</p>
          )}
          {state === 'error' && (
            <p className="py-6 text-sm text-red-600">No se pudieron cargar las cuentas.</p>
          )}
          {state === 'ok' && filtered.length === 0 && (
            <p className="py-6 text-sm text-[var(--text-secondary)]">
              {accounts.length === 0
                ? 'No hay cuentas sin empresa.'
                : 'Ninguna cuenta coincide con la búsqueda.'}
            </p>
          )}
          {state === 'ok' && filtered.length > 0 && (
            <ul className="divide-y divide-[var(--border-color)]">
              {filtered.map((a) => {
                const inputId = `assign-account-${a.id}`;
                return (
                  <li key={a.id} className="flex items-center gap-3 py-2">
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggle(a.id)}
                      className="h-4 w-4 rounded border-[var(--border-color)]"
                    />
                    <label
                      htmlFor={inputId}
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 text-sm text-[var(--text-primary)]"
                    >
                      <span className="truncate">{a.name}</span>
                      <StatusBadge status={a.status} />
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-[var(--border-color)] px-5 py-4">
          {err && (
            <p role="alert" className="mb-3 text-sm text-red-600">
              {err}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ background: 'var(--color-accent)' }}
            >
              {saving ? 'Asignando…' : `Asignar ${count} cuenta${count === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AssignAccountsModal;
