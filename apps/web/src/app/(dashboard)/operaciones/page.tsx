'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  BookMarked,
  Calendar,
  CheckCircle2,
  ClipboardList,
  ClockAlert,
  Database,
  FileText,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { ActionItemRow } from '../../../components/operations/dashboard/ActionItemRow';
import { ActivityStreamItem } from '../../../components/operations/dashboard/ActivityStreamItem';
import { AssetRiskCard } from '../../../components/operations/dashboard/AssetRiskCard';
import { ComplianceBarChart } from '../../../components/operations/dashboard/ComplianceBarChart';
import { KpiCard } from '../../../components/operations/dashboard/KpiCard';
import { MyTasksWidget } from '../../../components/operations/dashboard/MyTasksWidget';
import { StatusDistributionDonut } from '../../../components/operations/dashboard/StatusDistributionDonut';
import { UpcomingEventRow } from '../../../components/operations/dashboard/UpcomingEventRow';
import { thresholdColor } from '../../../components/operations/dashboard/types';
import type {
  DashboardActionItems,
  DashboardActivityEvent,
  DashboardAssetDistribution,
  DashboardAssetRiskRow,
  DashboardComplianceByCategory,
  DashboardMyTasks,
  DashboardOverview,
  DashboardUpcomingEvents,
  UpcomingDocumentRow,
  UpcomingPermitRow,
  UpcomingWorkPermitRow,
  UpcomingAcknowledgmentRow,
} from '../../../components/operations/dashboard/types';

const REFRESH_INTERVAL_MS = 60_000;

/* OPS-034 — shape returned by GET /api/operations/dashboard/freshness.
   Each timestamp comes from the corresponding MV's `refreshed_at`
   column; null means the MV is empty (typically the case for a brand
   new install before the first cron tick has run). */
interface DashboardFreshness {
  assetCompliance: string | null;
  companySummary: string | null;
  complianceByCategory: string | null;
  statusDistribution: string | null;
}

interface DashboardState {
  overview: DashboardOverview | null;
  actionItems: DashboardActionItems | null;
  upcomingEvents: DashboardUpcomingEvents | null;
  topAssets: DashboardAssetRiskRow[];
  recentActivity: DashboardActivityEvent[];
  myTasks: DashboardMyTasks | null;
  assetDistribution: DashboardAssetDistribution | null;
  complianceByCategory: DashboardComplianceByCategory;
  freshness: DashboardFreshness | null;
}

const EMPTY_STATE: DashboardState = {
  overview: null,
  actionItems: null,
  upcomingEvents: null,
  topAssets: [],
  recentActivity: [],
  myTasks: null,
  assetDistribution: null,
  complianceByCategory: [],
  freshness: null,
};

/* "hace X min/h" formatter. Same shape used elsewhere in the app
   (e.g. ActivityStreamItem) but kept local because the component is
   tiny and this avoids growing the shared utils API. */
function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'sin datos';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'ahora';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

/* Local time-window buckets: rather than a horizontal timeline (which
   needs a real chart library and a lot of polish), the spec accepts a
   grouped list. Grouping is by daysRemaining → "Esta semana" /
   "Próximas 2 semanas" / "Próximo mes". Each bucket fans out into
   its own row component. */
type UpcomingBucketName = 'week' | 'two-weeks' | 'month';
const BUCKET_LABELS: Record<UpcomingBucketName, string> = {
  week: 'Esta semana',
  'two-weeks': 'Próximas 2 semanas',
  month: 'Próximo mes',
};
function bucketFor(days: number | null): UpcomingBucketName {
  if (days === null || days <= 7) return 'week';
  if (days <= 14) return 'two-weeks';
  return 'month';
}

/* ---- Skeletons -------------------------------------------------- */

