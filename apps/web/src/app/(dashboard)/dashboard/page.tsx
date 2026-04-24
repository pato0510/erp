'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '../../../lib/api';
import { formatCLP, formatDate, formatRelativeDate } from '../../../lib/formatters';
import { PeriodSelector } from '../../../components/shared/PeriodSelector';
import { Toast } from '../../../components/shared/Toast';
import { Gauge } from '../../../components/dashboard/Gauge';
import { GoalsModal } from '../../../components/dashboard/GoalsModal';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Upload,
  FileText,
  AlertCircle,
  Percent,
  Target,
  Pencil,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface AnnualMonth {
  month: number;
  name: string;
  income: number;
  expense: number;
  margin: number;
  hasData: boolean;
}

interface AnnualCategoryRow {
  categoryName: string;
  total: number;
  percentage: number;
}

interface AnnualData {
  year: number;
  goals: { incomeGoal: number | null; expenseLimit: number | null } | null;
  months: AnnualMonth[];
  totals: {
    income: number;
    expense: number;
    margin: number;
    result: number;
    incomeVsGoal: number;
    expenseVsLimit: number;
  };
  categories: {
    topExpenses: AnnualCategoryRow[];
    topIncome: AnnualCategoryRow[];
  };
}

interface RealtimeCash {
  totalCash: number;
  freeCash: number;
  committedAmount: number;
  lastUpdated: string;
}

interface MultiYearYear {
  year: number;
  income: number;
  expense: number;
  margin: number;
  result: number;
  hasData: boolean;
}

interface MultiYearMonth {
  year: number;
  month: number;
  label: string;
  income: number;
  expense: number;
  hasData: boolean;
}

interface MultiYearData {
  years: MultiYearYear[];
  totals: {
    income: number;
    expense: number;
    margin: number;
    result: number;
    bestYear: number;
    worstYear: number;
  };
  monthlyEvolution: MultiYearMonth[];
}

const MONTH_SHORT = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

function marginColor(margin: number): string {
  if (margin > 20) return 'text-blue-600';
  if (margin >= 10) return 'text-yellow-500';
  return 'text-red-500';
}

function expenseGaugeColor(pct: number): string {
  if (pct > 100) return '#dc2626';
  if (pct >= 80) return '#dc2626';
  if (pct >= 60) return '#d97706';
  return '#16a34a';
}

interface DashboardData {
  period: { name: string; status: string };
  cash: { totalCash: number; freeCash: number; committedAmount: number; openingBalance: number };
  movements: {
    totalIncome: number;
    totalExpense: number;
    balance: number;
    confirmedCount: number;
    draftCount: number;
  };
  commitments: {
    upcoming: {
      id: string;
      description: string;
      amount: string;
      dueDate: string;
      type: string;
      counterparty?: { name: string };
      category?: { name: string };
    }[];
    totalPending: number;
    totalPendingAmount: number;
  };
  categories: {
    topExpenses: { categoryName: string; total: number; percentage: number; color: string }[];
    topIncome: { categoryName: string; total: number; percentage: number; color: string }[];
  };
  recentMovements: {
    id: string;
    type: string;
    amount: string;
    date: string;
    description: string;
    category: { name: string; color: string };
    counterparty?: { name: string };
  }[];
  alerts: {
    critical: number;
    warning: number;
    info: number;
    items: { id: string; severity: string; title: string; message: string }[];
  };
}

