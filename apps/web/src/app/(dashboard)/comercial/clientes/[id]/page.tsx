'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  FileText,
  Phone,
  Calendar,
  CheckSquare,
  MessageSquare,
  Clock,
  Receipt,
  TrendingUp,
  Briefcase,
  LayoutList,
} from 'lucide-react';
import { KpiCard } from '../../../../../components/operations/dashboard/KpiCard';
import { apiClient } from '../../../../../lib/api';
import { formatCLP, formatDate, formatRUT } from '../../../../../lib/formatters';

/* ── Types ─────────────────────────────────────────────────────────── */

interface TaxRecord {
  id: string;
  folio: string;
  type: string;
  direction: string;
  issueDate: string;
  netAmount: number | string;
  taxAmount: number | string;
  totalAmount: number | string;
  status: string;
}

interface Opportunity {
  id: string;
  title: string;
  amount: number | string;
  stageName: string;
  stageIsWon?: boolean;
  stageOrder?: number;
  serviceName?: string | null;
  serviceCategory?: string | null;
}

interface Activity {
  id: string;
  type: string;
  content: string;
  date: string;
  dueDate?: string | null;
  done?: boolean;
}

interface Task {
  id: string;
  content: string;
  dueDate?: string | null;
  done?: boolean;
}

interface Counterparty {
  id: string;
  name: string;
  taxId?: string;
  email?: string;
  phone?: string;
}

interface ClientDetail {
  counterparty: Counterparty;
  historialTributario: TaxRecord[];
  oportunidades: Opportunity[];
  actividades: Activity[];
  proximasTareas: Task[];
}

interface QuoteRow {
  id: string;
  opportunityId: string | null;
  opportunityTitle: string | null;
  counterpartyId: string;
  counterpartyName: string;
  status: string;
  validUntil: string | null;
  executionTerm: string | null;
  version: number;
  subtotal: number | string;
  ivaAmount: number | string;
  total: number | string;
  itemCount: number;
  createdAt: string;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-[rgba(128,128,128,0.12)] ${className}`} />
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="py-10 text-center text-sm text-[var(--text-secondary)]">{text}</p>
  );
}

/* Stage badge */
function StageBadge({ name, isWon }: { name: string; isWon?: boolean }) {
  const color = isWon
    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    : 'bg-[rgba(37,99,235,0.1)] text-[#2563eb]';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {name}
    </span>
  );
}

/* Quote status chip */
const QUOTE_STATUS_LABELS: Record<string, string> = {
  BORRADOR: 'Borrador',
  EN_REVISION: 'En revisión',
  ENVIADA: 'Enviada',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  VENCIDA: 'Vencida',
  REEMPLAZADA: 'Reemplazada',
  APROBADA: 'Aprobada',
};

const QUOTE_STATUS_COLORS: Record<string, string> = {
  BORRADOR: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-300',
  EN_REVISION: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  ENVIADA: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  ACEPTADA: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  RECHAZADA: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  VENCIDA: 'bg-slate-100 text-slate-500 dark:bg-slate-800/40 dark:text-slate-400',
  REEMPLAZADA: 'bg-slate-100 text-slate-500 dark:bg-slate-800/40 dark:text-slate-400',
  APROBADA: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
};

function QuoteStatusChip({ status }: { status: string }) {
  const label = QUOTE_STATUS_LABELS[status] ?? status;
  const color = QUOTE_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {label}
    </span>
  );
}

/* Activity type helpers */
const ACTIVITY_LABELS: Record<string, string> = {
  NOTA: 'Nota',
  LLAMADA: 'Llamada',
  REUNION: 'Reunión',
  TAREA: 'Tarea',
};

const ACTIVITY_COLORS: Record<string, string> = {
  NOTA: 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300',
  LLAMADA: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  REUNION: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  TAREA: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

type ActivityIconKey = 'NOTA' | 'LLAMADA' | 'REUNION' | 'TAREA';
const ACTIVITY_ICONS: Record<ActivityIconKey, React.ComponentType<{ size?: number; className?: string }>> = {
  NOTA: MessageSquare,
  LLAMADA: Phone,
  REUNION: Calendar,
  TAREA: CheckSquare,
};

function ActivityChip({ type }: { type: string }) {
  const label = ACTIVITY_LABELS[type] ?? type;
  const color = ACTIVITY_COLORS[type] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${color}`}>
      {label}
    </span>
  );
}