function CardSkeleton({ height = 'h-24' }: { height?: string }) {
  return (
    <div
      className={`bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5 ${height}`}
    >
      <div className="h-3 w-24 animate-pulse rounded bg-[rgba(0,0,0,0.06)]" />
      <div className="mt-3 h-7 w-16 animate-pulse rounded bg-[rgba(0,0,0,0.06)]" />
      <div className="mt-2 h-3 w-32 animate-pulse rounded bg-[rgba(0,0,0,0.06)]" />
    </div>
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
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ---- Page ------------------------------------------------------- */

export default function OperacionesDashboardPage() {
  const [state, setState] = useState<DashboardState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchAll = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [
        overview,
        actionItems,
        upcomingEvents,
        topAssets,
        recentActivity,
        myTasks,
        assetDistribution,
        complianceByCategory,
        freshness,
      ] = await Promise.all([
        apiClient.get<DashboardOverview>('/api/operations/dashboard/overview'),
        apiClient.get<DashboardActionItems>('/api/operations/dashboard/action-items'),
        apiClient.get<DashboardUpcomingEvents>(
          '/api/operations/dashboard/upcoming-events?daysAhead=30',
        ),
        apiClient.get<DashboardAssetRiskRow[]>(
          '/api/operations/dashboard/top-assets-at-risk?limit=5',
        ),
        apiClient.get<DashboardActivityEvent[]>(
          '/api/operations/dashboard/recent-activity?limit=15',
        ),
        apiClient.get<DashboardMyTasks>('/api/operations/dashboard/my-tasks'),
        apiClient.get<DashboardAssetDistribution>('/api/operations/dashboard/asset-distribution'),
        apiClient.get<DashboardComplianceByCategory>(
          '/api/operations/dashboard/compliance-by-category',
        ),
        apiClient.get<DashboardFreshness>('/api/operations/dashboard/freshness'),
      ]);
      setState({
        overview,
        actionItems,
        upcomingEvents,
        topAssets,
        recentActivity,
        myTasks,
        assetDistribution,
        complianceByCategory,
        freshness,
      });
      setLastUpdated(new Date());
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'No se pudo cargar el dashboard. Intenta nuevamente.';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll(false);
    const id = setInterval(() => fetchAll(true), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  const overview = state.overview;
  const actionItems = state.actionItems;
  const upcoming = state.upcomingEvents;
  const myTasks = state.myTasks;
  const distribution = state.assetDistribution;
  const compliance = state.complianceByCategory;
  const topAssets = state.topAssets;
  const activity = state.recentActivity;

  /* Threshold-driven KPI tints — recomputed on every render but the
     overview prop is small and stable so this is essentially free. */
  const opPct = overview?.operationalHealth.operationalPercentage ?? 0;
  const docPct = overview?.documentCompliance.compliancePercentage ?? 0;
  const opColor = thresholdColor(opPct);
  const docColor = thresholdColor(docPct);
  const ackPct = overview?.procedures.coveragePercentage ?? 0;
  const ackColor = thresholdColor(ackPct);

  const hasUrgentItems = useMemo(() => {
    if (!actionItems) return false;
    return (
      actionItems.blockedAssets.length > 0 ||
      actionItems.criticalUnattendedAlerts.length > 0 ||
      actionItems.expiredWorkPermits.length > 0 ||
      actionItems.expiringExceptions.length > 0
    );
  }, [actionItems]);

  /* Group upcoming events into the 3 time buckets the spec asks for. */
  const upcomingByBucket = useMemo(() => {
    const buckets: Record<
      UpcomingBucketName,
      Array<{ kind: string; node: React.ReactNode; days: number | null }>
    > = {
      week: [],
      'two-weeks': [],
      month: [],
    };
    if (!upcoming) return buckets;
    const pushDocs = (rows: UpcomingDocumentRow[]) => {
      for (const r of rows) {
        buckets[bucketFor(r.daysRemaining)].push({
          kind: 'document',
          days: r.daysRemaining,
          node: (
            <UpcomingEventRow
              key={`doc-${r.documentRecordId}`}
              kind="document"
              title={`${r.asset?.code ?? '—'} · ${r.type.name}`}
              subtitle={
                r.asset?.name
                  ? `${r.asset.name} — vence ${formatShortDate(r.expirationDate)}`
                  : `Vence ${formatShortDate(r.expirationDate)}`
              }
              daysRemaining={r.daysRemaining}
              href={
                r.asset?.id
                  ? `/operaciones/equipos/${r.asset.id}/carpeta`
                  : '/operaciones/documentos'
              }
            />
          ),
        });
      }
    };
    const pushPermits = (rows: UpcomingPermitRow[]) => {
      for (const r of rows) {
        buckets[bucketFor(r.daysRemaining)].push({
          kind: 'permit',
          days: r.daysRemaining,
          node: (
            <UpcomingEventRow
              key={`per-${r.permitId}`}
              kind="permit"
              title={`${r.permitNumber} · ${r.type.name}`}
              subtitle={
                r.target
                  ? `${r.target.code ?? r.target.name} — vence ${formatShortDate(r.expirationDate)}`
                  : `Vence ${formatShortDate(r.expirationDate)}`
              }
              daysRemaining={r.daysRemaining}
              href="/operaciones/permisos"
            />
          ),
        });
      }
    };
    const pushWorkPermits = (rows: UpcomingWorkPermitRow[]) => {
      for (const r of rows) {
        const days = Math.max(
          0,
          Math.floor((new Date(r.plannedStart).getTime() - Date.now()) / 86_400_000),
        );
        buckets[bucketFor(days)].push({
          kind: 'work-permit',
          days,
          node: (
            <UpcomingEventRow
              key={`wp-${r.id}`}
              kind="work-permit"
              title={`${r.permitNumber} · ${r.title}`}
              subtitle={`Inicio ${formatShortDate(r.plannedStart)} — ${r.status}`}
              daysRemaining={days}
              href={`/operaciones/permisos/trabajo/${r.id}`}
            />
          ),
        });
      }
    };
    const pushAcks = (rows: UpcomingAcknowledgmentRow[]) => {
      for (const r of rows) {
        buckets[bucketFor(r.daysRemaining)].push({
          kind: 'acknowledgment',
          days: r.daysRemaining,
          node: (
            <UpcomingEventRow
              key={`ack-${r.procedureId}`}
              kind="acknowledgment"
              title={`${r.code} · ${r.title}`}
              subtitle={r.dueDate ? `Vence ${formatShortDate(r.dueDate)}` : undefined}
              daysRemaining={r.daysRemaining}
              href="/operaciones/mis-lecturas"
            />
          ),
        });
      }
    };
    pushDocs(upcoming.documentsExpiring);
    pushPermits(upcoming.permitsExpiring);
    pushWorkPermits(upcoming.workPermitsScheduled);
    pushAcks(upcoming.pendingAcknowledgments);
    /* Sort each bucket by days ascending so most urgent items lead. */
    for (const k of Object.keys(buckets) as UpcomingBucketName[]) {
      buckets[k].sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
    }
    return buckets;
  }, [upcoming]);

  const maxRiskScore = useMemo(
    () => topAssets.reduce((m, r) => Math.max(m, r.score), 0),
    [topAssets],
  );

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
            Dashboard Operacional
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Estado general del módulo de operaciones
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-[var(--text-secondary)]">
              Actualizado{' '}
              {lastUpdated.toLocaleTimeString('es-CL', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          {state.freshness && (
            <span
              className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]"
              title={
                'Los KPIs principales se calculan a partir de vistas materializadas que se ' +
                'refrescan automáticamente cada 15 minutos para mantener el dashboard rápido. ' +
                'La actividad reciente, las acciones inmediatas y "Mis tareas" son siempre en ' +
                'tiempo real.'
              }
            >
              <Database size={11} aria-hidden />
              KPIs: {formatRelativeTime(state.freshness.companySummary)}
            </span>
          )}
          <button
            type="button"
            onClick={() => fetchAll(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))] disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Action items banner — only when something needs attention. */}
      {hasUrgentItems && actionItems && (
        <div
          className="mb-6 rounded-xl border p-4"
          style={{
            backgroundColor: 'rgba(239,68,68,0.06)',
            borderColor: 'rgba(239,68,68,0.35)',
          }}
        >
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700">
            <AlertTriangle size={16} />
            Acción inmediata
          </div>
          <div className="flex flex-col gap-1">
            {actionItems.blockedAssets.length > 0 && (
              <ActionItemRow
                icon={ShieldOff}
                tone="red"
                title={`${actionItems.blockedAssets.length} activo${
                  actionItems.blockedAssets.length === 1 ? '' : 's'
                } bloqueado${actionItems.blockedAssets.length === 1 ? '' : 's'} por documentos`}
                detail={actionItems.blockedAssets
                  .slice(0, 3)
                  .map((a) => a.code)
                  .join(' · ')}
                href="/operaciones/equipos?status=BLOCKED_DOCUMENTAL"
              />
            )}
            {actionItems.criticalUnattendedAlerts.length > 0 && (
              <ActionItemRow
                icon={AlertCircle}
                tone="red"
                title={`${actionItems.criticalUnattendedAlerts.length} alerta${
                  actionItems.criticalUnattendedAlerts.length === 1 ? '' : 's'
                } crítica${
                  actionItems.criticalUnattendedAlerts.length === 1 ? '' : 's'
                } sin atender hace más de 24h`}
                detail={actionItems.criticalUnattendedAlerts[0]?.title}
                href="/operaciones/alertas?severity=CRITICAL"
              />
            )}
            {actionItems.expiredWorkPermits.length > 0 && (
              <ActionItemRow
                icon={ClockAlert}
                tone="orange"
                title={`${actionItems.expiredWorkPermits.length} permiso${
                  actionItems.expiredWorkPermits.length === 1 ? '' : 's'
                } de trabajo vencieron sin cierre`}
                detail={actionItems.expiredWorkPermits
                  .slice(0, 3)
                  .map((p) => p.permitNumber)
                  .join(' · ')}
                href="/operaciones/permisos"
              />
            )}
            {actionItems.expiringExceptions.length > 0 && (
              <ActionItemRow
                icon={ShieldOff}
                tone="orange"
                title={`${actionItems.expiringExceptions.length} excepción${
                  actionItems.expiringExceptions.length === 1 ? 'es' : 'es'
                } expira${actionItems.expiringExceptions.length === 1 ? '' : 'n'} esta semana`}
                detail={actionItems.expiringExceptions
                  .slice(0, 3)
                  .map((e) => e.asset?.code ?? 'sin activo')
                  .join(' · ')}
                href="/operaciones/excepciones?status=APPROVED"
              />
            )}
          </div>
        </div>
      )}

      {/* KPI grid (6 cards in 2 rows) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {loading && !overview ? (
          Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
        ) : overview ? (
          <>
            <KpiCard
              label="Activos operativos"
              value={`${overview.operationalHealth.operationalAssets} / ${overview.operationalHealth.totalActiveAssets}`}
              subtitle={`${overview.operationalHealth.operationalPercentage}% disponibles`}
              icon={Wrench}
              valueColor={opColor}
              href="/operaciones/equipos"
            />
            <KpiCard
              label="Cumplimiento documental"
              value={`${overview.documentCompliance.compliancePercentage}%`}
              subtitle={`${overview.documentCompliance.expired} vencidos · ${overview.documentCompliance.expiringSoon} por vencer`}
              icon={FileText}
              valueColor={docColor}
              href="/operaciones/documentos"
            />
            <KpiCard
              label="Alertas críticas"
              value={String(overview.alerts.critical)}
              subtitle={`${overview.alerts.unattended} sin atender · ${overview.alerts.escalated} escaladas`}
              icon={Bell}
              valueColor={overview.alerts.critical > 0 ? '#b91c1c' : undefined}
              href="/operaciones/alertas?severity=CRITICAL"
            />
            <KpiCard
              label="PT en ejecución ahora"
              value={String(overview.workPermits.inExecution)}
              subtitle={`${overview.workPermits.pendingAuthorization} pendientes de autorización`}
              icon={ShieldCheck}
              valueColor={overview.workPermits.inExecution > 0 ? '#0d9488' : undefined}
              href="/operaciones/permisos"
            />
            <KpiCard
              label="Acuses pendientes"
              value={String(overview.procedures.pendingMyAck)}
              subtitle={`Cobertura empresa: ${overview.procedures.coveragePercentage}%`}
              icon={BookMarked}
              valueColor={overview.procedures.pendingMyAck > 0 ? '#c2410c' : ackColor}
              href="/operaciones/mis-lecturas"
            />
            <KpiCard
              label="Excepciones activas"
              value={String(overview.exceptions.activeCount)}
              subtitle={`${overview.exceptions.expiringSoon} vencen esta semana · ${overview.exceptions.pendingApproval} pendientes`}
              icon={ShieldOff}
              valueColor={overview.exceptions.expiringSoon > 0 ? '#a16207' : undefined}
              href="/operaciones/excepciones"
            />
          </>
        ) : null}
      </div>

      {/* Two-column main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN — spans 2 columns on lg+ */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <SectionCard
            title="Próximos 30 días"
            action={
              <a
                href="/operaciones/calendario"
                className="text-xs text-[var(--accent-color,#2563eb)] hover:underline"
              >
                Ver calendario completo →
              </a>
            }
          >
            {loading && !upcoming ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-[rgba(0,0,0,0.04)]" />
                ))}
              </div>
            ) : upcoming &&
              upcomingByBucket.week.length +
                upcomingByBucket['two-weeks'].length +
                upcomingByBucket.month.length >
                0 ? (
              <div className="flex flex-col gap-4">
                {(['week', 'two-weeks', 'month'] as const).map((bucket) => {
                  const items = upcomingByBucket[bucket];
                  if (items.length === 0) return null;
                  return (
                    <div key={bucket}>
                      <div className="mb-1 flex items-center gap-2">
                        <Calendar size={12} className="text-[var(--text-secondary)]" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                          {BUCKET_LABELS[bucket]} · {items.length}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {items.slice(0, 8).map((it) => it.node)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyHint icon={CheckCircle2} text="Sin vencimientos próximos." />
            )}
          </SectionCard>

          <SectionCard
            title="Top 5 activos en riesgo"
            action={
              <a
                href="/operaciones/equipos"
                className="text-xs text-[var(--accent-color,#2563eb)] hover:underline"
              >
                Ver todos →
              </a>
            }
          >
            {loading && topAssets.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded bg-[rgba(0,0,0,0.04)]" />
                ))}
              </div>
            ) : topAssets.length > 0 ? (
              <div className="flex flex-col gap-2">
                {topAssets.map((row) => (
                  <AssetRiskCard key={row.asset.id} row={row} maxScore={maxRiskScore} />
                ))}
              </div>
            ) : (
              <EmptyHint icon={CheckCircle2} text="Ningún activo registra problemas activos." />
            )}
          </SectionCard>

          <SectionCard title="Actividad reciente">
            {loading && activity.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-[rgba(0,0,0,0.04)]" />
                ))}
              </div>
            ) : activity.length > 0 ? (
              <div className="flex flex-col gap-0.5 max-h-[420px] overflow-y-auto">
                {activity.map((event) => (
                  <ActivityStreamItem key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <EmptyHint icon={TrendingUp} text="Aún no hay actividad reciente." />
            )}
          </SectionCard>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-6">
          <SectionCard title="Distribución de activos">
            {loading && !distribution ? (
              <div className="h-44 animate-pulse rounded bg-[rgba(0,0,0,0.04)]" />
            ) : distribution ? (
              <StatusDistributionDonut data={distribution} />
            ) : null}
          </SectionCard>

          <SectionCard title="Cumplimiento por categoría">
            {loading && compliance.length === 0 ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-[rgba(0,0,0,0.04)]" />
                ))}
              </div>
            ) : compliance.length > 0 ? (
              <ComplianceBarChart rows={compliance} />
            ) : (
              <EmptyHint icon={ClipboardList} text="Aún no hay datos de cumplimiento." />
            )}
          </SectionCard>

          <SectionCard title="Mis tareas">
            {loading && !myTasks ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-[rgba(0,0,0,0.04)]" />
                ))}
              </div>
            ) : myTasks ? (
              <MyTasksWidget data={myTasks} />
            ) : null}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

/* Tiny inline empty-state component — used by 4 sections so worth
   factoring out, but small enough that a separate file would be
   noise. */
function EmptyHint({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-xs text-[var(--text-secondary)]">
      <Icon size={20} className="opacity-60" />
      <span>{text}</span>
    </div>
  );
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}
