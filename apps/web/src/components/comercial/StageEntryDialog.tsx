'use client';

import { useId, useState } from 'react';
import { apiClient, ApiError } from '../../lib/api';
import {
  DIALOG_GHOST,
  DIALOG_INPUT,
  DIALOG_LABEL,
  DIALOG_PRIMARY,
  DialogShell,
} from './DialogShell';
import {
  REASON_MAX,
  REASON_MIN,
  STAGE_LABELS,
  isActiveStage,
  isMoveBack,
  resumeTarget,
  stageRequires,
  type OpportunityStage,
} from './stageLabels';

/* COM-027 — THE stage-entry dialog: every stage move in Comercial (table select, kanban
 * drag / «Mover a…», the cards' Reanudar / Reabrir, the ficha's Pausar / Reanudar /
 * Reabrir) asks here exactly what COM-023 needs for that move, and nothing else:
 *  - «Motivo» — a move back (isMoveBack) or any reopen;
 *  - «Valor estimado» — the target requires it, the opportunity has none and it is not
 *    derived from service lines (valueFromBundle);
 *  - «Fecha estimada de cierre» — the target requires it and the opportunity has none.
 * What to ask comes from the static mirror in stageLabels.tsx; the api decides (no
 * client-side validation: an empty field is simply not sent and the api says why). Confirm
 * sends ONE request (stage / resume / reopen endpoint) with everything; any 4xx shows
 * inside the dialog (role="alert") and keeps what was typed. Cancel, Escape or the
 * backdrop call onCancel (the caller reverts its optimistic move; nothing persists). */

export interface StageEntryOpportunity {
  id: string;
  name: string;
  stage: string;
  previousStage: string | null;
  estimatedValue: string | number | null;
  expectedCloseDate: string | null;
  /** COM-023 list rows; the ficha derives it from its service lines. */
  valueFromBundle?: boolean;
}

export type StageIntent =
  | { kind: 'move'; to: OpportunityStage }
  | { kind: 'resume' }
  | { kind: 'reopen' };

export interface EntryNeeds {
  target: OpportunityStage;
  reason: boolean;
  value: boolean;
  date: boolean;
  title: string;
}

/** What a move needs (display only — the api validates). */
export function entryNeeds(opp: StageEntryOpportunity, intent: StageIntent): EntryNeeds {
  const target =
    intent.kind === 'move'
      ? intent.to
      : intent.kind === 'resume'
        ? resumeTarget(opp.previousStage)
        : 'NEGOCIACION';
  const req = stageRequires(target);
  const reason =
    intent.kind === 'reopen' ||
    (intent.kind === 'move' && isMoveBack(opp.stage, opp.previousStage, target));
  const title =
    intent.kind === 'reopen'
      ? 'Reabrir en Negociación'
      : target === 'GANADA'
        ? 'Marcar como Ganada'
        : intent.kind === 'resume' || (opp.stage === 'EN_PAUSA' && isActiveStage(target))
          ? `Reanudar en ${STAGE_LABELS[target]}`
          : `Mover a ${STAGE_LABELS[target]}`;
  return {
    target,
    reason,
    value: req.value && opp.estimatedValue == null && !opp.valueFromBundle,
    date: req.date && !opp.expectedCloseDate,
    title,
  };
}

export const needsDialog = (n: EntryNeeds) => n.reason || n.value || n.date;

/** The api's error text; a 403 in plain words. */
export const stageErrText = (e: unknown, fallback: string) =>
  e instanceof ApiError
    ? e.status === 403
      ? 'No tienes permiso para hacer esto.'
      : e.message || fallback
    : fallback;

