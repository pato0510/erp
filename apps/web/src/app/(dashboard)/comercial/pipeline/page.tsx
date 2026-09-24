'use client';

import { MemberAvatar } from '../../../../components/shared/MemberAvatar';
import { useMembers } from '../../../../hooks/useMembers';

/* COM-007 — Pipeline kanban: the Comercial module's flagship screen. It VISUALIZES
 * the COM-005 stage machine; it never re-implements the rules. Every move calls the
 * canonical endpoint (PATCH /:id/stage, POST /:id/reopen, POST /:id/resume) and
 * renders its acceptance or rejection — the backend is the single source of truth.
 *
 * Drag & drop uses native HTML5 DnD (draggable + onDragStart/onDragOver/onDrop) — no
 * new dependency; the codebase ships none and column-to-column moves don't need one.
 *
 * Permissions are ability-driven via GET /comercial/permissions (opportunity flags):
 *  - opportunity.update === true (MANAGER/ADMIN/SUPER_ADMIN): full board.
 *  - read true, update false (ACCOUNTANT): the FULL board, read-only (no drag, no
 *    buttons, no "Nueva oportunidad").
 *  - no read (ANALYST/VIEWER): the list 403s → clean sin-permiso state.
 * Tokens: accent #2563eb, Outfit headings.
 *
 * The minimal detail (/comercial/pipeline/[id]) shows read-only fields + stage
 * actions; the full detail (service-bundle editor, timeline) lands in COM-007b.
 *
 * COM-020 — Pipeline 2.0: a "Tabla | Kanban" toggle (React state only), default Tabla.
 * The table (PipelineTable) reuses attemptMove for its inline stage select, so both
 * views share ONE stage-change path.
 *
 * COM-025 — table v2: the table view fetches ?includeClosed=true and nothing else;
 * search, filters and grouping are client-side in PipelineTable. Its quick-add row
 * POSTs through onAdd (the creator is the default Responsable), and the header's
 * «Nueva oportunidad» shows only in kanban view (the table has its own «Agregar
 * oportunidad»). The kanban's fetch and rendering are untouched except the close-date
 * line (formatDbDate: a @db.Date no longer renders one day early).
 *
 * COM-026 — every table row opens its actions (ActionList, compact) under it; a write
 * there refetches the list so the pending indicators and «Actualización» follow.
 *
 * COM-027-A — after a direct move (no dialog) focus follows the moved row / card to the
 * trigger attemptMove received (restoreFocus), also after a revert, the Ganada confirm
 * and LostReasonModal; each open action list reloads when its row's updatedAt changes. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KanbanSquare, LayoutList, Play, Plus, RotateCcw } from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/api';
import { formatCLP } from '../../../../lib/formatters';
import { formatDbDate } from '../../../../lib/dates';
import { useAuth } from '../../../../hooks/useAuth';
import { useComercialPermissions } from '../../../../hooks/useCanWrite';
import {
  isClosedStage,
  isActiveStage,
  STAGE_ORDER,
  STAGE_LABELS,
  stageAccent,
  type LostReason,
  type OpportunityStage,
} from '../../../../components/comercial/stageLabels';
import {
  NewOpportunityModal,
  type AccountOption,
} from '../../../../components/comercial/NewOpportunityModal';
import { LostReasonModal } from '../../../../components/comercial/LostReasonModal';
import { CardMoveMenu } from '../../../../components/comercial/CardMoveMenu';
// COM-027 — the one stage-entry dialog (required fields, move-back / reopen reason).
import {
  StageEntryDialog,
  entryNeeds,
  needsDialog,
  stageErrText,
  type StageIntent,
} from '../../../../components/comercial/StageEntryDialog';
// COM-025 — the grouped table view (Etapa | Cuenta) with its quick-add row.
import { PipelineTable } from '../../../../components/comercial/PipelineTable';
// COM-026 — each table row's actions dropdown.
import { ActionList } from '../../../../components/comercial/ActionList';
import type { QuickAddBody } from '../../../../components/comercial/PipelineQuickAdd';

interface Opportunity {
  id: string;
  accountId: string;
  name: string;
  stage: string;
  previousStage: string | null;
  estimatedValue: string | null;
  probability: number | null;
  expectedCloseDate: string | null;
  ownerId: string | null;
  lostReason: string | null;
  lostReasonDetail: string | null;
  closedAt: string | null;
  notes: string | null;
  createdAt: string; // COM-025 — «Fecha de creación» column
  updatedAt: string;
  lastMovementAt?: string | null; // COM-020 — derived by the API
  // COM-026 — derived by the API (COM-022): the row / group indicators and «Actualización».
  pendingActions?: number;
  overdueActions?: number;
  lastUpdate?: { at: string; kind: string } | null;
  valueFromBundle?: boolean; // COM-023 — value derived from service lines (never asked)
  account?: { id: string; name: string; enterprise: { id: string; name: string } | null } | null; // COM-020
}
interface AccountRow {
  id: string;
  name: string;
  priority: string;
}
type Toast = { msg: string; type: 'error' | 'success' };

export default function PipelinePage() {
  const router = useRouter();
  const perms = useComercialPermissions();
  const canWrite = perms?.opportunity.update ?? false;
  const canCreate = perms?.opportunity.create ?? false;
  const { user } = useAuth();

  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const { nameOf } = useMembers('all');
  const { members: activeMembers } = useMembers('active');
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accountFilter, setAccountFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  // COM-020 — view toggle (React state only). COM-025: the table filters client-side.
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [newModal, setNewModal] = useState(false);
  const [lostModal, setLostModal] = useState<{
    id: string;
    name: string;
    prev: Opportunity;
    returnFocusId?: string; // COM-027-A — where focus goes when it confirms or cancels
  } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  // COM-027 — an open stage-entry dialog: the PRE-move opportunity (its needs are computed
  // from it), the intent, and whether an optimistic move must be reverted on cancel.
  const [entry, setEntry] = useState<{
    opp: Opportunity;
    intent: StageIntent;
    optimistic: boolean;
    returnFocusId?: string;
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  /* ── Edge auto-scroll during drag ──────────────────────────────────────────
     Native HTML5 DnD auto-scrolls the PAGE, never an inner overflow container, so
     dragging a card toward Ganada/Perdida on the wide board would stall at the edge.
     dragover fires continuously during a drag and carries clientX; we translate the
     pointer's proximity to the container's left/right edge into a scroll velocity and
     apply it on a requestAnimationFrame loop. The loop is cancelled on drop/dragend
     (the card's onDragEnd) and on unmount, so it can't leak. */
  const boardRef = useRef<HTMLDivElement | null>(null);
  const scrollVelRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const stepAutoScroll = () => {
    const el = boardRef.current;
    if (el && scrollVelRef.current !== 0) el.scrollLeft += scrollVelRef.current;
    rafRef.current = requestAnimationFrame(stepAutoScroll);
  };
  const stopAutoScroll = () => {
    scrollVelRef.current = 0;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };
  // Cancel any in-flight RAF if the board unmounts mid-drag.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onBoardDragOver = (e: React.DragEvent) => {
    if (!draggingId) return; // only our own card drags
    const el = boardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const EDGE = 76; // edge-zone width in px
    const MIN = 4;
    const MAX = 24;
    const x = e.clientX - rect.left;
    let v = 0;
    if (x < EDGE) {
      const i = Math.min(1, (EDGE - x) / EDGE);
      v = -(MIN + (MAX - MIN) * i);
    } else if (x > rect.width - EDGE) {
      const i = Math.min(1, (x - (rect.width - EDGE)) / EDGE);
      v = MIN + (MAX - MIN) * i;
    }
    scrollVelRef.current = v;
    if (v !== 0 && rafRef.current === null) rafRef.current = requestAnimationFrame(stepAutoScroll);
  };

  // Account names are independent of the shared members directory.
  useEffect(() => {
    apiClient
      .get<AccountRow[]>('/api/comercial/accounts')
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, []);

  const fetchOpps = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (view === 'table') {
      // COM-025 — open deals + closed ones from the last 90 days; everything else is
      // client-side. The kanban (which sends no includeClosed) keeps its legacy full set.
      params.set('includeClosed', 'true');
    } else {
      if (accountFilter) params.set('accountId', accountFilter);
      if (ownerFilter) params.set('ownerId', ownerFilter);
    }
    const qs = params.toString();
    apiClient
      .get<Opportunity[]>(`/api/comercial/opportunities${qs ? `?${qs}` : ''}`)
      .then((data) => {
        setOpps(data);
        setError(null);
        setForbidden(false);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setForbidden(true);
        else setError('No se pudieron cargar las oportunidades.');
      })
      .finally(() => setLoading(false));
  }, [accountFilter, ownerFilter, view]);

  useEffect(() => {
    fetchOpps();
  }, [fetchOpps]);

  // COM-007b — a one-shot flash toast handed off via sessionStorage (e.g. after
  // deleting an opportunity from its detail page and navigating back here).
  useEffect(() => {
    try {
      const flash = sessionStorage.getItem('comercial.flash');
      if (flash) {
        sessionStorage.removeItem('comercial.flash');
        setToast({ msg: flash, type: 'success' });
      }
    } catch {
      /* sessionStorage unavailable — no flash */
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const accountsById = useMemo(() => {
    const m = new Map<string, AccountRow>();
    accounts.forEach((a) => m.set(a.id, a));
    return m;
  }, [accounts]);
  const ownerOptions = activeMembers.map((member) => ({
    id: member.userId,
    label: member.displayName,
  }));

  const byStage = (stage: string) => opps.filter((o) => o.stage === stage);
  const columnSum = (stage: string) =>
    byStage(stage).reduce((acc, o) => acc + Number(o.estimatedValue ?? 0), 0);

  /* ── local optimistic helpers ── */
  const moveLocally = (id: string, stage: string) =>
    setOpps((cur) => cur.map((o) => (o.id === id ? { ...o, stage } : o)));
  const revert = (prev: Opportunity) =>
    setOpps((cur) => cur.map((o) => (o.id === prev.id ? prev : o)));
  // COM-027 — the stage / resume / reopen responses are the bare row (no account, counts,
  // valueFromBundle): merge them over what we have; the table then refetches the derived
  // fields (lastUpdate, pending counts). The kanban keeps the merge only (a refetch would
  // flash its loading skeleton).
  const replaceOpp = (u: Opportunity) =>
    setOpps((cur) => cur.map((o) => (o.id === u.id ? { ...o, ...u } : o)));
  const afterStageChange = (u: Opportunity) => {
    replaceOpp(u);
    if (view === 'table') fetchOpps();
  };

  /* COM-027-A — after a direct move (no dialog) the moved row / card is re-created in its
     new group or column, so the focused control vanishes. Once the rows re-render, put
     focus on the trigger attemptMove was given (the row's Etapa select, the card's ⋮) —
     only if focus actually fell to <body>, never stealing it from where the user went.
     Two frames: the first lets React commit the move / revert, the second the refetch. */
  const restoreFocus = (id?: string) => {
    if (!id) return;
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active && active !== document.body) return;
        document.getElementById(id)?.focus();
      }),
    );
  };

  /* commit a stage change to the canonical endpoint; revert + toast on any 4xx.
     The backend is the machine — the frontend never pre-validates beyond routing
     the drop to the right endpoint/dialog (COM-027: moves that need fields or a reason
     go through StageEntryDialog instead, whose errors stay inside the dialog). */
  const commitStage = async (
    id: string,
    body: { stage: OpportunityStage; lostReason?: LostReason; lostReasonDetail?: string },
    prev: Opportunity,
    returnFocusId?: string,
  ) => {
    try {
      const updated = await apiClient.patch<Opportunity>(
        `/api/comercial/opportunities/${id}/stage`,
        body,
      );
      afterStageChange(updated);
    } catch (e) {
      revert(prev);
      setToast({
        msg: e instanceof ApiError ? e.message : 'No se pudo mover la oportunidad.',
        type: 'error',
      });
    } finally {
      restoreFocus(returnFocusId);
    }
  };

  /* The shared "attempt to move this opportunity to stage X" flow. BOTH a drag-drop
     and the "Mover a…" menu call this, so the two paths are guaranteed identical: the
     optimistic move + revert, the GANADA light confirm, the PERDIDA modal (cancel =
     nothing persists), and the canonical PATCH for active/EN_PAUSA targets all live
     here — never duplicated per entry-point. */
  const attemptMove = (opp: Opportunity, targetStage: OpportunityStage, returnFocusId?: string) => {
    if (opp.stage === targetStage || isClosedStage(opp.stage)) return;
    const prev = opp;
    moveLocally(opp.id, targetStage); // optimistic

    // COM-027 — a move that needs fields or a reason asks for them first (PERDIDA keeps
    // LostReasonModal: it never needs fields). Cancel reverts the optimistic move.
    const intent: StageIntent = { kind: 'move', to: targetStage };
    if (targetStage !== 'PERDIDA' && needsDialog(entryNeeds(prev, intent))) {
      setEntry({ opp: prev, intent, optimistic: true, returnFocusId });
      return;
    }

    // COM-027-A — the optimistic move re-created the row / card: keep focus on it.
    restoreFocus(returnFocusId);
    if (isActiveStage(targetStage) || targetStage === 'EN_PAUSA') {
      void commitStage(opp.id, { stage: targetStage }, prev, returnFocusId);
    } else if (targetStage === 'GANADA') {
      if (window.confirm(`¿Marcar “${opp.name}” como ganada?`)) {
        void commitStage(opp.id, { stage: 'GANADA' }, prev, returnFocusId);
      } else {
        revert(prev); // cancel reverts the card
        restoreFocus(returnFocusId);
      }
    } else if (targetStage === 'PERDIDA') {
      // Persist only on modal confirm; cancel reverts (nothing persists).
      setLostModal({ id: opp.id, name: opp.name, prev, returnFocusId });
    }
  };

  const handleDrop = (targetStage: OpportunityStage) => {
    const id = draggingId;
    setDraggingId(null);
    setDragOverStage(null);
    stopAutoScroll();
    if (!id) return;
    const opp = opps.find((o) => o.id === id);
    if (opp) attemptMove(opp, targetStage);
  };

  const confirmLost = async (lostReason: LostReason, lostReasonDetail?: string) => {
    if (!lostModal) return;
    await commitStage(
      lostModal.id,
      { stage: 'PERDIDA', lostReason, lostReasonDetail },
      lostModal.prev,
      lostModal.returnFocusId,
    );
    setLostModal(null);
  };
  const cancelLost = () => {
    if (lostModal) {
      revert(lostModal.prev);
      restoreFocus(lostModal.returnFocusId);
    }
    setLostModal(null);
  };

  // COM-027 — reopening always asks for a reason (and any field Negociación lacks).
  const reopen = (opp: Opportunity, ev?: React.MouseEvent) => {
    ev?.stopPropagation();
    // After a reopen the card's «Reabrir» is gone: focus its new «Mover a…» trigger.
    setEntry({
      opp,
      intent: { kind: 'reopen' },
      optimistic: false,
      returnFocusId: `pipeline-card-move-${opp.id}`,
    });
  };
  /* COM-025 — the table's quick-add row: POST with the creator as Responsable (COM-027:
     at the group's stage, with the fields that stage requires); the api's message goes to
     the page toast on error. */
  const addFromTable = async (body: QuickAddBody): Promise<boolean> => {
    try {
      await apiClient.post('/api/comercial/opportunities', body);
      return true;
    } catch (e) {
      setToast({
        msg: e instanceof ApiError ? e.message : 'No se pudo crear la oportunidad.',
        type: 'error',
      });
      return false;
    }
  };

  // COM-027 — resume asks for what the landing stage needs; otherwise it posts directly.
  const resume = async (opp: Opportunity, ev?: React.MouseEvent, returnFocusId?: string) => {
    ev?.stopPropagation();
    const intent: StageIntent = { kind: 'resume' };
    if (needsDialog(entryNeeds(opp, intent))) {
      setEntry({ opp, intent, optimistic: false, returnFocusId });
      return;
    }
    try {
      const u = await apiClient.post<Opportunity>(`/api/comercial/opportunities/${opp.id}/resume`);
      afterStageChange(u);
      // The card's «Reanudar» is gone after resuming: focus its «Mover a…» trigger.
      if (returnFocusId)
        window.requestAnimationFrame(() => document.getElementById(returnFocusId)?.focus());
    } catch (e) {
      setToast({ msg: stageErrText(e, 'No se pudo reanudar la oportunidad.'), type: 'error' });
    }
  };

  /* COM-027 — inline edits in the table: ONE field per PATCH, then refetch; the api's
     message goes to the page toast and the cell shows its previous value. */
  const editField = async (id: string, patch: Record<string, unknown>): Promise<boolean> => {
    try {
      await apiClient.patch(`/api/comercial/opportunities/${id}`, patch);
      fetchOpps();
      return true;
    } catch (e) {
      setToast({ msg: stageErrText(e, 'No se pudo guardar el cambio.'), type: 'error' });
      return false;
    }
  };

  /* ── header ── */
  const Header = (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Pipeline
        </h1>
      </div>
      {canCreate && !forbidden && view === 'kanban' && (
        <button
          onClick={() => setNewModal(true)}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: 'var(--color-accent)' }}
        >
          <Plus size={16} /> Nueva oportunidad
        </button>
      )}
    </div>
  );

  if (forbidden) {
    return (
      <div className="pt-2">
        {Header}
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            No tienes permiso para ver el pipeline comercial.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-2">
      {Header}

      {/* COM-020 — view toggle (segmented control). Default Tabla; kanban unchanged. */}
      <div
        className="mb-4 inline-flex rounded-lg border border-[var(--border-color)] p-0.5"
        role="group"
        aria-label="Vista"
      >
        {(
          [
            ['table', 'Tabla', LayoutList],
            ['kanban', 'Kanban', KanbanSquare],
          ] as const
        ).map(([v, label, Icon]) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
              view === v
                ? 'text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            style={view === v ? { background: 'var(--color-accent)' } : undefined}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {view === 'table' ? (
        <PipelineTable
          rows={opps}
          loading={loading}
          accounts={accounts}
          canWrite={canWrite}
          canCreate={canCreate}
          currentUserId={user?.id ?? null}
          ownerOptions={ownerOptions}
          nameOf={nameOf}
          onChangeStage={(row, stage) => {
            const opp = opps.find((o) => o.id === row.id);
            if (opp) attemptMove(opp, stage, `pipeline-stage-${row.id}`);
          }}
          onEditField={editField}
          ownerMembers={activeMembers}
          onNew={() => setNewModal(true)}
          onAdd={addFromTable}
          onCreated={fetchOpps}
          renderRowDetail={(row) => (
            <ActionList
              scope="opportunity"
              scopeId={row.id}
              variant="compact"
              onChanged={fetchOpps}
              // COM-027-A — the open list reloads (silently) when its opportunity changes.
              refreshKey={row.updatedAt}
            />
          )}
        />
      ) : (
        <>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              <option value="">Todas las cuentas</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              <option value="">Todos los responsables</option>
              {ownerOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            {(accountFilter || ownerFilter) && (
              <button
                onClick={() => {
                  setAccountFilter('');
                  setOwnerFilter('');
                }}
                className="text-sm text-[var(--text-secondary)] underline-offset-2 hover:underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          {/* Board — horizontally scrollable. onDragOver drives the edge auto-scroll. */}
          <div
            ref={boardRef}
            onDragOver={onBoardDragOver}
            className="flex gap-4 overflow-x-auto pb-4"
          >
            {STAGE_ORDER.map((stage) => {
              const cards = byStage(stage);
              const over = dragOverStage === stage;
              return (
                <div
                  key={stage}
                  onDragOver={(e) => {
                    if (!draggingId) return;
                    e.preventDefault();
                    if (dragOverStage !== stage) setDragOverStage(stage);
                  }}
                  onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
                  onDrop={() => handleDrop(stage as OpportunityStage)}
                  className="flex w-[286px] shrink-0 flex-col rounded-xl border bg-[var(--bg-card)]"
                  style={{
                    borderColor: over ? 'var(--color-accent)' : 'var(--border-color)',
                    boxShadow: over ? '0 0 0 1px #2563eb inset' : undefined,
                    transition: 'border-color 120ms ease',
                  }}
                >
                  {/* Column header */}
                  <div className="flex items-center justify-between gap-2 border-b border-[var(--border-color)] px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: stageAccent(stage) }}
                      />
                      <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                        {STAGE_LABELS[stage]}
                      </span>
                      <span className="shrink-0 text-xs text-[var(--text-secondary)]">
                        ({cards.length})
                      </span>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-[var(--text-secondary)]">
                      {formatCLP(columnSum(stage))}
                    </span>
                  </div>

                  {/* Column body */}
                  <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
                    {loading ? (
                      Array.from({ length: 2 }).map((_, i) => (
                        <div
                          key={i}
                          className="animate-pulse rounded-lg border border-[var(--border-color)] p-3"
                        >
                          <div className="mb-2 h-4 w-3/4 rounded bg-subtle-hover" />
                          <div className="h-3 w-1/2 rounded bg-subtle-hover" />
                        </div>
                      ))
                    ) : cards.length === 0 ? (
                      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[var(--border-color)] py-6 text-center text-xs text-[var(--text-secondary)]">
                        Sin oportunidades
                      </div>
                    ) : (
                      cards.map((o) => {
                        const account = accountsById.get(o.accountId);
                        const ownerName = o.ownerId
                          ? (nameOf(o.ownerId) ?? 'Usuario desconocido')
                          : null;
                        const draggable = canWrite && !isClosedStage(o.stage);
                        return (
                          <div
                            key={o.id}
                            draggable={draggable}
                            onDragStart={() => setDraggingId(o.id)}
                            onDragEnd={() => {
                              setDraggingId(null);
                              setDragOverStage(null);
                              stopAutoScroll();
                            }}
                            onClick={() => router.push(`/comercial/pipeline/${o.id}`)}
                            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-3 text-left transition-shadow hover:shadow-sm"
                            style={{
                              cursor: draggable ? 'grab' : 'pointer',
                              opacity: draggingId === o.id ? 0.5 : 1,
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="min-w-0 text-sm font-medium text-[var(--text-primary)]">
                                {o.name}
                              </p>
                              <div className="flex shrink-0 items-center gap-1">
                                {account?.priority === 'ALTA' && (
                                  <span
                                    title="Cuenta prioridad alta"
                                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                                    style={{ background: '#ef4444' }}
                                  />
                                )}
                                {/* "Mover a…" — writers, non-closed cards. Reuses attemptMove/
                                resume so it's the same flow as a drag-drop. */}
                                {draggable && (
                                  <CardMoveMenu
                                    stage={o.stage}
                                    triggerId={`pipeline-card-move-${o.id}`}
                                    onMove={(t) => attemptMove(o, t, `pipeline-card-move-${o.id}`)}
                                    onResume={() =>
                                      resume(o, undefined, `pipeline-card-move-${o.id}`)
                                    }
                                  />
                                )}
                              </div>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                              {account?.name ?? '—'}
                            </p>

                            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                              <span className="font-medium text-[var(--text-primary)]">
                                {o.estimatedValue != null ? formatCLP(o.estimatedValue) : '—'}
                              </span>
                              <span className="text-[var(--text-secondary)]">
                                {o.expectedCloseDate ? formatDbDate(o.expectedCloseDate) : '—'}
                              </span>
                            </div>

                            {ownerName && (
                              <div className="mt-2 flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                                <MemberAvatar displayName={nameOf(o.ownerId)} size="sm" />
                                <span className="truncate">{ownerName}</span>
                              </div>
                            )}

                            {/* Semi-terminal / paused quick-actions (writers only) */}
                            {canWrite && isClosedStage(o.stage) && (
                              <div className="mt-2 border-t border-[var(--border-color)] pt-2">
                                <button
                                  onClick={(ev) => reopen(o, ev)}
                                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                >
                                  <RotateCcw size={11} /> Reabrir
                                </button>
                              </div>
                            )}
                            {canWrite && o.stage === 'EN_PAUSA' && (
                              <div className="mt-2 border-t border-[var(--border-color)] pt-2">
                                <button
                                  onClick={(ev) => resume(o, ev, `pipeline-card-move-${o.id}`)}
                                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                >
                                  <Play size={11} /> Reanudar
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {newModal && (
        <NewOpportunityModal
          accounts={accounts as AccountOption[]}
          onClose={() => setNewModal(false)}
          onCreated={() => {
            setNewModal(false);
            fetchOpps();
          }}
        />
      )}

      {entry && (
        <StageEntryDialog<Opportunity>
          opportunity={entry.opp}
          intent={entry.intent}
          returnFocusId={entry.returnFocusId}
          onDone={(u) => {
            setEntry(null);
            afterStageChange(u);
          }}
          onCancel={() => {
            if (entry.optimistic) revert(entry.opp);
            setEntry(null);
          }}
        />
      )}

      {lostModal && (
        <LostReasonModal
          opportunityName={lostModal.name}
          onCancel={cancelLost}
          onConfirm={confirmLost}
        />
      )}

      {toast && (
        <div
          role={toast.type === 'error' ? 'alert' : 'status'}
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg px-4 py-3 text-sm shadow-lg"
          style={{
            background: toast.type === 'error' ? '#fef2f2' : '#f0fdf4',
            color: toast.type === 'error' ? '#b91c1c' : '#15803d',
            border: `1px solid ${toast.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
