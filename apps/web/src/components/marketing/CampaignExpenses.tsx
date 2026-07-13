'use client';

/* MKT-005 — the campaign "Gastos" section: budget-vs-spent bar + expenses table +
 * add/edit/delete (gated by useCanWriteMarketing('marketingExpense')). `spent` is the
 * backend-derived Σ(amount) passed from the detail page (single source of truth); after
 * any mutation we refetch the list AND call onChanged so the header badges + bar refresh
 * together. Amounts use the platform CLP formatter. NO Finance interaction. */
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { formatCLP } from '../../lib/formatters';
import { formatCampaignDate } from './campaignLabels';
import { ExpenseFormModal, ExpenseForForm } from './ExpenseFormModal';

interface ExpenseRow {
  id: string;
  expenseDate: string;
  description: string;
  amount: string;
  vendorName: string | null;
  notes: string | null;
}

export function CampaignExpenses({
  campaignId,
  budgetAmount,
  spent,
  canWrite,
  onChanged,
}: {
  campaignId: string;
  budgetAmount: string | null;
  spent: string | number;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseForForm | null>(null);

  const fetchExpenses = useCallback(() => {
    setLoading(true);
    apiClient
      .get<ExpenseRow[]>(`/api/marketing/campaigns/${campaignId}/expenses`)
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch(() => setError('No se pudieron cargar los gastos.'))
      .finally(() => setLoading(false));
  }, [campaignId]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const afterMutation = () => {
    fetchExpenses();
    onChanged(); // refresh campaign-level spent / overBudget / badges
  };

  const remove = async (row: ExpenseRow) => {
    if (
      !window.confirm(`¿Eliminar el gasto "${row.description}"? Esta acción no se puede deshacer.`)
    )
      return;
    try {
      await apiClient.delete(`/api/marketing/campaigns/${campaignId}/expenses/${row.id}`);
      afterMutation();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo eliminar el gasto.');
    }
  };

  const spentNum = Number(spent);
  const budgetNum = budgetAmount != null ? Number(budgetAmount) : null;
  const over = budgetNum != null && spentNum > budgetNum;
  const pct = budgetNum != null && budgetNum > 0 ? (spentNum / budgetNum) * 100 : 0;
  const barColor = over ? '#ef4444' : '#2563eb';

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--text-primary)]">Gastos</p>
        {canWrite && (
          <button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: '#2563eb' }}
          >
            <Plus size={14} /> Nuevo gasto
          </button>
        )}
      </div>

      {/* Budget-vs-spent bar */}
      <div className="mb-4">
        {budgetNum != null ? (
          <>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">
                Gastado{' '}
                <span className="font-medium text-[var(--text-primary)]">
                  {formatCLP(spentNum)}
                </span>{' '}
                de {formatCLP(budgetNum)}
              </span>
              <span
                className="font-medium"
                style={{ color: over ? '#b91c1c' : 'var(--text-secondary)' }}
              >
                {Math.round(pct)}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border-color)]">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(pct, 100)}%`, background: barColor }}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--text-secondary)]">
              Gastado{' '}
              <span className="font-medium text-[var(--text-primary)]">{formatCLP(spentNum)}</span>
            </span>
            <span className="text-[var(--text-secondary)]">Sin presupuesto definido</span>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-[var(--border-color)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border-color)] bg-gray-50">
            <tr>
              {['Fecha', 'Descripción', 'Proveedor', 'Monto'].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  {h}
                </th>
              ))}
              {canWrite && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {loading ? (
              <tr>
                <td
                  colSpan={canWrite ? 5 : 4}
                  className="px-3 py-6 text-center text-sm text-[var(--text-secondary)]"
                >
                  Cargando gastos…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={canWrite ? 5 : 4}
                  className="px-3 py-6 text-center text-sm text-[var(--text-secondary)]"
                >
                  No hay gastos registrados.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">
                    {formatCampaignDate(r.expenseDate)}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-primary)]">{r.description}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{r.vendorName ?? '—'}</td>
                  <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                    {formatCLP(r.amount)}
                  </td>
                  {canWrite && (
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditing({
                              id: r.id,
                              expenseDate: r.expenseDate,
                              description: r.description,
                              amount: r.amount,
                              vendorName: r.vendorName,
                              notes: r.notes,
                            });
                            setModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                          <Pencil size={12} /> Editar
                        </button>
                        <button
                          onClick={() => remove(r)}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={12} /> Eliminar
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <ExpenseFormModal
          campaignId={campaignId}
          editing={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            afterMutation();
          }}
        />
      )}
    </div>
  );
}

export default CampaignExpenses;
