'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { formatCLP } from '../../lib/formatters';
import { civilDate, formatDbDate } from '../../lib/dates';
import { MemberAvatar } from '../shared/MemberAvatar';
import { ColumnHelp } from './ColumnHelp';
import type { PipelineRow } from './pipelineTableModel';
import { PROBABILITY_OPTIONS, isActiveStage, isClosedStage } from './stageLabels';

/* COM-027 — the pipeline table's inline edits (spec T7, founder decision F4): Valor
 * estimado, Fecha estimada de cierre and Probabilidad on non-closed rows, Responsable on
 * every row (a won deal needs an owner for the handoff). Writers only (opportunity.update);
 * ONE cell at a time (the table owns the editing key). The display is a button; activating
 * it opens the editor: Enter or blur saves (a select saves on change), Escape cancels. One
 * single-field PATCH through onSave (the page PATCHes and refetches; on error it toasts
 * the api's message and the cell shows its previous value again). Focus returns to the
 * cell after Enter / Escape / a select change — never stolen after a blur. The api
 * validates every rule (required fields per stage, closed rows, active owner). */

export type EditField = 'value' | 'close' | 'probability' | 'owner';
export type SaveField = (id: string, patch: Record<string, unknown>) => Promise<boolean>;

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
const EDITOR = `h-8 w-full rounded-md border border-accent bg-input px-2 text-sm text-fg ${FOCUS}`;
const DISPLAY = `-mx-1.5 flex min-h-8 w-[calc(100%+0.75rem)] items-center rounded-md px-1.5 text-left hover:bg-subtle-hover ${FOCUS}`;

const cellId = (field: EditField, rowId: string) => `pipeline-${field}-${rowId}`;

function refocus(field: EditField, rowId: string) {
  window.requestAnimationFrame(() => document.getElementById(cellId(field, rowId))?.focus());
}

/** Shared editor lifecycle: a guard so Enter + the blur that follows save once. */
function useCommit(row: PipelineRow, field: EditField, onSave: SaveField, onClose: () => void) {
  const settled = useRef(false);
  const [saving, setSaving] = useState(false);
  const finish = (focusBack: boolean) => {
    onClose();
    if (focusBack) refocus(field, row.id);
  };
  const cancel = (focusBack = true) => {
    if (settled.current) return;
    settled.current = true;
    finish(focusBack);
  };
  const commit = async (patch: Record<string, unknown> | null, focusBack: boolean) => {
    if (settled.current) return;
    settled.current = true;
    if (patch === null) {
      finish(focusBack); // unchanged
      return;
    }
    setSaving(true);
    await onSave(row.id, patch);
    setSaving(false);
    finish(focusBack);
  };
  return { saving, cancel, commit };
}

/* ── Valor estimado ── */

export function ValueCell({ row: r, canEdit, editing, onStart, onClose, onSave }: CellProps) {
  const text = r.estimatedValue != null ? formatCLP(r.estimatedValue) : '—';
  const editable = canEdit && !isClosedStage(r.stage) && !r.valueFromBundle;
  if (r.valueFromBundle && !isClosedStage(r.stage)) {
    return (
      <span className="inline-flex items-center justify-end gap-1">
        {text}
        <ColumnHelp help="Se calcula con las líneas de servicios">
          <span
            tabIndex={0}
            aria-label="Se calcula con las líneas de servicios"
            className={`inline-flex rounded text-fg-secondary ${FOCUS}`}
          >
            <Info size={13} aria-hidden="true" />
          </span>
        </ColumnHelp>
      </span>
    );
  }
  if (!editable) return <>{text}</>;
  if (editing) return <ValueEditor row={r} onClose={onClose} onSave={onSave} />;
  return (
    <button
      id={cellId('value', r.id)}
      type="button"
      onClick={onStart}
      aria-label={`Valor estimado de «${r.name}»: ${text}. Editar`}
      className={`${DISPLAY} justify-end tabular-nums`}
    >
      {text}
    </button>
  );
}

