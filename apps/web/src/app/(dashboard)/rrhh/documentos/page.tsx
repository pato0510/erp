'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileText, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { formatDate } from '../../../../lib/formatters';
import { KpiCard } from '../../../../components/operations/dashboard/KpiCard';
import { ComplianceGauge } from '../../../../components/operations/ComplianceGauge';
import {
  DocumentStatusBadge,
  type DerivedDocumentStatus,
} from '../../../../components/operations/DocumentStatusBadge';

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

interface HrDocument {
  id: string;
  tipoDocumento: string;
  nombre: string;
  fechaEmision?: string | null;
  fechaVencimiento?: string | null;
  estado: string;
  diasRestantes?: number | null;
  nombreTrabajador: string;
  employeeId: string;
}

type FilterEstado = 'TODOS' | 'VIGENTE' | 'POR_VENCER' | 'VENCIDO';

/* Map API estado strings to DerivedDocumentStatus expected by the badge. */
function toDerivado(estado: string): DerivedDocumentStatus {
  const map: Record<string, DerivedDocumentStatus> = {
    VIGENTE: 'VIGENTE',
    POR_VENCER: 'POR_VENCER',
    VENCIDO: 'VENCIDO',
    DRAFT: 'BORRADOR',
    BORRADOR: 'BORRADOR',
    PENDIENTE_REVISION: 'PENDIENTE_REVISION',
    APROBADO: 'APROBADO',
    RECHAZADO: 'RECHAZADO',
    REEMPLAZADO: 'REEMPLAZADO',
    ARCHIVADO: 'ARCHIVADO',
    FALTANTE: 'FALTANTE',
  };
  return map[estado] ?? 'BORRADOR';
}

