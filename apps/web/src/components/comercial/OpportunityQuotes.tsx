'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Lock,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { formatCLP, formatDate } from '../../lib/formatters';
import { QUOTE_STATUS_LABELS, QuoteStatusBadge, isTerminalQuote } from './quoteLabels';
import { QuoteLineModal } from './QuoteLineModal';
import { SendQuoteModal } from './SendQuoteModal';
import type { CatalogService, LineForForm } from './ServiceLineModal';

/* COM-011 — "Cotizaciones": the quote lifecycle on screen (COM-010 backend). Self-
   loading. The backend owns every rule; this UI renders states and relays 4xx messages.
   Two — and only two — client-side UX guards: the empty-bundle disable on "Nueva
   cotización" and the ask-for-validUntil-on-send mini-modal. Ability-driven: writers
   (canWrite = quote.update) get lifecycle controls; ACCOUNTANT sees the full history +
   money block, read-only. Accepting does NOT auto-move the opportunity to GANADA — the
   UI nudges toward the existing stage actions instead. */

interface Quote {
  id: string;
  quoteNumber: string;
  version: number;
  status: string;
  validUntil: string | null;
  netAmount: string;
  taxAmount: string;
  totalAmount: string;
  taxRate: string;
  notes: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
interface QuoteLine {
  id: string;
  serviceId: string;
  serviceName: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  notes: string | null;
}
interface QuoteDetail extends Quote {
  lines: QuoteLine[];
}

function relevantDate(q: Quote): { label: string; date: string | null } {
  if (q.status === 'ACEPTADA') return { label: 'Aceptada', date: q.acceptedAt };
  if (q.status === 'RECHAZADA') return { label: 'Rechazada', date: q.rejectedAt };
  if (q.status === 'ENVIADA' || q.status === 'SUPERSEDIDA')
    return { label: 'Enviada', date: q.sentAt };
  return { label: 'Creada', date: q.createdAt };
}

export function OpportunityQuotes({
  opportunityId,
  canWrite,
  canCreate,
  oppClosed,
  onQuotesChanged,
}: {
  opportunityId: string;
  canWrite: boolean; // quote.update — lifecycle controls
  canCreate: boolean; // quote.create — "Nueva cotización"
  oppClosed: boolean;
  onQuotesChanged?: (hasQuotes: boolean) => void;
}) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [bundleEmpty, setBundleEmpty] = useState<boolean | null>(null);
  const [catalog, setCatalog] = useState<CatalogService[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QuoteDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nudge, setNudge] = useState<string | null>(null);
  const [lineModal, setLineModal] = useState<{ editing: LineForForm | null } | null>(null);
  const [sendModal, setSendModal] = useState<{ id: string; number: string } | null>(null);

  // Report quote existence to the parent (delete-opportunity seam) without dep churn.
  const reportRef = useRef(onQuotesChanged);
  reportRef.current = onQuotesChanged;

  const loadQuotes = useCallback(async () => {
    const [qs, bundle] = await Promise.all([
      apiClient.get<Quote[]>(`/api/comercial/opportunities/${opportunityId}/quotes`),
      apiClient
        .get<{ id: string }[]>(`/api/comercial/opportunities/${opportunityId}/services`)
        .catch(() => [] as { id: string }[]),
    ]);
    setQuotes(qs);
    setBundleEmpty(bundle.length === 0);
    reportRef.current?.(qs.length > 0);
  }, [opportunityId]);

  const load = useCallback(async () => {
    setState('loading');
    try {
      await loadQuotes();
      apiClient
        .get<CatalogService[]>('/api/comercial/service-catalog?active=true')
        .then(setCatalog)
        .catch(() => setCatalog([]));
      setState('ok');
    } catch {
      // Within this page the reader already passed the opp 403 gate, so a quotes
      // failure here is a transient/load error, not a permission wall.
      setState('error');
    }
  }, [loadQuotes]);

  useEffect(() => {
    load();
  }, [load]);

  const reloadDetail = useCallback(
    async (id?: string) => {
      const qid = id ?? expandedId;
      if (!qid) return;
      try {
        const d = await apiClient.get<QuoteDetail>(`/api/comercial/quotes/${qid}`);
        setDetail(d);
      } catch {
        /* keep the stale detail; the list still refreshes */
      }
    },
    [expandedId],
  );

