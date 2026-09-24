'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { STAGE_LABELS, stageRequires, type OpportunityStage } from './stageLabels';

/* COM-025 — the table's quick-add row (last row of a group; writers with
 * opportunity.create only). «+ Agregar oportunidad» turns into an inline form: name
 * (autofocus) plus, in the Prospecto group, an account select; Enter or «Agregar» saves,
 * Escape or «Cancelar» cancels. A blank name creates nothing and closes the row; no
 * account → «Elige una cuenta.» and no request. The POST itself lives in the page
 * (onAdd, which toasts the api's message on error); on success the page refetches and
 * focus returns to «+ Agregar oportunidad».
 *
 * COM-027 (spec T13) — the row lives in every active-stage group and creates AT that
 * stage (`stage`); Cuenta groups send no stage (the api creates at Prospecto). Groups
 * whose stage requires fields (static mirror of COM-023, stageRequires) show them in the
 * row — Visita Técnica: «Fecha estimada de cierre»; Cotización and Negociación: «Valor
 * estimado» + «Fecha estimada de cierre». Missing → a field message and no request; the
 * api's 400 still goes to the page toast. */

export interface QuickAddBody {
  name: string;
  accountId: string;
  ownerId?: string;
  /** COM-027 — the group's stage (omitted → Prospecto). */
  stage?: OpportunityStage;
  estimatedValue?: number;
  expectedCloseDate?: string;
}

const INPUT =
  'h-9 rounded-lg border border-line bg-input px-3 text-sm text-fg placeholder:text-fg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
const GHOST =
  'h-9 rounded-lg border border-line px-3 text-sm text-fg hover:bg-subtle-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50';

export function PipelineQuickAdd({
  groupLabel,
  fixedAccountId,
  stage,
  accounts,
  currentUserId,
  restColSpan,
  onAdd,
  onCreated,
}: {
  /** For accessible names: «Prospecto» or the account's name. */
  groupLabel: string;
  /** Cuenta grouping: the group's account. Etapa grouping: undefined → select. */
  fixedAccountId?: string;
  /** COM-027 — Etapa grouping: the group's (active) stage. */
  stage?: OpportunityStage;
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
  const [value, setValue] = useState('');
  const [date, setDate] = useState('');
  // COM-027 — which fields are missing (account, value, date).
  const [missing, setMissing] = useState<{ account: boolean; value: boolean; date: boolean }>({
    account: false,
    value: false,
    date: false,
  });
  const req = stage ? stageRequires(stage) : { value: false, date: false };
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
    setValue('');
    setDate('');
    setMissing({ account: false, value: false, date: false });
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
    const miss = {
      account: !target,
      value: req.value && value.trim() === '',
      date: req.date && !date,
    };
    setMissing(miss);
    if (miss.account || miss.value || miss.date) return;
    setSaving(true);
    const ok = await onAdd({
      name: trimmed,
      accountId: target,
      ...(currentUserId ? { ownerId: currentUserId } : {}),
      ...(stage ? { stage } : {}),
      ...(req.value ? { estimatedValue: Math.round(Number(value)) } : {}),
      ...(req.date ? { expectedCloseDate: date } : {}),
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

  const errorId = `${uid}-error`;
  const anyMissing = missing.account || missing.value || missing.date;
  const missingText = [
    missing.account && 'Elige una cuenta.',
    (missing.value || missing.date) &&
      `Para crear en ${stage ? STAGE_LABELS[stage] : ''} falta: ${[
        missing.value && 'valor estimado',
        missing.date && 'fecha estimada de cierre',
      ]
        .filter(Boolean)
        .join(' y ')}.`,
  ]
    .filter(Boolean)
    .join(' ');

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
                  aria-invalid={missing.account || undefined}
                  aria-describedby={missing.account ? errorId : undefined}
                  onChange={(e) => {
                    setAccountId(e.target.value);
                    if (e.target.value) setMissing((m) => ({ ...m, account: false }));
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
            {req.value && (
              <>
                <label htmlFor={`${uid}-value`} className="sr-only">
                  Valor estimado de la nueva oportunidad (obligatorio)
                </label>
                <input
                  id={`${uid}-value`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={value}
                  disabled={saving}
                  aria-required="true"
                  aria-invalid={missing.value || undefined}
                  aria-describedby={missing.value ? errorId : undefined}
                  onChange={(e) => {
                    setValue(e.target.value);
                    if (e.target.value) setMissing((m) => ({ ...m, value: false }));
                  }}
                  placeholder="Valor estimado *"
                  className={`${INPUT} w-[160px]`}
                />
              </>
            )}
            {req.date && (
              <>
                <label htmlFor={`${uid}-date`} className="sr-only">
                  Fecha estimada de cierre de la nueva oportunidad (obligatoria)
                </label>
                <input
                  id={`${uid}-date`}
                  type="date"
                  value={date}
                  disabled={saving}
                  aria-required="true"
                  aria-invalid={missing.date || undefined}
                  aria-describedby={missing.date ? errorId : undefined}
                  title="Fecha estimada de cierre"
                  onChange={(e) => {
                    setDate(e.target.value);
                    if (e.target.value) setMissing((m) => ({ ...m, date: false }));
                  }}
                  className={`${INPUT} w-[160px]`}
                />
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
            {anyMissing && (
              <span
                id={errorId}
                role="alert"
                className="text-xs font-medium text-red-700 dark:text-red-400"
              >
                {missingText}
              </span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export default PipelineQuickAdd;