function hintFromDias(
  estado: string,
  dias: number | null | undefined,
): string | undefined {
  if (dias === null || dias === undefined) return undefined;
  if (estado === 'POR_VENCER') return `(en ${dias} día${dias === 1 ? '' : 's'})`;
  if (estado === 'VENCIDO') return `(hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'})`;
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Per-worker compliance mini-badge                                    */
/* ------------------------------------------------------------------ */

function WorkerCompliancePill({ docs }: { docs: HrDocument[] }) {
  const total = docs.length;
  const vigentes = docs.filter((d) => d.estado === 'VIGENTE').length;
  const pct = total === 0 ? 100 : Math.round((vigentes / total) * 100);
  const color = pct >= 90 ? '#15803d' : pct >= 70 ? '#a16207' : '#b91c1c';
  const bg = pct >= 90 ? 'rgba(34,197,94,0.1)' : pct >= 70 ? 'rgba(234,179,8,0.12)' : 'rgba(239,68,68,0.1)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        borderRadius: 999,
        background: bg,
        color,
        fontFamily: 'var(--font-jetbrains-mono), monospace',
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {vigentes}/{total} al día
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

function RowSkeleton() {
  return (
    <tr>
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 animate-pulse rounded bg-[rgba(0,0,0,0.06)]" />
        </td>
      ))}
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function DocumentosRrhhPage() {
  const [docs, setDocs] = useState<HrDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterEstado, setFilterEstado] = useState<FilterEstado>('TODOS');
  const [filterTrabajador, setFilterTrabajador] = useState('');

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<HrDocument[]>('/api/rrhh/documents');
      setDocs(data);
    } catch {
      setError('No se pudo cargar la lista de documentos. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  /* KPI counts */
  const total = docs.length;
  const vigentes = useMemo(() => docs.filter((d) => d.estado === 'VIGENTE').length, [docs]);
  const porVencer = useMemo(() => docs.filter((d) => d.estado === 'POR_VENCER').length, [docs]);
  const vencidos = useMemo(() => docs.filter((d) => d.estado === 'VENCIDO').length, [docs]);
  const compliancePct = total === 0 ? 100 : Math.round((vigentes / total) * 100);

  /* Filtered list */
  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (filterEstado !== 'TODOS' && d.estado !== filterEstado) return false;
      if (
        filterTrabajador &&
        !d.nombreTrabajador.toLowerCase().includes(filterTrabajador.toLowerCase())
      )
        return false;
      return true;
    });
  }, [docs, filterEstado, filterTrabajador]);

  /* Group filtered docs by worker */
  const byWorker = useMemo(() => {
    const map = new Map<string, { nombre: string; allDocs: HrDocument[]; filteredDocs: HrDocument[] }>();
    /* First, group ALL docs by worker (for compliance pill) */
    for (const d of docs) {
      if (!map.has(d.employeeId)) {
        map.set(d.employeeId, { nombre: d.nombreTrabajador, allDocs: [], filteredDocs: [] });
      }
      map.get(d.employeeId)!.allDocs.push(d);
    }
    /* Then tag which ones pass the current filter */
    for (const d of filtered) {
      const entry = map.get(d.employeeId);
      if (entry) entry.filteredDocs.push(d);
    }
    /* Only return workers who have at least one filtered doc */
    return Array.from(map.values())
      .filter((e) => e.filteredDocs.length > 0)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-CL'));
  }, [docs, filtered]);

  const filterChips: { label: string; value: FilterEstado }[] = [
    { label: 'Todos', value: 'TODOS' },
    { label: 'Vigentes', value: 'VIGENTE' },
    { label: 'Por vencer', value: 'POR_VENCER' },
    { label: 'Vencidos', value: 'VENCIDO' },
  ];

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
          Documentos de Trabajadores
        </h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
          Control documental y alertas de vencimiento del equipo
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Top summary row: gauge + KPI cards */}
      <div className="mb-6 flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Compliance Gauge */}
        <div className="flex-shrink-0 flex justify-center lg:justify-start">
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-6 flex flex-col items-center gap-2">
            <ComplianceGauge
              percentage={loading ? 0 : compliancePct}
              size={160}
              subtitle={loading ? 'Cargando…' : `${vigentes} de ${total} al día`}
              caption="Porcentaje documentos vigentes"
            />
          </div>
        </div>

        {/* KPI Cards */}
        <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total documentos"
            value={loading ? '—' : String(total)}
            subtitle="Todos los registros"
            icon={FileText}
          />
          <KpiCard
            label="Vigentes"
            value={loading ? '—' : String(vigentes)}
            subtitle="Estado al día"
            icon={CheckCircle2}
            valueColor="#15803d"
          />
          <KpiCard
            label="Por vencer"
            value={loading ? '—' : String(porVencer)}
            subtitle="Próximos a expirar"
            icon={Clock}
            valueColor={porVencer > 0 ? '#a16207' : undefined}
          />
          <KpiCard
            label="Vencidos"
            value={loading ? '—' : String(vencidos)}
            subtitle="Requieren renovación"
            icon={XCircle}
            valueColor={vencidos > 0 ? '#b91c1c' : undefined}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Estado chips */}
        <div className="flex flex-wrap gap-2">
          {filterChips.map((chip) => {
            const active = filterEstado === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => setFilterEstado(chip.value)}
                className="rounded-full border px-3 py-1 text-xs font-medium transition"
                style={{
                  background: active ? '#2563eb' : 'var(--bg-card)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  borderColor: active ? '#2563eb' : 'var(--border-color)',
                }}
              >
                {chip.label}
                {chip.value !== 'TODOS' && !loading && (
                  <span className="ml-1.5 opacity-75">
                    (
                    {chip.value === 'VIGENTE'
                      ? vigentes
                      : chip.value === 'POR_VENCER'
                        ? porVencer
                        : vencidos}
                    )
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Trabajador search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar trabajador…"
            value={filterTrabajador}
            onChange={(e) => setFilterTrabajador(e.target.value)}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:ring-2 focus:ring-blue-500 w-52"
          />
        </div>
      </div>

      {/* Grouped by worker table */}
      {loading ? (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)] bg-[rgba(0,0,0,0.02)]">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Trabajador</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Tipo documento</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Vencimiento</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Estado</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <RowSkeleton key={i} />
              ))}
            </tbody>
          </table>
        </div>
      ) : byWorker.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] py-16 text-center">
          <FileText size={32} className="opacity-30 text-[var(--text-secondary)]" />
          <p className="text-sm text-[var(--text-secondary)]">
            {docs.length === 0
              ? 'No hay documentos registrados en el sistema.'
              : 'No hay documentos que coincidan con los filtros aplicados.'}
          </p>
          {filterEstado !== 'TODOS' || filterTrabajador ? (
            <button
              type="button"
              onClick={() => {
                setFilterEstado('TODOS');
                setFilterTrabajador('');
              }}
              className="mt-1 text-xs text-blue-600 hover:underline"
            >
              Limpiar filtros
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {byWorker.map(({ nombre, allDocs, filteredDocs }) => (
            <section
              key={nombre}
              className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm overflow-hidden"
            >
              {/* Worker header */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-color)] bg-[rgba(0,0,0,0.02)]">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    {nombre.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{nombre}</span>
                </div>
                <WorkerCompliancePill docs={allDocs} />
              </div>

              {/* Documents table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-color)]">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                        Tipo documento
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                        Nombre
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                        Vencimiento
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocs.map((doc, idx) => {
                      const derivado = toDerivado(doc.estado);
                      const hint = hintFromDias(doc.estado, doc.diasRestantes);
                      const isLast = idx === filteredDocs.length - 1;
                      return (
                        <tr
                          key={doc.id}
                          className={`transition-colors hover:bg-[rgba(0,0,0,0.02)] ${!isLast ? 'border-b border-[var(--border-color)]' : ''}`}
                        >
                          <td className="px-4 py-3 text-[var(--text-secondary)] text-xs font-medium">
                            {doc.tipoDocumento}
                          </td>
                          <td className="px-4 py-3 text-[var(--text-primary)] font-medium">
                            {doc.nombre}
                          </td>
                          <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums text-xs">
                            {doc.fechaVencimiento ? formatDate(doc.fechaVencimiento) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <DocumentStatusBadge status={derivado} hint={hint} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Footer count */}
      {!loading && byWorker.length > 0 && (
        <p className="mt-4 text-xs text-[var(--text-secondary)]">
          Mostrando {filtered.length} documento{filtered.length !== 1 ? 's' : ''} de {total} total
          {filterEstado !== 'TODOS' || filterTrabajador ? ' (filtrado)' : ''}
        </p>
      )}
    </div>
  );
}
