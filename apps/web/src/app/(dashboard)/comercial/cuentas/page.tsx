'use client';

/* COM-004b — Cuentas (accounts) list. Self-contained: filters + table + create/
 * edit modal + soft-deactivate. Clones the RRHH cargos table markup and the
 * standard modal overlay. Write controls are role-gated (useCanWrite); ANALYST/
 * VIEWER get a 403 from the list and see a clean "sin permiso" state. Tokens:
 * accent #2563eb, Outfit headings.
 * COM-018 — columns: Nombre de la cuenta · Empresa · Estado · Prioridad · Responsable ·
 * Creado · Último movimiento (DERIVED by the API, "—" when null; no server-side sort on
 * it in V1). "Empresa" filter (all / sin empresa / one). Row click (or Enter/Space on the
 * focused row, aria-expanded) toggles an inline accordion with the account's activities
 * (ActivityTimeline scope="account", lazy on first open, one row open at a time) and a
 * "Ver cuenta" link; the ficha is no longer the row's click target. */
import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Ban, ChevronDown, ChevronRight, ExternalLink, Link2, Pencil, Plus } from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/api';
import { formatDate } from '../../../../lib/formatters';
import { useCanWrite } from '../../../../hooks/useCanWrite';
import {
  ACCOUNT_STATUSES,
  PRIORITIES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  StatusBadge,
} from '../../../../components/comercial/accountLabels';
import { AccountFormModal } from '../../../../components/comercial/AccountFormModal';
import { ActivityTimeline } from '../../../../components/comercial/ActivityTimeline';
import { EnterpriseSelect, NO_ENTERPRISE } from '../../../../components/comercial/EnterpriseSelect';

interface AccountRow {
  id: string;
  name: string;
  status: string;
  priority: string;
  industry: string | null;
  commercialRisk: string | null;
  paymentTermDays: number; // COM-014 — feeds AccountFormModal's edit form
  ownerId: string | null;
  counterpartyId: string | null;
  sourceCampaignId: string | null; // MKT-006 — feeds AccountFormModal's "Campaña de origen"
  enterpriseId: string | null; // COM-018 — feeds AccountFormModal's "Empresa"
  enterprise: { id: string; name: string } | null; // COM-018 — included by the list
  lastMovementAt: string | null; // COM-018 — derived by the API, never stored
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS = [
  'Nombre de la cuenta',
  'Empresa',
  'Estado',
  'Prioridad',
  'Responsable',
  'Creado',
  'Último movimiento',
];

export default function CuentasPage() {
  const canWrite = useCanWrite();
  // COM-018 — the accordion's timeline gates Registrar/Editar/Eliminar on the activity flags.
  const canWriteActivity = useCanWrite('activity');
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [enterpriseFilter, setEnterpriseFilter] = useState(''); // '' | NO_ENTERPRISE | id
  const [expandedId, setExpandedId] = useState<string | null>(null); // one row open at a time
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);

  const fetchAccounts = useCallback(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (priorityFilter) params.set('priority', priorityFilter);
    if (search.trim()) params.set('search', search.trim());
    if (enterpriseFilter === NO_ENTERPRISE) params.set('noEnterprise', 'true');
    else if (enterpriseFilter) params.set('enterpriseId', enterpriseFilter);
    const qs = params.toString();
    apiClient
      .get<AccountRow[]>(`/api/comercial/accounts${qs ? `?${qs}` : ''}`)
      .then((data) => {
        setRows(data);
        setError(null);
        setForbidden(false);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setForbidden(true);
        else setError('No se pudieron cargar las cuentas.');
      })
      .finally(() => setIsLoading(false));
  }, [statusFilter, priorityFilter, search, enterpriseFilter]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const toggleRow = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

  const deactivate = async (a: AccountRow, ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (!window.confirm(`¿Desactivar la cuenta "${a.name}"? Pasará a estado Inactiva.`)) return;
    try {
      await apiClient.delete(`/api/comercial/accounts/${a.id}`);
      fetchAccounts();
    } catch {
      window.alert('No se pudo desactivar la cuenta.');
    }
  };

  const Header = (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Cuentas
        </h1>
      </div>
      {canWrite && !forbidden && (
        <button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: 'var(--color-accent)' }}
        >
          <Plus size={16} /> Nueva cuenta
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
            No tienes permiso para ver el módulo Comercial.
          </p>
        </div>
      </div>
    );
  }

  const cols = COLUMNS.length + (canWrite ? 1 : 0);

  return (
    <div className="pt-2">
      {Header}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre…"
          className="min-w-[220px] flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          <option value="">Todos los estados</option>
          {ACCOUNT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          <option value="">Todas las prioridades</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        {/* COM-018 — "Empresa" filter: Todas / Sin empresa (→ noEnterprise=true) / one. */}
        <EnterpriseSelect
          mode="filter"
          value={enterpriseFilter}
          onChange={setEnterpriseFilter}
          className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border-color)] bg-subtle">
            <tr>
              {COLUMNS.map((h) => (
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
                      <div className="h-4 w-24 rounded bg-subtle-hover" />
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
                  No hay cuentas registradas.
                </td>
              </tr>
            ) : (
              rows.map((a) => {
                const expanded = expandedId === a.id;
                const panelId = `account-activities-${a.id}`;
                return (
                  <Fragment key={a.id}>
                    <tr
                      role="button"
                      tabIndex={0}
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      className="cursor-pointer hover:bg-black/[0.02] focus:outline-none focus-visible:bg-subtle"
                      onClick={() => toggleRow(a.id)}
                      onKeyDown={(e) => {
                        // Only when the ROW itself is focused — buttons inside keep their own keys.
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleRow(a.id);
                        }
                      }}
                    >
                      <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                        <span className="inline-flex items-center gap-2">
                          <span className="text-[var(--text-secondary)]" aria-hidden="true">
                            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                          {a.name}
                          {a.counterpartyId && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]"
                              style={{
                                background: 'rgba(37,99,235,0.1)',
                                color: 'var(--color-accent)',
                              }}
                              title="Vinculada a un tercero de Finanzas (facturable)"
                            >
                              <Link2 size={10} />
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {a.enterprise?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {PRIORITY_LABELS[a.priority] ?? a.priority}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {a.ownerId ? (
                          <span className="font-mono text-[11px]" title={a.ownerId}>
                            {a.ownerId.slice(0, 8)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {formatDate(a.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {a.lastMovementAt ? formatDate(a.lastMovementAt) : '—'}
                      </td>
                      {canWrite && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setEditing(a);
                                setModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            >
                              <Pencil size={13} /> Editar
                            </button>
                            {a.status !== 'INACTIVA' && (
                              <button
                                onClick={(ev) => deactivate(a, ev)}
                                className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                              >
                                <Ban size={13} /> Desactivar
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                    {/* COM-018 — inline accordion: the account's activities (newest-first) +
                        "Ver cuenta". Mounted only while open → lazy on first open. */}
                    {expanded && (
                      <tr id={panelId}>
                        <td colSpan={cols} className="bg-subtle px-4 py-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                              Actividad de {a.name}
                            </p>
                            <Link
                              href={`/comercial/cuentas/${a.id}`}
                              onClick={(ev) => ev.stopPropagation()}
                              className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                              style={{ color: 'var(--color-accent)' }}
                            >
                              Ver cuenta <ExternalLink size={13} />
                            </Link>
                          </div>
                          <ActivityTimeline
                            scope="account"
                            scopeId={a.id}
                            canWrite={canWriteActivity}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <AccountFormModal
          editing={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            fetchAccounts();
          }}
        />
      )}
    </div>
  );
}
