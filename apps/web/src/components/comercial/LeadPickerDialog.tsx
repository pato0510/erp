'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { apiClient } from '../../lib/api';
import {
  DIALOG_GHOST,
  DIALOG_INPUT,
  DIALOG_LABEL,
  DIALOG_PRIMARY,
  DialogShell,
} from './DialogShell';
import { stageErrText } from './StageEntryDialog';
import { LeadContactSelect, contactName, opportunitiesLabel, type LeadListRow } from './leadShared';
import { normalizeText } from './pipelineTableModel';

/* COM-029 — «Vincular lead» for ONE opportunity (the pipeline table's column 7 and the
 * opportunity ficha). Lists the leads of the opportunity's account (founder L3: a lead
 * links only to opportunities of its own account) as one radio group — the current lead
 * preselected when changing, a filter field above eight — and «Vincular» sends ONE
 * PATCH /opportunities/:id { leadId }. «Crear lead nuevo» (lead.create) swaps the list for
 * Nombre + Contacto and «Crear y vincular» sends ONE POST /leads { …, opportunityId }
 * (founder L2: created here, edited in its ficha). No client rules beyond a non-empty
 * name: any 4xx shows inside (role="alert") and keeps what was typed. On success the
 * dialog waits for the caller's `onDone` (its refetch) so focus returns to the new cell. */

const FILTER_THRESHOLD = 8;

export interface LeadPickerOpportunity {
  id: string;
  name: string;
  accountId: string;
  accountName: string | null;
  leadId: string | null;
}

