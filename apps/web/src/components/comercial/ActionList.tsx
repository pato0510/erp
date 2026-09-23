'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { formatSantiagoDate, santiagoToday } from '../../lib/dates';
import { useComercialPermissions } from '../../hooks/useCanWrite';
import { useMembers } from '../../hooks/useMembers';
import {
  ACTION_STATE_LABELS,
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  ActivityTypeIcon,
  type ActionState,
  type ActivityType,
} from './activityLabels';
import { ActionEditModal, type ActionForEdit } from './ActionEditModal';
import { STAGE_LABELS, isClosedStage } from './stageLabels';

/* COM-026 — the ONE actions component of Comercial («acción» to the user; Activity in
 * code), used under each pipeline-table row (variant compact), in the opportunity ficha
 * and in Cuentas (accordion + account tab; variant full). It replaces COM-008's
 * ActivityTimeline and runs on the COM-022 api:
 *  - GET /comercial/activities?{opportunityId|accountId}=…&limit=200 — the account scope
 *    includes the actions linked to the account's opportunities.
 *  - POST (inline «Registrar acción» form, status PENDIENTE | HECHA, date YYYY-MM-DD =
 *    that civil day in Santiago), PATCH /:id (ActionEditModal), PATCH /:id/status (the
 *    checkbox), DELETE /:id. System rows are read-only (the api answers 409 anyway).
 * Two blocks grouped on the client (display only): «Pendientes» (date ascending, so the
 * overdue ones come first) and «Historial» (done + system rows, newest first). overdue is
 * the api's derived flag — never recomputed here.
 * Gating reads the activity flags itself (read → list, create → form, update → checkbox +
 * edit, delete → delete); while the flags load everything is read-only. After every write
 * the list refetches silently (no skeleton, so focus survives), onChanged fires, a polite
 * live region announces the result and focus lands on the item (or its block heading),
 * never on <body>. */

export interface CommercialAction {
  id: string;
  accountId: string;
  opportunityId: string | null;
  type: string;
  subject: string;
  detail: string | null;
  activityDate: string;
  isSystemGenerated: boolean;
  status: 'PENDIENTE' | 'HECHA' | null;
  statusChangedAt: string | null;
  systemEvent: string | null;
  createdBy: string;
  createdAt: string;
  overdue: boolean;
}

interface AccountOpportunity {
  id: string;
  name: string;
  stage: string;
}

type Scope = 'opportunity' | 'account';
type Variant = 'compact' | 'full';

const LIMIT = 200;
const COMPACT_HISTORY = 5;
const NO_OPPORTUNITY = '__none__';
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
const INPUT = `h-9 rounded-lg border border-line bg-input px-3 text-sm text-fg ${FOCUS}`;
const ICON_BUTTON = `inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-fg-secondary hover:bg-subtle-hover hover:text-fg ${FOCUS}`;

const byDate = (a: CommercialAction, b: CommercialAction) =>
  a.activityDate.localeCompare(b.activityDate) || a.createdAt.localeCompare(b.createdAt);

const stateOf = (a: CommercialAction): ActionState =>
  a.isSystemGenerated || a.status === null
    ? 'SISTEMA'
    : a.status === 'HECHA'
      ? 'HECHA'
      : a.overdue
        ? 'VENCIDA'
        : 'PENDIENTE';

const STATE_CHIP: Record<ActionState, string> = {
  PENDIENTE: 'border border-line bg-subtle text-fg-secondary',
  VENCIDA: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
  HECHA: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300',
  SISTEMA: 'border border-dashed border-line text-fg-secondary',
};

const errText = (e: unknown, fallback: string) =>
  e instanceof ApiError
    ? e.status === 403
      ? 'No tienes permiso para hacer esto.'
      : e.message || fallback
    : fallback;

