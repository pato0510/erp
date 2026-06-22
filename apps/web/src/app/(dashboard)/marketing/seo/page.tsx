'use client';

import { useEffect, useState, useMemo } from 'react';
import { Search, TrendingUp, ArrowUp, ArrowDown, Minus, Globe } from 'lucide-react';
import { KpiCard } from '../../../../components/operations/dashboard/KpiCard';
import { apiClient } from '../../../../lib/api';

/* ---- API shape --------------------------------------------------- */

interface SeoKeyword {
  id: string;
  keyword: string;
  currentPosition: number;
  previousPosition: number;
  monthlyTraffic: number;
  url: string;
  delta: number; // previousPosition - currentPosition; positive = mejoró (lower position = better)
}

/* ---- Helpers ----------------------------------------------------- */

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-[rgba(128,128,128,0.12)] ${className}`} />
  );
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('es-CL').format(n);
}

function DeltaIndicator({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color: '#16a34a' }}>
        <ArrowUp size={13} />
        {delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color: '#b91c1c' }}>
        <ArrowDown size={13} />
        {Math.abs(delta)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--text-secondary)]">
      <Minus size={13} />
      —
    </span>
  );
}

function PositionBadge({ pos }: { pos: number }) {
  let bg = 'rgba(37,99,235,0.10)';
  let color = '#2563eb';
  if (pos <= 3) { bg = 'rgba(22,163,74,0.12)'; color = '#16a34a'; }
  else if (pos <= 10) { bg = 'rgba(234,179,8,0.12)'; color = '#ca8a04'; }
  else if (pos > 20) { bg = 'rgba(185,28,28,0.10)'; color = '#b91c1c'; }

  return (
    <span
      className="inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold min-w-[2rem]"
      style={{ background: bg, color }}
    >
      #{pos}
    </span>
  );
}

/* ---- Page -------------------------------------------------------- */

export default function MarketingSeoPage() {
  const [keywords, setKeywords] = useState<SeoKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    apiClient
      .get<SeoKeyword[]>('/api/marketing/seo')
      .then((data) => setKeywords(data))
      .catch(() => setError('No se pudo cargar el tablero SEO.'))
      .finally(() => setLoading(false));
  }, []);

  /* Derived KPIs */
  const totalKeywords = keywords.length;
  const totalTraffic = keywords.reduce((sum, k) => sum + Number(k.monthlyTraffic), 0);
  const avgPosition =
    keywords.length > 0
      ? keywords.reduce((sum, k) => sum + Number(k.currentPosition), 0) / keywords.length
      : 0;
  const improvedCount = keywords.filter((k) => Number(k.delta) > 0).length;

  /* Filtered + sorted table */
  const searchTerm = search.toLowerCase().trim();
  const filtered = useMemo(() => {
    const base = [...keywords].sort(
      (a, b) => Number(a.currentPosition) - Number(b.currentPosition)
    );
    if (!searchTerm) return base;
    return base.filter((k) => k.keyword.toLowerCase().includes(searchTerm));
  }, [keywords, searchTerm]);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
        >
          Tablero SEO
        </h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
          Posicionamiento orgánico y tráfico por keyword
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))
        ) : (
          <>
            <KpiCard
              label="Keywords monitoreadas"
              value={String(totalKeywords)}
              subtitle="Total palabras clave"
              icon={Search}
            />
            <KpiCard
              label="Tráfico mensual total"
              value={formatNumber(totalTraffic)}
              subtitle="Visitas orgánicas estimadas"
              icon={Globe}
            />
            <KpiCard
              label="Posición promedio"
              value={avgPosition > 0 ? avgPosition.toFixed(1) : '—'}
              subtitle="Posición actual en buscadores"
              icon={TrendingUp}
              valueColor={
                avgPosition > 0 && avgPosition <= 10
                  ? '#16a34a'
                  : avgPosition > 20
                  ? '#b91c1c'
                  : undefined
              }
            />
            <KpiCard
              label="Mejoraron"
              value={String(improvedCount)}
              subtitle="Keywords con delta positivo"
              icon={ArrowUp}
              valueColor={improvedCount > 0 ? '#16a34a' : undefined}
            />
          </>
        )}
      </div>

      {/* Table section */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm">
        {/* Table header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-[var(--border-color)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Keywords
            {!loading && keywords.length > 0 && (
              <span className="ml-2 text-xs font-normal text-[var(--text-secondary)]">
                ({filtered.length} de {totalKeywords})
              </span>
            )}
          </h2>
          {/* Search */}
          <div className="relative max-w-xs w-full sm:w-auto">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
            />
            <input
              type="text"
              placeholder="Buscar keyword…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] pl-8 pr-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent transition"
            />
          </div>
        </div>

        {/* Legend bar */}
        <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 border-b border-[var(--border-color)] bg-[rgba(128,128,128,0.03)]">
          <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            <ArrowUp size={11} style={{ color: '#16a34a' }} />
            Mejoró
          </span>
          <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            <ArrowDown size={11} style={{ color: '#b91c1c' }} />
            Bajó
          </span>
          <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            <Minus size={11} className="text-[var(--text-secondary)]" />
            Sin cambio
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#16a34a' }} /> Top 3
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#ca8a04' }} /> Top 10
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#2563eb' }} /> Top 20
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#b91c1c' }} /> +20
            </span>
          </span>
        </div>

        {/* Table body */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-[var(--text-secondary)]">
              {searchTerm
                ? `Sin resultados para "${search}".`
                : 'No hay keywords monitoreadas.'}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-color)] bg-[rgba(128,128,128,0.04)]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Keyword
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Posición
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Variación
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Tráfico mensual
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    URL
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((kw) => {
                  const delta = Number(kw.delta);
                  return (
                    <tr
                      key={kw.id}
                      className="border-b border-[var(--border-color)] last:border-0 hover:bg-[rgba(128,128,128,0.04)] transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                        {kw.keyword}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <PositionBadge pos={Number(kw.currentPosition)} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <DeltaIndicator delta={delta} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                        {formatNumber(Number(kw.monthlyTraffic))}
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        {kw.url ? (
                          <a
                            href={kw.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#2563eb] hover:underline text-xs truncate block max-w-[180px]"
                            title={kw.url}
                          >
                            {kw.url.replace(/^https?:\/\//, '')}
                          </a>
                        ) : (
                          <span className="text-xs text-[var(--text-secondary)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer summary */}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-[var(--border-color)] flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
            <span>
              {filtered.length} keyword{filtered.length !== 1 ? 's' : ''} · ordenadas por posición ascendente
            </span>
            <span>
              Tráfico total filtrado:{' '}
              <strong className="text-[var(--text-primary)]">
                {formatNumber(filtered.reduce((s, k) => s + Number(k.monthlyTraffic), 0))}
              </strong>{' '}
              visitas/mes
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
