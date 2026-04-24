'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Upload, Search, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiClient } from '../../../lib/api';
import { downloadFile } from '../../../lib/download';
import { MovementStatusBadge } from '../../../components/movements/MovementStatusBadge';
import { MovementTypeBadge } from '../../../components/movements/MovementTypeBadge';
import { formatCLP, formatDate } from '../../../lib/formatters';

interface Movement {
  id: string;
  type: string;
  status: string;
  amount: string;
  date: string;
  description: string;
  reference?: string;
  category: { id: string; name: string };
  counterparty?: { id: string; name: string };
  costCenter?: { id: string; name: string; code: string | null };
  fiscalPeriod?: { id: string; name: string; year: number; month: number };
}

interface PaginatedResult {
  data: Movement[];
  total: number;
  page: number;
  totalPages: number;
}

interface SelectOption {
  id: string;
  name: string;
}

interface FiscalPeriodOption {
  id: string;
  name: string;
  year: number;
  month: number;
}

export default function MovimientosPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Individual primitive states — stable useEffect deps
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [filterCounterpartyId, setFilterCounterpartyId] = useState('');
  const [filterCostCenterId, setFilterCostCenterId] = useState('');
  const [filterFiscalPeriodId, setFilterFiscalPeriodId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [page, setPage] = useState(1);

  // Filter option lists
  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [counterparties, setCounterparties] = useState<SelectOption[]>([]);
  const [costCenters, setCostCenters] = useState<SelectOption[]>([]);
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriodOption[]>([]);

  // Ref to avoid stale closure in confirm/cancel handlers
  const reloadRef = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set('type', filterType);
      if (filterStatus) params.set('status', filterStatus);
      if (filterCategoryId) params.set('categoryId', filterCategoryId);
      if (filterCounterpartyId) params.set('counterpartyId', filterCounterpartyId);
      if (filterCostCenterId) params.set('costCenterId', filterCostCenterId);
      if (filterFiscalPeriodId) params.set('fiscalPeriodId', filterFiscalPeriodId);
      if (filterDateFrom) params.set('dateFrom', filterDateFrom);
      if (filterDateTo) params.set('dateTo', filterDateTo);
      if (filterSearch) params.set('search', filterSearch);
      params.set('page', String(page));
      params.set('limit', '15');

      const res = await apiClient.get<PaginatedResult>(`/api/movements?${params}`);
      setMovements(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      // handled by apiClient
    } finally {
      setIsLoading(false);
    }
  }, [
    filterType,
    filterStatus,
    filterCategoryId,
    filterCounterpartyId,
    filterCostCenterId,
    filterFiscalPeriodId,
    filterDateFrom,
    filterDateTo,
    filterSearch,
    page,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  // Load filter options once on mount — these don't change often enough to
  // warrant refetching on every filter tweak.
  useEffect(() => {
    Promise.all([
      apiClient
        .get<SelectOption[]>('/api/categories')
        .then(setCategories)
        .catch(() => undefined),
      apiClient
        .get<{ data: SelectOption[] }>('/api/counterparties?limit=200')
        .then((r) => setCounterparties(r.data))
        .catch(() => undefined),
      apiClient
        .get<SelectOption[]>('/api/cost-centers')
        .then(setCostCenters)
        .catch(() => undefined),
      apiClient
        .get<FiscalPeriodOption[]>('/api/fiscal-periods')
        .then(setFiscalPeriods)
        .catch(() => undefined),
    ]);
  }, []);

  reloadRef.current = load;

  const handleConfirm = async (id: string) => {
    await apiClient.post(`/api/movements/${id}/confirm`);
    reloadRef.current?.();
  };

  const handleCancel = async (id: string) => {
    const reason = prompt('Razón de cancelación:');
    if (reason !== null) {
      await apiClient.post(`/api/movements/${id}/cancel`, { reason });
      reloadRef.current?.();
    }
  };

  const updateFilter = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  const clearFilters = () => {
    setFilterType('');
    setFilterStatus('');
    setFilterCategoryId('');
    setFilterCounterpartyId('');
    setFilterCostCenterId('');
    setFilterFiscalPeriodId('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterSearch('');
    setPage(1);
  };

  // Category distribution derived from the currently-fetched movements so the
  // chart stays in lock-step with whatever filters are active — no second
  // API call needed.
  const categoryTotalsMap = movements.reduce<
    Record<string, { name: string; income: number; expense: number }>
  >((acc, mov) => {
    const key = mov.category?.name || 'Sin categoría';
    if (!acc[key]) acc[key] = { name: key, income: 0, expense: 0 };
    if (mov.type === 'INCOME') acc[key].income += Number(mov.amount);
    else acc[key].expense += Number(mov.amount);
    return acc;
  }, {});
  const categoryChartData = Object.values(categoryTotalsMap)
    .sort((a, b) => b.income + b.expense - (a.income + a.expense))
    .slice(0, 6);

  const activeFilterCount = [
    filterType,
    filterStatus,
    filterCategoryId,
    filterCounterpartyId,
    filterCostCenterId,
    filterFiscalPeriodId,
    filterDateFrom,
    filterDateTo,
    filterSearch,
  ].filter(Boolean).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl text-[var(--text-primary)]">Movimientos</h1>
        <div className="flex gap-3">
          <button
            onClick={() => {
              const params = new URLSearchParams();
              if (filterType) params.set('type', filterType);
              if (filterStatus) params.set('status', filterStatus);
              if (filterCategoryId) params.set('categoryId', filterCategoryId);
              if (filterCounterpartyId) params.set('counterpartyId', filterCounterpartyId);
              if (filterCostCenterId) params.set('costCenterId', filterCostCenterId);
              if (filterFiscalPeriodId) params.set('fiscalPeriodId', filterFiscalPeriodId);
              if (filterDateFrom) params.set('dateFrom', filterDateFrom);
              if (filterDateTo) params.set('dateTo', filterDateTo);
              const qs = params.toString();
              const date = new Date().toISOString().split('T')[0];
              downloadFile(
                `/api/reports/movements/export${qs ? `?${qs}` : ''}`,
                `movimientos-${date}.xlsx`,
              );
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            <Download size={16} /> Exportar Excel
          </button>
          <Link
            href="/movimientos/importar"
            className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            <Upload size={16} /> Importar CSV
          </Link>
          <Link
            href="/movimientos/nuevo"
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={16} /> Nuevo Movimiento
          </Link>
        </div>
      </div>

      {/* Category distribution */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 mb-6">
        <h3
          className="text-[var(--text-primary)] mb-3"
          style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 500,
            fontSize: 14,
          }}
        >
          Distribución por categoría
        </h3>
        {categoryChartData.length < 2 ? (
          <p className="text-sm text-[var(--text-muted)] text-center py-8">Sin datos suficientes</p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={categoryChartData} layout="vertical" barSize={12}>
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `$${(Number(v) / 1000000).toFixed(1)}M`}
              />
              <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: unknown) => formatCLP(v as number)}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="income" name="Ingresos" fill="#2563EB" radius={[0, 3, 3, 0]} />
              <Bar dataKey="expense" name="Egresos" fill="#94A3B8" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Filters */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Tipo</label>
            <select
              value={filterType}
              onChange={(e) => updateFilter(setFilterType, e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              <option value="INCOME">Ingresos</option>
              <option value="EXPENSE">Egresos</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Estado</label>
            <select
              value={filterStatus}
              onChange={(e) => updateFilter(setFilterStatus, e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              <option value="DRAFT">Borrador</option>
              <option value="CONFIRMED">Confirmado</option>
              <option value="RECONCILED">Conciliado</option>
              <option value="CANCELLED">Cancelado</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Período fiscal
            </label>
            <select
              value={filterFiscalPeriodId}
              onChange={(e) => updateFilter(setFilterFiscalPeriodId, e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              {fiscalPeriods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Categoría</label>
            <select
              value={filterCategoryId}
              onChange={(e) => updateFilter(setFilterCategoryId, e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Contraparte</label>
            <select
              value={filterCounterpartyId}
              onChange={(e) => updateFilter(setFilterCounterpartyId, e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todas</option>
              {counterparties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Centro de costo
            </label>
            <select
              value={filterCostCenterId}
              onChange={(e) => updateFilter(setFilterCostCenterId, e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Desde</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => updateFilter(setFilterDateFrom, e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Hasta</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => updateFilter(setFilterDateTo, e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Buscar</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-2.5 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Descripción o referencia..."
                value={filterSearch}
                onChange={(e) => updateFilter(setFilterSearch, e.target.value)}
                className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm"
              />
            </div>
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-xs text-blue-600 hover:underline px-2 py-2"
            >
              Limpiar ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-[var(--border-color)]">
            <tr>
              <th className="label text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                Fecha
              </th>
              <th className="label text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                Período Fiscal
              </th>
              <th className="label text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                Tipo
              </th>
              <th className="label text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                Descripción
              </th>
              <th className="label text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                Categoría
              </th>
              <th className="label text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                Contraparte
              </th>
              <th className="label text-right px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                Monto
              </th>
              <th className="label text-center px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                Estado
              </th>
              <th className="label text-right px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-200 rounded w-20" />
                    </td>
                  ))}
                </tr>
              ))
            ) : movements.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-[var(--text-muted)]">
                  No se encontraron movimientos
                </td>
              </tr>
            ) : (
              movements.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="mono px-4 py-3 text-[var(--text-secondary)]">
                    {formatDate(m.date)}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)] whitespace-nowrap">
                    {m.fiscalPeriod?.name || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <MovementTypeBadge type={m.type} />
                  </td>
                  <td className="px-4 py-3 text-[var(--text-primary)] font-medium max-w-[200px] truncate">
                    {m.description}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {m.category?.name || '-'}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {m.counterparty?.name || '-'}
                  </td>
                  <td
                    className={`amount px-4 py-3 text-right ${m.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}
                  >
                    {m.type === 'INCOME' ? '+' : '-'}
                    {formatCLP(Number(m.amount))}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <MovementStatusBadge status={m.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-1 justify-end">
                      {m.status === 'DRAFT' && (
                        <button
                          onClick={() => handleConfirm(m.id)}
                          className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 transition"
                        >
                          Confirmar
                        </button>
                      )}
                      {(m.status === 'DRAFT' || m.status === 'CONFIRMED') && (
                        <button
                          onClick={() => handleCancel(m.id)}
                          className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 transition"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)] bg-gray-50">
            <p className="text-sm text-[var(--text-secondary)]">
              {total} movimientos &middot; Página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-2 rounded border border-gray-300 disabled:opacity-30 hover:bg-[var(--bg-card)] transition"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-2 rounded border border-gray-300 disabled:opacity-30 hover:bg-[var(--bg-card)] transition"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