export function ActionList({
  scope,
  scopeId,
  variant,
  onChanged,
}: {
  scope: Scope;
  scopeId: string;
  variant: Variant;
  onChanged?: () => void;
}) {
  const uid = useId();
  const compact = variant === 'compact';
  const perms = useComercialPermissions();
  const canCreate = perms?.activity.create ?? false;
  const canUpdate = perms?.activity.update ?? false;
  const canDelete = perms?.activity.delete ?? false;
  const { nameOf } = useMembers('all');

  const [phase, setPhase] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [rows, setRows] = useState<CommercialAction[]>([]);
  const [opps, setOpps] = useState<AccountOpportunity[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openDetails, setOpenDetails] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<CommercialAction | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const rootRef = useRef<HTMLDivElement | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);
  // Where focus goes once the refetched list has rendered: the item's control if it is
  // still on screen, else the heading of the block it was in.
  const focusAfter = useRef<{ selector: string; fallback: string } | null>(null);

  const query = `${scope === 'account' ? 'accountId' : 'opportunityId'}=${scopeId}`;

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setPhase('loading');
      try {
        const data = await apiClient.get<CommercialAction[]>(
          `/api/comercial/activities?${query}&limit=${LIMIT}`,
        );
        setRows(data);
        setPhase('ok');
      } catch (e) {
        if (silent) setActionErr(errText(e, 'No se pudieron cargar las acciones.'));
        else setPhase(e instanceof ApiError && e.status === 403 ? 'forbidden' : 'error');
      }
    },
    [query],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Account scope: the account's opportunities (register / edit select + item links).
  useEffect(() => {
    if (scope !== 'account') return;
    let active = true;
    apiClient
      .get<AccountOpportunity[]>(`/api/comercial/opportunities?accountId=${scopeId}`)
      .then((data) => {
        if (!active) return;
        // Open ones first; the api's order is kept inside each half.
        setOpps([
          ...data.filter((o) => !isClosedStage(o.stage)),
          ...data.filter((o) => isClosedStage(o.stage)),
        ]);
      })
      .catch(() => active && setOpps([]));
    return () => {
      active = false;
    };
  }, [scope, scopeId]);

  const oppOptions = useMemo(
    () => opps.map((o) => ({ id: o.id, label: `${o.name} · ${STAGE_LABELS[o.stage] ?? o.stage}` })),
    [opps],
  );
  const oppName = useMemo(() => new Map(opps.map((o) => [o.id, o.name])), [opps]);

  const pending = useMemo(
    () => rows.filter((a) => stateOf(a) === 'PENDIENTE' || stateOf(a) === 'VENCIDA').sort(byDate),
    [rows],
  );
  const history = useMemo(
    () =>
      rows
        .filter((a) => stateOf(a) === 'HECHA' || stateOf(a) === 'SISTEMA')
        .sort((a, b) => byDate(b, a)),
    [rows],
  );
  const shownHistory = compact && !historyOpen ? history.slice(0, COMPACT_HISTORY) : history;

  // Apply the pending focus move after the refetched list is on screen.
  useEffect(() => {
    const target = focusAfter.current;
    const root = rootRef.current;
    if (!target || !root) return;
    focusAfter.current = null;
    const el =
      root.querySelector<HTMLElement>(target.selector) ??
      root.querySelector<HTMLElement>(target.fallback);
    el?.focus();
  }, [rows]);

  const announce = (msg: string) => {
    // Clear first so the same message twice in a row is still announced.
    setAnnouncement('');
    window.setTimeout(() => setAnnouncement(msg), 30);
  };

  const afterWrite = async (msg: string, focus: { selector: string; fallback: string } | null) => {
    focusAfter.current = focus;
    await load(true);
    announce(msg);
    onChanged?.();
  };

  const blockOf = (a: CommercialAction) =>
    stateOf(a) === 'PENDIENTE' || stateOf(a) === 'VENCIDA' ? 'pending' : 'history';

  const toggleStatus = async (a: CommercialAction) => {
    const next = a.status === 'HECHA' ? 'PENDIENTE' : 'HECHA';
    setBusyId(a.id);
    setActionErr(null);
    try {
      await apiClient.patch(`/api/comercial/activities/${a.id}/status`, { status: next });
      await afterWrite(next === 'HECHA' ? 'Acción marcada como hecha' : 'Acción reabierta', {
        selector: `[data-action-check="${a.id}"]`,
        fallback: `[data-block-heading="${next === 'HECHA' ? 'history' : 'pending'}"]`,
      });
    } catch (e) {
      setActionErr(errText(e, 'No se pudo cambiar el estado de la acción.'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (a: CommercialAction) => {
    if (!window.confirm(`¿Eliminar la acción «${a.subject}»?`)) return;
    setBusyId(a.id);
    setActionErr(null);
    try {
      await apiClient.delete(`/api/comercial/activities/${a.id}`);
      await afterWrite('Acción eliminada', {
        selector: `[data-block-heading="${blockOf(a)}"]`,
        fallback: `[data-block-heading="${blockOf(a)}"]`,
      });
    } catch (e) {
      setActionErr(errText(e, 'No se pudo eliminar la acción.'));
    } finally {
      setBusyId(null);
    }
  };

  const toggleDetail = (id: string) =>
    setOpenDetails((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (phase === 'loading') {
    return (
      <div className="space-y-2 py-1" aria-busy="true" aria-label="Cargando acciones">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 animate-pulse rounded-lg bg-subtle-hover" />
        ))}
      </div>
    );
  }
  if (phase === 'forbidden') {
    return <p className="text-sm text-fg-secondary">No tienes permiso para ver las acciones.</p>;
  }
  if (phase === 'error') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          No se pudieron cargar las acciones.
        </p>
        <button
          type="button"
          onClick={() => load()}
          className={`rounded-md border border-line px-3 py-1 text-sm text-fg hover:bg-subtle-hover ${FOCUS}`}
        >
          Reintentar
        </button>
      </div>
    );
  }

  const heading = compact
    ? 'text-xs font-semibold uppercase tracking-wide text-fg-secondary'
    : 'text-sm font-semibold text-fg';

  const renderItem = (a: CommercialAction) => (
    <ActionItem
      key={a.id}
      action={a}
      compact={compact}
      scope={scope}
      oppName={a.opportunityId ? (oppName.get(a.opportunityId) ?? null) : null}
      who={nameOf(a.createdBy) ?? 'Usuario desconocido'}
      canUpdate={canUpdate}
      canDelete={canDelete}
      busy={busyId === a.id}
      detailOpen={openDetails.has(a.id)}
      onToggleDetail={() => toggleDetail(a.id)}
      onToggleStatus={() => toggleStatus(a)}
      onEdit={() => setEditing(a)}
      onDelete={() => remove(a)}
    />
  );

  return (
    <div ref={rootRef} className={compact ? 'space-y-3' : 'space-y-5'}>
      {actionErr && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {actionErr}
        </p>
      )}

      {/* Pendientes */}
      <section aria-labelledby={`${uid}-pending`}>
        <h3
          id={`${uid}-pending`}
          tabIndex={-1}
          data-block-heading="pending"
          className={`${heading} mb-2 rounded ${FOCUS}`}
        >
          Pendientes ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="text-sm text-fg-secondary">Sin acciones pendientes.</p>
        ) : (
          <ul className="space-y-1.5">{pending.map(renderItem)}</ul>
        )}
      </section>

      {canCreate && (
        <RegisterForm
          scope={scope}
          scopeId={scopeId}
          compact={compact}
          opps={opps}
          oppOptions={oppOptions}
          subjectRef={subjectRef}
          onRegistered={async () => {
            await afterWrite('Acción registrada', null);
          }}
        />
      )}

      {/* Historial */}
      <section aria-labelledby={`${uid}-history`}>
        <h3
          id={`${uid}-history`}
          tabIndex={-1}
          data-block-heading="history"
          className={`${heading} mb-2 rounded ${FOCUS}`}
        >
          Historial
        </h3>
        {history.length === 0 ? (
          <p className="text-sm text-fg-secondary">Sin acciones realizadas todavía.</p>
        ) : (
          <ul id={`${uid}-history-list`} className="space-y-1.5">
            {shownHistory.map(renderItem)}
          </ul>
        )}
        {compact && history.length > COMPACT_HISTORY && (
          <button
            type="button"
            aria-expanded={historyOpen}
            aria-controls={`${uid}-history-list`}
            onClick={() => setHistoryOpen((v) => !v)}
            className={`mt-2 rounded text-sm font-medium text-accent hover:underline ${FOCUS}`}
          >
            {historyOpen ? 'Ver menos' : `Ver todo el historial (${history.length})`}
          </button>
        )}
        {rows.length === LIMIT && (
          <p className="mt-2 text-xs text-fg-secondary">Se muestran las 200 más recientes.</p>
        )}
      </section>

      {/* Last child: an sr-only first child would still take space-y's margin. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {editing && (
        <ActionEditModal
          action={toEdit(editing)}
          scope={scope}
          opportunities={oppOptions}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            const id = editing.id;
            setEditing(null);
            setActionErr(null);
            await afterWrite('Acción actualizada', {
              selector: `[data-action-edit="${id}"]`,
              fallback: `[data-block-heading="${blockOf(editing)}"]`,
            });
          }}
        />
      )}
    </div>
  );
}

const toEdit = (a: CommercialAction): ActionForEdit => ({
  id: a.id,
  type: a.type,
  subject: a.subject,
  detail: a.detail,
  activityDate: a.activityDate,
  opportunityId: a.opportunityId,
});

/* ── one action ── */

function ActionItem({
  action: a,
  compact,
  scope,
  oppName,
  who,
  canUpdate,
  canDelete,
  busy,
  detailOpen,
  onToggleDetail,
  onToggleStatus,
  onEdit,
  onDelete,
}: {
  action: CommercialAction;
  compact: boolean;
  scope: Scope;
  oppName: string | null;
  who: string;
  canUpdate: boolean;
  canDelete: boolean;
  busy: boolean;
  detailOpen: boolean;
  onToggleDetail: () => void;
  onToggleStatus: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const state = stateOf(a);
  const system = state === 'SISTEMA';
  const done = state === 'HECHA';
  const detail = a.detail?.trim() ?? '';
  const longDetail = !compact && (detail.length > 140 || detail.includes('\n'));
  const showCheck = !system && canUpdate;

  return (
    <li
      className={`flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-lg px-3 py-2 ${
        system ? 'bg-subtle' : 'border border-line bg-card-solid'
      }`}
    >
      {showCheck ? (
        <input
          type="checkbox"
          data-action-check={a.id}
          checked={done}
          disabled={busy}
          onChange={onToggleStatus}
          aria-label={done ? `Reabrir «${a.subject}»` : `Marcar «${a.subject}» como hecha`}
          className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent)] disabled:cursor-wait"
        />
      ) : (
        canUpdate && <span aria-hidden="true" className="w-4 shrink-0" />
      )}
      <ActivityTypeIcon type={a.type} small />

      <div className="min-w-[10rem] flex-1">
        <p
          className={`text-sm ${system ? 'text-fg-secondary' : 'font-medium text-fg'} ${
            done ? 'text-fg-secondary' : ''
          } break-words`}
        >
          {a.subject}
        </p>
        {detail && (
          <div className="mt-0.5">
            <p
              title={compact ? detail : undefined}
              className={`whitespace-pre-wrap break-words text-xs text-fg-secondary ${
                compact ? 'line-clamp-1' : longDetail && !detailOpen ? 'line-clamp-2' : ''
              }`}
            >
              {detail}
            </p>
            {longDetail && (
              <button
                type="button"
                aria-expanded={detailOpen}
                onClick={onToggleDetail}
                className={`rounded text-xs font-medium text-accent hover:underline ${FOCUS}`}
              >
                {detailOpen ? 'Ver menos' : 'Ver más'}
              </button>
            )}
          </div>
        )}
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-fg-secondary">
          <span>{ACTIVITY_TYPE_LABELS[a.type] ?? a.type}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{formatSantiagoDate(a.activityDate)}</span>
          <span aria-hidden="true">·</span>
          <span>por {who}</span>
          {scope === 'account' && a.opportunityId && (
            <>
              <span aria-hidden="true">·</span>
              <Link
                href={`/comercial/pipeline/${a.opportunityId}`}
                className={`rounded text-accent hover:underline ${FOCUS}`}
              >
                {oppName ?? 'Oportunidad'}
              </Link>
            </>
          )}
        </p>
      </div>

      {/* Wraps under the text when the panel is narrow (phones). */}
      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_CHIP[state]}`}
        >
          {ACTION_STATE_LABELS[state]}
        </span>
        {!system && canUpdate && (
          <button
            type="button"
            data-action-edit={a.id}
            onClick={onEdit}
            disabled={busy}
            aria-label={`Editar «${a.subject}»`}
            title="Editar"
            className={ICON_BUTTON}
          >
            <Pencil size={13} aria-hidden="true" />
          </button>
        )}
        {!system && canDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            aria-label={`Eliminar «${a.subject}»`}
            title="Eliminar"
            className={`${ICON_BUTTON} hover:text-red-700 dark:hover:text-red-400`}
          >
            <Trash2 size={13} aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  );
}

/* ── «Registrar acción» ── */

function RegisterForm({
  scope,
  scopeId,
  compact,
  opps,
  oppOptions,
  subjectRef,
  onRegistered,
}: {
  scope: Scope;
  scopeId: string;
  compact: boolean;
  opps: AccountOpportunity[];
  oppOptions: { id: string; label: string }[];
  subjectRef: React.MutableRefObject<HTMLInputElement | null>;
  onRegistered: () => Promise<void>;
}) {
  const uid = useId();
  const [type, setType] = useState<ActivityType>('LLAMADA');
  const [subject, setSubject] = useState('');
  const [detail, setDetail] = useState('');
  const [date, setDate] = useState(() => santiagoToday());
  const [done, setDone] = useState(false);
  const [opp, setOpp] = useState('');
  const [fieldErr, setFieldErr] = useState<{
    field: 'subject' | 'opp' | 'date';
    msg: string;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Exactly one opportunity → preselected; 0 → no select; 2+ → the user must choose.
  const oppCount = opps.length;
  const onlyOppId = oppCount === 1 ? opps[0].id : null;
  useEffect(() => {
    setOpp(onlyOppId ?? '');
  }, [onlyOppId, oppCount]);
  const needsOpp = scope === 'account' && oppCount > 0;

  const submit = async () => {
    const trimmed = subject.trim();
    if (!trimmed) {
      setFieldErr({ field: 'subject', msg: 'Escribe una descripción de la acción' });
      subjectRef.current?.focus();
      return;
    }
    if (needsOpp && !opp) {
      setFieldErr({ field: 'opp', msg: 'Elige la oportunidad de esta acción' });
      document.getElementById(`${uid}-opp`)?.focus();
      return;
    }
    if (!date) {
      setFieldErr({ field: 'date', msg: 'Elige la fecha de la acción' });
      return;
    }
    setFieldErr(null);
    setErr(null);
    const body: Record<string, unknown> = {
      type,
      subject: trimmed,
      activityDate: date,
      status: done ? 'HECHA' : 'PENDIENTE',
    };
    if (!compact && detail.trim()) body.detail = detail.trim();
    if (scope === 'opportunity') body.opportunityId = scopeId;
    else {
      body.accountId = scopeId;
      if (opp && opp !== NO_OPPORTUNITY) body.opportunityId = opp;
    }
    setSaving(true);
    try {
      await apiClient.post('/api/comercial/activities', body);
      setSubject('');
      setDetail('');
      setDone(false);
      subjectRef.current?.focus();
      await onRegistered();
    } catch (e) {
      setErr(errText(e, 'No se pudo registrar la acción.'));
    } finally {
      setSaving(false);
    }
  };

  const label = compact ? 'sr-only' : 'mb-1 block text-xs font-medium text-fg-secondary';
  const errId = `${uid}-err`;

  return (
    <form
      aria-label="Registrar acción"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={`rounded-lg border border-dashed border-line ${compact ? 'p-2' : 'p-3'}`}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-[9.5rem] shrink-0">
          <label htmlFor={`${uid}-type`} className={label}>
            Tipo
          </label>
          <select
            id={`${uid}-type`}
            value={type}
            onChange={(e) => setType(e.target.value as ActivityType)}
            className={`${INPUT} w-full`}
          >
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[12rem] flex-1">
          <label htmlFor={`${uid}-subject`} className={label}>
            Descripción
          </label>
          <input
            id={`${uid}-subject`}
            ref={subjectRef}
            value={subject}
            maxLength={200}
            onChange={(e) => {
              setSubject(e.target.value);
              if (fieldErr?.field === 'subject') setFieldErr(null);
            }}
            placeholder="Descripción de la acción"
            aria-invalid={fieldErr?.field === 'subject' || undefined}
            aria-describedby={fieldErr?.field === 'subject' ? errId : undefined}
            className={`${INPUT} w-full`}
          />
        </div>
        <div className="w-[10rem] shrink-0">
          <label htmlFor={`${uid}-date`} className={label}>
            Fecha
          </label>
          <input
            id={`${uid}-date`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={fieldErr?.field === 'date' || undefined}
            aria-describedby={fieldErr?.field === 'date' ? errId : undefined}
            className={`${INPUT} w-full`}
          />
        </div>
        {needsOpp && (
          <div className="min-w-[12rem] flex-1">
            <label htmlFor={`${uid}-opp`} className={label}>
              Oportunidad
            </label>
            <select
              id={`${uid}-opp`}
              value={opp}
              onChange={(e) => {
                setOpp(e.target.value);
                if (fieldErr?.field === 'opp') setFieldErr(null);
              }}
              aria-invalid={fieldErr?.field === 'opp' || undefined}
              aria-describedby={fieldErr?.field === 'opp' ? errId : undefined}
              className={`${INPUT} w-full`}
            >
              {oppCount > 1 && <option value="">Elige una oportunidad…</option>}
              {oppOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
              <option value={NO_OPPORTUNITY}>Solo la cuenta (sin oportunidad)</option>
            </select>
          </div>
        )}
        {!compact && (
          <div className="basis-full">
            <label htmlFor={`${uid}-detail`} className={label}>
              Detalle (opcional)
            </label>
            <textarea
              id={`${uid}-detail`}
              value={detail}
              maxLength={4000}
              onChange={(e) => setDetail(e.target.value)}
              rows={2}
              className={`w-full rounded-lg border border-line bg-input px-3 py-2 text-sm text-fg ${FOCUS}`}
            />
          </div>
        )}
        <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={done}
            onChange={(e) => setDone(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          Ya realizada
        </label>
        <button
          type="submit"
          disabled={saving}
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 ${FOCUS} focus-visible:outline-offset-2`}
        >
          <Plus size={15} aria-hidden="true" /> Registrar acción
        </button>
      </div>

      {scope === 'account' && oppCount === 0 && (
        <p className="mt-2 text-xs text-fg-secondary">
          Esta cuenta aún no tiene oportunidades: la acción queda en la cuenta.
        </p>
      )}
      {fieldErr && (
        <p id={errId} role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {fieldErr.msg}
        </p>
      )}
      {err && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {err}
        </p>
      )}
    </form>
  );
}

export default ActionList;
