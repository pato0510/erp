'use client';

import { useEffect, useState } from 'react';
import {
  Banknote,
  Megaphone,
  Radio,
  CalendarDays,
  TrendingUp,
  Users,
  Target,
  Coins,
} from 'lucide-react';
import Link from 'next/link';
import { KpiCard } from '../../../components/operations/dashboard/KpiCard';
import { apiClient } from '../../../lib/api';
import { formatCLP, formatDate } from '../../../lib/formatters';

/* ---- API shapes -------------------------------------------------- */

interface CampaignRoiRow {
  campaignId: string;
  campaignName: string;
  channel: string;
  cost: number | string;
  attributedRevenue: number | string;
  wonCount: number;
  roi: number | null;
}

interface GastoPorCampana {
  campaignId: string;
  name: string;
  total: number | string;
}

interface GastoPorCanal {
  channel: string;
  total: number | string;
}

interface LeadsPorCanal {
  channel: string;
  leads: number;
}

interface ProximaCampana {
  id: string;
  name: string;
  channel: string;
  startDate: string;
  endDate: string;
  cost: number | string;
  status: string;
}

interface DashboardData {
  gastoTotal: number | string;
  gastoPorCampana: GastoPorCampana[];
  gastoPorCanal: GastoPorCanal[];
  proximasCampanas: ProximaCampana[];
  /* Embudo fields (new) */
  campanasActivas: number;
  leadsGenerados: number;
  leadsPorCanal: LeadsPorCanal[];
  oportunidadesGeneradas: number;
  ventasAtribuidas: number | string;
  costoPorLead: number | string;
}

/* ---- Helpers ----------------------------------------------------- */

function channelLabel(ch: string): string {
  return ch;
}

const STATUS_STYLES: Record<string, string> = {
  BORRADOR: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
  PLANIFICADA: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  EN_PRODUCCION: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  PROGRAMADA: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
  ACTIVA: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  PAUSADA: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  FINALIZADA: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
  ANALIZADA: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

/* CampaignStatus (8) → accented Spanish labels. Never show raw enum. */
const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  BORRADOR: 'Borrador',
  PLANIFICADA: 'Planificada',
  EN_PRODUCCION: 'En producción',
  PROGRAMADA: 'Programada',
  ACTIVA: 'Activa',
  PAUSADA: 'Pausada',
  FINALIZADA: 'Finalizada',
  ANALIZADA: 'Analizada',
};

function statusBadge(status: string) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES['FINALIZADA'];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {CAMPAIGN_STATUS_LABELS[status] ?? status}
    </span>
  );
}

