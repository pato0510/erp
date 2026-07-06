'use client';

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
 * actions; the full detail (service-bundle editor, timeline) lands in COM-007b. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Plus, RotateCcw, User as UserIcon } from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/api';
import { formatCLP, formatDate } from '../../../../lib/formatters';
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
  type UserOption,
} from '../../../../components/comercial/NewOpportunityModal';
import { LostReasonModal } from '../../../../components/comercial/LostReasonModal';
import { CardMoveMenu } from '../../../../components/comercial/CardMoveMenu';

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
  updatedAt: string;
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

  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accountFilter, setAccountFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [newModal, setNewModal] = useState(false);
  const [lostModal, setLostModal] = useState<{
    id: string;
    name: string;
    prev: Opportunity;
  } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
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

  /* Directory maps for card display + filters. /api/users degrades to [] for
     non-admins (owners then fall back to a short UUID), consistent with the rest
     of the app. Both load once — they don't depend on the opp filters. */
  useEffect(() => {
    apiClient
      .get<AccountRow[]>('/api/comercial/accounts')
      .then(setAccounts)
      .catch(() => setAccounts([]));
    apiClient
      .get<UserOption[]>('/api/users')
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  const fetchOpps = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (accountFilter) params.set('accountId', accountFilter);
    if (ownerFilter) params.set('ownerId', ownerFilter);
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
  }, [accountFilter, ownerFilter]);

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
  const usersById = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => m.set(u.id, `${u.firstName} ${u.lastName}`.trim()));
    return m;
  }, [users]);

  // Owner filter options: the user directory when available, else the distinct
  // ownerIds present on the board (short UUIDs), so the filter is always usable.
  const ownerOptions = useMemo(() => {
    if (users.length)
      return users.map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}` }));
    const ids = Array.from(new Set(opps.map((o) => o.ownerId).filter(Boolean))) as string[];
    return ids.map((id) => ({ id, label: id.slice(0, 8) }));
  }, [users, opps]);

  const byStage = (stage: string) => opps.filter((o) => o.stage === stage);
  const columnSum = (stage: string) =>
    byStage(stage).reduce((acc, o) => acc + Number(o.estimatedValue ?? 0), 0);

  /* ── local optimistic helpers ── */
  const moveLocally = (id: string, stage: string) =>
    setOpps((cur) => cur.map((o) => (o.id === id ? { ...o, stage } : o)));
  const revert = (prev: Opportunity) =>
    setOpps((cur) => cur.map((o) => (o.id === prev.id ? prev : o)));
  const replaceOpp = (u: Opportunity) => setOpps((cur) => cur.map((o) => (o.id === u.id ? u : o)));

  /* commit a stage change to the canonical endpoint; revert + toast on any 4xx.
     The backend is the machine — the frontend never pre-validates beyond routing
     the drop to the right endpoint/dialog. */
  const commitStage = async (
    id: string,
    body: { stage: OpportunityStage; lostReason?: LostReason; lostReasonDetail?: string },
    prev: Opportunity,
  ) => {
    try {
      const updated = await apiClient.patch<Opportunity>(
        `/api/comercial/opportunities/${id}/stage`,
        body,
      );
      replaceOpp(updated);
    } catch (e) {
      revert(prev);
      setToast({
        msg: e instanceof ApiError ? e.message : 'No se pudo mover la oportunidad.',
        type: 'error',
      });
    }
  };

  /* The shared "attempt to move this opportunity to stage X" flow. BOTH a drag-drop
     and the "Mover a…" menu call this, so the two paths are guaranteed identical: the
     optimistic move + revert, the GANADA light confirm, the PERDIDA modal (cancel =
     nothing persists), and the canonical PATCH for active/EN_PAUSA targets all live
     here — never duplicated per entry-point. */
  const attemptMove = (opp: Opportunity, targetStage: OpportunityStage) => {
    if (opp.stage === targetStage || isClosedStage(opp.stage)) return;
    const prev = opp;
    moveLocally(opp.id, targetStage); // optimistic

    if (isActiveStage(targetStage) || targetStage === 'EN_PAUSA') {
      void commitStage(opp.id, { stage: targetStage }, prev);
    } else if (targetStage === 'GANADA') {
      if (window.confirm(`¿Marcar “${opp.name}” como ganada?`)) {
        void commitStage(opp.id, { stage: 'GANADA' }, prev);
      } else {
        revert(prev); // cancel reverts the card
      }
    } else if (targetStage === 'PERDIDA') {
      // Persist only on modal confirm; cancel reverts (nothing persists).
      setLostModal({ id: opp.id, name: opp.name, prev });
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
    );
    setLostModal(null);
  };
  const cancelLost = () => {
    if (lostModal) revert(lostModal.prev);
    setLostModal(null);
  };

  const reopen = async (opp: Opportunity, ev?: React.MouseEvent) => {
    ev?.stopPropagation();
    if (!window.confirm(`¿Reabrir “${opp.name}”? Volverá a Negociación.`)) return;
    try {
      const u = await apiClient.post<Opportunity>(`/api/comercial/opportunities/${opp.id}/reopen`);
      replaceOpp(u);
    } catch (e) {
      setToast({
        msg: e instanceof ApiError ? e.message : 'No se pudo reabrir la oportunidad.',
        type: 'error',
      });
    }
  };
  const resume = async (opp: Opportunity, ev?: React.MouseEvent) => {
    ev?.stopPropagation();
    try {
      const u = await apiClient.post<Opportunity>(`/api/comercial/opportunities/${opp.id}/resume`);
      replaceOpp(u);
    } catch (e) {
      setToast({
        msg: e instanceof ApiError ? e.message : 'No se pudo reanudar la oportunidad.',
        type: 'error',
      });
    }
  };

  /* ── header ── */
  const Header = (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Pipeline
        </h1>
      </div>
      {canCreate && !forbidden && (
        <button
          onClick={() => setNewModal(true)}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: '#2563eb' }}
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

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Board — horizontally scrollable. onDragOver drives the edge auto-scroll. */}
      <div ref={boardRef} onDragOver={onBoardDragOver} className="flex gap-4 overflow-x-auto pb-4">
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
                borderColor: over ? '#2563eb' : 'var(--border-color)',
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
                      <div className="mb-2 h-4 w-3/4 rounded bg-gray-200" />
                      <div className="h-3 w-1/2 rounded bg-gray-200" />
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
                      ? (usersById.get(o.ownerId) ?? o.ownerId.slice(0, 8))
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
                                onMove={(t) => attemptMove(o, t)}
                                onResume={() => resume(o)}
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
                            {o.expectedCloseDate ? formatDate(o.expectedCloseDate) : '—'}
                          </span>
                        </div>

                        {ownerName && (
                          <div className="mt-2 flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                            <UserIcon size={11} />
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
                              onClick={(ev) => resume(o, ev)}
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

      {newModal && (
        <NewOpportunityModal
          accounts={accounts as AccountOption[]}
          users={users}
          onClose={() => setNewModal(false)}
          onCreated={() => {
            setNewModal(false);
            fetchOpps();
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
