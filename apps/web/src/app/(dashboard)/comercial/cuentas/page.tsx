'use client';

/* COM-004b — Cuentas (accounts) list. Self-contained: filters + table + create/
 * edit modal + soft-deactivate. Clones the RRHH cargos table markup and the
 * standard modal overlay. Write controls are role-gated (useCanWrite); ANALYST/
 * VIEWER get a 403 from the list and see a clean "sin permiso" state. Tokens:
 * accent #2563eb, Outfit headings. */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Link2, Pencil, Plus } from 'lucide-react';
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

interface AccountRow {
  id: string;
  name: string;
  status: string;
  priority: string;
  industry: string | null;
  commercialRisk: string | null;
  ownerId: string | null;
  counterpartyId: string | null;
  notes: string | null;
  updatedAt: string;
}

export default function CuentasPage() {
  const router = useRouter();
  const canWrite = useCanWrite();
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);

  const fetchAccounts = useCallback(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (priorityFilter) params.set('priority', priorityFilter);
    if (search.trim()) params.set('search', search.trim());
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
  }, [statusFilter, priorityFilter, search]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

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
        <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
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
          style={{ background: '#2563eb' }}
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

  const cols = canWrite ? 7 : 6;

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
              {['Nombre', 'Estado', 'Prioridad', 'Industria', 'Ejecutivo', 'Actualizado'].map(
                (h) => (
                  <th
                    key={h}
                    className="label px-4 py-3 text-left text-[11px] uppercase tracking-wider text-[var(--text-secondary)]"
                  >
                    {h}
                  </th>
                ),
              )}
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
                  No hay cuentas registradas.
                </td>
              </tr>
            ) : (
              rows.map((a) => (
                <tr
                  key={a.id}
                  className="cursor-pointer hover:bg-black/[0.02]"
                  onClick={() => router.push(`/comercial/cuentas/${a.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                    {a.name}
                    {a.counterpartyId && (
                      <span
                        className="ml-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]"
                        style={{ background: 'rgba(37,99,235,0.1)', color: '#2563eb' }}
                        title="Vinculada a un tercero de Finanzas (facturable)"
                      >
                        <Link2 size={10} />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {PRIORITY_LABELS[a.priority] ?? a.priority}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{a.industry ?? '—'}</td>
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
                    {formatDate(a.updatedAt)}
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
              ))
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
