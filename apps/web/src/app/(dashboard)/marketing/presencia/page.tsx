'use client';

/* MKT-009 — Digital presence dashboard. PAGE GATE (the rare cell): gates on
 * presenceSnapshot.read (NOT campaign.read) — ACCOUNTANT, who browses /marketing/campanas
 * freely, lands on the denied state HERE. Write affordances gate on
 * useCanWriteMarketing('presenceSnapshot'). Zero role strings. Chart reuses the platform's
 * recharts LineChart with connectNulls={false} (same as the Finanzas dashboard) so months
 * without data render as GAPS — never an interpolated line. Tokens: accent #2563eb,
 * Outfit, glassmorphism; Spanish with accents. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Plus } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiClient } from '../../../../lib/api';
import {
  useCanWriteMarketing,
  useMarketingPermissions,
} from '../../../../hooks/useMarketingPermissions';
import {
  PresenceRegisterModal,
  PresenceSnapshot,
} from '../../../../components/marketing/PresenceRegisterModal';

type MetricKey = 'webVisits' | 'linkedinFollowers' | 'googleProfileViews';
const METRICS: { key: MetricKey; label: string; short: string }[] = [
  { key: 'webVisits', label: 'Visitas al sitio web', short: 'Visitas' },
  { key: 'linkedinFollowers', label: 'Seguidores en LinkedIn', short: 'LinkedIn' },
  { key: 'googleProfileViews', label: 'Vistas perfil de Google', short: 'Google' },
];

const MONTH_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

const fmt = (v: number | null) => (v == null ? '—' : Number(v).toLocaleString('es-CL'));
/** YYYY-MM of the calendar month before a UTC-anchored ISO period. */
function prevMonthKey(iso: string): string {
  const d = new Date(iso);
  const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return `${p.getUTCFullYear()}-${String(p.getUTCMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(iso: string): string {
  const d = new Date(iso);
  return `${MONTH_SHORT[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}
function longMonthLabel(iso: string): string {
  const d = new Date(iso);
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export default function PresenciaPage() {
  const perms = useMarketingPermissions();
  const canWrite = useCanWriteMarketing('presenceSnapshot');
  const [snapshots, setSnapshots] = useState<PresenceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>('webVisits');
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    apiClient
      .get<PresenceSnapshot[]>('/api/marketing/presence')
      .then((data) => {
        setSnapshots(data);
        setError(null);
      })
      .catch(() => setError('No se pudieron cargar los datos de presencia.'))
      .finally(() => setLoading(false));
  }, []);

  // Only fetch once the gate has confirmed read access (avoids a guaranteed 403).
  const canRead = perms?.presenceSnapshot.read ?? false;
  useEffect(() => {
    if (canRead) fetchData();
  }, [canRead, fetchData]);

  // ── Latest month with data + calendar-previous month (for deltas) ──
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const prev = useMemo(() => {
    if (!latest) return null;
    const key = prevMonthKey(latest.period);
    return snapshots.find((s) => s.period.slice(0, 7) === key) ?? null;
  }, [latest, snapshots]);

  // ── Densified series for the selected metric: one entry per month from the earliest to
  //    the latest snapshot; months without data (or with the metric null) carry value=null
  //    so connectNulls={false} leaves a visible GAP. ──
  const series = useMemo(() => {
    if (snapshots.length === 0) return [];
    const first = new Date(snapshots[0].period);
    const last = new Date(snapshots[snapshots.length - 1].period);
    const byMonth = new Map(snapshots.map((s) => [s.period.slice(0, 7), s]));
    const out: { name: string; value: number | null }[] = [];
    const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    const end = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1));
    while (cursor.getTime() <= end.getTime()) {
      const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
      const s = byMonth.get(key);
      out.push({ name: monthLabel(cursor.toISOString()), value: s ? s[metric] : null });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return out;
  }, [snapshots, metric]);

  const pointCount = series.filter((p) => p.value != null).length;

  // ── Gate ──
  if (perms === null)
    return <div className="pt-6 text-sm text-[var(--text-secondary)]">Cargando…</div>;
  if (!canRead)
    return (
      <div className="pt-2">
        {Header(null)}
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            No tienes permiso para ver la presencia digital.
          </p>
        </div>
      </div>
    );

  return (
    <div className="pt-2">
      {Header(
        canWrite ? (
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ background: '#2563eb' }}
          >
            <Plus size={16} /> Registrar datos del mes
          </button>
        ) : null,
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[var(--text-secondary)]">Cargando datos…</div>
      ) : snapshots.length === 0 ? (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center">
          <p className="text-sm text-[var(--text-primary)]">
            Aún no hay datos de presencia digital.
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {canWrite
              ? 'Registra el primer mes con el botón «Registrar datos del mes».'
              : 'Cuando se registren datos, aquí verás la evolución mensual.'}
          </p>
        </div>
      ) : (
        <>
          {/* KPI cards — latest month with data */}
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
            Último mes con datos: {latest ? longMonthLabel(latest.period) : '—'}
          </p>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {METRICS.map((m) => (
              <KpiCard
                key={m.key}
                label={m.label}
                current={latest ? latest[m.key] : null}
                previous={prev ? prev[m.key] : null}
              />
            ))}
          </div>

          {/* Evolution chart */}
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-[var(--text-primary)]">Evolución</p>
              <div className="flex gap-1">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMetric(m.key)}
                    className="rounded-lg border px-3 py-1.5 text-sm"
                    style={
                      metric === m.key
                        ? { borderColor: '#2563eb', color: '#2563eb', fontWeight: 600 }
                        : { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }
                    }
                  >
                    {m.short}
                  </button>
                ))}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => (v ? Number(v).toLocaleString('es-CL') : '')}
                  width={48}
                />
                <Tooltip
                  formatter={(v: unknown) =>
                    v == null ? 'Sin datos' : Number(v).toLocaleString('es-CL')
                  }
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  name={METRICS.find((m) => m.key === metric)?.short}
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>

            {pointCount < 2 && (
              <p className="mt-2 text-center text-xs text-[var(--text-secondary)]">
                {pointCount === 0
                  ? 'Sin datos para esta métrica en el rango.'
                  : 'Solo hay un punto de datos: se necesitan al menos dos meses para trazar una línea.'}
              </p>
            )}
          </div>
        </>
      )}

      {modalOpen && (
        <PresenceRegisterModal
          snapshots={snapshots}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

function Header(action: React.ReactNode) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Presencia digital
        </h1>
      </div>
      {action}
    </div>
  );
}

/* A KPI card with the current value + a delta vs the previous calendar month, shown ONLY
   when BOTH months carry that metric (non-null). If the previous value is 0, show the
   absolute change (no division by zero); otherwise a one-decimal percentage. */
function KpiCard({
  label,
  current,
  previous,
}: {
  label: string;
  current: number | null;
  previous: number | null;
}) {
  const showDelta = current != null && previous != null;
  let deltaText = '';
  let up = true;
  if (showDelta) {
    if (previous === 0) {
      const abs = current - previous;
      up = abs >= 0;
      deltaText = `${up ? '+' : ''}${abs.toLocaleString('es-CL')}`;
    } else {
      const pct = ((current - previous) / previous) * 100;
      up = pct >= 0;
      deltaText = `${up ? '+' : ''}${pct.toFixed(1).replace('.', ',')}%`;
    }
  }
  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </p>
      <p className="text-2xl font-semibold text-[var(--text-primary)]">{fmt(current)}</p>
      {showDelta && (
        <p
          className="mt-1 inline-flex items-center gap-1 text-sm font-medium"
          style={{ color: up ? '#15803d' : '#b91c1c' }}
        >
          {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {deltaText}
        </p>
      )}
    </div>
  );
}
