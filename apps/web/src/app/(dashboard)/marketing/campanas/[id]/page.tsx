'use client';

/* MKT-003 — Campaign detail. Datos section (all fields + status badge) and CURATED
 * status actions per current status (STATUS_ACTIONS — the backend machine allows more
 * edges; the UI deliberately offers this subset). Editing is disabled for closed
 * campaigns (FINALIZADA/CANCELADA) with a visible hint; the only way out is Reabrir.
 * Terminal actions (Finalizar/Cancelar/Eliminar) go behind window.confirm (the
 * platform convention). Backend 4xx messages are shown VERBATIM (already Spanish).
 * Write controls are role-gated via useCanWriteMarketing (ACCOUNTANT read-only).
 * Tokens: accent #2563eb, Outfit headings, glassmorphism. */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { apiClient, ApiError } from '../../../../../lib/api';
import { formatCLP } from '../../../../../lib/formatters';
import { useCanWriteMarketing } from '../../../../../hooks/useMarketingPermissions';
import {
  CampaignDerivedBadges,
  CampaignStatus,
  CampaignStatusBadge,
  CHANNEL_LABELS,
  formatCampaignDate,
  isClosedStatus,
  STATUS_ACTIONS,
  STATUS_LABELS,
} from '../../../../../components/marketing/campaignLabels';
import {
  CampaignFormModal,
  CampaignForForm,
} from '../../../../../components/marketing/CampaignFormModal';
import { CampaignExpenses } from '../../../../../components/marketing/CampaignExpenses';
import { CampaignRetorno } from '../../../../../components/marketing/CampaignRetorno';