export function LeadPickerDialog({
  opportunity: opp,
  canCreate,
  returnFocusId,
  fallbackFocusId,
  onDone,
  onCancel,
}: {
  opportunity: LeadPickerOpportunity;
  /** lead.create — shows «Crear lead nuevo». */
  canCreate: boolean;
  returnFocusId?: string;
  fallbackFocusId?: string;
  /** After the write: the caller refetches (awaited) and closes the dialog. */
  onDone: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const uid = useId();
  const [leads, setLeads] = useState<LeadListRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [mode, setMode] = useState<'pick' | 'create'>('pick');
  const [selected, setSelected] = useState<string>(opp.leadId ?? '');
  const [filter, setFilter] = useState('');
  const [name, setName] = useState('');
  const [contactId, setContactId] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    apiClient
      .get<LeadListRow[]>(`/api/comercial/leads?accountId=${encodeURIComponent(opp.accountId)}`)
      .then((rows) => {
        if (!active) return;
        setLeads(rows);
        // Nothing to pick: go straight to creating one (the empty state stays visible).
        if (rows.length === 0 && canCreate) setMode('create');
      })
      .catch((e) => {
        if (!active) return;
        setLeads([]);
        setLoadErr(stageErrText(e, 'No se pudieron cargar los leads de la cuenta.'));
      });
    return () => {
      active = false;
    };
  }, [opp.accountId, canCreate]);

  /* The shell focused its close button while the list loaded; once the list (or the
     create form) is there, focus the first thing to work with — once per mode. */
  useEffect(() => {
    if (leads === null) return;
    const root = bodyRef.current;
    if (!root) return;
    const target =
      mode === 'create'
        ? root.querySelector<HTMLElement>('[data-lead-name]')
        : (root.querySelector<HTMLElement>('[data-lead-filter]') ??
          root.querySelector<HTMLElement>('input[type="radio"]:checked') ??
          root.querySelector<HTMLElement>('input[type="radio"]') ??
          root.querySelector<HTMLElement>('[data-lead-create]'));
    target?.focus();
  }, [leads, mode]);

  const visible = useMemo(() => {
    if (!leads) return [];
    const q = normalizeText(filter.trim());
    return q ? leads.filter((l) => normalizeText(l.name).includes(q)) : leads;
  }, [leads, filter]);

  const run = async (write: () => Promise<unknown>) => {
    setSaving(true);
    setErr(null);
    try {
      await write();
    } catch (e) {
      setErr(stageErrText(e, 'No se pudo vincular el lead.'));
      setSaving(false);
      return;
    }
    await onDone();
  };

  const link = () =>
    run(() => apiClient.patch(`/api/comercial/opportunities/${opp.id}`, { leadId: selected }));

  const createAndLink = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    return run(() =>
      apiClient.post('/api/comercial/leads', {
        name: trimmed,
        accountId: opp.accountId,
        ...(contactId ? { contactId } : {}),
        opportunityId: opp.id,
      }),
    );
  };

  const canLink = mode === 'pick' && selected !== '' && selected !== (opp.leadId ?? '');
  const canSubmitCreate = mode === 'create' && name.trim() !== '';
  const hasLeads = (leads?.length ?? 0) > 0;

  return (
    <DialogShell
      title="Vincular lead"
      onCancel={onCancel}
      returnFocusId={returnFocusId}
      fallbackFocusId={fallbackFocusId}
      footer={
        <>
          <button type="button" onClick={onCancel} className={DIALOG_GHOST}>
            Cancelar
          </button>
          {mode === 'pick' ? (
            <button
              type="submit"
              form={`${uid}-form`}
              disabled={!canLink || saving}
              className={DIALOG_PRIMARY}
            >
              {saving ? 'Guardando…' : 'Vincular'}
            </button>
          ) : (
            <button
              type="submit"
              form={`${uid}-form`}
              disabled={!canSubmitCreate || saving}
              className={DIALOG_PRIMARY}
            >
              {saving ? 'Guardando…' : 'Crear y vincular'}
            </button>
          )}
        </>
      }
    >
      <form
        id={`${uid}-form`}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === 'pick') {
            if (canLink) void link();
          } else void createAndLink();
        }}
      >
        <div ref={bodyRef} className="space-y-4">
          <p className="text-sm text-fg-secondary">
            Cuenta: <span className="font-medium text-fg">{opp.accountName ?? '—'}</span>
            <span className="mt-0.5 block truncate text-xs" title={opp.name}>
              Oportunidad «{opp.name}»
            </span>
          </p>

          {leads === null ? (
            <div className="space-y-2" aria-busy="true">
              <span className="sr-only">Cargando leads…</span>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-11 animate-pulse rounded-lg bg-subtle-hover" />
              ))}
            </div>
          ) : loadErr ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {loadErr}
            </p>
          ) : mode === 'pick' ? (
            <>
              {leads.length > FILTER_THRESHOLD && (
                <div>
                  <label htmlFor={`${uid}-filter`} className="sr-only">
                    Filtrar leads
                  </label>
                  <input
                    id={`${uid}-filter`}
                    data-lead-filter
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filtrar leads…"
                    className={DIALOG_INPUT}
                  />
                </div>
              )}
              {!hasLeads ? (
                <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-fg-secondary">
                  Esta cuenta aún no tiene leads.
                </p>
              ) : visible.length === 0 ? (
                <p className="px-1 text-sm text-fg-secondary">
                  Ningún lead coincide con «{filter.trim()}».
                </p>
              ) : (
                <fieldset>
                  <legend className="sr-only">Leads de la cuenta</legend>
                  <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
                    {visible.map((l) => {
                      const checked = selected === l.id;
                      const current = l.id === opp.leadId;
                      return (
                        <li key={l.id}>
                          <label
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                              checked
                                ? 'border-accent bg-accent-dim'
                                : 'border-line hover:bg-subtle'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`${uid}-lead`}
                              value={l.id}
                              checked={checked}
                              onChange={() => setSelected(l.id)}
                              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)] focus:outline-none"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-2">
                                <span className="truncate text-sm font-medium text-fg">
                                  {l.name}
                                </span>
                                {current && (
                                  <span className="shrink-0 text-[11px] text-fg-secondary">
                                    (actual)
                                  </span>
                                )}
                              </span>
                              <span className="block truncate text-xs text-fg-secondary">
                                {l.contact ? `${contactName(l.contact)} · ` : ''}
                                {opportunitiesLabel(l.opportunitiesCount)}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              )}
              {canCreate && (
                <button
                  type="button"
                  data-lead-create
                  onClick={() => {
                    setErr(null);
                    setMode('create');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Plus size={15} aria-hidden="true" /> Crear lead nuevo
                </button>
              )}
            </>
          ) : (
            <>
              {!hasLeads && (
                <p className="text-sm text-fg-secondary">Esta cuenta aún no tiene leads.</p>
              )}
              <div>
                <label htmlFor={`${uid}-name`} className={DIALOG_LABEL}>
                  Nombre (obligatorio)
                </label>
                <input
                  id={`${uid}-name`}
                  data-lead-name
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-required="true"
                  autoComplete="off"
                  className={DIALOG_INPUT}
                />
              </div>
              <LeadContactSelect
                id={`${uid}-contact`}
                accountId={opp.accountId}
                value={contactId}
                onChange={setContactId}
              />
              {hasLeads && (
                <button
                  type="button"
                  onClick={() => {
                    setErr(null);
                    setMode('pick');
                  }}
                  className="rounded-md text-sm text-fg-secondary underline-offset-2 hover:text-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Elegir un lead existente
                </button>
              )}
            </>
          )}

          {err && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {err}
            </p>
          )}
        </div>
      </form>
    </DialogShell>
  );
}

export default LeadPickerDialog;
