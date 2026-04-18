'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api';
import { formatCLP, formatDate, formatRelativeDate } from '../../../lib/formatters';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<DashboardData>('/api/dashboard')
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-xl">Error cargando dashboard: {error}</div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          {data && (
            <p className="text-gray-500 mt-1">
              {data.period.name} &middot;{' '}
              <span
                className={
                  data.period.status === 'OPEN'
                    ? 'text-green-600'
                    : data.period.status === 'CLOSED'
                      ? 'text-gray-400'
                      : 'text-yellow-600'
                }
              >
                {data.period.status}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
              title="Ingresos del Período"
              value={formatCLP(data.movements.totalIncome)}
              icon={TrendingUp}
              color="text-blue-600"
              subtitle={`${data.movements.confirmedCount} confirmados`}
            />
            <KpiCard
              title="Egresos del Período"
              value={formatCLP(data.movements.totalExpense)}
              icon={TrendingDown}
              color="text-red-500"
              subtitle={`${data.movements.draftCount} borradores`}
            />
          </>
        ) : null}
      </div>

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming Commitments */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Clock size={18} />
                Compromisos Próximos
              </h2>
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
                        {formatCLP(Number(c.amount))}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Recent Movements */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Movimientos Recientes</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {data.recentMovements.length === 0 ? (
                <p className="px-6 py-8 text-gray-400 text-center text-sm">
                  Sin movimientos confirmados
                </p>
              ) : (
                data.recentMovements.map((m) => (
                  <div key={m.id} className="px-6 py-3 flex items-center justify-between">
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
                        <p className="text-xs text-gray-400">
                          {m.category.name} &middot; {formatDate(m.date)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-sm font-semibold ${m.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}
                    >
                      {m.type === 'INCOME' ? '+' : '-'}
                      {formatCLP(Number(m.amount))}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top Expense Categories */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm lg:col-span-2">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Principales Categorías de Gasto</h2>
            </div>
            <div className="p-6 space-y-3">
              {data.categories.topExpenses.length === 0 ? (
                <p className="text-gray-400 text-center text-sm py-4">Sin datos de gastos</p>
              ) : (
                data.categories.topExpenses.map((cat) => (
                  <div key={cat.categoryName}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700">{cat.categoryName}</span>
                      <span className="text-gray-500">
                        {formatCLP(cat.total)} ({cat.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${cat.percentage}%`,
                          backgroundColor: cat.color || '#6B7280',
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
