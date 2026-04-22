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
  Wallet,
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
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');
  const [selectedYear, setSelectedYear] = useState(2026);
  const [annualData, setAnnualData] = useState<AnnualData | null>(null);
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

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadAnnual();
  }, [loadAnnual]);

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

  const yearOptions = [2025, 2026, 2027];

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

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
            {(['month', 'year'] as const).map((mode) => (
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
                {mode === 'month' ? 'Mes' : 'Año'}
              </button>
            ))}
          </div>
          {viewMode === 'month' ? (
            <PeriodSelector value={periodId} onChange={setPeriodId} />
          ) : (
            <div className="inline-flex gap-1 bg-gray-100 rounded-lg p-0.5">
              {yearOptions.map((y) => (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
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
          )}
        </div>
      </div>

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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 mb-6">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : data ? (
          <>
            <KpiCard
              title="Caja Total"
              value={formatCLP(data.cash.totalCash)}
              icon={DollarSign}
              color={Number(data.cash.totalCash) >= 0 ? 'text-green-600' : 'text-red-600'}
              subtitle={`Apertura: ${formatCLP(data.cash.openingBalance)}`}
            />
            <KpiCard
              title="Caja Libre"
              value={formatCLP(data.cash.freeCash)}
              icon={Wallet}
              color={
                Number(data.cash.totalCash) > 0 &&
                Number(data.cash.freeCash) / Number(data.cash.totalCash) < 0.2
                  ? 'text-yellow-500'
                  : 'text-green-600'
              }
              subtitle={`Comprometido: ${formatCLP(data.cash.committedAmount)}`}
            />
            <KpiCard
              title="Ingresos"
              value={formatCLP(data.movements.totalIncome)}
              icon={TrendingUp}
              color="text-blue-600"
              subtitle={`${data.movements.confirmedCount} confirmados`}
            />
            <KpiCard
              title="Egresos"
              value={formatCLP(data.movements.totalExpense)}
              icon={TrendingDown}
              color="text-red-500"
              subtitle={`Balance: ${formatCLP(data.movements.balance)}`}
            />
            <KpiCard
              title="Margen bruto"
              value={`${marginValue.toFixed(1)}%`}
              icon={Percent}
              color={marginColor(marginValue)}
              subtitle={viewMode === 'year' ? `Año ${selectedYear}` : 'Período actual'}
            />
          </>
        ) : null}
      </div>

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
                    de <span className="amount">{formatCLP(Number(goals.incomeGoal))}</span> meta
                    anual
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
              {viewMode === 'year' ? `Evolución mensual ${selectedYear}` : 'Ingresos vs Egresos'}
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
                      formatter={(v: unknown) => (v == null ? 'Sin datos' : formatCLP(v as number))}
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
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">{pieTitle}</h3>
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
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Flujo de Caja</h3>
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
              <h2 className="font-semibold text-[var(--text-primary)]">Movimientos Recientes</h2>
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
