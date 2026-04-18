'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Upload, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiClient } from '../../../lib/api';
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
  category: { name: string };
  counterparty?: { name: string };
}

interface PaginatedResult {
  data: Movement[];
  total: number;
  page: number;
  totalPages: number;
}

export default function MovimientosPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Individual primitive states — stable useEffect deps
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [page, setPage] = useState(1);

  // Ref to avoid stale closure in confirm/cancel handlers
  const reloadRef = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set('type', filterType);
      if (filterStatus) params.set('status', filterStatus);
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
  }, [filterType, filterStatus, filterDateFrom, filterDateTo, filterSearch, page]);

  useEffect(() => {
    load();
  }, [load]);

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

  const totalIncome = movements
    .filter((m) => m.type === 'INCOME' && m.status === 'CONFIRMED')
    .reduce((s, m) => s + Number(m.amount), 0);
  const totalExpense = movements
    .filter((m) => m.type === 'EXPENSE' && m.status === 'CONFIRMED')
    .reduce((s, m) => s + Number(m.amount), 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Movimientos</h1>
        <div className="flex gap-3">
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

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-xs text-green-600 font-medium">Ingresos</p>
          <p className="text-lg font-bold text-green-700">{formatCLP(totalIncome)}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
          <p className="text-xs text-red-600 font-medium">Egresos</p>
          <p className="text-lg font-bold text-red-700">{formatCLP(totalExpense)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
          <p className="text-xs text-blue-600 font-medium">Balance</p>
          <p className="text-lg font-bold text-blue-700">{formatCLP(totalIncome - totalExpense)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tipo</label>
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
          <label className="block text-xs text-gray-500 mb-1">Estado</label>
          <select
            value={filterStatus}
            onChange={(e) => updateFilter(setFilterStatus, e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="DRAFT">Borrador</option>
            <option value="CONFIRMED">Confirmado</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Desde</label>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => updateFilter(setFilterDateFrom, e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Hasta</label>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => updateFilter(setFilterDateTo, e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-500 mb-1">Buscar</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar descripción..."
              value={filterSearch}
              onChange={(e) => updateFilter(setFilterSearch, e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Tipo</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Descripción</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Categoría</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Contraparte</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Monto</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">Estado</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-200 rounded w-20" />
                    </td>
                  ))}
                </tr>
              ))
            ) : movements.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                  No se encontraron movimientos
                </td>
              </tr>
            ) : (
              movements.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{formatDate(m.date)}</td>
                  <td className="px-4 py-3">
                    <MovementTypeBadge type={m.type} />
                  </td>
                  <td className="px-4 py-3 text-gray-900 font-medium max-w-[200px] truncate">
                    {m.description}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.category?.name || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{m.counterparty?.name || '-'}</td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${m.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-500">
              {total} movimientos &middot; Página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-2 rounded border border-gray-300 disabled:opacity-30 hover:bg-white transition"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-2 rounded border border-gray-300 disabled:opacity-30 hover:bg-white transition"
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
