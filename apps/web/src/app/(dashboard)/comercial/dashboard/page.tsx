'use client';

/* COM-019 — Comercial dashboard (CRM-4): win rate, KPIs, pipeline by stage, lost reasons,
 * lost and top accounts, actions by type — all DERIVED LIVE by the API for a selectable
 * range (GET comercial/dashboard?from&to). Read-only page, no mutations. Follows the
 * Finance dashboard's card / chart patterns (KpiCard markup, recharts with
 * useThemeTokens(), formatCLP) and the Cuentas list's table markup; token utilities only.
 * Gate: rendered for anyone with opportunity.read (the API enforces read on Opportunity
 * AND Account). The bar chart carries an sr-only table with the same values. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart, Bar, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Award, BarChart3, Clock, Target, Trophy, TrendingDown, TrendingUp } from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/api';
import { formatCLP, formatDate } from '../../../../lib/formatters';
import { useThemeTokens } from '../../../../hooks/useThemeTokens';
import { useComercialPermissions } from '../../../../hooks/useCanWrite';

interface DashboardData {
  range: { from: string; to: string };
  kpis: {
    created: number;
    won: number;
    lost: number;
    winRate: number | null;
    wonAmount: number;
    avgCycleDays: number | null;
    openCount: number;
    openAmount: number;
  };
  pipelineByStage: { stage: string; label: string; count: number; amount: number }[];
  lostReasons: { reason: string; label: string; count: number }[];
  lostAccounts: {
    accountId: string;
    name: string;
    lastLostAt: string;
    lastReason: string | null;
    lastReasonLabel: string | null;
    lostAmount: number;
  }[];
  topAccounts: { accountId: string; name: string; wonCount: number; wonAmount: number }[];
  activitiesByType: { type: string; label: string; count: number }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const INPUT =
  'rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]';

type Preset = '30' | '90' | '365' | 'year';

function presetRange(preset: Preset): { from: string; to: string } {
  const today = new Date();
  const to = isoDay(today);
  if (preset === 'year') return { from: `${today.getUTCFullYear()}-01-01`, to };
  const days = Number(preset);
  return { from: isoDay(new Date(today.getTime() - (days - 1) * DAY_MS)), to };
}

export default function ComercialDashboardPage() {
  const perms = useComercialPermissions();
  const canRead = perms?.opportunity.read ?? false;
  const themeTokens = useThemeTokens();

  const [preset, setPreset] = useState<Preset | null>('90');
  const [from, setFrom] = useState(() => presetRange('90').from);
  const [to, setTo] = useState(() => presetRange('90').to);
  const [data, setData] = useState<DashboardData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!from || !to) return;
    setState('loading');
    try {
      const res = await apiClient.get<DashboardData>(
        `/api/comercial/dashboard?from=${from}&to=${to}`,
      );
      setData(res);
      setState('ok');
      setErrorMsg(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setState('forbidden');
      else {
        setState('error');
        setErrorMsg(
          e instanceof ApiError && e.status === 400 ? e.message : 'No se pudo cargar el dashboard.',
        );
      }
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const applyPreset = (p: Preset) => {
    const r = presetRange(p);
    setPreset(p);
    setFrom(r.from);
    setTo(r.to);
  };

  const chartData = useMemo(
    () => (data ? data.pipelineByStage.map((s) => ({ ...s, name: s.label })) : []),
    [data],
  );

  const Header = (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Dashboard comercial
        </h1>
      </div>
    </div>
  );

  if (perms && !canRead) {
    return (
      <div className="pt-2">
        {Header}
        <Forbidden />
      </div>
    );
  }
  if (state === 'forbidden') {
    return (
      <div className="pt-2">
        {Header}
        <Forbidden />
      </div>
    );
  }

  const k = data?.kpis;

  return (
    <div className="pt-2">
      {Header}

      {/* Range control: presets + two date inputs (to inclusive). */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Rango rápido">
          {(
            [
              ['30', '30 días'],
              ['90', '90 días'],
              ['365', '365 días'],
              ['year', 'Año actual'],
            ] as [Preset, string][]
          ).map(([p, label]) => (
            <button
              key={p}
              type="button"
              onClick={() => applyPreset(p)}
              aria-pressed={preset === p}
              className={`rounded-lg border px-3 py-2 text-sm ${
                preset === p
                  ? 'border-transparent text-white'
                  : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              style={preset === p ? { background: 'var(--color-accent)' } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
        <div>
          <label
            htmlFor="dashboard-from"
            className="mb-1 block text-xs text-[var(--text-secondary)]"
          >
            Desde
          </label>
          <input
            id="dashboard-from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setPreset(null);
              setFrom(e.target.value);
            }}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="dashboard-to" className="mb-1 block text-xs text-[var(--text-secondary)]">
            Hasta
          </label>
          <input
            id="dashboard-to"
            type="date"
            value={to}
            min={from}
            onChange={(e) => {
              setPreset(null);
              setTo(e.target.value);
            }}
            className={INPUT}
          />
        </div>
      </div>

      {state === 'error' && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {errorMsg}
        </div>
      )}

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Creadas"
          icon={Target}
          value={k ? String(k.created) : null}
          loading={state === 'loading'}
        />
        <KpiCard
          title="Ganadas"
          icon={Trophy}
          value={k ? String(k.won) : null}
          loading={state === 'loading'}
        />
        <KpiCard
          title="Perdidas"
          icon={TrendingDown}
          value={k ? String(k.lost) : null}
          loading={state === 'loading'}
        />
        <KpiCard
          title="Win rate"
          icon={TrendingUp}
          value={k ? (k.winRate === null ? '—' : `${Math.round(k.winRate * 100)}%`) : null}
          subtitle={k && k.winRate === null ? 'Sin cierres en el rango' : undefined}
          loading={state === 'loading'}
        />
        <KpiCard
          title="Monto ganado"
          icon={Award}
          value={k ? formatCLP(k.wonAmount) : null}
          loading={state === 'loading'}
        />
        <KpiCard
          title="Ciclo promedio"
          icon={Clock}
          value={k ? (k.avgCycleDays === null ? '—' : `${k.avgCycleDays} días`) : null}
          subtitle="creación → cierre, ganadas"
          loading={state === 'loading'}
        />
        <KpiCard
          title="Pipeline abierto"
          icon={BarChart3}
          value={k ? String(k.openCount) : null}
          subtitle={k ? formatCLP(k.openAmount) : undefined}
          loading={state === 'loading'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Pipeline by stage */}
        <Card title="Pipeline por etapa" className="lg:col-span-2">
          {state === 'loading' ? (
            <Skeleton rows={4} />
          ) : !data || data.kpis.openCount === 0 ? (
            <Empty />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} layout="vertical" barSize={22}>
                  <XAxis stroke={themeTokens.border} type="number" hide />
                  <YAxis
                    stroke={themeTokens.border}
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 12, fill: themeTokens.textSecondary }}
                  />
                  <Tooltip
                    cursor={{ fill: themeTokens.border, stroke: themeTokens.border }}
                    formatter={(
                      v: unknown,
                      _n: unknown,
                      item: { payload?: { count?: number } },
                    ) => [
                      `${formatCLP(v as number)} · ${item?.payload?.count ?? 0} oportunidades`,
                      'Monto',
                    ]}
                    contentStyle={{
                      borderRadius: 8,
                      fontSize: 12,
                      backgroundColor: themeTokens.cardSolid,
                      borderColor: themeTokens.border,
                      color: themeTokens.textPrimary,
                    }}
                    labelStyle={{ color: themeTokens.textPrimary }}
                    itemStyle={{ color: themeTokens.textPrimary }}
                  />
                  <Bar dataKey="amount" radius={[0, 6, 6, 0]}>
                    {chartData.map((s) => (
                      <Cell key={s.stage} fill="var(--color-accent)" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* Accessible fallback with the same values. */}
              <table className="sr-only">
                <caption>Pipeline por etapa</caption>
                <thead>
                  <tr>
                    <th>Etapa</th>
                    <th>Oportunidades</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pipelineByStage.map((s) => (
                    <tr key={s.stage}>
                      <td>{s.label}</td>
                      <td>{s.count}</td>
                      <td>{formatCLP(s.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>

        {/* Lost reasons */}
        <Card title="Motivos de pérdida">
          {state === 'loading' ? (
            <Skeleton rows={3} />
          ) : !data || data.lostReasons.length === 0 ? (
            <Empty />
          ) : (
            <ul className="divide-y divide-[var(--border-color)]">
              {data.lostReasons.map((r) => (
                <li key={r.reason} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-[var(--text-primary)]">{r.label}</span>
                  <span className="font-medium text-[var(--text-secondary)]">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Lost accounts */}
        <Card title="Cuentas perdidas" className="lg:col-span-2">
          {state === 'loading' ? (
            <Skeleton rows={4} />
          ) : !data || data.lostAccounts.length === 0 ? (
            <Empty />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border-color)] bg-subtle">
                  <tr>
                    {['Cuenta', 'Última pérdida', 'Motivo', 'Monto'].map((h) => (
                      <th
                        key={h}
                        className="label px-3 py-2 text-left text-[11px] uppercase tracking-wider text-[var(--text-secondary)]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {data.lostAccounts.map((a) => (
                    <tr key={a.accountId}>
                      <td className="px-3 py-2 font-medium">
                        <Link
                          href={`/comercial/cuentas/${a.accountId}`}
                          className="hover:underline"
                          style={{ color: 'var(--color-accent)' }}
                        >
                          {a.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">
                        {formatDate(a.lastLostAt)}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">
                        {a.lastReasonLabel ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">
                        {formatCLP(a.lostAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Top accounts + actions by type */}
        <div className="space-y-4">
          <Card title="Cuentas top">
            {state === 'loading' ? (
              <Skeleton rows={3} />
            ) : !data || data.topAccounts.length === 0 ? (
              <Empty />
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border-color)] bg-subtle">
                  <tr>
                    {['Cuenta', 'Ganadas', 'Monto'].map((h) => (
                      <th
                        key={h}
                        className="label px-3 py-2 text-left text-[11px] uppercase tracking-wider text-[var(--text-secondary)]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {data.topAccounts.map((a) => (
                    <tr key={a.accountId}>
                      <td className="px-3 py-2 font-medium">
                        <Link
                          href={`/comercial/cuentas/${a.accountId}`}
                          className="hover:underline"
                          style={{ color: 'var(--color-accent)' }}
                        >
                          {a.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{a.wonCount}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">
                        {formatCLP(a.wonAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card title="Acciones por tipo">
            {state === 'loading' ? (
              <Skeleton rows={3} />
            ) : !data || data.activitiesByType.length === 0 ? (
              <Empty />
            ) : (
              <ul className="divide-y divide-[var(--border-color)]">
                {data.activitiesByType.map((a) => (
                  <li key={a.type} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-[var(--text-primary)]">{a.label}</span>
                    <span className="font-medium text-[var(--text-secondary)]">{a.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ── local building blocks (Finance dashboard KpiCard markup, Cuentas card shell) ── */

function KpiCard({
  title,
  value,
  icon: Icon,
  subtitle,
  loading,
}: {
  title: string;
  value: string | null;
  icon: React.ElementType;
  subtitle?: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-secondary)]">{title}</p>
          {loading || value === null ? (
            <div className="mt-2 h-8 w-24 animate-pulse rounded bg-subtle-hover" />
          ) : (
            <p className="amount mt-1 truncate text-2xl text-[var(--text-primary)]">{value}</p>
          )}
          {subtitle && !loading && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">{subtitle}</p>
          )}
        </div>
        <span
          className="rounded-lg p-2"
          style={{ background: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
          aria-hidden="true"
        >
          <Icon size={16} />
        </span>
      </div>
    </div>
  );
}

function Card({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 ${className ?? ''}`}
      aria-label={title}
    >
      <h2
        className="mb-3 text-sm font-semibold text-[var(--text-primary)]"
        style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty() {
  return <p className="py-4 text-sm text-[var(--text-secondary)]">Sin datos en el rango.</p>;
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 w-full animate-pulse rounded bg-subtle-hover" />
      ))}
    </div>
  );
}

function Forbidden() {
  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center">
      <p className="text-sm text-[var(--text-secondary)]">
        No tienes permiso para ver el dashboard comercial.
      </p>
    </div>
  );
}