interface Campaign {
  id: string;
  name: string;
  channel: string;
  status: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  budgetAmount: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // MKT-005 — derived at read time by the backend (never stored).
  spent: string;
  overBudget: boolean;
  endingSoon: boolean;
  // MKT-007 — ROI attribution (detail-only), computed live by Comercial's reader.
  attribution: { accountsCount: number; wonCount: number; wonNetAmount: string };
}

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const canWrite = useCanWriteMarketing('campaign');
  const canWriteExpenses = useCanWriteMarketing('marketingExpense');

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    apiClient
      .get<Campaign>(`/api/marketing/campaigns/${id}`)
      .then((data) => {
        setCampaign(data);
        setForbidden(false);
        setNotFound(false);
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

  const changeStatus = async (target: CampaignStatus, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setErr(null);
    setBusy(true);
    try {
      await apiClient.patch(`/api/marketing/campaigns/${id}/status`, { status: target });
      load();
    } catch (e) {
      // Surface the backend's Spanish message verbatim (e.g. activation without startDate).
      setErr(e instanceof ApiError ? e.message : 'No se pudo cambiar el estado.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('¿Eliminar esta campaña en borrador? Esta acción no se puede deshacer.'))
      return;
    setErr(null);
    setBusy(true);
    try {
      await apiClient.delete(`/api/marketing/campaigns/${id}`);
      router.push('/marketing/campanas');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo eliminar la campaña.');
      setBusy(false);
    }
  };

  if (loading)
    return <div className="pt-6 text-sm text-[var(--text-secondary)]">Cargando campaña…</div>;

  if (forbidden)
    return (
      <div className="pt-6">
        <p className="text-sm text-[var(--text-secondary)]">
          No tienes permiso para ver esta campaña.
        </p>
        <BackLink />
      </div>
    );

  if (notFound || !campaign)
    return (
      <div className="pt-6">
        <p className="text-sm text-[var(--text-secondary)]">Campaña no encontrada.</p>
        <BackLink />
      </div>
    );

  const closed = isClosedStatus(campaign.status);
  const actions = STATUS_ACTIONS[campaign.status] ?? [];

  return (
    <div className="pt-2">
      <Link
        href="/marketing/campanas"
        className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={13} /> Campañas
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
                {campaign.name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
                <CampaignStatusBadge status={campaign.status} />
                <span>·</span>
                <span>{CHANNEL_LABELS[campaign.channel] ?? campaign.channel}</span>
                <CampaignDerivedBadges
                  overBudget={campaign.overBudget}
                  endingSoon={campaign.endingSoon}
                />
              </div>
            </div>
          </div>
          {/* Editing is blocked for closed campaigns — the button is only rendered
              when the caller can write AND the campaign is not closed. */}
          {canWrite && !closed && (
            <button
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <Pencil size={14} /> Editar
            </button>
          )}
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* Datos */}
      <div className="space-y-4">
        <Card>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KV label="Estado" value={STATUS_LABELS[campaign.status] ?? campaign.status} />
            <KV label="Canal" value={CHANNEL_LABELS[campaign.channel] ?? campaign.channel} />
            <KV label="Presupuesto (neto)" value={budgetText(campaign.budgetAmount)} />
            <KV label="Fecha de inicio" value={formatCampaignDate(campaign.startDate)} />
            <KV label="Fecha de término" value={formatCampaignDate(campaign.endDate)} />
          </div>
          {campaign.description && (
            <div className="mt-4 border-t border-[var(--border-color)] pt-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                Descripción
              </p>
              <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                {campaign.description}
              </p>
            </div>
          )}
          {campaign.notes && (
            <div className="mt-4 border-t border-[var(--border-color)] pt-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                Notas
              </p>
              <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                {campaign.notes}
              </p>
            </div>
          )}
        </Card>

        {/* Gastos — budget bar + expenses table + CRUD (MKT-005). Reloads the campaign
            on mutation so the header badges + bar stay in sync with the derived spent. */}
        <CampaignExpenses
          campaignId={campaign.id}
          budgetAmount={campaign.budgetAmount}
          spent={campaign.spent}
          canWrite={canWriteExpenses}
          onChanged={load}
        />

        {/* Retorno (ROI) — below Gastos. Read-only; live attribution from Comercial. */}
        <CampaignRetorno attribution={campaign.attribution} spent={campaign.spent} />

        {/* Status actions (writers only) */}
        {canWrite && (
          <Card>
            <p className="mb-1 text-sm font-medium text-[var(--text-primary)]">
              Acciones de estado
            </p>
            {closed && (
              <p className="mb-3 text-xs text-[var(--text-secondary)]">
                Esta campaña está {STATUS_LABELS[campaign.status].toLowerCase()}. La edición está
                deshabilitada; reábrela para volver a modificarla.
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {actions.map((a) => (
                <button
                  key={a.target}
                  onClick={() => changeStatus(a.target, a.confirm)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
                  style={
                    a.danger
                      ? { borderColor: '#fecaca', color: '#b91c1c' }
                      : { borderColor: 'var(--border-color)', color: 'var(--text-primary)' }
                  }
                >
                  {a.label}
                </button>
              ))}
              {/* DELETE is BORRADOR-only (pristine draft); it is not a status transition. */}
              {campaign.status === 'BORRADOR' && (
                <button
                  onClick={remove}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
                  style={{ borderColor: '#fecaca', color: '#b91c1c' }}
                >
                  <Trash2 size={14} /> Eliminar
                </button>
              )}
            </div>
          </Card>
        )}
      </div>

      {editOpen && (
        <CampaignFormModal
          editing={toFormValue(campaign)}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function budgetText(amount: string | null): string {
  return amount != null ? formatCLP(amount) : '—';
}

function toFormValue(c: Campaign): CampaignForForm {
  return {
    id: c.id,
    name: c.name,
    channel: c.channel,
    description: c.description,
    startDate: c.startDate,
    endDate: c.endDate,
    budgetAmount: c.budgetAmount,
    notes: c.notes,
  };
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      {children}
    </div>
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
      href="/marketing/campanas"
      className="mt-2 inline-block text-sm"
      style={{ color: '#2563eb' }}
    >
      ← Volver a campañas
    </Link>
  );
}
