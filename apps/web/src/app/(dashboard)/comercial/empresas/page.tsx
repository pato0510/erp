'use client';

/* COM-021 — Empresas (the client's parent companies; Enterprise ≠ Company, the tenant).
 * Founder request after the COM-018 production check: enterprises need their own place to
 * be listed, created, edited, deactivated/reactivated and to receive accounts in bulk.
 * Follows the Cuentas list (COM-018): same header, filters, table markup, badges and token
 * utilities. Search (name or RUT → ?q=) is server-side; the Activas / Inactivas / Todas
 * filter fetches with includeInactive=true and splits CLIENT-side (one fetch, tiny
 * volumes). Actions are ability-gated: Editar + Desactivar/Reactivar on enterprise.update,
 * Asignar cuentas on account.update (it mutates accounts; only on active enterprises),
 * Ver cuentas links to /comercial/cuentas?enterpriseId=<id>. No delete, ever. Mutate →
 * refetch. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Ban, ExternalLink, Pencil, Plus, RotateCcw, UserPlus } from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/api';
import { formatRUT } from '../../../../lib/formatters';
import { useComercialPermissions } from '../../../../hooks/useCanWrite';
import {
  EnterpriseFormModal,
  enterpriseErrMessage,
  type EnterpriseForForm,
} from '../../../../components/comercial/EnterpriseFormModal';
import { AssignAccountsModal } from '../../../../components/comercial/AssignAccountsModal';
// Estado badge: the account status badge already renders ACTIVA / INACTIVA with the
// house token styles, so the enterprise flag maps onto it (no new palette).
import { StatusBadge } from '../../../../components/comercial/accountLabels';

interface EnterpriseRow {
  id: string;
  name: string;
  rut: string | null;
  industry: string | null;
  notes: string | null;
  isActive: boolean;
  accountsCount: number;
  createdAt: string;
  updatedAt: string;
}

type ActiveFilter = 'active' | 'inactive' | 'all';

const COLUMNS = ['Nombre', 'RUT', 'Industria', 'Cuentas', 'Estado'];
const FILTER_SELECT =
  'rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]';

export default function EmpresasPage() {
  const perms = useComercialPermissions();
  const canCreate = perms?.enterprise.create ?? false;
  const canUpdate = perms?.enterprise.update ?? false;
  const canAssign = perms?.account.update ?? false;

  const [rows, setRows] = useState<EnterpriseRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('active');
  const [toast, setToast] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EnterpriseForForm | null>(null);
  const [assigning, setAssigning] = useState<EnterpriseRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchEnterprises = useCallback(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    params.set('includeInactive', 'true');
    apiClient
      .get<EnterpriseRow[]>(`/api/comercial/enterprises?${params.toString()}`)
      .then((data) => {
        setRows(data);
        setError(null);
        setForbidden(false);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setForbidden(true);
        else setError('No se pudieron cargar las empresas.');
      })
      .finally(() => setIsLoading(false));
  }, [search]);

  useEffect(() => {
    fetchEnterprises();
  }, [fetchEnterprises]);

  // Toast auto-dismiss.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const visible = useMemo(() => {
    if (activeFilter === 'all') return rows;
    return rows.filter((r) => r.isActive === (activeFilter === 'active'));
  }, [rows, activeFilter]);

  const toggleActive = async (e: EnterpriseRow) => {
    const question = e.isActive
      ? `¿Desactivar la empresa "${e.name}"? Sus cuentas conservan el vínculo.`
      : `¿Reactivar la empresa "${e.name}"?`;
    if (!window.confirm(question)) return;
    setBusyId(e.id);
    try {
      await apiClient.patch(`/api/comercial/enterprises/${e.id}`, { isActive: !e.isActive });
      fetchEnterprises();
    } catch (err) {
      window.alert(enterpriseErrMessage(err, 'No se pudo actualizar la empresa.'));
    } finally {
      setBusyId(null);
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
          Empresas
        </h1>
      </div>
      {canCreate && !forbidden && (
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: 'var(--color-accent)' }}
        >
          <Plus size={16} /> Nueva empresa
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

  const cols = COLUMNS.length + 1; // "Acciones" always present (Ver cuentas is read-only)

  return (
    <div className="pt-2">
      {Header}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label htmlFor="empresas-search" className="sr-only">
          Buscar empresa
        </label>
        <input
          id="empresas-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o RUT…"
          className="min-w-[220px] flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
        />
        <label htmlFor="empresas-active-filter" className="sr-only">
          Estado
        </label>
        <select
          id="empresas-active-filter"
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
          className={FILTER_SELECT}
        >
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
          <option value="all">Todas</option>
        </select>
      </div>

      {toast && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-[var(--border-color)] bg-subtle px-4 py-3 text-sm text-[var(--text-primary)]"
        >
          {toast}
        </div>
      )}
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
              <th className="label px-4 py-3 text-right text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                Acciones
              </th>
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
            ) : visible.length === 0 ? (
              <tr>
                <td
                  colSpan={cols}
                  className="px-4 py-10 text-center text-sm text-[var(--text-secondary)]"
                >
                  {rows.length === 0 ? 'Aún no hay empresas.' : 'No hay empresas con este filtro.'}
                </td>
              </tr>
            ) : (
              visible.map((e) => (
                <tr key={e.id} className="hover:bg-black/[0.02]">
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{e.name}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[var(--text-secondary)]">
                    {e.rut ? formatRUT(e.rut) : '—'}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{e.industry ?? '—'}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{e.accountsCount}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={e.isActive ? 'ACTIVA' : 'INACTIVA'} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {canUpdate && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditing({
                              id: e.id,
                              name: e.name,
                              rut: e.rut,
                              industry: e.industry,
                              notes: e.notes,
                            });
                            setFormOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                          <Pencil size={13} /> Editar
                        </button>
                      )}
                      {canUpdate &&
                        (e.isActive ? (
                          <button
                            type="button"
                            onClick={() => toggleActive(e)}
                            disabled={busyId === e.id}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
                          >
                            <Ban size={13} /> Desactivar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleActive(e)}
                            disabled={busyId === e.id}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60"
                          >
                            <RotateCcw size={13} /> Reactivar
                          </button>
                        ))}
                      {canAssign && e.isActive && (
                        <button
                          type="button"
                          onClick={() => setAssigning(e)}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                          <UserPlus size={13} /> Asignar cuentas
                        </button>
                      )}
                      <Link
                        href={`/comercial/cuentas?enterpriseId=${e.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs hover:underline"
                        style={{ color: 'var(--color-accent)' }}
                      >
                        <ExternalLink size={13} /> Ver cuentas
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <EnterpriseFormModal
          editing={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            fetchEnterprises();
          }}
        />
      )}

      {assigning && (
        <AssignAccountsModal
          enterprise={{ id: assigning.id, name: assigning.name }}
          onClose={() => setAssigning(null)}
          onAssigned={(result) => {
            setAssigning(null);
            setToast(
              `Cuentas asignadas: ${result.assigned}${
                result.skipped > 0 ? ` (omitidas por ya tener empresa: ${result.skipped})` : ''
              }`,
            );
            fetchEnterprises();
          }}
        />
      )}
    </div>
  );
}