  const expand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await apiClient.get<QuoteDetail>(`/api/comercial/quotes/${id}`);
      setDetail(d);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  /* ── lifecycle actions ── */
  const create = async () => {
    setErr(null);
    setNudge(null);
    setBusy(true);
    try {
      const q = await apiClient.post<Quote>(
        `/api/comercial/opportunities/${opportunityId}/quotes`,
        {},
      );
      await loadQuotes();
      setExpandedId(q.id);
      await reloadDetail(q.id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo crear la cotización.');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (quoteId: string, status: string) => {
    setErr(null);
    setNudge(null);
    setBusy(true);
    try {
      await apiClient.patch(`/api/comercial/quotes/${quoteId}/status`, { status });
      if (status === 'ACEPTADA') {
        setNudge(
          'Cotización aceptada. La oportunidad puede marcarse como Ganada con las acciones de etapa de arriba.',
        );
      }
      await loadQuotes();
      await reloadDetail(quoteId);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo actualizar la cotización.');
    } finally {
      setBusy(false);
    }
  };

  const send = (q: Quote) => {
    if (q.validUntil) {
      if (!window.confirm(`¿Enviar ${q.quoteNumber}? Quedará inmutable.`)) return;
      changeStatus(q.id, 'ENVIADA');
    } else {
      setSendModal({ id: q.id, number: q.quoteNumber });
    }
  };
  const accept = (q: Quote) => {
    if (window.confirm(`¿Marcar ${q.quoteNumber} como aceptada?`)) changeStatus(q.id, 'ACEPTADA');
  };
  const reject = (q: Quote) => {
    if (window.confirm(`¿Marcar ${q.quoteNumber} como rechazada?`)) changeStatus(q.id, 'RECHAZADA');
  };
  const deleteDraft = async (q: Quote) => {
    if (!window.confirm(`¿Eliminar el borrador ${q.quoteNumber}?`)) return;
    setErr(null);
    setBusy(true);
    try {
      await apiClient.delete(`/api/comercial/quotes/${q.id}`);
      if (expandedId === q.id) {
        setExpandedId(null);
        setDetail(null);
      }
      await loadQuotes();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo eliminar el borrador.');
    } finally {
      setBusy(false);
    }
  };
  const removeLine = async (quoteId: string, line: QuoteLine) => {
    if (!window.confirm(`¿Quitar “${line.serviceName}” de la cotización?`)) return;
    setErr(null);
    try {
      await apiClient.delete(`/api/comercial/quotes/${quoteId}/lines/${line.id}`);
      await reloadDetail(quoteId);
      await loadQuotes();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo quitar el servicio.');
    }
  };

  const afterLineSaved = async () => {
    setLineModal(null);
    if (expandedId) {
      await reloadDetail(expandedId);
      await loadQuotes();
    }
  };

  const createDisabled = busy || bundleEmpty === true;

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2
          className="text-sm font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Cotizaciones
        </h2>
        {canCreate && !oppClosed && (
          <div className="flex flex-col items-end">
            <button
              onClick={create}
              disabled={createDisabled}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: '#2563eb' }}
            >
              <Plus size={15} /> Nueva cotización
            </button>
            {bundleEmpty === true && (
              <span className="mt-1 text-[11px] text-[var(--text-secondary)]">
                Agregá servicios al paquete primero
              </span>
            )}
          </div>
        )}
      </div>

