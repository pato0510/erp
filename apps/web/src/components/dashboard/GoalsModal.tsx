'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { formatCLP } from '../../lib/formatters';

interface GoalsModalProps {
  year: number;
  initialIncomeGoal: number | null;
  initialExpenseLimit: number | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}

export function GoalsModal({
  year,
  initialIncomeGoal,
  initialExpenseLimit,
  onClose,
  onSaved,
  onError,
}: GoalsModalProps) {
  const [incomeRaw, setIncomeRaw] = useState<string>(
    initialIncomeGoal != null ? String(Math.round(initialIncomeGoal)) : '',
  );
  const [expenseRaw, setExpenseRaw] = useState<string>(
    initialExpenseLimit != null ? String(Math.round(initialExpenseLimit)) : '',
  );
  const [submitting, setSubmitting] = useState(false);

  const incomeMonthly = useMemo(() => {
    const n = Number(incomeRaw);
    return Number.isFinite(n) && n > 0 ? n / 12 : 0;
  }, [incomeRaw]);

  const expenseMonthly = useMemo(() => {
    const n = Number(expenseRaw);
    return Number.isFinite(n) && n > 0 ? n / 12 : 0;
  }, [expenseRaw]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const incomeGoal = incomeRaw.trim() === '' ? null : Number(incomeRaw);
      const expenseLimit = expenseRaw.trim() === '' ? null : Number(expenseRaw);
      await apiClient.patch('/api/dashboard/goals', {
        year,
        incomeGoal,
        expenseLimit,
      });
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al guardar metas');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)]">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            Metas y límites {year}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="Meta anual de ingresos">
            <input
              type="number"
              step="1"
              value={incomeRaw}
              onChange={(e) => setIncomeRaw(e.target.value)}
              placeholder="0"
              className="tn-input"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {incomeMonthly > 0
                ? `Equivale a ${formatCLP(incomeMonthly)}/mes`
                : 'Deja vacío para quitar la meta'}
            </p>
          </Field>

          <Field label="Límite anual de egresos">
            <input
              type="number"
              step="1"
              value={expenseRaw}
              onChange={(e) => setExpenseRaw(e.target.value)}
              placeholder="0"
              className="tn-input"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {expenseMonthly > 0
                ? `Equivale a ${formatCLP(expenseMonthly)}/mes`
                : 'Deja vacío para quitar el límite'}
            </p>
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            {submitting ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      <style jsx global>{`
        .tn-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-family: var(--font-outfit), sans-serif;
          font-size: 14px;
          color: var(--text-primary);
          background: var(--input-bg);
          outline: none;
          transition:
            border-color 120ms ease,
            box-shadow 120ms ease;
        }
        .tn-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="block mb-1.5 text-[var(--text-secondary)]"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500, fontSize: 13 }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
