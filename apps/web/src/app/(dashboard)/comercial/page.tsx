'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, Percent, Banknote, Inbox, Users, KanbanSquare, FileText, Tag } from 'lucide-react';
import Link from 'next/link';
import { KpiCard } from '../../../components/operations/dashboard/KpiCard';
import { apiClient } from '../../../lib/api';
import { formatCLP } from '../../../lib/formatters';

/* ---- API shapes -------------------------------------------------- */

interface ByStageItem {
  stageId: string;
  name: string;
  order: number;
  count: number;
  value: number | string;
}

interface TopClienteItem {
  counterpartyId: string;
  name: string;
  value: number | string;
  count: number;
}

interface VentasPorServicioItem {
  serviceId: string;
  serviceName: string;
  total: number | string;
  wonCount: number;
}

interface DashboardData {
  pipelineValue: number | string;
  conversionRate: number | null;
  ventasDelMes: number | string;
  byStage: ByStageItem[];
  topClientes: TopClienteItem[];
  leadsNuevos: number;
  leadToOppConversion: number | null;
  ventasPorServicio: VentasPorServicioItem[];
}

/* ---- Helpers ----------------------------------------------------- */

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-[rgba(128,128,128,0.12)] ${className}`} />
  );
}

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

/* Simple horizontal bar row used in both chart sections */
function BarRow({
  label,
  sublabel,
  pct,
  color = '#2563eb',
  opacity,
}: {
  label: string;
  sublabel: string;
  pct: number;
  color?: string;
  opacity?: number;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-[var(--text-primary)] truncate">{label}</span>
        <span className="text-xs text-[var(--text-secondary)] shrink-0">{sublabel}</span>
      </div>
      <div className="h-2.5 rounded-full bg-[rgba(128,128,128,0.14)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.max(4, pct)}%`,
            background: color,
            opacity: opacity ?? (0.6 + (pct / 100) * 0.4),
          }}
        />
      </div>
    </div>
  );
}

/* ---- Page -------------------------------------------------------- */

