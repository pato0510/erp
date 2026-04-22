'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Building2,
  CreditCard,
  Banknote,
  Download,
  Wallet,
  Pencil,
  Trash2,
} from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { downloadFile } from '../../../lib/download';
import { CashPositionCard } from '../../../components/cashflow/CashPositionCard';
import { CommitmentStatusBadge } from '../../../components/cashflow/CommitmentStatusBadge';
import { AccountFormModal } from '../../../components/cashflow/AccountFormModal';
import { OpeningBalanceModal } from '../../../components/cashflow/OpeningBalanceModal';
import { MovementTypeBadge } from '../../../components/movements/MovementTypeBadge';
import { PeriodSelector } from '../../../components/shared/PeriodSelector';
import { Toast } from '../../../components/shared/Toast';
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
  SAVINGS: 'Cuenta de Ahorro',
  CASH: 'Caja Chica',
  CREDIT_LINE: 'Línea de Crédito',
  OTHER: 'Otra',
};

const ACCOUNT_TYPE_BADGE: Record<string, string> = {
  CHECKING: 'bg-blue-50 text-blue-700 border-blue-200',
  SAVINGS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CASH: 'bg-amber-50 text-amber-700 border-amber-200',
  CREDIT_LINE: 'bg-purple-50 text-purple-700 border-purple-200',
  OTHER: 'bg-gray-50 text-[var(--text-secondary)] border-gray-200',
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

function maskAccountNumber(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\s+/g, '');
  if (digits.length <= 4) return digits;
  const last = digits.slice(-4);
  return `•••• ${last}`;
}

type ModalState =
  | { kind: 'none' }
  | { kind: 'create-account' }
  | { kind: 'set-balance'; account: BankAccount };

export default function CajaPage() {
  const [position, setPosition] = useState<CashPosition | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [periodId, setPeriodId] = useState('');
  const [commitTab, setCommitTab] = useState<'upcoming' | 'all'>('upcoming');
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

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

  const handleDeleteAccount = async (accountId: string) => {
    if (!window.confirm('¿Eliminar esta cuenta? Esta acción no se puede deshacer.')) return;
    try {
      await apiClient.delete(`/api/cashflow/accounts/${accountId}`);
      setToast({ message: 'Cuenta eliminada', type: 'success' });
      reloadRef.current?.();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error al eliminar la cuenta',
        type: 'error',
      });
    }
  };

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

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

      {/* SECTION — Cuentas y Saldos */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-sm mb-8">
        <div className="px-5 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-[var(--text-primary)]">Cuentas y Saldos</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Gestiona tus cuentas bancarias y saldos de apertura
            </p>
          </div>
          {accounts.length > 0 && (
            <button
              onClick={() => setModal({ kind: 'create-account' })}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full transition"
              style={{
                background: '#1C1C1E',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Plus size={16} /> Agregar Cuenta
            </button>
          )}
        </div>

        {isLoading && accounts.length === 0 ? (
          <div className="divide-y divide-[var(--border-color)]">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="px-5 py-4 animate-pulse flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-200" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-48 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-32" />
                </div>
                <div className="h-6 bg-gray-200 rounded w-24" />
              </div>
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Wallet size={28} className="text-[var(--text-secondary)]" />
            </div>
            <h3
              className="text-[var(--text-primary)] mb-1.5"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
                fontSize: 16,
              }}
            >
              Comienza registrando tus cuentas
            </h3>
            <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto mb-5">
              Agrega tus cuentas bancarias y el saldo inicial para que Excelsia pueda calcular tu
              posición de caja real.
            </p>
            <button
              onClick={() => setModal({ kind: 'create-account' })}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm text-white rounded-full transition"
              style={{
                background: '#1C1C1E',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Plus size={16} /> Agregar primera cuenta
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-color)]">
            {accounts.map((acc) => {
              const Icon = ACCOUNT_ICONS[acc.type] || CreditCard;
              const balance = acc.balances?.[0] ? Number(acc.balances[0].openingBalance) : 0;
              const masked = maskAccountNumber(acc.accountNumber);
              return (
                <div key={acc.id} className="px-5 py-4 flex items-center gap-4">
                  <div className="p-2.5 bg-gray-100 rounded-lg flex-shrink-0">
                    <Icon size={20} className="text-[var(--text-secondary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {acc.name}
                      </p>
                      <span
                        className={`label text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          ACCOUNT_TYPE_BADGE[acc.type] || ACCOUNT_TYPE_BADGE.OTHER
                        }`}
                      >
                        {ACCOUNT_TYPE_LABELS[acc.type] || acc.type}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {acc.bankName ?? 'Sin banco'}
                      {masked ? ` · ${masked}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] label">
                      Saldo apertura
                    </p>
                    <p className="amount text-sm font-semibold text-[var(--text-primary)]">
                      {formatCLP(balance)}
                    </p>
                  </div>
                  <button
                    onClick={() => setModal({ kind: 'set-balance', account: acc })}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition text-[var(--text-secondary)]"
                    style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
                  >
                    <Pencil size={12} /> Editar saldo
                  </button>
                  <button
                    onClick={() => handleDeleteAccount(acc.id)}
                    className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-red-50 hover:text-red-600 transition"
                    title="Eliminar cuenta"
                    aria-label="Eliminar cuenta"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION — Cash Position Cards */}
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

      {/* SECTION — Commitments */}
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
                <td colSpan={6} className="px-4 py-10 text-center text-[var(--text-muted)] text-sm">
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

      {modal.kind === 'create-account' && (
        <AccountFormModal
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => {
            setModal({ kind: 'none' });
            setToast({ message: 'Cuenta creada', type: 'success' });
            reloadRef.current?.();
          }}
          onError={(message) => setToast({ message, type: 'error' })}
        />
      )}

      {modal.kind === 'set-balance' && (
        <OpeningBalanceModal
          accountId={modal.account.id}
          accountName={modal.account.name}
          initialBalance={
            modal.account.balances?.[0] ? Number(modal.account.balances[0].openingBalance) : 0
          }
          defaultPeriodId={periodId || undefined}
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => {
            setModal({ kind: 'none' });
            setToast({ message: 'Saldo actualizado', type: 'success' });
            reloadRef.current?.();
          }}
          onError={(message) => setToast({ message, type: 'error' })}
        />
      )}
    </div>
  );
}