      {nudge && (
        <div className="mb-3 flex items-start justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={15} /> {nudge}
          </span>
          <button onClick={() => setNudge(null)} className="shrink-0 text-green-700">
            <X size={15} />
          </button>
        </div>
      )}
      {err && (
        <div className="mb-3 flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{err}</span>
          <button onClick={() => setErr(null)} className="shrink-0 text-red-600">
            <X size={15} />
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        {state === 'loading' ? (
          <p className="p-5 text-sm text-[var(--text-secondary)]">Cargando cotizaciones…</p>
        ) : state === 'error' ? (
          <p className="p-5 text-sm text-red-600">No se pudieron cargar las cotizaciones.</p>
        ) : quotes.length === 0 ? (
          <p className="p-5 text-sm text-[var(--text-secondary)]">
            Aún no hay cotizaciones para esta oportunidad.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border-color)]">
            {quotes.map((q) => {
              const isOpen = expandedId === q.id;
              const rd = relevantDate(q);
              const accepted = q.status === 'ACEPTADA';
              return (
                <li key={q.id}>
                  {/* Row header (clickable to expand) */}
                  <div
                    onClick={() => expand(q.id)}
                    className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-black/[0.02]"
                    style={
                      accepted
                        ? { borderLeft: '3px solid #15803d', background: 'rgba(34,197,94,0.04)' }
                        : undefined
                    }
                  >
                    {isOpen ? (
                      <ChevronDown size={15} className="text-[var(--text-secondary)]" />
                    ) : (
                      <ChevronRight size={15} className="text-[var(--text-secondary)]" />
                    )}
                    <span className="font-medium text-[var(--text-primary)]">{q.quoteNumber}</span>
                    <span className="text-xs text-[var(--text-secondary)]">v{q.version}</span>
                    <QuoteStatusBadge status={q.status} />
                    <span className="ml-auto font-medium text-[var(--text-primary)]">
                      {formatCLP(q.totalAmount)}
                    </span>
                    <span className="w-full text-xs text-[var(--text-secondary)] sm:w-auto sm:pl-2">
                      Válida: {q.validUntil ? formatDate(q.validUntil) : '—'}
                      {rd.date && (
                        <>
                          {' · '}
                          {rd.label}: {formatDate(rd.date)}
                        </>
                      )}
                    </span>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="border-t border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-4">
                      {detailLoading || !detail ? (
                        <p className="text-sm text-[var(--text-secondary)]">Cargando detalle…</p>
                      ) : (
                        <QuoteDetailPanel
                          detail={detail}
                          canWrite={canWrite}
                          busy={busy}
                          onAddLine={() => setLineModal({ editing: null })}
                          onEditLine={(l) =>
                            setLineModal({
                              editing: {
                                id: l.id,
                                serviceId: l.serviceId,
                                serviceName: l.serviceName,
                                quantity: l.quantity,
                                unitPrice: l.unitPrice,
                                notes: l.notes,
                              },
                            })
                          }
                          onRemoveLine={(l) => removeLine(q.id, l)}
                          onMetaSaved={async () => {
                            await reloadDetail(q.id);
                            await loadQuotes();
                          }}
                          onSend={() => send(q)}
                          onAccept={() => accept(q)}
                          onReject={() => reject(q)}
                          onDelete={() => deleteDraft(q)}
                        />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {lineModal && expandedId && (
        <QuoteLineModal
          quoteId={expandedId}
          editing={lineModal.editing}
          catalog={catalog}
          onClose={() => setLineModal(null)}
          onSaved={afterLineSaved}
        />
      )}
      {sendModal && (
        <SendQuoteModal
          quoteId={sendModal.id}
          quoteNumber={sendModal.number}
          onCancel={() => setSendModal(null)}
          onSent={async () => {
            const sid = sendModal.id; // explicit — don't rely on the expandedId closure
            setSendModal(null);
            await loadQuotes();
            await reloadDetail(sid);
          }}
        />
      )}
    </div>
  );
}

/* ── the expanded panel: lines + money block + notes/dates + lifecycle actions ── */
function QuoteDetailPanel({
  detail,
  canWrite,
  busy,
  onAddLine,
  onEditLine,
  onRemoveLine,
  onMetaSaved,
  onSend,
  onAccept,
  onReject,
  onDelete,
}: {
  detail: QuoteDetail;
  canWrite: boolean;
  busy: boolean;
  onAddLine: () => void;
  onEditLine: (l: QuoteLine) => void;
  onRemoveLine: (l: QuoteLine) => void;
  onMetaSaved: () => void;
  onSend: () => void;
  onAccept: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  const isDraft = detail.status === 'BORRADOR';
  const isSent = detail.status === 'ENVIADA';
  const editable = canWrite && isDraft;

  return (
    <div className="space-y-4">
      {/* Lines */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
            Servicios
          </p>
          {editable && (
            <button
              onClick={onAddLine}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <Plus size={12} /> Agregar
            </button>
          )}
        </div>
        {detail.lines.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">La cotización no tiene servicios.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--border-color)]">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border-color)] bg-black/[0.02]">
                <tr>
                  {['Servicio', 'Cantidad', 'Precio unit.', 'Subtotal'].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--text-secondary)]"
                    >
                      {h}
                    </th>
                  ))}
                  {editable && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {detail.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                      {l.serviceName}
                      {l.notes && (
                        <span className="ml-2 text-[11px] font-normal text-[var(--text-secondary)]">
                          — {l.notes}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{Number(l.quantity)}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">
                      {formatCLP(l.unitPrice)}
                    </td>
                    <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                      {formatCLP(l.lineTotal)}
                    </td>
                    {editable && (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onEditLine(l)}
                            className="rounded-md border border-[var(--border-color)] p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            title="Editar"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => onRemoveLine(l)}
                            className="rounded-md border border-[var(--border-color)] p-1 text-red-600 hover:bg-red-50"
                            title="Quitar"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isSent && (
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            <Lock size={11} /> Cotización enviada: es un documento inmutable.
          </p>
        )}
      </div>

      {/* Money block — the PERSISTED amounts, never recomputed client-side */}
      <div className="flex justify-end">
        <div className="w-full max-w-xs space-y-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-3 text-sm">
          <Row label="Neto" value={formatCLP(detail.netAmount)} />
          <Row label={`IVA (${Number(detail.taxRate)}%)`} value={formatCLP(detail.taxAmount)} />
          <div className="border-t border-[var(--border-color)] pt-1">
            <Row label="Total" value={formatCLP(detail.totalAmount)} bold />
          </div>
        </div>
      </div>

      {/* Draft meta editor / read-only notes + dates */}
      {editable ? (
        <DraftMetaEditor
          quoteId={detail.id}
          initialValidUntil={detail.validUntil}
          initialNotes={detail.notes}
          onSaved={onMetaSaved}
        />
      ) : (
        detail.notes && (
          <div className="rounded-lg border border-[var(--border-color)] p-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Notas
            </p>
            <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{detail.notes}</p>
          </div>
        )
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
        <span>Estado: {QUOTE_STATUS_LABELS[detail.status] ?? detail.status}</span>
        {detail.sentAt && <span>· Enviada {formatDate(detail.sentAt)}</span>}
        {detail.acceptedAt && <span>· Aceptada {formatDate(detail.acceptedAt)}</span>}
        {detail.rejectedAt && <span>· Rechazada {formatDate(detail.rejectedAt)}</span>}
      </div>

      {/* Lifecycle actions (writers only) */}
      {canWrite && (isDraft || isSent) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-color)] pt-3">
          {isDraft && (
            <>
              <button
                onClick={onSend}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                style={{ background: '#2563eb' }}
              >
                <Send size={14} /> Enviar
              </button>
              <button
                onClick={onDelete}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                <Trash2 size={14} /> Eliminar borrador
              </button>
            </>
          )}
          {isSent && (
            <>
              <button
                onClick={onAccept}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                style={{ background: '#15803d' }}
              >
                <CheckCircle2 size={14} /> Marcar aceptada
              </button>
              <button
                onClick={onReject}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                <X size={14} /> Marcar rechazada
              </button>
            </>
          )}
        </div>
      )}
      {canWrite && isTerminalQuote(detail.status) && (
        <p className="border-t border-[var(--border-color)] pt-3 text-xs text-[var(--text-secondary)]">
          Documento en estado final: sin más acciones.
        </p>
      )}
    </div>
  );
}

function DraftMetaEditor({
  quoteId,
  initialValidUntil,
  initialNotes,
  onSaved,
}: {
  quoteId: string;
  initialValidUntil: string | null;
  initialNotes: string | null;
  onSaved: () => void;
}) {
  const toInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
  const [validUntil, setValidUntil] = useState(toInput(initialValidUntil));
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty = validUntil !== toInput(initialValidUntil) || notes !== (initialNotes ?? '');

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await apiClient.patch(`/api/comercial/quotes/${quoteId}`, {
        validUntil: validUntil || null,
        notes: notes.trim() || undefined,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const INPUT =
    'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';
  return (
    <div className="rounded-lg border border-[var(--border-color)] p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
            Válida hasta
          </label>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
            Notas
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={1}
            className={INPUT}
          />
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-2 flex justify-end">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar validez / notas'}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span
        className={bold ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}
      >
        {value}
      </span>
    </div>
  );
}

export default OpportunityQuotes;
