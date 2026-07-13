'use client';

/* MKT-003 — Campañas (campaigns) list. Mirrors the Comercial cuentas list: filters +
 * table + create/edit modal. Write controls are role-gated (useCanWriteMarketing);
 * ANALYST/VIEWER get a 403 from the list and see a clean "sin permiso" state.
 * Tokens: accent #2563eb, Outfit headings, glassmorphism. */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/api';
import { formatCLP } from '../../../../lib/formatters';
import { useCanWriteMarketing } from '../../../../hooks/useMarketingPermissions';
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_STATUSES,
  CampaignDerivedBadges,
  CampaignStatusBadge,
  CHANNEL_LABELS,
  formatCampaignDate,
  STATUS_LABELS,
} from '../../../../components/marketing/campaignLabels';
import {
  CampaignFormModal,
  CampaignForForm,
} from '../../../../components/marketing/CampaignFormModal';

interface CampaignRow {
  id: string;
  name: string;
  channel: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  budgetAmount: string | null;
  description: string | null;
  notes: string | null;
  updatedAt: string;
  // MKT-005 — derived at read time by the backend (never stored).
  spent: string;
  overBudget: boolean;
  endingSoon: boolean;
}

export default function CampanasPage() {
  const router = useRouter();
  const canWrite = useCanWriteMarketing('campaign');
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignForForm | null>(null);

  const fetchCampaigns = useCallback(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (channelFilter) params.set('channel', channelFilter);
    const qs = params.toString();
    apiClient
      .get<CampaignRow[]>(`/api/marketing/campaigns${qs ? `?${qs}` : ''}`)
      .then((data) => {
        setRows(data);
        setError(null);
        setForbidden(false);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setForbidden(true);
        else setError('No se pudieron cargar las campañas.');
      })
      .finally(() => setIsLoading(false));
  }, [statusFilter, channelFilter]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const Header = (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Campañas
        </h1>
      </div>
      {canWrite && !forbidden && (
        <button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: '#2563eb' }}
        >
          <Plus size={16} /> Nueva campaña
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
            No tienes permiso para ver el módulo Marketing.
          </p>
        </div>
      </div>
    );
  }

  const cols = canWrite ? 7 : 6;

  return (
    <div className="pt-2">
      {Header}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          <option value="">Todos los estados</option>
          {CAMPAIGN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          <option value="">Todos los canales</option>
          {CAMPAIGN_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border-color)] bg-gray-50">
            <tr>
              {['Nombre', 'Canal', 'Estado', 'Inicio', 'Término', 'Presupuesto'].map((h) => (
                <th
                  key={h}
                  className="label px-4 py-3 text-left text-[11px] uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  {h}
                </th>
              ))}
              {canWrite && (
                <th className="label px-4 py-3 text-right text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: cols }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-24 rounded bg-gray-200" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={cols}
                  className="px-4 py-10 text-center text-sm text-[var(--text-secondary)]"
                >
                  No hay campañas registradas.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer hover:bg-black/[0.02]"
                  onClick={() => router.push(`/marketing/campanas/${c.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{c.name}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {CHANNEL_LABELS[c.channel] ?? c.channel}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CampaignStatusBadge status={c.status} />
                      <CampaignDerivedBadges overBudget={c.overBudget} endingSoon={c.endingSoon} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {formatCampaignDate(c.startDate)}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {formatCampaignDate(c.endDate)}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {c.budgetAmount != null ? formatCLP(c.budgetAmount) : '—'}
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setEditing({
                              id: c.id,
                              name: c.name,
                              channel: c.channel,
                              description: c.description,
                              startDate: c.startDate,
                              endDate: c.endDate,
                              budgetAmount: c.budgetAmount,
                              notes: c.notes,
                            });
                            setModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                          <Pencil size={13} /> Editar
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <CampaignFormModal
          editing={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            fetchCampaigns();
          }}
        />
      )}
    </div>
  );
}