function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
              fontSize: 16,
              letterSpacing: '-0.01em',
              color: 'var(--text-secondary)',
            }}
          >
            {title}
          </p>
          <p
            className="amount"
            style={{
              marginTop: 6,
              fontSize: 32,
              color: 'var(--text-primary)',
              lineHeight: 1.1,
            }}
          >
            {value}
          </p>
          {subtitle && (
            <p
              style={{
                marginTop: 6,
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 300,
                fontSize: 13,
                color: 'var(--text-muted)',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        <div
          className={`p-3 rounded-lg ${color.replace('text-', 'bg-').replace('600', '100').replace('500', '100')}`}
        >
          <Icon size={24} className={color} />
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6 shadow-sm animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
      <div className="h-8 bg-gray-200 rounded w-36" />
    </div>
  );
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: 'Abierto', cls: 'bg-green-100 text-green-700' },
  IN_REVIEW: { label: 'En Revisión', cls: 'bg-yellow-100 text-yellow-700' },
  CLOSED: { label: 'Cerrado', cls: 'bg-gray-100 text-[var(--text-secondary)]' },
};

const PIE_COLORS = [
  '#1E3A5F',
  '#2563EB',
  '#3B82F6',
  '#60A5FA',
  '#93C5FD',
  '#64748B',
  '#475569',
  '#334155',
];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [periodId, setPeriodId] = useState('');
  const [viewMode, setViewMode] = useState<'month' | 'year' | 'multiyear'>('month');
  const [selectedYear, setSelectedYear] = useState(2026);
  const [annualData, setAnnualData] = useState<AnnualData | null>(null);
  const [realtimeCash, setRealtimeCash] = useState<RealtimeCash | null>(null);
  const [multiYearData, setMultiYearData] = useState<MultiYearData | null>(null);
  const [multiYearFrom, setMultiYearFrom] = useState(2019);
  const [multiYearTo, setMultiYearTo] = useState(new Date().getFullYear());
  const [multiYearChartMode, setMultiYearChartMode] = useState<'year' | 'month'>('month');
  const [goalsModalOpen, setGoalsModalOpen] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const param = periodId ? `?fiscalPeriodId=${periodId}` : '';
    try {
      const result = await apiClient.get<DashboardData>(`/api/dashboard${param}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setIsLoading(false);
    }
  }, [periodId]);

  const loadAnnual = useCallback(async () => {
    if (viewMode !== 'year') return;
    const url = `/api/dashboard/annual?year=${selectedYear}`;

    console.log('[dashboard] fetching annual', { url, viewMode, selectedYear });
    try {
      const result = await apiClient.get<AnnualData>(url);

      console.log('[dashboard] annual response', result);
      setAnnualData(result);
    } catch (err) {
      console.error('[dashboard] annual fetch failed', err);
      setToast({
        message:
          err instanceof Error
            ? `No se pudieron cargar los datos anuales: ${err.message}`
            : 'No se pudieron cargar los datos anuales',
        type: 'error',
      });
    }
  }, [viewMode, selectedYear]);

  const loadRealtimeCash = useCallback(async () => {
    try {
      const res = await apiClient.get<RealtimeCash>('/api/dashboard/realtime-cash');
      setRealtimeCash(res);
    } catch {
      /* non-fatal; the Posición actual cards fall back to a skeleton state */
    }
  }, []);

  useEffect(() => {
    loadRealtimeCash();
  }, [loadRealtimeCash]);

  const loadMultiYear = useCallback(async () => {
    if (viewMode !== 'multiyear') return;
    try {
      const result = await apiClient.get<MultiYearData>(
        `/api/dashboard/multiyear?fromYear=${multiYearFrom}&toYear=${multiYearTo}`,
      );
      setMultiYearData(result);
    } catch (err) {
      setToast({
        message:
          err instanceof Error
            ? `No se pudieron cargar los datos históricos: ${err.message}`
            : 'No se pudieron cargar los datos históricos',
        type: 'error',
      });
    }
  }, [viewMode, multiYearFrom, multiYearTo]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadAnnual();
  }, [loadAnnual]);

  useEffect(() => {
    loadMultiYear();
  }, [loadMultiYear]);

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-xl">Error cargando dashboard: {error}</div>
    );
  }

  const weekCommitments =
    data?.commitments.upcoming.filter((c) => {
      const days = (new Date(c.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return days >= 0 && days <= 7;
    }).length ?? 0;

  const incomeExpenseData = data
    ? [
        { name: 'Ingresos', value: Number(data.movements.totalIncome) },
        { name: 'Egresos', value: Number(data.movements.totalExpense) },
      ]
    : [];

  const monthMargin = data
    ? Number(data.movements.totalIncome) > 0
      ? ((Number(data.movements.totalIncome) - Number(data.movements.totalExpense)) /
          Number(data.movements.totalIncome)) *
        100
      : 0
    : 0;
  const marginValue = viewMode === 'year' ? Number(annualData?.totals.margin ?? 0) : monthMargin;

  const goals = annualData?.goals ?? null;
  const hasGoals = Boolean(goals && (goals.incomeGoal || goals.expenseLimit));
  const incomeVsGoal = Number(annualData?.totals.incomeVsGoal ?? 0);
  const expenseVsLimit = Number(annualData?.totals.expenseVsLimit ?? 0);

  const monthlyGoal = goals?.incomeGoal ? goals.incomeGoal / 12 : null;
  const months12 = Array.from({ length: 12 }, (_, i) => {
    const m = annualData?.months?.find((x) => x.month === i + 1);
    return {
      name: MONTH_SHORT[i],
      income: m?.hasData ? Number(m.income) : null,
      expense: m?.hasData ? Number(m.expense) : null,
      goal: monthlyGoal,
    };
  });

  const expenseCategorySource =
    viewMode === 'year'
      ? (annualData?.categories?.topExpenses ?? []).map((c) => ({
          categoryName: c.categoryName,
          total: Number(c.total),
        }))
      : (data?.categories.topExpenses ?? []).map((c) => ({
          categoryName: c.categoryName,
          total: Number(c.total),
        }));

  const pieData = expenseCategorySource.map((c, i) => ({
    name: c.categoryName,
    value: c.total,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  const pieTitle =
    viewMode === 'year'
      ? `Categorías de Gasto — ${selectedYear}`
      : `Categorías de Gasto${data ? ` — ${data.period.name}` : ''}`;

  // Company has data from 2019 onwards; include next year so users can set goals ahead of time.
  const yearOptions: number[] = [];
  for (let y = 2019; y <= new Date().getFullYear() + 1; y++) yearOptions.push(y);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Posición actual — cumulative real-time cash, independent of period selection */}
      <RealtimeCashSection cash={realtimeCash} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl text-[var(--text-primary)]">Dashboard</h1>
          {data && (
            <p className="text-[var(--text-secondary)] mt-1">
              {data.period.name} &middot;{' '}
              <span
                className={`badge inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_LABELS[data.period.status]?.cls || 'bg-gray-100 text-[var(--text-secondary)]'}`}
              >
                {STATUS_LABELS[data.period.status]?.label || data.period.status}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {[
              { mode: 'month' as const, label: 'Mes' },
              { mode: 'year' as const, label: 'Año' },
              { mode: 'multiyear' as const, label: 'Historia' },
            ].map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  viewMode === mode
                    ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)]'
                }`}
                style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
              >
                {label}
              </button>
            ))}
          </div>
          {viewMode === 'month' ? (
            <PeriodSelector value={periodId} onChange={setPeriodId} />
          ) : viewMode === 'year' ? (
            <div
              className="flex gap-2 overflow-x-auto max-w-full pb-1 -mb-1 bg-gray-100 rounded-lg p-0.5"
              style={{ maxWidth: 'min(100%, 520px)' }}
            >
              {yearOptions.map((y) => (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    selectedYear === y
                      ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-secondary)]'
                  }`}
                  style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
                >
                  {y}
                </button>
              ))}
            </div>
          ) : (
            <MultiYearRange
              fromYear={multiYearFrom}
              toYear={multiYearTo}
              onChange={(f, t) => {
                setMultiYearFrom(f);
                setMultiYearTo(t);
              }}
            />
          )}
        </div>
      </div>

      {viewMode === 'multiyear' && (
        <MultiYearContent
          data={multiYearData}
          onYearClick={(year) => {
            setSelectedYear(year);
            setViewMode('year');
          }}
          chartMode={multiYearChartMode}
          onChartModeChange={setMultiYearChartMode}
        />
      )}

      {viewMode !== 'multiyear' && (
        <>
          {/* Critical alert banner */}
          {data && data.alerts.critical > 0 && (
            <Link
              href="/alertas"
              className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-3 hover:bg-red-100 transition"
            >
              <AlertCircle size={20} className="text-red-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">
                  {data.alerts.critical} alerta{data.alerts.critical > 1 ? 's' : ''} crítica
                  {data.alerts.critical > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-red-600">
                  {data.alerts.items.find((a) => a.severity === 'CRITICAL')?.title ||
                    'Requiere atención inmediata'}
                </p>
              </div>
              <span className="text-xs text-red-500">Ver alertas →</span>
            </Link>
          )}

          {/* Period-scoped KPI Cards — Caja Total/Libre moved to top "Posición actual" section */}
          {(() => {
            // Source of truth flips based on viewMode. Same card layout either
            // way — we just swap values and labels so the UX is identical.
            const isYear = viewMode === 'year';
            const income = isYear
              ? Number(annualData?.totals.income ?? 0)
              : Number(data?.movements.totalIncome ?? 0);
            const expense = isYear
              ? Number(annualData?.totals.expense ?? 0)
              : Number(data?.movements.totalExpense ?? 0);
            const result = isYear
              ? Number(annualData?.totals.result ?? 0)
              : Number(data?.movements.balance ?? 0);
            const margin = isYear ? Number(annualData?.totals.margin ?? 0) : monthMargin;
            const incomeTitle = isYear ? `Ingresos ${selectedYear}` : 'Ingresos del período';
            const expenseTitle = isYear ? `Egresos ${selectedYear}` : 'Egresos del período';
            const marginTitle = isYear ? `Margen ${selectedYear}` : 'Margen del período';
            const resultTitle = isYear ? `Resultado ${selectedYear}` : 'Resultado del período';
            const marginSubtitle = isYear
              ? `Año ${selectedYear}`
              : (data?.period.name ?? 'Período actual');
            const incomeSubtitle = isYear
              ? 'Confirmados en el año'
              : `${data?.movements.confirmedCount ?? 0} confirmados`;
            const expenseSubtitle = `Balance: ${formatCLP(result)}`;
            const resultSubtitle = result >= 0 ? 'Ganancia' : 'Pérdida';
            const waitingForAnnual = isYear && !annualData;
            const waitingForMonth = !isYear && isLoading;
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
                {waitingForMonth || waitingForAnnual ? (
                  <>
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                  </>
                ) : (
                  <>
                    <KpiCard
                      title={incomeTitle}
                      value={formatCLP(income)}
                      icon={TrendingUp}
                      color="text-blue-600"
                      subtitle={incomeSubtitle}
                    />
                    <KpiCard
                      title={expenseTitle}
                      value={formatCLP(expense)}
                      icon={TrendingDown}
                      color="text-red-500"
                      subtitle={expenseSubtitle}
                    />
                    <KpiCard
                      title={marginTitle}
                      value={`${margin.toFixed(1)}%`}
                      icon={Percent}
                      color={marginColor(margin)}
                      subtitle={marginSubtitle}
                    />
                    <KpiCard
                      title={resultTitle}
                      value={formatCLP(result)}
                      icon={DollarSign}
                      color={result >= 0 ? 'text-green-600' : 'text-red-500'}
                      subtitle={resultSubtitle}
                    />
                  </>
                )}
              </div>
            );
          })()}

          {/* Gauges — Ingresos vs Meta y Egresos vs Límite */}
          {hasGoals && annualData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
              {goals?.incomeGoal ? (
                <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      Ingresos vs Meta {selectedYear}
                    </h3>
                    <button
                      onClick={() => setGoalsModalOpen(true)}
                      className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--text-muted)]"
                      title="Editar metas"
                      aria-label="Editar metas"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                  <div className="flex justify-center">
                    <Gauge
                      percentage={incomeVsGoal}
                      fillColor={incomeVsGoal >= 100 ? '#16a34a' : '#2563EB'}
                      centerText={`${Math.round(incomeVsGoal)}%`}
                      ariaLabel="Ingresos vs meta anual"
                    />
                  </div>
                  <p className="mt-2 text-center text-sm text-[var(--text-secondary)]">
                    {incomeVsGoal >= 100 ? (
                      <span className="text-green-600 font-medium">¡Meta superada!</span>
                    ) : (
                      <>
                        Logrado{' '}
                        <span className="amount text-[var(--text-primary)]">
                          {formatCLP(annualData.totals.income)}
                        </span>{' '}
                        de <span className="amount">{formatCLP(Number(goals.incomeGoal))}</span>{' '}
                        meta anual
                      </>
                    )}
                  </p>
                </div>
              ) : null}

              {goals?.expenseLimit ? (
                <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      Egresos vs Límite {selectedYear}
                    </h3>
                    <button
                      onClick={() => setGoalsModalOpen(true)}
                      className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--text-muted)]"
                      title="Editar metas"
                      aria-label="Editar metas"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                  <div className="flex justify-center">
                    <Gauge
                      percentage={expenseVsLimit}
                      fillColor={expenseGaugeColor(expenseVsLimit)}
                      centerText={`${Math.round(expenseVsLimit)}%`}
                      ariaLabel="Egresos vs límite anual"
                    />
                  </div>
                  <p className="mt-2 text-center text-sm text-[var(--text-secondary)]">
                    {expenseVsLimit > 100 ? (
                      <span className="text-red-600 font-medium">¡Límite superado!</span>
                    ) : (
                      <>
                        Usado{' '}
                        <span className="amount text-[var(--text-primary)]">
                          {formatCLP(annualData.totals.expense)}
                        </span>{' '}
                        de <span className="amount">{formatCLP(Number(goals.expenseLimit))}</span>{' '}
                        límite anual
                      </>
                    )}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mb-6">
              <button
                onClick={() => setGoalsModalOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
              >
                <Target size={14} /> Definir metas
              </button>
            </div>
          )}

          {/* Summary chips + Quick actions */}
          {data && (
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div className="flex flex-wrap gap-2">
                {weekCommitments > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                    <AlertCircle size={12} />
                    {weekCommitments} vencimiento{weekCommitments > 1 ? 's' : ''} esta semana
                  </span>
                )}
                {data.movements.draftCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
                    <FileText size={12} />
                    {data.movements.draftCount} borrador{data.movements.draftCount > 1 ? 'es' : ''}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Link
                  href="/movimientos/nuevo"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  <Plus size={12} /> Nuevo Movimiento
                </Link>
                <Link
                  href="/caja/nuevo-compromiso"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  <Clock size={12} /> Nuevo Compromiso
                </Link>
                <Link
                  href="/movimientos/importar"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  <Upload size={12} /> Importar CSV
                </Link>
              </div>
            </div>
          )}

          {data && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* CHART 1 — Income vs Expense (bar in month view, line in year view) */}
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
                  {viewMode === 'year'
                    ? `Evolución mensual ${selectedYear}`
                    : 'Ingresos vs Egresos'}
                </h3>
                {viewMode === 'year' ? (
                  <>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={months12}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => (v ? `$${(Number(v) / 1000000).toFixed(1)}M` : '')}
                        />
                        <Tooltip
                          formatter={(v: unknown) =>
                            v == null ? 'Sin datos' : formatCLP(v as number)
                          }
                          contentStyle={{ borderRadius: 8, fontSize: 12 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="income"
                          name="Ingresos"
                          stroke="#2563EB"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="expense"
                          name="Egresos"
                          stroke="#94A3B8"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls={false}
                        />
                        {goals?.incomeGoal ? (
                          <Line
                            type="monotone"
                            dataKey="goal"
                            name="Meta mensual"
                            stroke="#16a34a"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            dot={false}
                          />
                        ) : null}
                      </LineChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: '#2563EB' }}
                        />
                        Ingresos
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: '#94A3B8' }}
                        />
                        Egresos
                      </span>
                      {goals?.incomeGoal ? (
                        <span className="flex items-center gap-1.5">
                          <span
                            className="inline-block w-5 h-0.5"
                            style={{ backgroundColor: '#16a34a' }}
                          />
                          Meta mensual
                        </span>
                      ) : null}
                    </div>
                  </>
                ) : incomeExpenseData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={incomeExpenseData} layout="vertical" barSize={28}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 12 }} />
                        <Tooltip
                          formatter={(v: unknown) => formatCLP(v as number)}
                          contentStyle={{ borderRadius: 8, fontSize: 12 }}
                        />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                          <Cell fill="#2563EB" />
                          <Cell fill="#94A3B8" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex items-center gap-4 mt-3 text-xs text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: '#2563EB' }}
                        />
                        Ingresos
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: '#94A3B8' }}
                        />
                        Egresos
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-[var(--text-muted)] text-sm text-center py-8">Sin datos</p>
                )}
              </div>

              {/* CHART 2 — Expense categories pie */}
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
                  {pieTitle}
                </h3>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={3}
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: unknown) => formatCLP(v as number)}
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-[var(--text-muted)] text-sm text-center py-8">
                    Sin datos de gastos
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  {pieData.map((d) => (
                    <span
                      key={d.name}
                      className="flex items-center gap-1 text-xs text-[var(--text-secondary)]"
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ backgroundColor: d.color }}
                      />
                      {d.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* CHART 3 — Cash flow summary */}
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
                  Flujo de Caja
                </h3>
                <div className="space-y-3">
                  {[
                    {
                      label: 'Saldo Apertura',
                      value: Number(data.cash.openingBalance),
                      color: '#64748B',
                    },
                    {
                      label: 'Ingresos',
                      value: Number(data.movements.totalIncome),
                      color: '#2563EB',
                    },
                    {
                      label: 'Egresos',
                      value: Number(data.movements.totalExpense),
                      color: '#94A3B8',
                    },
                    {
                      label: 'Caja Libre',
                      value: Number(data.cash.freeCash),
                      color: '#1E3A5F',
                    },
                  ].map((item) => {
                    const maxVal = Math.max(
                      Number(data.cash.openingBalance),
                      Number(data.movements.totalIncome),
                      Number(data.movements.totalExpense),
                      Number(data.cash.freeCash),
                      1,
                    );
                    const pct = Math.round((Math.abs(item.value) / maxVal) * 100);
                    return (
                      <div key={item.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[var(--text-secondary)]">{item.label}</span>
                          <span className="amount text-[var(--text-primary)]">
                            {formatCLP(item.value)}
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className="h-2 rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: item.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {data && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Upcoming Commitments */}
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm">
                <div className="px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
                  <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <Clock size={18} />
                    Compromisos Próximos
                  </h2>
                  <Link href="/caja" className="text-xs text-blue-600 hover:underline">
                    Ver todos
                  </Link>
                </div>
                <div className="divide-y divide-[var(--border-color)]">
                  {data.commitments.upcoming.length === 0 ? (
                    <p className="px-6 py-8 text-[var(--text-muted)] text-center text-sm">
                      Sin compromisos pendientes
                    </p>
                  ) : (
                    data.commitments.upcoming.slice(0, 5).map((c) => {
                      const daysUntil = Math.round(
                        (new Date(c.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                      );
                      const urgencyColor =
                        daysUntil < 7
                          ? 'text-red-600'
                          : daysUntil < 15
                            ? 'text-yellow-600'
                            : 'text-[var(--text-secondary)]';
                      return (
                        <div key={c.id} className="px-6 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-[var(--text-primary)]">
                              {c.description}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {c.counterparty?.name || c.category?.name || ''} &middot;{' '}
                              <span className={urgencyColor}>{formatRelativeDate(c.dueDate)}</span>
                            </p>
                          </div>
                          <span className="amount text-sm text-[var(--text-primary)]">
                            {formatCLP(c.amount)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Recent Movements */}
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm">
                <div className="px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
                  <h2 className="font-semibold text-[var(--text-primary)]">
                    Movimientos Recientes
                  </h2>
                  <Link href="/movimientos" className="text-xs text-blue-600 hover:underline">
                    Ver todos
                  </Link>
                </div>
                <div className="divide-y divide-[var(--border-color)]">
                  {data.recentMovements.length === 0 ? (
                    <p className="px-6 py-8 text-[var(--text-muted)] text-center text-sm">
                      Sin movimientos confirmados
                    </p>
                  ) : (
                    data.recentMovements.map((m) => (
                      <Link
                        key={m.id}
                        href="/movimientos"
                        className="px-6 py-3 flex items-center justify-between hover:bg-gray-50 transition block"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-1.5 rounded-md ${m.type === 'INCOME' ? 'bg-green-100' : 'bg-red-100'}`}
                          >
                            {m.type === 'INCOME' ? (
                              <ArrowUpRight size={14} className="text-green-600" />
                            ) : (
                              <ArrowDownRight size={14} className="text-red-500" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[var(--text-primary)]">
                              {m.description}
                            </p>
                            <p className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                              <span
                                className="inline-block w-2 h-2 rounded-full"
                                style={{ backgroundColor: m.category.color || '#888' }}
                              />
                              {m.category.name}
                              {m.counterparty ? ` · ${m.counterparty.name}` : ''}
                              {' · '}
                              {formatDate(m.date)}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`amount text-sm ${m.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}
                        >
                          {m.type === 'INCOME' ? '+' : '-'}
                          {formatCLP(m.amount)}
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {goalsModalOpen && (
        <GoalsModal
          year={selectedYear}
          initialIncomeGoal={goals?.incomeGoal ?? null}
          initialExpenseLimit={goals?.expenseLimit ?? null}
          onClose={() => setGoalsModalOpen(false)}
          onSaved={() => {
            setGoalsModalOpen(false);
            setToast({ message: 'Metas actualizadas', type: 'success' });
            loadAnnual();
          }}
          onError={(message) => setToast({ message, type: 'error' })}
        />
      )}
    </div>
  );
}

// ───────────────────────── Real-time cash section ─────────────────────────

function RealtimeCashSection({ cash }: { cash: RealtimeCash | null }) {
  if (!cash) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6 shadow-sm animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-32 mb-3" />
          <div className="h-10 bg-gray-200 rounded w-48" />
        </div>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6 shadow-sm animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-32 mb-3" />
          <div className="h-10 bg-gray-200 rounded w-48" />
        </div>
      </div>
    );
  }

  const totalColor = cash.totalCash >= 0 ? 'text-green-600' : 'text-red-600';
  const ratio = cash.totalCash > 0 ? cash.freeCash / cash.totalCash : 0;
  const freeColor =
    ratio > 0.5 ? 'text-green-600' : ratio >= 0.2 ? 'text-yellow-500' : 'text-red-500';
  const freeBarColor = ratio > 0.5 ? '#16a34a' : ratio >= 0.2 ? '#d97706' : '#dc2626';
  // Clamp width for display; negative/over-100% ratios get pinned but we still
  // surface the number above the bar so it's not hidden.
  const freePct = Math.max(0, Math.min(100, ratio * 100));
  const lastUpdatedLabel = cash.lastUpdated
    ? formatRelativeDate(
        typeof cash.lastUpdated === 'string'
          ? cash.lastUpdated
          : new Date(cash.lastUpdated).toISOString(),
      )
    : 'Actualizado ahora';

  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">
          Posición actual
        </h2>
        <span className="text-[11px] text-[var(--text-muted)]">{lastUpdatedLabel}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6 shadow-sm">
          <p className="text-sm text-[var(--text-secondary)]" style={{ fontWeight: 500 }}>
            Caja Total hoy
          </p>
          <p className={`amount mt-1 leading-tight ${totalColor}`} style={{ fontSize: 36 }}>
            {formatCLP(cash.totalCash)}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1" style={{ fontWeight: 300 }}>
            Saldo acumulado total · Actualizado ahora
          </p>
        </div>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6 shadow-sm">
          <p className="text-sm text-[var(--text-secondary)]" style={{ fontWeight: 500 }}>
            Caja Libre hoy
          </p>
          <p className={`amount mt-1 leading-tight ${freeColor}`} style={{ fontSize: 36 }}>
            {formatCLP(cash.freeCash)}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1" style={{ fontWeight: 300 }}>
            Disponible tras compromisos · Comprometido {formatCLP(cash.committedAmount)}
          </p>
          <div className="mt-3 w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full"
              style={{ width: `${freePct}%`, backgroundColor: freeBarColor }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── MultiYear components ─────────────────────────

function MultiYearRange({
  fromYear,
  toYear,
  onChange,
}: {
  fromYear: number;
  toYear: number;
  onChange: (from: number, to: number) => void;
}) {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = 2019; y <= currentYear + 1; y++) years.push(y);
  return (
    <div className="flex items-center gap-2 text-xs">
      <label className="text-[var(--text-secondary)]">Desde</label>
      <select
        value={fromYear}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange(v, Math.max(v, toYear));
        }}
        className="px-2 py-1 border border-[var(--border-color)] rounded-md bg-[var(--bg-card)] text-[var(--text-primary)]"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <label className="text-[var(--text-secondary)]">Hasta</label>
      <select
        value={toYear}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange(Math.min(fromYear, v), v);
        }}
        className="px-2 py-1 border border-[var(--border-color)] rounded-md bg-[var(--bg-card)] text-[var(--text-primary)]"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}

function MultiYearContent({
  data,
  onYearClick,
  chartMode,
  onChartModeChange,
}: {
  data: MultiYearData | null;
  onYearClick: (year: number) => void;
  chartMode: 'year' | 'month';
  onChartModeChange: (mode: 'year' | 'month') => void;
}) {
  if (!data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const { years, totals, monthlyEvolution } = data;
  const bestYearRow = years.find((y) => y.year === totals.bestYear);
  const avgMargin =
    years.filter((y) => y.hasData).reduce((s, y) => s + y.margin, 0) /
    (years.filter((y) => y.hasData).length || 1);

  // Pre-null months without data so the LineChart renders gaps (connectNulls=false).
  const monthChartData = monthlyEvolution.map((m) => ({
    label: m.label,
    year: m.year,
    income: m.hasData ? m.income : null,
    expense: m.hasData ? m.expense : null,
  }));
  const yearChartData = years.map((y) => ({
    year: String(y.year),
    income: y.income,
    expense: y.expense,
    hasData: y.hasData,
  }));

  return (
    <>
      {/* ROW 1 — Historical KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <KpiCard
          title="Ingresos totales históricos"
          value={formatCLP(totals.income)}
          icon={TrendingUp}
          color="text-blue-600"
          subtitle={`${years.length} años`}
        />
        <KpiCard
          title="Egresos totales históricos"
          value={formatCLP(totals.expense)}
          icon={TrendingDown}
          color="text-red-500"
          subtitle={`Resultado: ${formatCLP(totals.result)}`}
        />
        <KpiCard
          title="Margen promedio"
          value={`${avgMargin.toFixed(1)}%`}
          icon={Percent}
          color={marginColor(avgMargin)}
          subtitle="Promedio anual"
        />
        <KpiCard
          title="Mejor año"
          value={String(totals.bestYear)}
          icon={Target}
          color="text-green-600"
          subtitle={bestYearRow ? formatCLP(bestYearRow.income) : '—'}
        />
      </div>

      {/* ROW 2 — Bar chart per year */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5 mb-6">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
          Ingresos y egresos por año
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={yearChartData}
            onClick={(state) => {
              // recharts gives us the active payload on bar click; fall back
              // to activeLabel (the X-axis tick) if the payload is empty.
              const clickedYear = state?.activeLabel;
              if (clickedYear) onYearClick(Number(clickedYear));
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => (v ? `$${(Number(v) / 1000000).toFixed(1)}M` : '')}
            />
            <Tooltip
              formatter={(v: unknown) => formatCLP(v as number)}
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
            />
            <Bar dataKey="income" name="Ingresos" fill="#2563EB" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" name="Egresos" fill="#94A3B8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-[var(--text-muted)] mt-2">
          Haz clic en un año para ver su detalle mensual.
        </p>
      </div>

      {/* ROW 3 — Chart-mode toggle + continuous timeline */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {chartMode === 'year' ? 'Evolución por año' : 'Evolución por mes'}
          </h3>
          <div className="inline-flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {[
              { mode: 'month' as const, label: 'Por mes' },
              { mode: 'year' as const, label: 'Por año' },
            ].map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => onChartModeChange(mode)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  chartMode === mode
                    ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {chartMode === 'year' ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={yearChartData}
              onClick={(state) => {
                const clickedYear = state?.activeLabel;
                if (clickedYear) onYearClick(Number(clickedYear));
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => (v ? `$${(Number(v) / 1000000).toFixed(1)}M` : '')}
              />
              <Tooltip
                formatter={(v: unknown) => formatCLP(v as number)}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="income" name="Ingresos" fill="#2563EB" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Egresos" fill="#94A3B8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                interval={Math.max(0, Math.floor(monthChartData.length / 12) - 1)}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => (v ? `$${(Number(v) / 1000000).toFixed(1)}M` : '')}
              />
              <Tooltip
                formatter={(v: unknown) => (v == null ? 'Sin datos' : formatCLP(v as number))}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="income"
                name="Ingresos"
                stroke="#2563EB"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="expense"
                name="Egresos"
                stroke="#94A3B8"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
        <div className="flex items-center gap-4 mt-3 text-xs text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: '#2563EB' }}
            />
            Ingresos
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: '#94A3B8' }}
            />
            Egresos
          </span>
        </div>
      </div>

      {/* ROW 4 — Year summary table */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-color)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Resumen por año</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-[var(--border-color)]">
              <tr>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Año</th>
                <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Ingresos</th>
                <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Egresos</th>
                <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Margen</th>
                <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {years.map((y) => {
                const isBest = y.year === totals.bestYear && y.hasData;
                return (
                  <tr
                    key={y.year}
                    onClick={() => y.hasData && onYearClick(y.year)}
                    className={`transition ${
                      y.hasData ? 'cursor-pointer hover:bg-gray-50' : 'opacity-50'
                    } ${isBest ? 'bg-green-50' : ''}`}
                  >
                    <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">
                      {y.year}
                      {isBest && (
                        <span className="ml-2 inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold uppercase">
                          Mejor
                        </span>
                      )}
                    </td>
                    <td className="amount px-4 py-2.5 text-right text-[var(--text-primary)]">
                      {y.hasData ? formatCLP(y.income) : '—'}
                    </td>
                    <td className="amount px-4 py-2.5 text-right text-[var(--text-primary)]">
                      {y.hasData ? formatCLP(y.expense) : '—'}
                    </td>
                    <td className={`amount px-4 py-2.5 text-right ${marginColor(y.margin)}`}>
                      {y.hasData ? `${y.margin.toFixed(1)}%` : '—'}
                    </td>
                    <td
                      className={`amount px-4 py-2.5 text-right ${
                        y.result >= 0 ? 'text-green-600' : 'text-red-500'
                      }`}
                    >
                      {y.hasData ? formatCLP(y.result) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
