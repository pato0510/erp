'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  CheckSquare,
  BarChart2,
  Users,
  Tag,
  Target,
  TrendingUp,
  DollarSign,
  MapPin,
  Layers,
  UserCircle,
  Clock,
  CheckCircle2,
  Circle,
  AlertCircle,
  ExternalLink,
  Briefcase,
} from 'lucide-react';
import { KpiCard } from '../../../../../components/operations/dashboard/KpiCard';
import { apiClient } from '../../../../../lib/api';
import { formatCLP, formatDate } from '../../../../../lib/formatters';

/* ── Enum label maps ─────────────────────────────────────────────────── */

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

const CALENDAR_ITEM_TYPE_LABELS: Record<string, string> = {
  CAMPANA: 'Campaña',
  PUBLICACION: 'Publicación',
  CONTENIDO_SEO: 'Contenido SEO',
  EMAIL: 'Email',
  CAMPANA_PAGADA: 'Campaña pagada',
  EVENTO: 'Evento',
  TAREA: 'Tarea',
  ACCION_CRM: 'Acción CRM',
};

const CALENDAR_ITEM_STATUS_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROGRESO: 'En progreso',
  PROGRAMADO: 'Programado',
  PUBLICADO: 'Publicado',
  COMPLETADO: 'Completado',
  CANCELADO: 'Cancelado',
};

const TASK_TYPE_LABELS: Record<string, string> = {
  CONTENIDO: 'Contenido',
  DISENO: 'Diseño',
  APROBACION: 'Aprobación',
  CONFIGURACION: 'Configuración',
  PUBLICACION: 'Publicación',
  REVISION: 'Revisión',
  CONTACTO_LEADS: 'Contacto leads',
};

/* ── Campaign status chip colors ────────────────────────────────────── */

function campaignStatusStyle(status: string): { bg: string; text: string; border: string } {
  switch (status) {
    case 'ACTIVA':        return { bg: 'rgba(34,197,94,0.12)',  text: '#15803d', border: 'rgba(34,197,94,0.3)' };
    case 'PLANIFICADA':   return { bg: 'rgba(37,99,235,0.12)',  text: '#1d4ed8', border: 'rgba(37,99,235,0.3)' };
    case 'EN_PRODUCCION': return { bg: 'rgba(99,102,241,0.12)', text: '#4f46e5', border: 'rgba(99,102,241,0.3)' };
    case 'PROGRAMADA':    return { bg: 'rgba(14,165,233,0.12)', text: '#0284c7', border: 'rgba(14,165,233,0.3)' };
    case 'PAUSADA':       return { bg: 'rgba(234,179,8,0.12)',  text: '#a16207', border: 'rgba(234,179,8,0.3)' };
    case 'FINALIZADA':    return { bg: 'rgba(148,163,184,0.1)', text: '#475569', border: 'rgba(148,163,184,0.3)' };
    case 'ANALIZADA':     return { bg: 'rgba(168,85,247,0.12)', text: '#7c3aed', border: 'rgba(168,85,247,0.3)' };
    case 'BORRADOR':      return { bg: 'rgba(148,163,184,0.1)', text: '#64748b', border: 'rgba(148,163,184,0.3)' };
    default:              return { bg: 'rgba(148,163,184,0.1)', text: '#64748b', border: 'rgba(148,163,184,0.3)' };
  }
}

function calendarItemTypeStyle(type: string): { bg: string; text: string; border: string } {
  switch (type) {
    case 'CAMPANA':        return { bg: 'rgba(37,99,235,0.12)',  text: '#1d4ed8', border: 'rgba(37,99,235,0.3)' };
    case 'PUBLICACION':    return { bg: 'rgba(34,197,94,0.12)',  text: '#15803d', border: 'rgba(34,197,94,0.3)' };
    case 'CONTENIDO_SEO':  return { bg: 'rgba(168,85,247,0.12)', text: '#7c3aed', border: 'rgba(168,85,247,0.3)' };
    case 'EMAIL':          return { bg: 'rgba(234,179,8,0.12)',  text: '#a16207', border: 'rgba(234,179,8,0.3)' };
    case 'CAMPANA_PAGADA': return { bg: 'rgba(239,68,68,0.12)',  text: '#dc2626', border: 'rgba(239,68,68,0.3)' };
    case 'EVENTO':         return { bg: 'rgba(14,165,233,0.12)', text: '#0284c7', border: 'rgba(14,165,233,0.3)' };
    case 'TAREA':          return { bg: 'rgba(148,163,184,0.1)', text: '#475569', border: 'rgba(148,163,184,0.3)' };
    case 'ACCION_CRM':     return { bg: 'rgba(99,102,241,0.12)', text: '#4f46e5', border: 'rgba(99,102,241,0.3)' };
    default:               return { bg: 'rgba(148,163,184,0.1)', text: '#64748b', border: 'rgba(148,163,184,0.3)' };
  }
}

function calendarItemStatusStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case 'COMPLETADO':  return { bg: 'rgba(34,197,94,0.12)',  text: '#15803d' };
    case 'PUBLICADO':   return { bg: 'rgba(34,197,94,0.1)',   text: '#16a34a' };
    case 'EN_PROGRESO': return { bg: 'rgba(37,99,235,0.12)',  text: '#1d4ed8' };
    case 'PROGRAMADO':  return { bg: 'rgba(14,165,233,0.12)', text: '#0284c7' };
    case 'PENDIENTE':   return { bg: 'rgba(234,179,8,0.12)',  text: '#a16207' };
    case 'CANCELADO':   return { bg: 'rgba(148,163,184,0.1)', text: '#64748b' };
    default:            return { bg: 'rgba(148,163,184,0.1)', text: '#64748b' };
  }
}

const CHANNEL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Google Ads': { bg: 'rgba(37,99,235,0.12)',  text: '#1d4ed8', border: 'rgba(37,99,235,0.3)' },
  Meta:         { bg: 'rgba(99,102,241,0.12)', text: '#4f46e5', border: 'rgba(99,102,241,0.3)' },
  LinkedIn:     { bg: 'rgba(14,165,233,0.12)', text: '#0284c7', border: 'rgba(14,165,233,0.3)' },
  Email:        { bg: 'rgba(234,179,8,0.12)',  text: '#a16207', border: 'rgba(234,179,8,0.3)' },
  SEO:          { bg: 'rgba(34,197,94,0.12)',  text: '#15803d', border: 'rgba(34,197,94,0.3)' },
  OTHER:        { bg: 'rgba(148,163,184,0.1)', text: '#64748b', border: 'rgba(148,163,184,0.3)' },
};

function channelStyle(channel: string) {
  return CHANNEL_COLORS[channel] ?? CHANNEL_COLORS['OTHER'];
}

/* ── CRM lead status chip ────────────────────────────────────────────── */

const LEAD_STATUS_LABELS: Record<string, string> = {
  NUEVO: 'Nuevo',
  CONTACTADO: 'Contactado',
  CALIFICADO: 'Calificado',
  NO_CALIFICADO: 'No calificado',
  EN_NEGOCIACION: 'En negociación',
  CONVERTIDO: 'Convertido',
  PERDIDO: 'Perdido',
};

function leadStatusStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case 'CONVERTIDO':     return { bg: 'rgba(34,197,94,0.12)',  text: '#15803d' };
    case 'CALIFICADO':     return { bg: 'rgba(37,99,235,0.12)',  text: '#1d4ed8' };
    case 'EN_NEGOCIACION': return { bg: 'rgba(99,102,241,0.12)', text: '#4f46e5' };
    case 'CONTACTADO':     return { bg: 'rgba(14,165,233,0.12)', text: '#0284c7' };
    case 'NUEVO':          return { bg: 'rgba(234,179,8,0.12)',  text: '#a16207' };
    case 'PERDIDO':        return { bg: 'rgba(239,68,68,0.12)',  text: '#dc2626' };
    case 'NO_CALIFICADO':  return { bg: 'rgba(148,163,184,0.1)', text: '#64748b' };
    default:               return { bg: 'rgba(148,163,184,0.1)', text: '#64748b' };
  }
}

/* ── Types ──────────────────────────────────────────────────────────── */

interface CampaignTask {
  id: string;
  title: string;
  type: string;
  dueDate: string | null;
  done: boolean;
  ownerName: string | null;
}

interface CampaignMetric {
  leadsGenerated: number;
  leadsQualified: number;
  meetingsBooked: number;
  quotesIssued: number;
  opportunitiesCreated: number;
  salesClosed: number;
  costPerLead: number | string;
  attributedRevenue: number | string;
  leadsLive: number;
  opportunitiesLive: number;
  attributedRevenueLive: number | string;
}

