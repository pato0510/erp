'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code2,
  GitBranch,
  RefreshCw,
  RotateCcw,
  X,
  XCircle,
} from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/api';
import { formatDate } from '../../../../lib/formatters';

const EVENT_TYPES = [
  'document.renewal-imminent',
  'permit.renewal-imminent',
  'asset.blocked',
  'asset.unblocked',
  'work-permit.closed',
  'procedure.acknowledgment-expired',
  'operational.cost',
] as const;

type EventType = (typeof EVENT_TYPES)[number];
type EventStatus = 'PENDING' | 'PROCESSED' | 'FAILED';

interface DomainEventRow {
  id: string;
  companyId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  handledAt: string | null;
  status: EventStatus;
  handlerResults: unknown;
  failureReason: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  data: DomainEventRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface StatsResponse {
  windowDays: number;
  total: number;
  processed: number;
  failed: number;
  pending: number;
  successRate: number;
  byType: Record<string, number>;
}

const TYPE_TONES: Record<string, { bg: string; fg: string }> = {
  'document.renewal-imminent': { bg: 'rgba(37,99,235,0.12)', fg: '#1d4ed8' },
  'permit.renewal-imminent': { bg: 'rgba(15,118,110,0.12)', fg: '#0f766e' },
  'asset.blocked': { bg: 'rgba(239,68,68,0.12)', fg: '#b91c1c' },
  'asset.unblocked': { bg: 'rgba(34,197,94,0.12)', fg: '#15803d' },
  'work-permit.closed': { bg: 'rgba(234,88,12,0.14)', fg: '#c2410c' },
  'procedure.acknowledgment-expired': { bg: 'rgba(124,58,237,0.14)', fg: '#7c3aed' },
  'operational.cost': { bg: 'rgba(100,116,139,0.14)', fg: '#475569' },
};

const STATUS_TONES: Record<EventStatus, { bg: string; fg: string; label: string }> = {
  PENDING: { bg: 'rgba(234,179,8,0.16)', fg: '#a16207', label: 'Pendiente' },
  PROCESSED: { bg: 'rgba(34,197,94,0.14)', fg: '#15803d', label: 'Procesado' },
  FAILED: { bg: 'rgba(239,68,68,0.14)', fg: '#b91c1c', label: 'Falló' },
};

export default function EventosPage() {
  const [list, setList] = useState<ListResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterAggregate, setFilterAggregate] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<DomainEventRow | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '50');
      if (filterType) params.set('eventType', filterType);
      if (filterStatus) params.set('status', filterStatus);
      if (filterAggregate) params.set('aggregateType', filterAggregate);
      if (filterFrom) params.set('dateFrom', filterFrom);
      if (filterTo) params.set('dateTo', filterTo);
      const [listResp, statsResp] = await Promise.all([
        apiClient.get<ListResponse>(`/api/operations/domain-events?${params.toString()}`),
        apiClient.get<StatsResponse>('/api/operations/domain-events/stats?days=30'),
      ]);
      setList(listResp);
      setStats(statsResp);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'No se pudieron cargar los eventos.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, filterType, filterStatus, filterAggregate, filterFrom, filterTo]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRetry = useCallback(
    async (eventId: string) => {
      setRetrying(eventId);
      try {
        await apiClient.post<{ retried: boolean }>(
          `/api/operations/domain-events/${eventId}/retry`,
        );
        await fetchAll();
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'No se pudo reintentar.';
        setError(msg);
      } finally {
        setRetrying(null);
      }
    },
    [fetchAll],
  );

  const resetFilters = useCallback(() => {
    setFilterType('');
    setFilterStatus('');
    setFilterAggregate('');
    setFilterFrom('');
    setFilterTo('');
    setPage(1);
  }, []);

  const aggregateTypes = useMemo(() => {
    const set = new Set<string>();
    for (const row of list?.data ?? []) set.add(row.aggregateType);
    return Array.from(set).sort();
  }, [list]);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      <div className="mb-2 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
        Operaciones / Eventos de dominio
      </div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--text-primary)]">
            <GitBranch size={20} className="text-[var(--text-secondary)]" />
            Eventos de dominio
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Audit trail de eventos del módulo
          </p>
        </div>
        <button
          type="button"
          onClick={fetchAll}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))] disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* KPI bar */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="Total (30d)"
          value={stats?.total ?? 0}
          fg="#475569"
          bg="rgba(100,116,139,0.10)"
          icon={Code2}
        />
        <KpiCard
          label="Procesados"
          value={stats?.processed ?? 0}
          fg="#15803d"
          bg="rgba(34,197,94,0.10)"
          icon={CheckCircle2}
          subtitle={stats ? `${stats.successRate}% éxito` : undefined}
        />
        <KpiCard
          label="Fallidos"
          value={stats?.failed ?? 0}
          fg="#b91c1c"
          bg="rgba(239,68,68,0.10)"
          icon={XCircle}
        />
        <KpiCard
          label="Pendientes"
          value={stats?.pending ?? 0}
          fg="#a16207"
          bg="rgba(234,179,8,0.12)"
          icon={Clock}
        />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2.5 shadow-sm">
        <select
          value={filterType}
          onChange={(e) => {
            setFilterType(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-primary)]"
        >
          <option value="">Todos los tipos</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-primary)]"
        >
          <option value="">Todos los estados</option>
          <option value="PENDING">Pendiente</option>
          <option value="PROCESSED">Procesado</option>
          <option value="FAILED">Falló</option>
        </select>
        <select
          value={filterAggregate}
          onChange={(e) => {
            setFilterAggregate(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-primary)]"
        >
          <option value="">Todos los agregados</option>
          {aggregateTypes.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={filterFrom}
          onChange={(e) => {
            setFilterFrom(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-primary)]"
          placeholder="Desde"
        />
        <input
          type="date"
          value={filterTo}
          onChange={(e) => {
            setFilterTo(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-primary)]"
          placeholder="Hasta"
        />
        <button
          type="button"
          onClick={resetFilters}
          className="ml-auto rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
        >
          Limpiar
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Events table */}
      <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">
                  Timestamp
                </th>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Tipo</th>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">
                  Agregado
                </th>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">
                  Estado
                </th>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">
                  Reintentos
                </th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {loading && (!list || list.data.length === 0) ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                    <RefreshCw size={16} className="mx-auto mb-1 animate-spin opacity-60" />
                    Cargando…
                  </td>
                </tr>
              ) : list && list.data.length > 0 ? (
                list.data.map((row) => {
                  const tone = TYPE_TONES[row.eventType] ?? {
                    bg: 'rgba(100,116,139,0.14)',
                    fg: '#475569',
                  };
                  const status = STATUS_TONES[row.status];
                  return (
                    <tr key={row.id} className="hover:bg-[var(--hover-bg,rgba(0,0,0,0.02))]">
                      <td className="px-3 py-2 align-top">
                        <div className="font-mono text-[var(--text-primary)]">
                          {new Date(row.occurredAt).toLocaleString('es-CL', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                        <div className="text-[10px] text-[var(--text-secondary)]">
                          {formatDate(row.occurredAt)}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide"
                          style={{ backgroundColor: tone.bg, color: tone.fg }}
                        >
                          {row.eventType}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="text-[var(--text-primary)]">{row.aggregateType}</div>
                        <div className="font-mono text-[10px] text-[var(--text-secondary)] truncate max-w-[200px]">
                          {row.aggregateId}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: status.bg, color: status.fg }}
                        >
                          {status.label}
                        </span>
                        {row.failureReason && (
                          <div className="mt-1 text-[10px] text-red-700 truncate max-w-[280px]">
                            {row.failureReason}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top font-mono text-[var(--text-primary)]">
                        {row.retryCount}
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelected(row)}
                            className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-[10px] font-medium text-[var(--text-primary)] hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
                          >
                            Detalle
                          </button>
                          {row.status === 'FAILED' && row.retryCount < 3 && (
                            <button
                              type="button"
                              onClick={() => handleRetry(row.id)}
                              disabled={retrying === row.id}
                              className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:bg-blue-950/40 dark:text-blue-300"
                            >
                              <RotateCcw
                                size={10}
                                className={retrying === row.id ? 'animate-spin' : ''}
                              />
                              Reintentar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                    Sin eventos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {list && list.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[var(--border-color)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            <span>
              Página {list.page} de {list.totalPages} — {list.total} eventos
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={list.page <= 1}
                className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] p-1 disabled:opacity-50"
              >
                <ChevronLeft size={12} />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(list.totalPages, p + 1))}
                disabled={list.page >= list.totalPages}
                className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] p-1 disabled:opacity-50"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <DetailModal
          row={selected}
          onClose={() => setSelected(null)}
          onRetry={() => handleRetry(selected.id)}
          retrying={retrying === selected.id}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  fg,
  bg,
  icon: Icon,
  subtitle,
}: {
  label: string;
  value: number;
  fg: string;
  bg: string;
  icon: React.ComponentType<{ size?: number }>;
  subtitle?: string;
}) {
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          {label}
        </span>
        <span
          className="flex h-6 w-6 items-center justify-center rounded-md"
          style={{ backgroundColor: bg, color: fg }}
        >
          <Icon size={12} />
        </span>
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold leading-none" style={{ color: fg }}>
        {value}
      </div>
      {subtitle && <div className="mt-1 text-[10px] text-[var(--text-secondary)]">{subtitle}</div>}
    </div>
  );
}

function DetailModal({
  row,
  onClose,
  onRetry,
  retrying,
}: {
  row: DomainEventRow;
  onClose: () => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const status = STATUS_TONES[row.status];
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--bg-card)] w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--border-color)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">{row.eventType}</h2>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ backgroundColor: status.bg, color: status.fg }}
              >
                {status.label}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                Reintentos: {row.retryCount}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                {new Date(row.occurredAt).toLocaleString('es-CL')}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1 text-[var(--text-secondary)] hover:bg-[var(--hover-bg,rgba(0,0,0,0.04))]"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-5 py-4 flex flex-col gap-4">
          <Section title="Agregado">
            <div className="font-mono text-xs text-[var(--text-primary)]">
              {row.aggregateType} · {row.aggregateId}
            </div>
          </Section>

          {row.failureReason && (
            <Section title="Motivo de falla">
              <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                <AlertCircle size={12} className="inline mr-1 -translate-y-0.5" />
                {row.failureReason}
              </div>
            </Section>
          )}

          <Section title="Payload">
            <pre className="overflow-x-auto rounded-md border border-[var(--border-color)] bg-[rgba(0,0,0,0.03)] dark:bg-[rgba(255,255,255,0.03)] p-3 text-[11px] font-mono text-[var(--text-primary)]">
              {JSON.stringify(row.payload, null, 2)}
            </pre>
          </Section>

          {row.handlerResults != null && (
            <Section title="Resultados de handlers">
              <pre className="overflow-x-auto rounded-md border border-[var(--border-color)] bg-[rgba(0,0,0,0.03)] dark:bg-[rgba(255,255,255,0.03)] p-3 text-[11px] font-mono text-[var(--text-primary)]">
                {JSON.stringify(row.handlerResults, null, 2)}
              </pre>
            </Section>
          )}

          <Section title="Cronología">
            <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
              <li>
                Emitido:{' '}
                <span className="text-[var(--text-primary)]">
                  {new Date(row.occurredAt).toLocaleString('es-CL')}
                </span>
              </li>
              {row.handledAt && (
                <li>
                  Manejado:{' '}
                  <span className="text-[var(--text-primary)]">
                    {new Date(row.handledAt).toLocaleString('es-CL')}
                  </span>
                </li>
              )}
              <li>
                Creado:{' '}
                <span className="text-[var(--text-primary)]">
                  {new Date(row.createdAt).toLocaleString('es-CL')}
                </span>
              </li>
              <li>
                Actualizado:{' '}
                <span className="text-[var(--text-primary)]">
                  {new Date(row.updatedAt).toLocaleString('es-CL')}
                </span>
              </li>
            </ul>
          </Section>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--border-color)] px-5 py-3">
          {row.status === 'FAILED' && row.retryCount < 3 && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <RotateCcw size={12} className={retrying ? 'animate-spin' : ''} />
              Reintentar
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
          >
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        {title}
      </h3>
      {children}
    </div>
  );
}