/* Service category label */
const CATEGORY_LABELS: Record<string, string> = {
  DRONE: 'Dron',
  LIMPIEZA: 'Limpieza',
  INSPECCION: 'Inspección',
  AUDIOVISUAL: 'Audiovisual',
  INDUSTRIAL: 'Industrial',
};

/* Direction chip for tax records */
function DirectionChip({ direction }: { direction: string }) {
  const isEmit = direction === 'EMITIDO';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
      isEmit
        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400'
    }`}>
      {isEmit ? 'Emitido' : 'Recibido'}
    </span>
  );
}

/* ── Tab types ─────────────────────────────────────────────────────── */

type TabKey = 'resumen' | 'oportunidades' | 'actividades' | 'tributario' | 'cotizaciones';

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: 'resumen', label: 'Resumen', icon: LayoutList },
  { key: 'oportunidades', label: 'Oportunidades', icon: TrendingUp },
  { key: 'actividades', label: 'Actividades', icon: Calendar },
  { key: 'tributario', label: 'Historial tributario', icon: FileText },
  { key: 'cotizaciones', label: 'Cotizaciones', icon: Receipt },
];

/* ── Page ─────────────────────────────────────────────────────────── */

export default function ClienteFichaPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ClientDetail | null>(null);
  const [loadingClient, setLoadingClient] = useState(true);
  const [errorClient, setErrorClient] = useState<string | null>(null);

  /* Quotes — lazy loaded when tab is activated */
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [errorQuotes, setErrorQuotes] = useState<string | null>(null);
  const [quotesFetched, setQuotesFetched] = useState(false);

  /* Active tab — primitive string dep for useEffect */
  const [activeTab, setActiveTab] = useState<TabKey>('resumen');

  /* Load client detail */
  useEffect(() => {
    if (!id) return;
    setLoadingClient(true);
    setErrorClient(null);
    apiClient
      .get<ClientDetail>(`/api/comercial/clients/${id}`)
      .then((res: ClientDetail) => setData(res))
      .catch(() => setErrorClient('No se pudo cargar la ficha del cliente.'))
      .finally(() => setLoadingClient(false));
  }, [id]);

  /* Load quotes lazily when tab activates */
  useEffect(() => {
    if (activeTab !== 'cotizaciones' || quotesFetched) return;
    setLoadingQuotes(true);
    setErrorQuotes(null);
    apiClient
      .get<QuoteRow[]>('/api/comercial/quotes')
      .then((all: QuoteRow[]) => {
        setQuotes(all.filter((q: QuoteRow) => q.counterpartyId === id));
        setQuotesFetched(true);
      })
      .catch(() => setErrorQuotes('No se pudieron cargar las cotizaciones.'))
      .finally(() => setLoadingQuotes(false));
  }, [activeTab, quotesFetched, id]);

  /* ── Loading skeleton ─────────────────────────────────────────── */
  if (loadingClient) {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-[1200px] mx-auto space-y-6">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-32 w-full" />
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  /* ── Error state ──────────────────────────────────────────────── */
  if (errorClient || !data) {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-[1200px] mx-auto">
        <Link
          href="/comercial/clientes"
          className="inline-flex items-center gap-1.5 text-sm text-[#2563eb] hover:underline mb-6"
        >
          <ArrowLeft size={14} /> Volver a Clientes
        </Link>
        <div className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {errorClient ?? 'Cliente no encontrado.'}
        </div>
      </div>
    );
  }

  const { counterparty, historialTributario, oportunidades, actividades, proximasTareas } = data;

  /* Derived values */
  const pipelineValue = oportunidades.reduce((sum, o) => sum + Number(o.amount ?? 0), 0);
  const tareasCount = proximasTareas.filter((t) => !t.done).length;

  const sortedActividades = [...actividades].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const sortedTareas = [...proximasTareas].sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  /* ── Tab badge counts ─────────────────────────────────────────── */
  const tabBadge: Partial<Record<TabKey, number>> = {
    oportunidades: oportunidades.length,
    actividades: actividades.length,
    tributario: historialTributario.length,
    cotizaciones: quotesFetched ? quotes.length : undefined,
  };

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1200px] mx-auto">
      {/* Back link */}
      <Link
        href="/comercial/clientes"
        className="inline-flex items-center gap-1.5 text-sm text-[#2563eb] hover:underline mb-5"
      >
        <ArrowLeft size={14} /> Volver a Clientes
      </Link>

      {/* Client header card */}
      <div className="mb-6 bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-6"
        style={{ background: 'rgba(28,28,38,0.55)', backdropFilter: 'blur(12px)' }}
      >
        <div className="flex items-start gap-4 flex-wrap">
          {/* Avatar */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[rgba(37,99,235,0.13)] border border-[rgba(37,99,235,0.2)]">
            <Building2 size={26} className="text-[#2563eb]" />
          </div>

          {/* Identity */}
          <div className="min-w-0 flex-1">
            <h1
              className="text-xl font-semibold text-[var(--text-primary)]"
              style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
            >
              {counterparty.name}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[var(--text-secondary)]">
              {counterparty.taxId && (
                <span className="font-mono text-xs bg-[rgba(128,128,128,0.08)] rounded px-2 py-0.5">
                  RUT {formatRUT(counterparty.taxId)}
                </span>
              )}
              {counterparty.email && (
                <span className="flex items-center gap-1">
                  <span className="text-[var(--text-secondary)] text-xs">@</span>
                  {counterparty.email}
                </span>
              )}
              {counterparty.phone && (
                <span className="flex items-center gap-1">
                  <Phone size={12} className="text-[var(--text-secondary)]" />
                  {counterparty.phone}
                </span>
              )}
            </div>
          </div>

          {/* Pipeline value pill */}
          {pipelineValue > 0 && (
            <div className="shrink-0 rounded-xl bg-[rgba(37,99,235,0.08)] border border-[rgba(37,99,235,0.18)] px-4 py-2 text-right">
              <p className="text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">Pipeline activo</p>
              <p className="text-xl font-bold text-[#2563eb] leading-none mt-0.5">
                {formatCLP(pipelineValue)}
              </p>
            </div>
          )}
        </div>

        {/* KPI strip */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="Valor pipeline"
            value={pipelineValue > 0 ? formatCLP(pipelineValue) : '—'}
            subtitle="Oportunidades abiertas"
            icon={TrendingUp}
            valueColor="#2563eb"
          />
          <KpiCard
            label="Oportunidades"
            value={String(oportunidades.length)}
            subtitle="En todas las etapas"
            icon={Briefcase}
          />
          <KpiCard
            label="Actividades"
            value={String(actividades.length)}
            subtitle="Interacciones registradas"
            icon={Calendar}
          />
          <KpiCard
            label="Tareas pendientes"
            value={String(tareasCount)}
            subtitle="Sin completar"
            icon={CheckSquare}
            valueColor={tareasCount > 0 ? '#ca8a04' : undefined}
          />
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-[var(--border-color)] pb-px scrollbar-hide">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const badge = tabBadge[tab.key];
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.key}
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

      {/* ── TAB: RESUMEN ─────────────────────────────────────────── */}
      {activeTab === 'resumen' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT: top oportunidades + tributario preview */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Resumen de oportunidades */}
            <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp size={15} className="text-[#2563eb]" />
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-outfit), sans-serif' }}>
                    Oportunidades recientes
                  </h2>
                </div>
                {oportunidades.length > 3 && (
                  <button
                    onClick={() => setActiveTab('oportunidades')}
                    className="text-xs text-[#2563eb] hover:underline"
                  >
                    Ver todas →
                  </button>
                )}
              </div>
              {oportunidades.length === 0 ? (
                <EmptyHint text="Sin oportunidades registradas para este cliente." />
              ) : (
                <div className="flex flex-col divide-y divide-[var(--border-color)]">
                  {oportunidades.slice(0, 3).map((opp) => (
                    <div
                      key={opp.id}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{opp.title}</p>
                        {opp.serviceName && (
                          <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                            {opp.serviceCategory ? (CATEGORY_LABELS[opp.serviceCategory] ?? opp.serviceCategory) + ' · ' : ''}
                            {opp.serviceName}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <StageBadge name={opp.stageName} isWon={opp.stageIsWon} />
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          {formatCLP(Number(opp.amount))}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Tributario preview */}
            <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText size={15} className="text-[#2563eb]" />
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-outfit), sans-serif' }}>
                    Historial tributario
                  </h2>
                  {historialTributario.length > 0 && (
                    <span className="inline-flex items-center rounded-full bg-[rgba(37,99,235,0.1)] px-2 py-0.5 text-xs font-semibold text-[#2563eb]">
                      {historialTributario.length}
                    </span>
                  )}
                </div>
                {historialTributario.length > 2 && (
                  <button
                    onClick={() => setActiveTab('tributario')}
                    className="text-xs text-[#2563eb] hover:underline"
                  >
                    Ver historial →
                  </button>
                )}
              </div>
              {historialTributario.length === 0 ? (
                <EmptyHint text="Sin documentos tributarios vinculados desde Finanzas." />
              ) : (
                <div className="flex flex-col divide-y divide-[var(--border-color)]">
                  {historialTributario.slice(0, 2).map((rec) => (
                    <div key={rec.id} className="flex items-center gap-4 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-mono text-[var(--text-secondary)]">Folio {rec.folio}</p>
                        <p className="text-sm text-[var(--text-primary)]">{rec.type}</p>
                      </div>
                      <DirectionChip direction={rec.direction} />
                      <span className="text-xs text-[var(--text-secondary)] shrink-0">{formatDate(rec.issueDate)}</span>
                      <span className="text-sm font-semibold text-[var(--text-primary)] shrink-0">{formatCLP(Number(rec.totalAmount))}</span>
                    </div>
                  ))}
                </div>
              )}
              {historialTributario.length > 0 && (
                <p className="mt-3 text-[11px] text-[var(--text-secondary)]">
                  * Datos de solo lectura desde el módulo Finanzas.
                </p>
              )}
            </section>
          </div>

          {/* RIGHT: timeline + tareas */}
          <div className="flex flex-col gap-6">
            {/* Timeline preview */}
            <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar size={15} className="text-[#2563eb]" />
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-outfit), sans-serif' }}>
                    Actividad reciente
                  </h2>
                </div>
                {actividades.length > 4 && (
                  <button
                    onClick={() => setActiveTab('actividades')}
                    className="text-xs text-[#2563eb] hover:underline"
                  >
                    Ver todo →
                  </button>
                )}
              </div>
              {sortedActividades.length === 0 ? (
                <EmptyHint text="Sin actividades." />
              ) : (
                <div className="relative">
                  <div className="absolute left-[15px] top-0 bottom-0 w-px bg-[var(--border-color)]" />
                  <div className="flex flex-col gap-4 pl-9">
                    {sortedActividades.slice(0, 4).map((act) => {
                      const IconKey = act.type as ActivityIconKey;
                      const IconComp = ACTIVITY_ICONS[IconKey] ?? MessageSquare;
                      return (
                        <div key={act.id} className="relative">
                          <div className="absolute -left-9 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--bg-card)] border border-[var(--border-color)]">
                            <IconComp size={13} className="text-[#2563eb]" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <ActivityChip type={act.type} />
                              <span className="text-[11px] text-[var(--text-secondary)]">{formatDate(act.date)}</span>
                            </div>
                            <p className="text-xs text-[var(--text-primary)] leading-relaxed line-clamp-2">{act.content}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* Próximas tareas */}
            <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
              <div className="mb-4 flex items-center gap-2">
                <CheckSquare size={15} className="text-[#2563eb]" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-outfit), sans-serif' }}>
                  Próximas tareas
                </h2>
                {tareasCount > 0 && (
                  <span className="ml-auto inline-flex items-center rounded-full bg-[rgba(202,138,4,0.12)] px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    {tareasCount}
                  </span>
                )}
              </div>
              {sortedTareas.length === 0 ? (
                <EmptyHint text="Sin tareas pendientes." />
              ) : (
                <div className="flex flex-col gap-3">
                  {sortedTareas.slice(0, 4).map((task) => {
                    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !task.done;
                    return (
                      <div
                        key={task.id}
                        className={[
                          'rounded-lg border px-3 py-2.5',
                          isOverdue
                            ? 'border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-950/30'
                            : 'border-[var(--border-color)] bg-[rgba(37,99,235,0.04)]',
                        ].join(' ')}
                      >
                        <div className="flex items-start gap-2">
                          <Clock
                            size={13}
                            className={`mt-0.5 shrink-0 ${isOverdue ? 'text-red-500' : 'text-[#2563eb]'}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-[var(--text-primary)] leading-snug">{task.content}</p>
                            {task.dueDate && (
                              <p className={`mt-0.5 text-[11px] ${isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-[var(--text-secondary)]'}`}>
                                Vence: {formatDate(task.dueDate)}{isOverdue && ' — Vencida'}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* ── TAB: OPORTUNIDADES ───────────────────────────────────── */}
      {activeTab === 'oportunidades' && (
        <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm overflow-hidden">
          {oportunidades.length === 0 ? (
            <EmptyHint text="Este cliente no tiene oportunidades registradas." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border-color)] bg-[rgba(128,128,128,0.04)]">
                  <tr>
                    {['Oportunidad', 'Servicio', 'Etapa', 'Monto'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {oportunidades.map((opp) => (
                    <tr
                      key={opp.id}
                      className="hover:bg-[rgba(37,99,235,0.04)] transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href="/comercial/pipeline"
                          className="font-medium text-[var(--text-primary)] group-hover:text-[#2563eb] transition-colors hover:underline"
                        >
                          {opp.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {opp.serviceName ? (
                          <span>
                            {opp.serviceCategory && (
                              <span className="text-[11px] mr-1 text-[var(--text-secondary)]">
                                {CATEGORY_LABELS[opp.serviceCategory] ?? opp.serviceCategory} ·
                              </span>
                            )}
                            {opp.serviceName}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StageBadge name={opp.stageName} isWon={opp.stageIsWon} />
                      </td>
                      <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">
                        {formatCLP(Number(opp.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {oportunidades.length > 0 && (
            <div className="border-t border-[var(--border-color)] px-4 py-3 flex items-center justify-between bg-[rgba(128,128,128,0.03)]">
              <span className="text-xs text-[var(--text-secondary)]">
                {oportunidades.length} oportunidad{oportunidades.length !== 1 ? 'es' : ''} · Pipeline total:{' '}
                <span className="font-semibold text-[#2563eb]">{formatCLP(pipelineValue)}</span>
              </span>
              <Link
                href="/comercial/pipeline"
                className="text-xs text-[#2563eb] hover:underline"
              >
                Ver en pipeline →
              </Link>
            </div>
          )}
        </section>
      )}

      {/* ── TAB: ACTIVIDADES ─────────────────────────────────────── */}
      {activeTab === 'actividades' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Timeline */}
          <div className="lg:col-span-2">
            <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
              <div className="mb-5 flex items-center gap-2">
                <Calendar size={15} className="text-[#2563eb]" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-outfit), sans-serif' }}>
                  Línea de tiempo
                </h2>
                {actividades.length > 0 && (
                  <span className="ml-auto inline-flex items-center rounded-full bg-[rgba(37,99,235,0.1)] px-2 py-0.5 text-xs font-semibold text-[#2563eb]">
                    {actividades.length}
                  </span>
                )}
              </div>
              {sortedActividades.length === 0 ? (
                <EmptyHint text="Sin actividades registradas para este cliente." />
              ) : (
                <div className="relative">
                  <div className="absolute left-[15px] top-0 bottom-0 w-px bg-[var(--border-color)]" />
                  <div className="flex flex-col gap-5 pl-9">
                    {sortedActividades.map((act) => {
                      const IconKey = act.type as ActivityIconKey;
                      const IconComp = ACTIVITY_ICONS[IconKey] ?? MessageSquare;
                      return (
                        <div key={act.id} className="relative">
                          <div className="absolute -left-9 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--bg-card)] border border-[var(--border-color)]">
                            <IconComp size={13} className="text-[#2563eb]" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                              <ActivityChip type={act.type} />
                              <span className="text-[11px] text-[var(--text-secondary)]">{formatDate(act.date)}</span>
                              {act.done && (
                                <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 text-[11px] font-semibold">
                                  Completada
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-[var(--text-primary)] leading-relaxed">{act.content}</p>
                            {act.dueDate && (
                              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                                Vencimiento: {formatDate(act.dueDate)}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Próximas tareas sidebar */}
          <div>
            <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
              <div className="mb-4 flex items-center gap-2">
                <CheckSquare size={15} className="text-[#2563eb]" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-outfit), sans-serif' }}>
                  Próximas tareas
                </h2>
                {tareasCount > 0 && (
                  <span className="ml-auto inline-flex items-center rounded-full bg-[rgba(202,138,4,0.12)] px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    {tareasCount}
                  </span>
                )}
              </div>
              {sortedTareas.length === 0 ? (
                <EmptyHint text="Sin tareas pendientes." />
              ) : (
                <div className="flex flex-col gap-3">
                  {sortedTareas.map((task) => {
                    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !task.done;
                    return (
                      <div
                        key={task.id}
                        className={[
                          'rounded-lg border px-3 py-2.5',
                          isOverdue
                            ? 'border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-950/30'
                            : 'border-[var(--border-color)] bg-[rgba(37,99,235,0.04)]',
                        ].join(' ')}
                      >
                        <div className="flex items-start gap-2">
                          <Clock
                            size={13}
                            className={`mt-0.5 shrink-0 ${isOverdue ? 'text-red-500' : 'text-[#2563eb]'}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-[var(--text-primary)] leading-snug">{task.content}</p>
                            {task.dueDate && (
                              <p className={`mt-0.5 text-[11px] ${isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-[var(--text-secondary)]'}`}>
                                Vence: {formatDate(task.dueDate)}{isOverdue && ' — Vencida'}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* ── TAB: HISTORIAL TRIBUTARIO ────────────────────────────── */}
      {activeTab === 'tributario' && (
        <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-color)] flex items-center gap-2 bg-[rgba(128,128,128,0.03)]">
            <FileText size={15} className="text-[#2563eb]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-outfit), sans-serif' }}>
              Historial tributario
            </h2>
            {historialTributario.length > 0 && (
              <span className="ml-1 inline-flex items-center rounded-full bg-[rgba(37,99,235,0.1)] px-2 py-0.5 text-xs font-semibold text-[#2563eb]">
                {historialTributario.length}
              </span>
            )}
            <span className="ml-auto text-[11px] text-[var(--text-secondary)] italic">
              desde Finanzas · solo lectura
            </span>
          </div>
          {historialTributario.length === 0 ? (
            <EmptyHint text="Sin documentos tributarios vinculados desde el módulo Finanzas." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border-color)] bg-[rgba(128,128,128,0.04)]">
                  <tr>
                    {['Folio', 'Tipo', 'Dirección', 'Fecha emisión', 'Monto neto', 'Total', 'Estado'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {historialTributario.map((rec) => (
                    <tr key={rec.id} className="hover:bg-[rgba(128,128,128,0.03)] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">{rec.folio}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{rec.type}</td>
                      <td className="px-4 py-3">
                        <DirectionChip direction={rec.direction} />
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{formatDate(rec.issueDate)}</td>
                      <td className="px-4 py-3 text-right font-medium text-[var(--text-primary)]">
                        {formatCLP(Number(rec.netAmount))}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[var(--text-primary)]">
                        {formatCLP(Number(rec.totalAmount))}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-[rgba(128,128,128,0.1)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                          {rec.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {historialTributario.length > 0 && (
            <div className="px-5 py-3 border-t border-[var(--border-color)] bg-[rgba(128,128,128,0.02)]">
              <p className="text-[11px] text-[var(--text-secondary)]">
                * Documentos de solo lectura sincronizados desde el módulo Finanzas (SII / BaseAPI).
              </p>
            </div>
          )}
        </section>
      )}

      {/* ── TAB: COTIZACIONES ────────────────────────────────────── */}
      {activeTab === 'cotizaciones' && (
        <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm overflow-hidden">
          {loadingQuotes ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : errorQuotes ? (
            <div className="m-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {errorQuotes}
            </div>
          ) : quotes.length === 0 ? (
            <EmptyHint text="Sin cotizaciones para este cliente." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border-color)] bg-[rgba(128,128,128,0.04)]">
                  <tr>
                    {['Estado', 'Oportunidad', 'Versión', 'Ítems', 'Total', 'Válida hasta', 'Acciones'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {quotes.map((q) => (
                    <tr key={q.id} className="hover:bg-[rgba(37,99,235,0.04)] transition-colors">
                      <td className="px-4 py-3">
                        <QuoteStatusChip status={q.status} />
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)] max-w-[200px] truncate">
                        {q.opportunityTitle ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center rounded-full bg-[rgba(128,128,128,0.1)] text-xs font-semibold text-[var(--text-secondary)] h-5 w-5">
                          {q.version}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-[var(--text-secondary)]">{q.itemCount}</td>
                      <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">
                        {formatCLP(Number(q.total))}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {q.validUntil ? formatDate(q.validUntil) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/comercial/cotizaciones?opportunityId=${q.opportunityId ?? ''}`}
                          className="text-xs text-[#2563eb] hover:underline font-medium"
                        >
                          Ver →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loadingQuotes && quotes.length > 0 && (
            <div className="border-t border-[var(--border-color)] px-4 py-3 flex items-center justify-between bg-[rgba(128,128,128,0.03)]">
              <span className="text-xs text-[var(--text-secondary)]">
                {quotes.length} cotización{quotes.length !== 1 ? 'es' : ''}
              </span>
              <Link href="/comercial/cotizaciones" className="text-xs text-[#2563eb] hover:underline">
                Todas las cotizaciones →
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