export default function ComercialDashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiClient
      .get<DashboardData>('/api/comercial/dashboard')
      .then((data) => setDashboard(data))
      .catch(() => setError('No se pudo cargar el dashboard comercial.'))
      .finally(() => setLoading(false));
  }, []);

  /* Derived values */
  const pipelineValue = dashboard ? Number(dashboard.pipelineValue) : 0;
  const ventasDelMes = dashboard ? Number(dashboard.ventasDelMes) : 0;
  const conversionRate = dashboard?.conversionRate ?? null;
  const leadToOppConversion = dashboard?.leadToOppConversion ?? null;
  const leadsNuevos = dashboard?.leadsNuevos ?? 0;

  const conversionLabel =
    conversionRate === null ? '—' : `${Math.round(conversionRate * 100)}%`;

  const leadConversionLabel =
    leadToOppConversion === null ? '—' : `${Math.round(leadToOppConversion * 100)}%`;

  const sortedStages = dashboard
    ? [...dashboard.byStage].sort((a, b) => a.order - b.order)
    : [];

  const maxStageValue =
    sortedStages.length > 0
      ? Math.max(1, ...sortedStages.map((s) => Number(s.value)))
      : 1;

  const sortedServicios = dashboard
    ? [...dashboard.ventasPorServicio].sort((a, b) => Number(b.total) - Number(a.total))
    : [];

  const maxServicioValue =
    sortedServicios.length > 0
      ? Math.max(1, ...sortedServicios.map((s) => Number(s.total)))
      : 1;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: '#2563eb', fontFamily: 'var(--font-jetbrains-mono), monospace' }}
        >
          Comercial · CRM
        </span>
        <h1
          className="mt-1 text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
        >
          Dashboard Comercial
        </h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
          Resumen del pipeline, leads y actividad comercial
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* KPI grid — row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))
        ) : dashboard ? (
          <>
            <KpiCard
              label="Valor del pipeline"
              value={formatCLP(pipelineValue)}
              subtitle="Total oportunidades abiertas"
              icon={TrendingUp}
            />
            <KpiCard
              label="Conversión opp → venta"
              value={conversionLabel}
              subtitle="Oportunidades ganadas vs cerradas"
              icon={Percent}
            />
            <KpiCard
              label="Ventas del mes"
              value={formatCLP(ventasDelMes)}
              subtitle="Oportunidades ganadas este mes"
              icon={Banknote}
              valueColor="#16a34a"
            />
            <KpiCard
              label="Leads nuevos"
              value={String(leadsNuevos)}
              subtitle="Leads sin contactar aún"
              icon={Inbox}
              href="/comercial/leads"
            />
          </>
        ) : null}
      </div>

      {/* KPI grid — row 2 (secondary metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))
        ) : dashboard ? (
          <>
            <KpiCard
              label="Conversión lead → oportunidad"
              value={leadConversionLabel}
              subtitle="Leads convertidos vs total"
              icon={KanbanSquare}
            />
            <KpiCard
              label="Clientes en pipeline"
              value={String(dashboard.topClientes.length)}
              subtitle="Clientes con oportunidades activas"
              icon={Users}
              href="/comercial/clientes"
            />
            <KpiCard
              label="Servicios con ventas"
              value={String(sortedServicios.filter((s) => Number(s.total) > 0).length)}
              subtitle="Servicios con oportunidades ganadas"
              icon={Tag}
              href="/comercial/cotizaciones"
            />
          </>
        ) : null}
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT — charts */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Pipeline por etapa */}
          <SectionCard
            title="Pipeline por etapa"
            action={
              <Link href="/comercial/pipeline" className="text-xs text-[#2563eb] hover:underline">
                Ver pipeline →
              </Link>
            }
          >
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : sortedStages.length === 0 ? (
              <EmptyHint text="No hay etapas con oportunidades en el pipeline." />
            ) : (
              <div className="flex flex-col gap-4">
                {sortedStages.map((stage) => {
                  const val = Number(stage.value);
                  const pct = maxStageValue > 0 ? (val / maxStageValue) * 100 : 4;
                  return (
                    <BarRow
                      key={stage.stageId}
                      label={stage.name}
                      sublabel={`${stage.count} oport. · ${formatCLP(val)}`}
                      pct={pct}
                    />
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* Ventas por servicio */}
          <SectionCard
            title="Ventas por servicio"
            action={
              <Link
                href="/comercial/cotizaciones"
                className="text-xs text-[#2563eb] hover:underline"
              >
                Ver cotizaciones →
              </Link>
            }
          >
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : sortedServicios.length === 0 ? (
              <EmptyHint text="Sin servicios con ventas registradas." />
            ) : (
              <div className="flex flex-col gap-4">
                {sortedServicios.map((srv) => {
                  const total = Number(srv.total);
                  const pct = maxServicioValue > 0 ? (total / maxServicioValue) * 100 : 4;
                  return (
                    <BarRow
                      key={srv.serviceId}
                      label={srv.serviceName}
                      sublabel={`${srv.wonCount} ganada${srv.wonCount !== 1 ? 's' : ''} · ${formatCLP(total)}`}
                      pct={pct}
                      color="#2563eb"
                    />
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>

        {/* RIGHT — top clientes + quick links */}
        <div className="flex flex-col gap-6">
          {/* Top clientes */}
          <SectionCard
            title="Top clientes"
            action={
              <Link href="/comercial/clientes" className="text-xs text-[#2563eb] hover:underline">
                Ver todos →
              </Link>
            }
          >
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : !dashboard || dashboard.topClientes.length === 0 ? (
              <EmptyHint text="Sin clientes con oportunidades registradas." />
            ) : (
              <div className="flex flex-col divide-y divide-[var(--border-color)]">
                {dashboard.topClientes.map((cliente, idx) => (
                  <Link
                    key={cliente.counterpartyId}
                    href="/comercial/clientes"
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:bg-[rgba(37,99,235,0.04)] rounded-lg px-1 -mx-1 transition-colors group"
                  >
                    {/* Rank badge */}
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{
                        background:
                          idx === 0
                            ? 'rgba(37,99,235,0.15)'
                            : idx === 1
                            ? 'rgba(37,99,235,0.08)'
                            : 'rgba(128,128,128,0.1)',
                        color: idx < 2 ? '#2563eb' : 'var(--text-secondary)',
                      }}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate group-hover:text-[#2563eb] transition-colors">
                        {cliente.name}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {cliente.count} oportunidad{cliente.count !== 1 ? 'es' : ''}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-[var(--text-primary)] shrink-0">
                      {formatCLP(Number(cliente.value))}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Quick links */}
          <SectionCard title="Accesos rápidos">
            <div className="flex flex-col gap-2">
              {[
                { label: 'Pipeline Kanban', href: '/comercial/pipeline', icon: KanbanSquare },
                { label: 'Leads', href: '/comercial/leads', icon: Inbox },
                { label: 'Clientes', href: '/comercial/clientes', icon: Users },
                { label: 'Cotizaciones', href: '/comercial/cotizaciones', icon: FileText },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-2.5 justify-between rounded-lg border border-[var(--border-color)] px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[rgba(37,99,235,0.06)] hover:border-[#2563eb] transition-colors group"
                >
                  <span className="flex items-center gap-2.5">
                    <link.icon
                      size={14}
                      className="text-[var(--text-secondary)] group-hover:text-[#2563eb] transition-colors"
                    />
                    {link.label}
                  </span>
                  <span className="text-[var(--text-secondary)] text-xs">→</span>
                </Link>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
