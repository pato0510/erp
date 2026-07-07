'use client';

/* COM-007b — the opportunity detail: the deal's operating center. Header + stage
 * actions (Pausar/Reanudar/Reabrir, canonical COM-005 endpoints), the read-only
 * fields, the "Servicios" bundle editor (COM-006), the Actividad timeline (COM-008),
 * and a Delete danger zone (COM-005 DELETE). ALL rules live in the backend — the UI
 * renders them and relays their 4xx messages, never re-implements them. Ability-driven
 * via /comercial/permissions. Tokens: accent #2563eb, Outfit headings, glass cards. */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pause, Play, RotateCcw, Trash2 } from 'lucide-react';
import { apiClient, ApiError } from '../../../../../lib/api';
import { formatCLP, formatDate } from '../../../../../lib/formatters';
import { useComercialPermissions } from '../../../../../hooks/useCanWrite';
import {
  isActiveStage,
  isClosedStage,
  LOST_REASON_LABELS,
  StageBadge,
} from '../../../../../components/comercial/stageLabels';
import { ActivityTimeline } from '../../../../../components/comercial/ActivityTimeline';
import { OpportunityBundle } from '../../../../../components/comercial/OpportunityBundle';
import { OpportunityQuotes } from '../../../../../components/comercial/OpportunityQuotes';
import { DeleteOpportunityModal } from '../../../../../components/comercial/DeleteOpportunityModal';

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
  createdAt: string;
  updatedAt: string;
}
interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
}