/* Thin skeleton */
function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-[rgba(128,128,128,0.12)] ${className}`} />
  );
}

/* Section card matching RRHH / Operaciones pattern */
function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="py-6 text-center text-xs text-[var(--text-secondary)]">{text}</p>
  );
}

/* Horizontal bar chart row — reused for "por canal" and "por campaña" */
function HBarRow({
  label,
  value,
  maxValue,
  formatValue,
}: {
  label: string;
  value: number;
  maxValue: number;
  formatValue?: (v: number) => string;
}) {
  const pct = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;
  const opacity = 0.65 + (pct / 100) * 0.35;
  const displayValue = formatValue ? formatValue(value) : formatCLP(value);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--text-primary)] truncate" title={label}>
          {label}
        </span>
        <span className="text-xs font-semibold text-[var(--text-secondary)] shrink-0">
          {displayValue}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[rgba(128,128,128,0.14)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: '#2563eb', opacity }}
        />
      </div>
    </div>
  );
}

/* ---- Page -------------------------------------------------------- */

export default function MarketingDashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [roiRows, setRoiRows] = useState<CampaignRoiRow[]>([]);
  const [roiLoading, setRoiLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiClient
      .get<DashboardData>('/api/marketing/dashboard')
      .then((data) => setDashboard(data))
      .catch(() => setError('No se pudo cargar el dashboard de Marketing.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setRoiLoading(true);
    apiClient
      .get<CampaignRoiRow[]>('/api/comercial/campaign-roi')
      .then((rows) => setRoiRows(Array.isArray(rows) ? rows : []))
      .catch(() => setRoiRows([]))
      .finally(() => setRoiLoading(false));
  }, []);

  /* Derived values — gasto */
  const gastoTotal = dashboard ? Number(dashboard.gastoTotal) : 0;

  const sortedPorCanal = dashboard
    ? [...dashboard.gastoPorCanal]
        .map((c) => ({ ...c, total: Number(c.total) }))
        .sort((a, b) => b.total - a.total)
    : [];

  const sortedPorCampana = dashboard
    ? [...dashboard.gastoPorCampana]
        .map((c) => ({ ...c, total: Number(c.total) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8)
    : [];

  const maxCanal = sortedPorCanal.length > 0 ? sortedPorCanal[0].total : 1;
  const maxCampana = sortedPorCampana.length > 0 ? sortedPorCampana[0].total : 1;

  const canalesCount = sortedPorCanal.length;

  const proximaCampana = dashboard?.proximasCampanas?.[0] ?? null;

  const activasCount = dashboard
    ? dashboard.proximasCampanas.filter((c) => c.status === 'ACTIVA').length
    : 0;

  /* Derived values — embudo */
  const campanasActivas = dashboard ? (dashboard.campanasActivas ?? activasCount) : 0;
  const leadsGenerados = dashboard ? (dashboard.leadsGenerados ?? 0) : 0;
  const oportunidadesGeneradas = dashboard ? (dashboard.oportunidadesGeneradas ?? 0) : 0;
  const ventasAtribuidas = dashboard ? Number(dashboard.ventasAtribuidas ?? 0) : 0;
  const costoPorLead = dashboard ? Number(dashboard.costoPorLead ?? 0) : 0;

  const sortedLeadsPorCanal = dashboard
    ? [...(dashboard.leadsPorCanal ?? [])]
        .sort((a, b) => b.leads - a.leads)
    : [];
  const maxLeads = sortedLeadsPorCanal.length > 0 ? sortedLeadsPorCanal[0].leads : 1;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
        >
          Dashboard Marketing
        </h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
          Resumen de campañas, gastos y canales
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ── Embudo de marketing ──────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <h2
            className="text-base font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
          >
            Embudo de marketing
          </h2>
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[rgba(37,99,235,0.1)] text-[#2563eb] uppercase tracking-wide">
            Mes actual
          </span>
        </div>

        {/* Embudo KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))
          ) : dashboard ? (
            <>
              <KpiCard
                label="Campañas activas"
                value={String(campanasActivas)}
                subtitle="Corriendo actualmente"
                icon={Megaphone}
                href="/marketing/campanas"
              />
              <KpiCard
                label="Leads generados"
                value={String(leadsGenerados)}
                subtitle="Contactos captados"
                icon={Users}
                href="/marketing/campanas"
              />
              <KpiCard
                label="Oportunidades"
                value={String(oportunidadesGeneradas)}
                subtitle="Generadas desde campañas"
                icon={Target}
                href="/comercial/pipeline"
              />
              <KpiCard
                label="Ventas atribuidas"
                value={formatCLP(ventasAtribuidas)}
                subtitle="Ingresos atribuidos"
                icon={Banknote}
                valueColor="#16a34a"
                href="/comercial/pipeline"
              />
              <KpiCard
                label="Costo por lead"
                value={costoPorLead > 0 ? formatCLP(costoPorLead) : '—'}
                subtitle="Gasto / leads generados"
                icon={Coins}
              />
            </>
          ) : null}
        </div>

        {/* Leads por canal bar chart */}
        <SectionCard
          title="Leads por canal"
          action={
            <Link href="/marketing/campanas" className="text-xs text-[#2563eb] hover:underline">
              Ver campañas →
            </Link>
          }
        >
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8" />
              ))}
            </div>
          ) : sortedLeadsPorCanal.length === 0 ? (
            <EmptyHint text="Sin leads registrados por canal." />
          ) : (
            <div className="flex flex-col gap-3">
              {sortedLeadsPorCanal.map((item) => (
                <HBarRow
                  key={item.channel}
                  label={channelLabel(item.channel)}
                  value={item.leads}
                  maxValue={maxLeads}
                  formatValue={(v) => `${v} lead${v !== 1 ? 's' : ''}`}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* KPI grid — gasto */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))
        ) : dashboard ? (
          <>
            <KpiCard
              label="Gasto total"
              value={formatCLP(gastoTotal)}
              subtitle="Suma de todos los gastos"
              icon={Banknote}
              href="/marketing/gastos"
            />
            <KpiCard
              label="Campañas activas"
              value={String(activasCount)}
              subtitle="En curso actualmente"
              icon={Megaphone}
              href="/marketing/campanas"
            />
            <KpiCard
              label="Canales"
              value={String(canalesCount)}
              subtitle="Con gasto registrado"
              icon={Radio}
            />
            <KpiCard
              label="Próxima campaña"
              value={proximaCampana ? proximaCampana.name : '—'}
              subtitle={
                proximaCampana
                  ? formatDate(proximaCampana.startDate)
                  : 'Sin campañas próximas'
              }
              icon={CalendarDays}
              href="/marketing/campanas"
            />
          </>
        ) : null}
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT col — bar charts */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* Gasto por canal */}
          <SectionCard
            title="Gasto por canal"
            action={
              <Link href="/marketing/gastos" className="text-xs text-[#2563eb] hover:underline">
                Ver gastos →
              </Link>
            }
          >
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : sortedPorCanal.length === 0 ? (
              <EmptyHint text="Sin gastos por canal registrados." />
            ) : (
              <div className="flex flex-col gap-3">
                {sortedPorCanal.map((item) => (
                  <HBarRow
                    key={item.channel}
                    label={channelLabel(item.channel)}
                    value={item.total}
                    maxValue={maxCanal}
                  />
                ))}
              </div>
            )}
          </SectionCard>

          {/* Gasto por campaña */}
          <SectionCard
            title="Gasto por campaña (top 8)"
            action={
              <Link href="/marketing/campanas" className="text-xs text-[#2563eb] hover:underline">
                Ver campañas →
              </Link>
            }
          >
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : sortedPorCampana.length === 0 ? (
              <EmptyHint text="Sin gastos de campaña registrados." />
            ) : (
              <div className="flex flex-col gap-3">
                {sortedPorCampana.map((item) => (
                  <HBarRow
                    key={item.campaignId}
                    label={item.name}
                    value={item.total}
                    maxValue={maxCampana}
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* RIGHT col — próximas campañas + accesos rápidos */}
        <div className="flex flex-col gap-6">

          {/* Próximas campañas */}
          <SectionCard
            title="Próximas campañas"
            action={
              <Link href="/marketing/campanas" className="text-xs text-[#2563eb] hover:underline">
                Ver todas →
              </Link>
            }
          >
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : !dashboard || dashboard.proximasCampanas.length === 0 ? (
              <EmptyHint text="Sin campañas próximas registradas." />
            ) : (
              <div className="flex flex-col divide-y divide-[var(--border-color)]">
                {dashboard.proximasCampanas.map((camp) => (
                  <div
                    key={camp.id}
                    className="py-3 first:pt-0 last:pb-0 flex flex-col gap-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-[var(--text-primary)] leading-snug truncate">
                        {camp.name}
                      </p>
                      {statusBadge(camp.status)}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-[rgba(37,99,235,0.1)] text-[#2563eb]">
                        {channelLabel(camp.channel)}
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        {formatDate(camp.startDate)} – {formatDate(camp.endDate)}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                      {formatCLP(Number(camp.cost))}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Accesos rápidos */}
          <SectionCard title="Accesos rápidos">
            <div className="flex flex-col gap-2">
              {[
                { label: 'Campañas', href: '/marketing/campanas' },
                { label: 'Gastos de marketing', href: '/marketing/gastos' },
                { label: 'Posicionamiento SEO', href: '/marketing/seo' },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center justify-between rounded-lg border border-[var(--border-color)] px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[rgba(37,99,235,0.06)] hover:border-[#2563eb] transition-colors"
                >
                  {link.label}
                  <span className="text-[var(--text-secondary)] text-xs">→</span>
                </Link>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── ROI por campaña (atribuido desde Comercial) ────────────── */}
      <div className="mt-6">
        <SectionCard
          title="ROI por campaña (atribuido desde Comercial)"
          action={
            <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
              <TrendingUp className="h-3.5 w-3.5" />
              Ingreso de oportunidades ganadas
            </span>
          }
        >
          {roiLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : roiRows.length === 0 ? (
            <EmptyHint text="Sin campañas con atribución de ingresos registradas. Cierra oportunidades vinculadas a campañas para ver el ROI aquí." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-color)]">
                    <th className="pb-2 text-left text-xs font-semibold text-[var(--text-secondary)]">
                      Campaña
                    </th>
                    <th className="pb-2 text-left text-xs font-semibold text-[var(--text-secondary)]">
                      Canal
                    </th>
                    <th className="pb-2 text-right text-xs font-semibold text-[var(--text-secondary)]">
                      Costo
                    </th>
                    <th className="pb-2 text-right text-xs font-semibold text-[var(--text-secondary)]">
                      Ingreso atribuido
                    </th>
                    <th className="pb-2 text-right text-xs font-semibold text-[var(--text-secondary)]">
                      # Ganadas
                    </th>
                    <th className="pb-2 text-right text-xs font-semibold text-[var(--text-secondary)]">
                      ROI
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {roiRows.map((row) => {
                    const roiValue = row.roi;
                    const roiLabel =
                      roiValue === null
                        ? '—'
                        : (roiValue >= 0 ? '+' : '') +
                          Math.round(roiValue * 100) +
                          '%';
                    const roiColor =
                      roiValue === null
                        ? 'text-[var(--text-secondary)]'
                        : roiValue > 0
                        ? 'text-[#16a34a]'
                        : 'text-[#b91c1c]';

                    return (
                      <tr key={row.campaignId} className="group">
                        <td className="py-2.5 pr-3 font-medium text-[var(--text-primary)] max-w-[200px] truncate">
                          {row.campaignName}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-[rgba(37,99,235,0.1)] text-[#2563eb] whitespace-nowrap">
                            {row.channel}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right text-xs text-[var(--text-secondary)] whitespace-nowrap">
                          {formatCLP(Number(row.cost))}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap">
                          {formatCLP(Number(row.attributedRevenue))}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-xs text-[var(--text-secondary)]">
                          {row.wonCount}
                        </td>
                        <td className={`py-2.5 text-right text-xs font-bold whitespace-nowrap ${roiColor}`}>
                          {roiLabel}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
