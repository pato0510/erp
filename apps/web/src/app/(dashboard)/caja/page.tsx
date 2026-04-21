'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Building2, CreditCard, Banknote, Download } from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { downloadFile } from '../../../lib/download';
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

  const reloadRef = useRef<(() => void) | null>(null);

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
        <h1 className="text-2xl text-[var(--text-primary)]">Caja y Tesorería</h1>
        <div className="flex items-center gap-3">
          {periodId && (
            <button
              onClick={() => {
                const date = new Date().toISOString().split('T')[0];
                downloadFile(
                  `/api/reports/cashflow/export?fiscalPeriodId=${periodId}`,
                  `caja-${date}.xlsx`,
                );
              }}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              <Download size={16} /> Exportar
            </button>
          )}
          <PeriodSelector value={periodId} onChange={setPeriodId} />
        </div>
      </div>

      {/* SECTION 1 — Cash Position Cards */}
      {isLoading && !position ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--border-color)] p-5 animate-pulse"
            >
              <div className="h-3 bg-gray-200 rounded w-20 mb-3" />
              <div className="h-7 bg-gray-200 rounded w-32" />
            </div>
          ))}
        </div>
      ) : position ? (
        (() => {
          const totalCash = Number(position.totalCash) || 0;
          const freeCash = Number(position.freeCash) || 0;
          const committed = Number(position.committedAmount) || 0;
          const opening = Number(position.openingBalance) || 0;
          const pct = totalCash > 0 ? Math.round((freeCash / totalCash) * 100) : 0;
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <CashPositionCard
                title="Caja Total"
                amount={totalCash}
                color={totalCash >= 0 ? 'green' : 'red'}
                subtitle={`Ingr: ${formatCLP(position.totalIncome)} | Egr: ${formatCLP(position.totalExpense)}`}
              />
              <CashPositionCard
                title="Caja Libre"
                amount={freeCash}
                color={freeCashColor(freeCash, totalCash)}
                subtitle={`${pct}% disponible`}
              />
              <CashPositionCard title="Comprometido" amount={committed} color="orange" />
              <CashPositionCard title="Saldo Apertura" amount={opening} color="gray" />
            </div>
          );
        })()
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SECTION 2 — Bank Accounts */}
        <div className="lg:col-span-1">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-sm">
            <div className="px-5 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
              <h2 className="font-semibold text-[var(--text-primary)]">Cuentas Bancarias</h2>
            </div>
            <div className="divide-y divide-[var(--border-color)]">
              {accounts.length === 0 ? (
                <p className="px-5 py-8 text-[var(--text-muted)] text-center text-sm">
                  Sin cuentas
                </p>
              ) : (
                accounts.map((acc) => {
                  const Icon = ACCOUNT_ICONS[acc.type] || CreditCard;
                  const balance = acc.balances?.[0] ? Number(acc.balances[0].openingBalance) : 0;
                  return (
                    <div key={acc.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        <Icon size={18} className="text-[var(--text-secondary)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {acc.name}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {ACCOUNT_TYPE_LABELS[acc.type] || acc.type}
                          {acc.bankName ? ` · ${acc.bankName}` : ''}
                        </p>
                      </div>
                      <p className="amount text-sm text-[var(--text-secondary)]">
                        {formatCLP(balance)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* SECTION 3 — Commitments */}
        <div className="lg:col-span-2">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-sm">
            <div className="px-5 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setCommitTab('upcoming')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    commitTab === 'upcoming'
                      ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  Próximos 30 días
                </button>
                <button
                  onClick={() => setCommitTab('all')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    commitTab === 'all'
                      ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
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
              <thead className="bg-gray-50 border-b border-[var(--border-color)]">
                <tr>
                  <th className="label text-left px-4 py-2.5 text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                    Vencimiento
                  </th>
                  <th className="label text-left px-4 py-2.5 text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                    Descripción
                  </th>
                  <th className="label text-left px-4 py-2.5 text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                    Tipo
                  </th>
                  <th className="label text-right px-4 py-2.5 text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                    Monto
                  </th>
                  <th className="label text-center px-4 py-2.5 text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                    Estado
                  </th>
                  <th className="label text-right px-4 py-2.5 text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
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
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-[var(--text-muted)] text-sm"
                    >
                      Sin compromisos pendientes
                    </td>
                  </tr>
                ) : (
                  commitments.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <span className={`mono ${dueDateUrgency(c.dueDate)}`}>
                          {formatDate(c.dueDate)}
                        </span>
                        <span className="block text-xs text-[var(--text-muted)]">
                          {formatRelativeDate(c.dueDate)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-[var(--text-primary)] font-medium text-sm">
                          {c.description}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {c.counterparty?.name || c.category?.name || ''}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        <MovementTypeBadge type={c.type} />
                      </td>
                      <td className="amount px-4 py-2.5 text-right text-[var(--text-primary)]">
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
                              className="text-xs px-2 py-1 rounded bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200 transition"
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