interface CalendarItem {
  id: string;
  type: string;
  title: string;
  date: string;
  endDate: string | null;
  channel: string | null;
  status: string;
  ownerName: string | null;
  serviceName: string | null;
  targetSegment: string | null;
  zone: string | null;
  campaignId: string | null;
  campaignName: string | null;
}

interface CrmLead {
  id: string;
  contactName: string;
  company: string | null;
  status: string;
  source: string | null;
}

interface CrmOpportunity {
  id: string;
  title: string;
  amount: number | string;
  stageName: string;
  stageIsWon?: boolean;
}

interface CampaignDetail {
  campaign: {
    id: string;
    name: string;
    channel: string;
    startDate: string;
    endDate: string;
    cost: number | string;
    status: string;
    objective: string | null;
    serviceAssociated: string | null;
    targetSegment: string | null;
    zone: string | null;
    ownerName: string | null;
    ctaType: string | null;
    kpiTarget: string | null;
    metric?: { leadsGenerated?: number; attributedRevenue?: number | string };
  };
  tasks: CampaignTask[];
  metric: CampaignMetric;
  calendarItems: CalendarItem[];
  crm: {
    leads: CrmLead[];
    opportunities: CrmOpportunity[];
  };
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[rgba(128,128,128,0.12)] ${className}`} />;
}

function EmptyHint({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      {icon && <div className="text-[var(--text-secondary)] opacity-30">{icon}</div>}
      <p className="text-sm text-[var(--text-secondary)]">{text}</p>
    </div>
  );
}

type TabKey = 'resumen' | 'calendario' | 'tareas' | 'metricas' | 'crm';

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: 'resumen',    label: 'Resumen',             icon: Layers },
  { key: 'calendario', label: 'Calendario interno',  icon: Calendar },
  { key: 'tareas',     label: 'Tareas',              icon: CheckSquare },
  { key: 'metricas',   label: 'Métricas',            icon: BarChart2 },
  { key: 'crm',        label: 'Relación CRM',        icon: Users },
];

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 py-2.5 border-b border-[var(--border-color)] last:border-0">
      <span className="w-40 shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </span>
      <span className="text-sm text-[var(--text-primary)]">{value ?? '—'}</span>
    </div>
  );
}

/** Group calendar items by date (yyyy-mm-dd). */
function groupByDate(items: CalendarItem[]): Array<{ dateKey: string; items: CalendarItem[] }> {
  const map = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const key = item.date.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, items]) => ({ dateKey, items }));
}

/* ── Page ────────────────────────────────────────────────────────────── */

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const campaignId = params?.id ?? '';

  const [data, setData] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('resumen');

  /* Task toggle state (optimistic) */
  const [taskDoneMap, setTaskDoneMap] = useState<Record<string, boolean>>({});
  const [taskToggling, setTaskToggling] = useState<Record<string, boolean>>({});

  /* Fetch campaign detail */
  useEffect(() => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    apiClient
      .get<CampaignDetail>(`/api/marketing/campaigns/${campaignId}`)
      .then((res) => {
        setData(res);
        /* Seed optimistic done map from API */
        const initMap: Record<string, boolean> = {};
        for (const t of res.tasks) initMap[t.id] = t.done;
        setTaskDoneMap(initMap);
      })
      .catch(() => setError('No se pudo cargar la campaña.'))
      .finally(() => setLoading(false));
  }, [campaignId]);

  /* Toggle task done */
  const toggleTask = useCallback(
    async (taskId: string) => {
      if (taskToggling[taskId]) return;
      const newDone = !taskDoneMap[taskId];
      /* Optimistic */
      setTaskDoneMap((prev) => ({ ...prev, [taskId]: newDone }));
      setTaskToggling((prev) => ({ ...prev, [taskId]: true }));
      try {
        await apiClient.patch(`/api/marketing/campaign-tasks/${taskId}`, { done: newDone });
      } catch {
        /* Rollback */
        setTaskDoneMap((prev) => ({ ...prev, [taskId]: !newDone }));
      } finally {
        setTaskToggling((prev) => ({ ...prev, [taskId]: false }));
      }
    },
    [taskDoneMap, taskToggling],
  );

  /* ── Loading skeleton ──────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-[1200px] mx-auto space-y-5">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  /* ── Error state ───────────────────────────────────────────────────── */
  if (error || !data) {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-[1200px] mx-auto">
        <button
          type="button"
          onClick={() => router.push('/marketing/campanas')}
          className="inline-flex items-center gap-1.5 text-sm text-[#2563eb] hover:underline mb-6"
        >
          <ArrowLeft size={14} /> Volver a campañas
        </button>
        <div className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error ?? 'Campaña no encontrada.'}
        </div>
      </div>
    );
  }

  const { campaign, tasks, metric, calendarItems, crm } = data;
  const statusStyle = campaignStatusStyle(campaign.status);
  const chStyle = channelStyle(campaign.channel);

  /* Derived task stats */
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => taskDoneMap[t.id]).length;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  /* Tab badge counts */
  const tabBadge: Partial<Record<TabKey, number>> = {
    calendario: calendarItems.length,
    tareas: tasks.length,
    crm: crm.leads.length + crm.opportunities.length,
  };

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1200px] mx-auto">
      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push('/marketing/campanas')}
        className="inline-flex items-center gap-1.5 text-sm text-[#2563eb] hover:underline mb-5"
      >
        <ArrowLeft size={14} /> Volver a campañas
      </button>

      {/* ── Campaign header card ─────────────────────────────────────── */}
      <div
        className="mb-6 rounded-xl border border-[var(--border-color)] shadow-sm p-6"
        style={{ background: 'rgba(28,28,38,0.55)', backdropFilter: 'blur(12px)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          {/* Icon */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[rgba(37,99,235,0.13)] border border-[rgba(37,99,235,0.2)]">
            <Target size={26} className="text-[#2563eb]" />
          </div>

          {/* Identity */}
          <div className="min-w-0 flex-1">
            <h1
              className="text-xl font-semibold text-[var(--text-primary)] leading-tight"
              style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}
            >
              {campaign.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {/* Status chip */}
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{ background: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.border}` }}
              >
                {CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status}
              </span>
              {/* Channel chip */}
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{ background: chStyle.bg, color: chStyle.text, border: `1px solid ${chStyle.border}` }}
              >
                {campaign.channel}
              </span>
              {/* Date range */}
              <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                <Calendar size={11} />
                {formatDate(campaign.startDate)} – {formatDate(campaign.endDate)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
              {campaign.ownerName && (
                <span className="flex items-center gap-1">
                  <UserCircle size={12} />
                  {campaign.ownerName}
                </span>
              )}
              {campaign.targetSegment && (
                <span className="flex items-center gap-1">
                  <Users size={12} />
                  {campaign.targetSegment}
                </span>
              )}
              {campaign.zone && (
                <span className="flex items-center gap-1">
                  <MapPin size={12} />
                  {campaign.zone}
                </span>
              )}
            </div>
          </div>

          {/* Budget pill */}
          <div className="shrink-0 rounded-xl bg-[rgba(37,99,235,0.08)] border border-[rgba(37,99,235,0.18)] px-4 py-3 text-right">
            <p className="text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">Presupuesto</p>
            <p className="text-xl font-bold text-[#2563eb] leading-none mt-0.5">
              {formatCLP(Number(campaign.cost))}
            </p>
          </div>
        </div>

        {/* Task progress bar */}
        {totalTasks > 0 && (
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Progreso de tareas</span>
              <span className="font-semibold text-[var(--text-primary)]">{doneTasks}/{totalTasks} completadas ({progressPct}%)</span>
            </div>
            <div className="h-2 rounded-full bg-[rgba(128,128,128,0.15)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #2563eb, #60a5fa)' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────── */}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-[var(--border-color)] pb-px scrollbar-hide">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const badge = tabBadge[tab.key];
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={[
                'flex shrink-0 items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-b-2 border-[#2563eb] text-[#2563eb] bg-[rgba(37,99,235,0.06)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(128,128,128,0.06)]',
              ].join(' ')}
            >
              <TabIcon size={14} />
              {tab.label}
              {badge !== undefined && badge > 0 && (
                <span
                  className={[
                    'inline-flex items-center justify-center rounded-full text-[10px] font-bold h-4 min-w-[16px] px-1',
                    isActive
                      ? 'bg-[rgba(37,99,235,0.15)] text-[#2563eb]'
                      : 'bg-[rgba(128,128,128,0.12)] text-[var(--text-secondary)]',
                  ].join(' ')}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB: RESUMEN                                                   */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'resumen' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT: brief */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Brief card */}
            <section
              className="rounded-xl border border-[var(--border-color)] shadow-sm p-5"
              style={{ background: 'var(--bg-card)' }}
            >
              <div className="mb-4 flex items-center gap-2">
                <Layers size={15} className="text-[#2563eb]" />
                <h2
                  className="text-sm font-semibold text-[var(--text-primary)]"
                  style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}
                >
                  Brief de campaña
                </h2>
              </div>
              <InfoRow label="Objetivo" value={campaign.objective} />
              <InfoRow label="Servicio asociado" value={campaign.serviceAssociated} />
              <InfoRow label="Segmento objetivo" value={campaign.targetSegment} />
              <InfoRow label="Zona geográfica" value={campaign.zone} />
              <InfoRow label="Tipo de CTA" value={campaign.ctaType} />
              <InfoRow label="KPI objetivo" value={campaign.kpiTarget} />
              <InfoRow label="Responsable" value={campaign.ownerName} />
              <InfoRow label="Estado" value={
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{ background: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.border}` }}
                >
                  {CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status}
                </span>
              } />
              <InfoRow label="Canal" value={
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{ background: chStyle.bg, color: chStyle.text, border: `1px solid ${chStyle.border}` }}
                >
                  {campaign.channel}
                </span>
              } />
              <InfoRow label="Inicio" value={formatDate(campaign.startDate)} />
              <InfoRow label="Término" value={formatDate(campaign.endDate)} />
              <InfoRow label="Presupuesto" value={
                <span className="font-semibold text-[#2563eb]">{formatCLP(Number(campaign.cost))}</span>
              } />
            </section>
          </div>

          {/* RIGHT: KPI tiles */}
          <div className="flex flex-col gap-4">
            <KpiCard
              label="Presupuesto"
              value={formatCLP(Number(campaign.cost))}
              subtitle="Inversión total asignada"
              icon={DollarSign}
              valueColor="#2563eb"
            />
            <KpiCard
              label="Leads generados"
              value={String(metric.leadsGenerated ?? 0)}
              subtitle="Histórico acumulado"
              icon={Users}
              valueColor="#16a34a"
            />
            <KpiCard
              label="Ventas atribuidas"
              value={formatCLP(Number(metric.attributedRevenue ?? 0))}
              subtitle="Ingresos atribuidos a esta campaña"
              icon={TrendingUp}
              valueColor="#7c3aed"
            />
            <KpiCard
              label="Tareas"
              value={`${doneTasks}/${totalTasks}`}
              subtitle={`${progressPct}% completadas`}
              icon={CheckSquare}
              valueColor={progressPct === 100 ? '#16a34a' : undefined}
            />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB: CALENDARIO INTERNO                                        */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'calendario' && (
        <section
          className="rounded-xl border border-[var(--border-color)] shadow-sm overflow-hidden"
          style={{ background: 'var(--bg-card)' }}
        >
          <div className="px-5 py-4 border-b border-[var(--border-color)] bg-[rgba(128,128,128,0.03)] flex items-center gap-2">
            <Calendar size={15} className="text-[#2563eb]" />
            <h2
              className="text-sm font-semibold text-[var(--text-primary)]"
              style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}
            >
              Ítems de calendario
            </h2>
            {calendarItems.length > 0 && (
              <span className="ml-1 inline-flex items-center rounded-full bg-[rgba(37,99,235,0.1)] px-2 py-0.5 text-xs font-semibold text-[#2563eb]">
                {calendarItems.length}
              </span>
            )}
          </div>

          {calendarItems.length === 0 ? (
            <EmptyHint
              text="No hay ítems de calendario asociados a esta campaña."
              icon={<Calendar size={40} />}
            />
          ) : (
            <div className="p-5">
              {groupByDate(calendarItems).map(({ dateKey, items }) => (
                <div key={dateKey} className="mb-6 last:mb-0">
                  {/* Date group header */}
                  <div className="mb-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-[var(--border-color)]" />
                    <span className="shrink-0 rounded-full bg-[rgba(37,99,235,0.08)] px-3 py-0.5 text-xs font-semibold text-[#2563eb] border border-[rgba(37,99,235,0.2)]">
                      {formatDate(dateKey)}
                    </span>
                    <div className="h-px flex-1 bg-[var(--border-color)]" />
                  </div>

                  <div className="flex flex-col gap-2">
                    {items.map((item) => {
                      const typeStyle = calendarItemTypeStyle(item.type);
                      const stStyle = calendarItemStatusStyle(item.status);
                      return (
                        <div
                          key={item.id}
                          className="flex items-start gap-3 rounded-lg border border-[var(--border-color)] px-4 py-3 hover:bg-[rgba(37,99,235,0.03)] transition-colors"
                        >
                          {/* Type chip */}
                          <span
                            className="shrink-0 mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ background: typeStyle.bg, color: typeStyle.text, border: `1px solid ${typeStyle.border}` }}
                          >
                            {CALENDAR_ITEM_TYPE_LABELS[item.type] ?? item.type}
                          </span>

                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[var(--text-primary)] truncate">{item.title}</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--text-secondary)]">
                              {item.channel && <span>{item.channel}</span>}
                              {item.ownerName && <span className="flex items-center gap-0.5"><UserCircle size={10} />{item.ownerName}</span>}
                              {item.endDate && item.endDate.slice(0, 10) !== dateKey && (
                                <span>hasta {formatDate(item.endDate)}</span>
                              )}
                            </div>
                          </div>

                          {/* Status chip */}
                          <span
                            className="shrink-0 mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ background: stStyle.bg, color: stStyle.text }}
                          >
                            {CALENDAR_ITEM_STATUS_LABELS[item.status] ?? item.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB: TAREAS                                                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'tareas' && (
        <section
          className="rounded-xl border border-[var(--border-color)] shadow-sm overflow-hidden"
          style={{ background: 'var(--bg-card)' }}
        >
          <div className="px-5 py-4 border-b border-[var(--border-color)] bg-[rgba(128,128,128,0.03)] flex items-center gap-2">
            <CheckSquare size={15} className="text-[#2563eb]" />
            <h2
              className="text-sm font-semibold text-[var(--text-primary)]"
              style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}
            >
              Tareas
            </h2>
            {tasks.length > 0 && (
              <span className="ml-1 inline-flex items-center rounded-full bg-[rgba(37,99,235,0.1)] px-2 py-0.5 text-xs font-semibold text-[#2563eb]">
                {doneTasks}/{tasks.length}
              </span>
            )}
          </div>

          {tasks.length === 0 ? (
            <EmptyHint
              text="No hay tareas registradas para esta campaña."
              icon={<CheckSquare size={40} />}
            />
          ) : (
            <div className="divide-y divide-[var(--border-color)]">
              {tasks
                .slice()
                .sort((a, b) => {
                  /* Pending first, then by dueDate */
                  const aDone = taskDoneMap[a.id] ?? a.done;
                  const bDone = taskDoneMap[b.id] ?? b.done;
                  if (aDone !== bDone) return aDone ? 1 : -1;
                  if (!a.dueDate && !b.dueDate) return 0;
                  if (!a.dueDate) return 1;
                  if (!b.dueDate) return -1;
                  return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                })
                .map((task) => {
                  const isDone = taskDoneMap[task.id] ?? task.done;
                  const isToggling = taskToggling[task.id] ?? false;
                  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
                  const isOverdue = dueDate && dueDate < today && !isDone;

                  return (
                    <div
                      key={task.id}
                      className={[
                        'flex items-start gap-3 px-5 py-3.5 hover:bg-[rgba(37,99,235,0.02)] transition-colors',
                        isOverdue ? 'bg-red-50/5 dark:bg-red-950/10' : '',
                      ].join(' ')}
                    >
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={() => toggleTask(task.id)}
                        disabled={isToggling}
                        aria-label={isDone ? 'Marcar como pendiente' : 'Marcar como completada'}
                        className="mt-0.5 shrink-0 transition-opacity disabled:opacity-50"
                      >
                        {isDone ? (
                          <CheckCircle2 size={18} className="text-green-500" />
                        ) : (
                          <Circle size={18} className={isOverdue ? 'text-red-400' : 'text-[var(--text-secondary)]'} />
                        )}
                      </button>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p
                            className={[
                              'text-sm font-medium leading-snug',
                              isDone
                                ? 'line-through text-[var(--text-secondary)]'
                                : 'text-[var(--text-primary)]',
                            ].join(' ')}
                          >
                            {task.title}
                          </p>
                          {/* Task type chip */}
                          <span className="inline-flex items-center rounded-full bg-[rgba(37,99,235,0.08)] px-2 py-0.5 text-[10px] font-semibold text-[#2563eb]">
                            {TASK_TYPE_LABELS[task.type] ?? task.type}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                          {task.ownerName && (
                            <span className="flex items-center gap-0.5 text-[var(--text-secondary)]">
                              <UserCircle size={10} />
                              {task.ownerName}
                            </span>
                          )}
                          {dueDate && (
                            <span
                              className={[
                                'flex items-center gap-0.5 font-medium',
                                isOverdue
                                  ? 'text-red-500 dark:text-red-400'
                                  : isDone
                                    ? 'text-[var(--text-secondary)]'
                                    : 'text-[var(--text-secondary)]',
                              ].join(' ')}
                            >
                              <Clock size={10} />
                              {formatDate(task.dueDate!)}
                              {isOverdue && ' — Vencida'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Overdue badge */}
                      {isOverdue && (
                        <span className="shrink-0 mt-0.5 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                          <AlertCircle size={10} />
                          Vencida
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {/* Footer: progress */}
          {tasks.length > 0 && (
            <div className="border-t border-[var(--border-color)] px-5 py-3 bg-[rgba(128,128,128,0.02)]">
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1.5">
                <span>Progreso</span>
                <span className="font-semibold text-[var(--text-primary)]">{progressPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-[rgba(128,128,128,0.15)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #2563eb, #60a5fa)' }}
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB: MÉTRICAS                                                  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'metricas' && (
        <div className="flex flex-col gap-6">
          {/* Historical metrics grid */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <BarChart2 size={15} className="text-[#2563eb]" />
              <h2
                className="text-sm font-semibold text-[var(--text-primary)]"
                style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}
              >
                Métricas de campaña
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <KpiCard
                label="Leads generados"
                value={String(metric.leadsGenerated ?? 0)}
                subtitle="Total acumulado"
                icon={Users}
                valueColor="#16a34a"
              />
              <KpiCard
                label="Leads calificados"
                value={String(metric.leadsQualified ?? 0)}
                subtitle="Pasaron filtro de calidad"
                icon={CheckSquare}
                valueColor="#2563eb"
              />
              <KpiCard
                label="Reuniones agendadas"
                value={String(metric.meetingsBooked ?? 0)}
                subtitle="Citas confirmadas"
                icon={Calendar}
              />
              <KpiCard
                label="Cotizaciones emitidas"
                value={String(metric.quotesIssued ?? 0)}
                subtitle="Propuestas enviadas"
                icon={Briefcase}
              />
              <KpiCard
                label="Oportunidades creadas"
                value={String(metric.opportunitiesCreated ?? 0)}
                subtitle="En pipeline Comercial"
                icon={TrendingUp}
                valueColor="#7c3aed"
              />
              <KpiCard
                label="Ventas cerradas"
                value={String(metric.salesClosed ?? 0)}
                subtitle="Oportunidades ganadas"
                icon={CheckCircle2}
                valueColor="#16a34a"
              />
              <KpiCard
                label="Costo por lead"
                value={formatCLP(Number(metric.costPerLead ?? 0))}
                subtitle="Inversión / Leads generados"
                icon={DollarSign}
                valueColor={Number(metric.costPerLead) > 50000 ? '#dc2626' : undefined}
              />
              <KpiCard
                label="Ingresos atribuidos"
                value={formatCLP(Number(metric.attributedRevenue ?? 0))}
                subtitle="Ventas totales atribuidas"
                icon={TrendingUp}
                valueColor="#7c3aed"
              />
            </div>
          </section>

          {/* Live CRM metrics */}
          <section
            className="rounded-xl border border-[rgba(37,99,235,0.2)] shadow-sm p-5"
            style={{ background: 'rgba(37,99,235,0.04)' }}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                <h2
                  className="text-sm font-semibold text-[var(--text-primary)]"
                  style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}
                >
                  En vivo desde Comercial
                </h2>
              </div>
              <span className="text-[11px] text-[var(--text-secondary)] italic">Datos actualizados en tiempo real</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiCard
                label="Leads activos"
                value={String(metric.leadsLive ?? 0)}
                subtitle="(en vivo desde Comercial)"
                icon={Users}
                valueColor="#16a34a"
              />
              <KpiCard
                label="Oportunidades activas"
                value={String(metric.opportunitiesLive ?? 0)}
                subtitle="(en vivo desde Comercial)"
                icon={TrendingUp}
                valueColor="#2563eb"
              />
              <KpiCard
                label="Ingresos en pipeline"
                value={formatCLP(Number(metric.attributedRevenueLive ?? 0))}
                subtitle="(en vivo desde Comercial)"
                icon={DollarSign}
                valueColor="#7c3aed"
              />
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB: RELACIÓN CRM                                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'crm' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Leads */}
          <section
            className="rounded-xl border border-[var(--border-color)] shadow-sm overflow-hidden"
            style={{ background: 'var(--bg-card)' }}
          >
            <div className="px-5 py-4 border-b border-[var(--border-color)] bg-[rgba(128,128,128,0.03)] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-[#2563eb]" />
                <h2
                  className="text-sm font-semibold text-[var(--text-primary)]"
                  style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}
                >
                  Leads atribuidos
                </h2>
                {crm.leads.length > 0 && (
                  <span className="ml-1 inline-flex items-center rounded-full bg-[rgba(37,99,235,0.1)] px-2 py-0.5 text-xs font-semibold text-[#2563eb]">
                    {crm.leads.length}
                  </span>
                )}
              </div>
              <Link
                href="/comercial/leads"
                className="inline-flex items-center gap-1 text-xs text-[#2563eb] hover:underline"
              >
                Ver en Comercial <ExternalLink size={10} />
              </Link>
            </div>

            {crm.leads.length === 0 ? (
              <EmptyHint
                text="No hay leads atribuidos a esta campaña todavía."
                icon={<Users size={36} />}
              />
            ) : (
              <div className="divide-y divide-[var(--border-color)]">
                {crm.leads.map((lead) => {
                  const stStyle = leadStatusStyle(lead.status);
                  return (
                    <div
                      key={lead.id}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-[rgba(37,99,235,0.02)] transition-colors"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(37,99,235,0.08)] border border-[rgba(37,99,235,0.15)]">
                        <UserCircle size={16} className="text-[#2563eb]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {lead.contactName}
                        </p>
                        {lead.company && (
                          <p className="text-[11px] text-[var(--text-secondary)] truncate">{lead.company}</p>
                        )}
                        {lead.source && (
                          <p className="text-[10px] text-[var(--text-secondary)] italic">{lead.source}</p>
                        )}
                      </div>
                      <span
                        className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: stStyle.bg, color: stStyle.text }}
                      >
                        {LEAD_STATUS_LABELS[lead.status] ?? lead.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Opportunities */}
          <section
            className="rounded-xl border border-[var(--border-color)] shadow-sm overflow-hidden"
            style={{ background: 'var(--bg-card)' }}
          >
            <div className="px-5 py-4 border-b border-[var(--border-color)] bg-[rgba(128,128,128,0.03)] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp size={15} className="text-[#2563eb]" />
                <h2
                  className="text-sm font-semibold text-[var(--text-primary)]"
                  style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}
                >
                  Oportunidades generadas
                </h2>
                {crm.opportunities.length > 0 && (
                  <span className="ml-1 inline-flex items-center rounded-full bg-[rgba(37,99,235,0.1)] px-2 py-0.5 text-xs font-semibold text-[#2563eb]">
                    {crm.opportunities.length}
                  </span>
                )}
              </div>
              <Link
                href="/comercial/pipeline"
                className="inline-flex items-center gap-1 text-xs text-[#2563eb] hover:underline"
              >
                Ver pipeline <ExternalLink size={10} />
              </Link>
            </div>

            {crm.opportunities.length === 0 ? (
              <EmptyHint
                text="No hay oportunidades generadas por esta campaña todavía."
                icon={<TrendingUp size={36} />}
              />
            ) : (
              <div className="divide-y divide-[var(--border-color)]">
                {crm.opportunities.map((opp) => (
                  <div
                    key={opp.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-[rgba(37,99,235,0.02)] transition-colors"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(99,102,241,0.08)] border border-[rgba(99,102,241,0.15)]">
                      <Briefcase size={14} className="text-indigo-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{opp.title}</p>
                      <p className="text-[11px] text-[var(--text-secondary)]">{opp.stageName}</p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {formatCLP(Number(opp.amount))}
                      </span>
                      {opp.stageIsWon && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <CheckCircle2 size={9} />
                          Ganada
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            {crm.opportunities.length > 0 && (
              <div className="border-t border-[var(--border-color)] px-5 py-2.5 bg-[rgba(128,128,128,0.02)]">
                <span className="text-xs text-[var(--text-secondary)]">
                  Total pipeline:{' '}
                  <span className="font-semibold text-[#2563eb]">
                    {formatCLP(crm.opportunities.reduce((s, o) => s + Number(o.amount ?? 0), 0))}
                  </span>
                </span>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
