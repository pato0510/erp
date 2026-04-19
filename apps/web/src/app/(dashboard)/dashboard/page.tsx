'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { apiClient } from '../../../lib/api';
import { formatCLP, formatDate, formatRelativeDate } from '../../../lib/formatters';
import { PeriodSelector } from '../../../components/shared/PeriodSelector';
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
} from 'lucide-react';

// Lazy load recharts to avoid SSR issues
const BarChart = dynamic(() => import('recharts').then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), {
  ssr: false,
});
const PieChart = dynamic(() => import('recharts').then((m) => m.PieChart), { ssr: false });
const Pie = dynamic(() => import('recharts').then((m) => m.Pie), { ssr: false });
const Cell = dynamic(() => import('recharts').then((m) => m.Cell), { ssr: false });

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
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
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
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
      <div className="h-8 bg-gray-200 rounded w-36" />
    </div>
  );
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: 'Abierto', cls: 'bg-green-100 text-green-700' },
  IN_REVIEW: { label: 'En Revisión', cls: 'bg-yellow-100 text-yellow-700' },
  CLOSED: { label: 'Cerrado', cls: 'bg-gray-100 text-gray-500' },
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [periodId, setPeriodId] = useState('');

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

  useEffect(() => {
    load();
  }, [load]);

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

  const pieData =
    data?.categories.topExpenses.map((c) => ({
      name: c.categoryName,
      value: Number(c.total),
      color: c.color || '#6B7280',
    })) ?? [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          {data && (
            <p className="text-gray-500 mt-1">
              {data.period.name} &middot;{' '}
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_LABELS[data.period.status]?.cls || 'bg-gray-100 text-gray-500'}`}
              >
                {STATUS_LABELS[data.period.status]?.label || data.period.status}
              </span>
            </p>
          )}
        </div>
        <PeriodSelector value={periodId} onChange={setPeriodId} />
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        {isLoading ? (
          <>
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
          </>
        ) : null}
      </div>

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
          {/* CHART 1 — Income vs Expense bar */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Ingresos vs Egresos</h3>
            {incomeExpenseData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={incomeExpenseData} layout="vertical" barSize={28}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(v: unknown) => formatCLP(v as number)}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    <Cell fill="#3B82F6" />
                    <Cell fill="#EF4444" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-400 text-sm text-center py-8">Sin datos</p>
            )}
          </div>

          {/* CHART 2 — Expense categories pie */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Categorías de Gasto</h3>
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
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: unknown) => formatCLP(v as number)}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-400 text-sm text-center py-8">Sin datos de gastos</p>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              {pieData.map((d) => (
                <span key={d.name} className="flex items-center gap-1 text-xs text-gray-500">
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
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Flujo de Caja</h3>
            <div className="space-y-3">
              {[
                {
                  label: 'Saldo Apertura',
                  value: Number(data.cash.openingBalance),
                  color: 'bg-gray-400',
                },
                {
                  label: 'Ingresos',
                  value: Number(data.movements.totalIncome),
                  color: 'bg-green-500',
                },
                {
                  label: 'Egresos',
                  value: Number(data.movements.totalExpense),
                  color: 'bg-red-500',
                },
                {
                  label: 'Caja Libre',
                  value: Number(data.cash.freeCash),
                  color: 'bg-blue-500',
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
                      <span className="text-gray-600">{item.label}</span>
                      <span className="font-medium text-gray-900">{formatCLP(item.value)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${item.color}`}
                        style={{ width: `${pct}%` }}
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
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Clock size={18} />
                Compromisos Próximos
              </h2>
              <Link href="/caja" className="text-xs text-blue-600 hover:underline">
                Ver todos
              </Link>
            </div>
            <div className="divide-y divide-gray-100">
              {data.commitments.upcoming.length === 0 ? (
                <p className="px-6 py-8 text-gray-400 text-center text-sm">
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
                        : 'text-gray-600';
                  return (
                    <div key={c.id} className="px-6 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{c.description}</p>
                        <p className="text-xs text-gray-400">
                          {c.counterparty?.name || c.category?.name || ''} &middot;{' '}
                          <span className={urgencyColor}>{formatRelativeDate(c.dueDate)}</span>
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {formatCLP(c.amount)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Recent Movements */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Movimientos Recientes</h2>
              <Link href="/movimientos" className="text-xs text-blue-600 hover:underline">
                Ver todos
              </Link>
            </div>
            <div className="divide-y divide-gray-100">
              {data.recentMovements.length === 0 ? (
                <p className="px-6 py-8 text-gray-400 text-center text-sm">
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
                        <p className="text-sm font-medium text-gray-900">{m.description}</p>
                        <p className="text-xs text-gray-400 flex items-center gap-1">
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
                      className={`text-sm font-semibold ${m.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}
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
    </div>
  );
}