export function StageEntryDialog<T>({
  opportunity: opp,
  intent,
  returnFocusId,
  fallbackFocusId,
  onDone,
  onCancel,
}: {
  opportunity: StageEntryOpportunity;
  intent: StageIntent;
  returnFocusId?: string;
  fallbackFocusId?: string;
  /** The api's updated opportunity. */
  onDone: (updated: T) => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const needs = entryNeeds(opp, intent);
  const [reason, setReason] = useState('');
  const [value, setValue] = useState('');
  const [date, setDate] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    // No pre-validation: an empty or short field goes to the api, whose message
    // («Retroceder de etapa requiere un motivo…», «Para mover a X falta: …») is shown here.
    const body: Record<string, unknown> = {};
    const trimmed = reason.trim();
    if (needs.reason && trimmed) body.reason = trimmed;
    if (needs.value && value.trim() !== '') body.estimatedValue = Math.round(Number(value));
    if (needs.date && date) body.expectedCloseDate = date;
    setSaving(true);
    setErr(null);
    try {
      const base = `/api/comercial/opportunities/${opp.id}`;
      const updated =
        intent.kind === 'move'
          ? await apiClient.patch<T>(`${base}/stage`, { stage: needs.target, ...body })
          : await apiClient.post<T>(`${base}/${intent.kind}`, body);
      onDone(updated);
    } catch (e) {
      setErr(stageErrText(e, 'No se pudo cambiar la etapa.'));
      setSaving(false);
    }
  };

  const confirmLabel =
    intent.kind === 'reopen'
      ? 'Reabrir'
      : needs.target === 'GANADA'
        ? 'Marcar como Ganada'
        : intent.kind === 'resume' || needs.title.startsWith('Reanudar')
          ? 'Reanudar'
          : 'Mover';

  return (
    <DialogShell
      title={needs.title}
      onCancel={onCancel}
      returnFocusId={returnFocusId}
      fallbackFocusId={fallbackFocusId}
      footer={
        <>
          <button type="button" onClick={onCancel} className={DIALOG_GHOST}>
            Cancelar
          </button>
          <button type="submit" form={`${uid}-form`} disabled={saving} className={DIALOG_PRIMARY}>
            {saving ? 'Guardando…' : confirmLabel}
          </button>
        </>
      }
    >
      <form
        id={`${uid}-form`}
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-sm text-fg-secondary">
          «{opp.name}»
          {needs.reason && intent.kind === 'move' && (
            <>
              {' '}
              vuelve de{' '}
              {
                STAGE_LABELS[opp.stage === 'EN_PAUSA' ? resumeTarget(opp.previousStage) : opp.stage]
              }{' '}
              a {STAGE_LABELS[needs.target]}: indica por qué.
            </>
          )}
          {intent.kind === 'reopen' && ' vuelve a Negociación: indica por qué.'}
          {!needs.reason && (needs.value || needs.date) && ' necesita estos datos para esta etapa.'}
        </p>

        {needs.reason && (
          <div>
            <label htmlFor={`${uid}-reason`} className={DIALOG_LABEL}>
              Motivo (obligatorio)
            </label>
            <textarea
              id={`${uid}-reason`}
              value={reason}
              maxLength={REASON_MAX}
              rows={3}
              onChange={(e) => setReason(e.target.value)}
              aria-required="true"
              aria-describedby={`${uid}-reason-hint`}
              className={DIALOG_INPUT}
            />
            <p id={`${uid}-reason-hint`} className="mt-1 text-xs text-fg-secondary">
              Entre {REASON_MIN} y {REASON_MAX} caracteres. Queda en el historial de acciones.
            </p>
          </div>
        )}
        {needs.value && (
          <div>
            <label htmlFor={`${uid}-value`} className={DIALOG_LABEL}>
              Valor estimado (CLP, obligatorio)
            </label>
            <input
              id={`${uid}-value`}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-required="true"
              className={DIALOG_INPUT}
            />
          </div>
        )}
        {needs.date && (
          <div>
            <label htmlFor={`${uid}-date`} className={DIALOG_LABEL}>
              Fecha estimada de cierre (obligatoria)
            </label>
            <input
              id={`${uid}-date`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-required="true"
              className={DIALOG_INPUT}
            />
          </div>
        )}

        {err && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {err}
          </p>
        )}
      </form>
    </DialogShell>
  );
}

export default StageEntryDialog;
