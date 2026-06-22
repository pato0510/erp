'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Sun, Users, AlertTriangle } from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { KpiCard } from '../../../../components/operations/dashboard/KpiCard';

interface VacationRow {
  employeeId: string;
  nombre: string;
  area: string;
  cargo: string;
  mesesTrabajados: number;
  devengados: number;
  tomados: number;
  saldo: number;
  fechaCorte: string;
}

export default function VacacionesPage() {
  const [rows, setRows] = useState<VacationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<VacationRow[]>('/api/rrhh/vacations');
      setRows(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el registro de vacaciones. Intenta nuevamente.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.nombre.toLowerCase().includes(q) ||
        r.area.toLowerCase().includes(q) ||
        r.cargo.toLowerCase().includes(q),
    );
  }, [rows, search]);

  // KPI derived values — computed from the full (unfiltered) dataset
  const totalSaldo = useMemo(
    () => rows.reduce((acc, r) => acc + Number(r.saldo), 0),
    [rows],
  );
  const conSaldoAlto = useMemo(
    () => rows.filter((r) => Number(r.saldo) > 15).length,
    [rows],
  );
  const conSaldoNegativo = useMemo(
    () => rows.filter((r) => Number(r.saldo) <= 0).length,
    [rows],
  );

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
        >
          Vacaciones
        </h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
          Control de días devengados, tomados y saldo por trabajador
        </p>
      </div>

      {/* Legal rule banner */}
      <div
        className="mb-6 rounded-xl border px-4 py-3 text-sm"
        style={{
          backgroundColor: 'rgba(37,99,235,0.06)',
          borderColor: 'rgba(37,99,235,0.25)',
          color: 'var(--text-primary)',
        }}
      >
        <span className="font-semibold text-[#2563eb]">Regla legal (Art. 67 CT): </span>
        Los días de vacaciones se calculan como{' '}
        <strong>Devengados = meses trabajados &times; 1,25 días hábiles</strong>. Un trabajador
        con 12 meses de servicio acumula 15 días hábiles anuales. Los días tomados se descuentan
        del saldo disponible; un saldo negativo indica anticipo de vacaciones.
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <KpiCard
          label="Total días de saldo acumulados"
          value={loading ? '—' : `${totalSaldo.toFixed(1)} días`}
          subtitle="Suma de saldos de todos los trabajadores"
          icon={Sun}
          valueColor="#2563eb"
        />
        <KpiCard
          label="Trabajadores con saldo > 15 días"
          value={loading ? '—' : String(conSaldoAlto)}
          subtitle="Podrían tener vacaciones pendientes de programar"
          icon={Users}
          valueColor={conSaldoAlto > 0 ? '#d97706' : undefined}
        />
        <KpiCard
          label="Trabajadores con saldo 0 o negativo"
          value={loading ? '—' : String(conSaldoNegativo)}
          subtitle="Anticipo de vacaciones o sin días disponibles"
          icon={AlertTriangle}
          valueColor={conSaldoNegativo > 0 ? '#b91c1c' : undefined}
        />
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
          />
          <input
            type="text"
            placeholder="Buscar por nombre, área o cargo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] pl-9 pr-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/40"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border-color)] bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Trabajador
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Área
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Cargo
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Meses trabajados
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Devengados
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Tomados
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Saldo
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded bg-gray-200" style={{ width: j === 0 ? 140 : 60 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-[var(--text-secondary)] text-sm"
                >
                  {search
                    ? 'No se encontraron trabajadores que coincidan con la búsqueda.'
                    : 'No hay registros de vacaciones disponibles.'}
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const saldo = Number(row.saldo);
                const saldoPositivo = saldo > 0;
                const saldoColor = saldoPositivo ? '#16a34a' : '#b91c1c';
                return (
                  <tr
                    key={row.employeeId}
                    className="hover:bg-[rgba(0,0,0,0.02)] transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)] whitespace-nowrap">
                      {row.nombre}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {row.area || '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {row.cargo || '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                      {Number(row.mesesTrabajados).toFixed(0)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                      {Number(row.devengados).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                      {Number(row.tomados).toFixed(2)}
                    </td>
                    <td
                      className="px-4 py-3 text-right tabular-nums font-semibold"
                      style={{ color: saldoColor }}
                    >
                      {saldo.toFixed(2)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Footer count */}
        {!loading && filtered.length > 0 && (
          <div className="border-t border-[var(--border-color)] bg-gray-50 px-4 py-2">
            <p className="text-xs text-[var(--text-secondary)]">
              {filtered.length} trabajador{filtered.length !== 1 ? 'es' : ''}
              {search ? ` · filtrado${filtered.length !== 1 ? 's' : ''}` : ''}
              {' '}&mdash; Corte al {filtered[0]?.fechaCorte
                ? new Date(filtered[0].fechaCorte).toLocaleDateString('es-CL', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })
                : 'hoy'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
