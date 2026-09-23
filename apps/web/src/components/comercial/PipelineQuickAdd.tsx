'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Plus } from 'lucide-react';

/* COM-025 — the table's quick-add row (last row of a group; writers with
 * opportunity.create only). «+ Agregar oportunidad» turns into an inline form: name
 * (autofocus) plus, in the Prospecto group, an account select; Enter or «Agregar» saves,
 * Escape or «Cancelar» cancels. A blank name creates nothing and closes the row; no
 * account → «Elige una cuenta.» and no request. The POST itself lives in the page
 * (onAdd, which toasts the api's message on error); on success the page refetches and
 * focus returns to «+ Agregar oportunidad». Today's POST always creates at PROSPECTO. */

export interface QuickAddBody {
  name: string;
  accountId: string;
  ownerId?: string;
}

const INPUT =
  'h-9 rounded-lg border border-line bg-input px-3 text-sm text-fg placeholder:text-fg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
const GHOST =
  'h-9 rounded-lg border border-line px-3 text-sm text-fg hover:bg-subtle-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50';

export function PipelineQuickAdd({
  groupLabel,
  fixedAccountId,
  accounts,
  currentUserId,
  restColSpan,
  onAdd,
  onCreated,
}: {
  /** For accessible names: «Prospecto» or the account's name. */
  groupLabel: string;
  /** Cuenta grouping: the group's account. Etapa grouping (Prospecto): undefined → select. */
  fixedAccountId?: string;
  accounts: { id: string; name: string }[];
  currentUserId: string | null;
  restColSpan: number;
  onAdd: (body: QuickAddBody) => Promise<boolean>;
  onCreated: () => void;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [accountError, setAccountError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refocus, setRefocus] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open && refocus) {
      addBtnRef.current?.focus();
      setRefocus(false);
    }
  }, [open, refocus]);

  const close = () => {
    setOpen(false);
    setName('');
    setAccountId('');
    setAccountError(false);
    setRefocus(true);
  };

  const submit = async () => {
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      close();
      return;
    }
    const target = fixedAccountId ?? accountId;
    if (!target) {
      setAccountError(true);
      return;
    }
    setSaving(true);
    const ok = await onAdd({
      name: trimmed,
      accountId: target,
      ...(currentUserId ? { ownerId: currentUserId } : {}),
    });
    setSaving(false);
    if (ok) {
      onCreated();
      close();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      void submit();
    }
  };

  const errorId = `${uid}-account-error`;

  return (
    <tr>
      <td className="sticky left-0 z-10 border-b border-line bg-card-solid px-3 py-2">
        {open ? (
          <>
            <label htmlFor={`${uid}-name`} className="sr-only">
              Nombre de la nueva oportunidad en {groupLabel}
            </label>
            <input
              id={`${uid}-name`}
              autoFocus
              value={name}
              maxLength={200}
              disabled={saving}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Nombre de la oportunidad"
              className={`${INPUT} w-full`}
            />
          </>
        ) : (
          <button
            ref={addBtnRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Agregar oportunidad en ${groupLabel}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-fg-secondary hover:bg-subtle-hover hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Plus size={14} aria-hidden="true" /> Agregar oportunidad
          </button>
        )}
      </td>
      <td colSpan={restColSpan} className="border-b border-line px-3 py-2">
        {open && (
          <div className="flex flex-wrap items-center gap-2" onKeyDown={onKeyDown}>
            {!fixedAccountId && (
              <>
                <label htmlFor={`${uid}-account`} className="sr-only">
                  Cuenta de la nueva oportunidad
                </label>
                <select
                  id={`${uid}-account`}
                  value={accountId}
                  disabled={saving}
                  aria-invalid={accountError || undefined}
                  aria-describedby={accountError ? errorId : undefined}
                  onChange={(e) => {
                    setAccountId(e.target.value);
                    if (e.target.value) setAccountError(false);
                  }}
                  className={`${INPUT} min-w-[200px] max-w-[280px]`}
                >
                  <option value="">Elige una cuenta…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              className="h-9 rounded-lg bg-accent px-3 text-sm font-medium text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
            >
              {saving ? 'Agregando…' : 'Agregar'}
            </button>
            <button type="button" onClick={close} disabled={saving} className={GHOST}>
              Cancelar
            </button>
            {accountError && (
              <span
                id={errorId}
                role="alert"
                className="text-xs font-medium text-red-700 dark:text-red-400"
              >
                Elige una cuenta.
              </span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export default PipelineQuickAdd;