export default function OpportunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const perms = useComercialPermissions();
  const canWrite = perms?.opportunity.update ?? false;
  const quoteCanWrite = perms?.quote.update ?? false;
  const quoteCanCreate = perms?.quote.create ?? false;

  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // COM-011 — the quotes section reports whether any quote exists, so the delete
  // danger zone can pre-empt the backend 409 (an opp with quotes can't be deleted).
  const [quotesExist, setQuotesExist] = useState(false);
  const handleQuotesChanged = useCallback((has: boolean) => setQuotesExist(has), []);

  /* Re-fetch ONLY the opportunity — used after a bundle mutation, whose derived
     estimatedValue must be reflected in the header/value display. */
  const refreshOpp = useCallback(() => {
    apiClient
      .get<Opportunity>(`/api/comercial/opportunities/${id}`)
      .then(setOpp)
      .catch(() => undefined);
  }, [id]);

  const load = useCallback(() => {
    apiClient
      .get<Opportunity>(`/api/comercial/opportunities/${id}`)
      .then((data) => {
        setOpp(data);
        setForbidden(false);
        setNotFound(false);
        apiClient
          .get<{ name: string }>(`/api/comercial/accounts/${data.accountId}`)
          .then((a) => setAccountName(a.name))
          .catch(() => setAccountName(null));
        if (data.ownerId) {
          apiClient
            .get<UserOption[]>('/api/users')
            .then((us) => {
              const u = us.find((x) => x.id === data.ownerId);
              setOwnerName(u ? `${u.firstName} ${u.lastName}` : data.ownerId!.slice(0, 8));
            })
            .catch(() => setOwnerName(data.ownerId!.slice(0, 8)));
        }
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setForbidden(true);
        else setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<Opportunity>) => {
    setBusy(true);
    setErr(null);
    try {
      const u = await fn();
      setOpp(u);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo actualizar la etapa.');
    } finally {
      setBusy(false);
    }
  };

  const pausar = () =>
    act(() =>
      apiClient.patch<Opportunity>(`/api/comercial/opportunities/${id}/stage`, {
        stage: 'EN_PAUSA',
      }),
    );
  const reanudar = () =>
    act(() => apiClient.post<Opportunity>(`/api/comercial/opportunities/${id}/resume`));
  const reabrir = () => {
    if (!opp || !window.confirm(`¿Reabrir “${opp.name}”? Volverá a Negociación.`)) return;
    act(() => apiClient.post<Opportunity>(`/api/comercial/opportunities/${id}/reopen`));
  };

  if (loading)
    return <div className="pt-6 text-sm text-[var(--text-secondary)]">Cargando oportunidad…</div>;
  if (forbidden)
    return (
      <div className="pt-6">
        <p className="text-sm text-[var(--text-secondary)]">
          No tienes permiso para ver esta oportunidad.
        </p>
        <BackLink />
      </div>
    );
  if (notFound || !opp)
    return (
      <div className="pt-6">
        <p className="text-sm text-[var(--text-secondary)]">Oportunidad no encontrada.</p>
        <BackLink />
      </div>
    );

  return (
    <div className="pt-2">
      <Link
        href="/comercial/pipeline"
        className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={13} /> Pipeline
      </Link>

      {/* Header */}
      <div className="mb-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="h-7 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
            <div>
              <h1
                className="text-xl font-semibold text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
              >
                {opp.name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
                <StageBadge stage={opp.stage} />
                <span>·</span>
                {opp.accountId ? (
                  <Link
                    href={`/comercial/cuentas/${opp.accountId}`}
                    className="hover:text-[var(--text-primary)]"
                    style={{ color: '#2563eb' }}
                  >
                    {accountName ?? 'Ver cuenta'}
                  </Link>
                ) : (
                  <span>—</span>
                )}
              </div>
            </div>
          </div>

          {/* Stage actions (writers only) */}
          {canWrite && (
            <div className="flex flex-wrap items-center gap-2">
              {isActiveStage(opp.stage) && (
                <ActionButton onClick={pausar} disabled={busy} icon={<Pause size={14} />}>
                  Pausar
                </ActionButton>
              )}
              {opp.stage === 'EN_PAUSA' && (
                <ActionButton onClick={reanudar} disabled={busy} icon={<Play size={14} />}>
                  Reanudar
                </ActionButton>
              )}
              {isClosedStage(opp.stage) && (
                <ActionButton onClick={reabrir} disabled={busy} icon={<RotateCcw size={14} />}>
                  Reabrir
                </ActionButton>
              )}
            </div>
          )}
        </div>
        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      </div>

      {/* Read-only fields */}
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KV
            label="Valor estimado"
            value={opp.estimatedValue != null ? formatCLP(opp.estimatedValue) : '—'}
          />
          <KV
            label="Cierre estimado"
            value={opp.expectedCloseDate ? formatDate(opp.expectedCloseDate) : '—'}
          />
          <KV label="Probabilidad" value={opp.probability != null ? `${opp.probability}%` : '—'} />
          <KV label="Responsable" value={ownerName ?? '—'} />
          <KV label="Cerrada" value={opp.closedAt ? formatDate(opp.closedAt) : '—'} />
          <KV label="Actualizada" value={formatDate(opp.updatedAt)} />
        </div>

        {isClosedStage(opp.stage) && opp.lostReason && (
          <div className="mt-4 border-t border-[var(--border-color)] pt-4">
            <KV
              label="Motivo de pérdida"
              value={
                (LOST_REASON_LABELS[opp.lostReason] ?? opp.lostReason) +
                (opp.lostReasonDetail ? ` — ${opp.lostReasonDetail}` : '')
              }
            />
          </div>
        )}

        {opp.notes && (
          <div className="mt-4 border-t border-[var(--border-color)] pt-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Notas
            </p>
            <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{opp.notes}</p>
          </div>
        )}
      </div>

      {/* COM-007b — service bundle (COM-006). Editable for writers on non-closed deals;
          closed deals show it frozen. Refreshing the opp keeps the header value in sync
          with the derived total. */}
      <OpportunityBundle
        opportunityId={opp.id}
        canEdit={canWrite && !isClosedStage(opp.stage)}
        closed={isClosedStage(opp.stage)}
        onChanged={refreshOpp}
      />

      {/* COM-011 — quotes lifecycle (COM-010 backend). Writers get create/edit/send/
          accept/reject/delete; ACCOUNTANT sees the full history read-only. Reports quote
          existence up so the delete danger zone can pre-empt the 409. */}
      <OpportunityQuotes
        opportunityId={opp.id}
        canWrite={quoteCanWrite}
        canCreate={quoteCanCreate}
        oppClosed={isClosedStage(opp.stage)}
        onQuotesChanged={handleQuotesChanged}
      />

      {/* COM-008 — this opportunity's activity timeline. New entries derive the account
          (not asked). */}
      <div className="mt-4">
        <h2
          className="mb-3 text-sm font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Actividad
        </h2>
        <ActivityTimeline scope="opportunity" scopeId={opp.id} canWrite={canWrite} />
      </div>

      {/* COM-007b — Delete danger zone (writers only). Hidden entirely for a closed
          deal, which shows a historical note instead (reopen above to enable delete).
          Delete lives ONLY here — never on the kanban cards. */}
      {canWrite && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50/40 p-5">
          <h2 className="text-sm font-semibold text-red-700">Zona de peligro</h2>
          {isClosedStage(opp.stage) ? (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Las oportunidades cerradas son un registro histórico. Reábrela primero si necesitas
              eliminarla.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-[var(--text-secondary)]">
                  Eliminar la oportunidad y su paquete de servicios. Las actividades permanecen en
                  la cuenta.
                </p>
                {quotesExist && (
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    La oportunidad tiene cotizaciones (documentos comerciales); elimina los
                    borradores o conserva el historial antes de eliminarla.
                  </p>
                )}
              </div>
              <button
                onClick={() => setDeleteOpen(true)}
                disabled={quotesExist}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ background: '#b91c1c' }}
              >
                <Trash2 size={15} /> Eliminar oportunidad
              </button>
            </div>
          )}
        </div>
      )}

      {deleteOpen && (
        <DeleteOpportunityModal
          opportunity={{ id: opp.id, name: opp.name }}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            try {
              sessionStorage.setItem('comercial.flash', 'Oportunidad eliminada.');
            } catch {
              /* sessionStorage unavailable — navigate without the flash */
            }
            router.push('/comercial/pipeline');
          }}
        />
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  icon,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60"
    >
      {icon} {children}
    </button>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </p>
      <p className="text-sm text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/comercial/pipeline"
      className="mt-2 inline-block text-sm"
      style={{ color: '#2563eb' }}
    >
      ← Volver al pipeline
    </Link>
  );
}