function ValueEditor({
  row: r,
  onClose,
  onSave,
}: {
  row: PipelineRow;
  onClose: () => void;
  onSave: SaveField;
}) {
  const initial = r.estimatedValue != null ? String(Math.round(Number(r.estimatedValue))) : '';
  const [draft, setDraft] = useState(initial);
  const { saving, cancel, commit } = useCommit(r, 'value', onSave, onClose);
  const save = (focusBack: boolean) => {
    const v = draft.trim();
    if (v === initial) return commit(null, focusBack);
    return commit({ estimatedValue: v === '' ? null : Math.round(Number(v)) }, focusBack);
  };
  return (
    <input
      autoFocus
      type="number"
      inputMode="numeric"
      min={0}
      step={1}
      value={draft}
      disabled={saving}
      aria-label={`Valor estimado de «${r.name}» (vacío = sin valor)`}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void save(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={() => void save(false)}
      className={`${EDITOR} text-right tabular-nums`}
    />
  );
}

/* ── Fecha estimada de cierre ── */

export function CloseDateCell({
  row: r,
  canEdit,
  editing,
  onStart,
  onClose,
  onSave,
  today,
}: CellProps & { today: string }) {
  const overdue =
    !!r.expectedCloseDate && isActiveStage(r.stage) && civilDate(r.expectedCloseDate) < today;
  const content: ReactNode = r.expectedCloseDate ? (
    overdue ? (
      <span className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-400">
        <AlertTriangle size={13} aria-hidden="true" />
        {formatDbDate(r.expectedCloseDate)}
        <span className="sr-only"> (vencida)</span>
      </span>
    ) : (
      <span className="text-fg-secondary">{formatDbDate(r.expectedCloseDate)}</span>
    )
  ) : (
    <span className="text-fg-secondary">—</span>
  );
  const editable = canEdit && !isClosedStage(r.stage);
  if (!editable) return <>{content}</>;
  if (editing) return <CloseDateEditor row={r} onClose={onClose} onSave={onSave} />;
  return (
    <button
      id={cellId('close', r.id)}
      type="button"
      onClick={onStart}
      aria-label={`Fecha estimada de cierre de «${r.name}»: ${
        r.expectedCloseDate ? formatDbDate(r.expectedCloseDate) : 'sin fecha'
      }${overdue ? ' (vencida)' : ''}. Editar`}
      className={`${DISPLAY} tabular-nums`}
    >
      {content}
    </button>
  );
}

function CloseDateEditor({
  row: r,
  onClose,
  onSave,
}: {
  row: PipelineRow;
  onClose: () => void;
  onSave: SaveField;
}) {
  const initial = r.expectedCloseDate ? civilDate(r.expectedCloseDate) : '';
  const [draft, setDraft] = useState(initial);
  const { saving, cancel, commit } = useCommit(r, 'close', onSave, onClose);
  const save = (focusBack: boolean) =>
    draft === initial
      ? commit(null, focusBack)
      : commit({ expectedCloseDate: draft === '' ? null : draft }, focusBack);
  return (
    <input
      autoFocus
      type="date"
      value={draft}
      disabled={saving}
      aria-label={`Fecha estimada de cierre de «${r.name}» (vacío = sin fecha)`}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void save(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={() => void save(false)}
      className={`${EDITOR} tabular-nums`}
    />
  );
}

/* ── Probabilidad ── */

export function ProbabilityCell({ row: r, canEdit, editing, onStart, onClose, onSave }: CellProps) {
  const bar =
    r.probability != null ? (
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-1.5 w-14 overflow-hidden rounded-full bg-subtle-hover"
        >
          <span
            className="block h-full rounded-full bg-accent"
            style={{ width: `${Math.max(0, Math.min(100, r.probability))}%` }}
          />
        </span>
        <span className="tabular-nums">{r.probability}%</span>
      </span>
    ) : (
      <span className="text-fg-secondary">—</span>
    );
  const editable = canEdit && !isClosedStage(r.stage);
  if (!editable) return bar;
  if (editing) return <ProbabilityEditor row={r} onClose={onClose} onSave={onSave} />;
  return (
    <button
      id={cellId('probability', r.id)}
      type="button"
      onClick={onStart}
      aria-label={`Probabilidad de «${r.name}»: ${
        r.probability != null ? `${r.probability}%` : 'sin definir'
      }. Editar`}
      className={DISPLAY}
    >
      {bar}
    </button>
  );
}

function ProbabilityEditor({
  row: r,
  onClose,
  onSave,
}: {
  row: PipelineRow;
  onClose: () => void;
  onSave: SaveField;
}) {
  const { saving, cancel, commit } = useCommit(r, 'probability', onSave, onClose);
  return (
    <SelectEditor
      label={`Probabilidad de «${r.name}»`}
      value={r.probability != null ? String(r.probability) : ''}
      saving={saving}
      onCancel={cancel}
      onPick={(v) =>
        void commit(v === String(r.probability) ? null : { probability: Number(v) }, true)
      }
    >
      {r.probability == null && <option value="">—</option>}
      {PROBABILITY_OPTIONS.map((p) => (
        <option key={p} value={String(p)}>
          {p}%
        </option>
      ))}
    </SelectEditor>
  );
}

/* ── Responsable ── */

export function OwnerCell({
  row: r,
  canEdit,
  editing,
  onStart,
  onClose,
  onSave,
  ownerName,
  members,
}: CellProps & {
  ownerName: string | null;
  members: { userId: string; displayName: string }[];
}) {
  const view = ownerName ? (
    <MemberAvatar size="sm" displayName={ownerName} />
  ) : (
    <span className="text-xs text-fg-secondary">Sin responsable</span>
  );
  if (!canEdit) {
    // Readers: the owner's full name is a keyboard-reachable tip.
    return ownerName ? (
      <ColumnHelp help={ownerName}>
        <span tabIndex={0} className={`inline-flex rounded-full ${FOCUS}`}>
          {view}
        </span>
      </ColumnHelp>
    ) : (
      view
    );
  }
  if (editing)
    return (
      <OwnerEditor
        row={r}
        ownerName={ownerName}
        members={members}
        onClose={onClose}
        onSave={onSave}
      />
    );
  return (
    <button
      id={cellId('owner', r.id)}
      type="button"
      onClick={onStart}
      title={ownerName ?? 'Sin responsable'}
      aria-label={`Responsable de «${r.name}»: ${ownerName ?? 'sin responsable'}. Cambiar`}
      className={DISPLAY}
    >
      {view}
    </button>
  );
}

function OwnerEditor({
  row: r,
  ownerName,
  members,
  onClose,
  onSave,
}: {
  row: PipelineRow;
  ownerName: string | null;
  members: { userId: string; displayName: string }[];
  onClose: () => void;
  onSave: SaveField;
}) {
  const { saving, cancel, commit } = useCommit(r, 'owner', onSave, onClose);
  // An inactive current owner stays listed so the select shows the real value.
  const current = r.ownerId ?? '';
  const listed = !r.ownerId || members.some((m) => m.userId === r.ownerId);
  return (
    <SelectEditor
      label={`Responsable de «${r.name}»`}
      value={current}
      saving={saving}
      onCancel={cancel}
      onPick={(v) => void commit(v === current ? null : { ownerId: v === '' ? null : v }, true)}
    >
      <option value="">Sin responsable</option>
      {!listed && <option value={current}>{ownerName ?? 'Usuario desconocido'} (inactivo)</option>}
      {members.map((m) => (
        <option key={m.userId} value={m.userId}>
          {m.displayName}
        </option>
      ))}
    </SelectEditor>
  );
}

/* ── shared ── */

interface CellProps {
  row: PipelineRow;
  canEdit: boolean;
  editing: boolean;
  onStart: () => void;
  onClose: () => void;
  onSave: SaveField;
}

/** A select that saves on change, cancels on Escape and closes (unchanged) on blur. */
function SelectEditor({
  label,
  value,
  saving,
  onPick,
  onCancel,
  children,
}: {
  label: string;
  value: string;
  saving: boolean;
  onPick: (value: string) => void;
  onCancel: (focusBack?: boolean) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSelectElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <select
      ref={ref}
      value={value}
      disabled={saving}
      aria-label={label}
      onChange={(e) => onPick(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel(true);
        }
      }}
      onBlur={() => onCancel(false)}
      className={EDITOR}
    >
      {children}
    </select>
  );
}
