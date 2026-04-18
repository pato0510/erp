'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Building2, CreditCard, Banknote } from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { CashPositionCard } from '../../../components/cashflow/CashPositionCard';
import { CommitmentStatusBadge } from '../../../components/cashflow/CommitmentStatusBadge';
import { MovementTypeBadge } from '../../../components/movements/MovementTypeBadge';
import { PeriodSelector } from '../../../components/shared/PeriodSelector';
import { formatCLP, formatDate, formatRelativeDate } from '../../../lib/formatters';

interface CashPosition {
  totalCash: number;
  freeCash: number;
  committedAmount: number;
  openingBalance: number;
  totalIncome: number;
  totalExpense: number;
  byAccount: { accountName: string; accountType: string; openingBalance: number }[];
}

interface BankAccount {
  id: string;
  name: string;
  type: string;
  bankName: string | null;
  accountNumber: string | null;
  balances: { openingBalance: string }[];
}

interface Commitment {
  id: string;
  description: string;
  amount: string;
  dueDate: string;
  type: string;
  status: string;
  counterparty?: { name: string } | null;
  category?: { name: string } | null;
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CHECKING: 'Cuenta Corriente',
  SAVINGS: 'Cuenta Ahorro',
  CASH: 'Caja Chica',
  CREDIT_LINE: 'Línea de Crédito',
  OTHER: 'Otra',
};

const ACCOUNT_ICONS: Record<string, React.ElementType> = {
  CHECKING: CreditCard,
  SAVINGS: Building2,
  CASH: Banknote,
  CREDIT_LINE: CreditCard,
  OTHER: CreditCard,
};

function freeCashColor(freeCash: number, totalCash: number): 'green' | 'yellow' | 'red' {
  if (totalCash <= 0) return 'red';
  const pct = freeCash / totalCash;
  if (pct > 0.5) return 'green';
  if (pct >= 0.2) return 'yellow';
  return 'red';
}

function dueDateUrgency(dueDate: string): string {
  const days = Math.round((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'text-red-600 font-semibold';
  if (days < 7) return 'text-red-600';
  if (days < 15) return 'text-yellow-600';
  return 'text-green-600';
}

export default function CajaPage() {
  const [position, setPosition] = useState<CashPosition | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [periodId, setPeriodId] = useState('');
  const [commitTab, setCommitTab] = useState<'upcoming' | 'all'>('upcoming');

  const reloadRef = useRef<() => void>();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const periodParam = periodId ? `?fiscalPeriodId=${periodId}` : '';

      const [pos, accts, commits] = await Promise.all([
        apiClient.get<CashPosition>(`/api/cashflow/position${periodParam}`),
        apiClient.get<BankAccount[]>('/api/cashflow/accounts'),
        commitTab === 'upcoming'
          ? apiClient.get<Commitment[]>('/api/cashflow/commitments/upcoming')
          : apiClient
              .get<{ data: Commitment[] }>('/api/cashflow/commitments?status=PENDING&limit=50')
              .then((r) => r.data),
      ]);

      setPosition(pos);
      setAccounts(accts);
      setCommitments(commits);
    } catch {
      // handled by apiClient
    } finally {
      setIsLoading(false);
    }
  }, [periodId, commitTab]);

  useEffect(() => {
    load();
  }, [load]);

  reloadRef.current = load;

  const handleMarkPaid = async (id: string) => {
    await apiClient.patch(`/api/cashflow/commitments/${id}/pay`);
    reloadRef.current?.();
  };

  const handleCancelCommitment = async (id: string) => {
    await apiClient.patch(`/api/cashflow/commitments/${id}/cancel`);
    reloadRef.current?.();
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Caja y Tesorería</h1>
        <PeriodSelector value={periodId} onChange={setPeriodId} />
      </div>

      {/* SECTION 1 — Cash Position Cards */}
      {isLoading && !position ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-20 mb-3" />
              <div className="h-7 bg-gray-200 rounded w-32" />
            </div>
          ))}
        </div>
      ) : position ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <CashPositionCard
            title="Caja Total"
            amount={position.totalCash}
            color={position.totalCash >= 0 ? 'green' : 'red'}
            subtitle={`Ingr: ${formatCLP(position.totalIncome)} | Egr: ${formatCLP(position.totalExpense)}`}
          />
          <CashPositionCard
            title="Caja Libre"
            amount={position.freeCash}
            color={freeCashColor(position.freeCash, position.totalCash)}
            subtitle={`${position.totalCash > 0 ? Math.round((position.freeCash / position.totalCash) * 100) : 0}% disponible`}
          />
          <CashPositionCard title="Comprometido" amount={position.committedAmount} color="orange" />
          <CashPositionCard title="Saldo Apertura" amount={position.openingBalance} color="gray" />
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SECTION 2 — Bank Accounts */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Cuentas Bancarias</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {accounts.length === 0 ? (
                <p className="px-5 py-8 text-gray-400 text-center text-sm">Sin cuentas</p>
              ) : (
                accounts.map((acc) => {
                  const Icon = ACCOUNT_ICONS[acc.type] || CreditCard;
                  const balance = acc.balances?.[0] ? Number(acc.balances[0].openingBalance) : 0;
                  return (
                    <div key={acc.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        <Icon size={18} className="text-gray-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{acc.name}</p>
                        <p className="text-xs text-gray-400">
                          {ACCOUNT_TYPE_LABELS[acc.type] || acc.type}
                          {acc.bankName ? ` · ${acc.bankName}` : ''}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-gray-700">{formatCLP(balance)}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* SECTION 3 — Commitments */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setCommitTab('upcoming')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    commitTab === 'upcoming'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Próximos 30 días
                </button>
                <button
                  onClick={() => setCommitTab('all')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    commitTab === 'all'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Todos pendientes
                </button>
              </div>
              <Link
                href="/caja/nuevo-compromiso"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                <Plus size={14} /> Nuevo
              </Link>
            </div>

            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Vencimiento</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Descripción</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Tipo</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500">Monto</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-500">Estado</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-200 rounded w-16" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : commitments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">
                      Sin compromisos pendientes
                    </td>
                  </tr>
                ) : (
                  commitments.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <span className={dueDateUrgency(c.dueDate)}>{formatDate(c.dueDate)}</span>
                        <span className="block text-xs text-gray-400">
                          {formatRelativeDate(c.dueDate)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-gray-900 font-medium text-sm">{c.description}</p>
                        <p className="text-xs text-gray-400">
                          {c.counterparty?.name || c.category?.name || ''}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        <MovementTypeBadge type={c.type} />
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                        {formatCLP(Number(c.amount))}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <CommitmentStatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {c.status === 'PENDING' && (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => handleMarkPaid(c.id)}
                              className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 transition"
                            >
                              Pagado
                            </button>
                            <button
                              onClick={() => handleCancelCommitment(c.id)}
                              className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
