'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { formatCLP } from '../../lib/formatters';

interface FiscalPeriod {
  id: string;
  name: string;
  year: number;
  month: number;
}

interface OpeningBalanceModalProps {
  accountId: string;
  accountName: string;
  initialBalance: number;
  defaultPeriodId?: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}

export function OpeningBalanceModal({
  accountId,
  accountName,
  initialBalance,
  defaultPeriodId,
  onClose,
  onSaved,
  onError,
}: OpeningBalanceModalProps) {
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [periodId, setPeriodId] = useState(defaultPeriodId ?? '');
  const [rawAmount, setRawAmount] = useState<string>(
    Number.isFinite(initialBalance) ? String(Math.round(initialBalance)) : '0',
  );
  const [submitting, setSubmitting] = useState(false);

  const year = new Date().getFullYear();
  useEffect(() => {
    apiClient
      .get<FiscalPeriod[]>(`/api/fiscal-periods?year=${year}`)
      .then((fetched) => {
        setPeriods(fetched);
        if (fetched.length === 0) return;
        const now = new Date();
        const match = fetched.find(
          (p) => p.year === now.getFullYear() && p.month === now.getMonth() + 1,
        );
        const fallback = match?.id ?? fetched[0].id;
        setPeriodId((prev) => prev || fallback);
      })
      .catch(() => undefined);
  }, [year]);

  const numericAmount = useMemo(() => {
    const n = Number(rawAmount);
    return Number.isFinite(n) ? n : 0;
  }, [rawAmount]);

  const canSubmit = periodId.length > 0 && rawAmount.trim().length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await apiClient.post(`/api/cashflow/accounts/${accountId}/balance`, {
        bankAccountId: accountId,
        fiscalPeriodId: periodId,
        openingBalance: numericAmount,
      });
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al guardar saldo');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)]">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Editar saldo</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{accountName}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="Saldo de apertura" required>
            <input
              type="number"
              step="1"
              value={rawAmount}
              onChange={(e) => setRawAmount(e.target.value)}
              placeholder="0"
              className="tn-input"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)] amount">
              {formatCLP(numericAmount)}
            </p>
          </Field>

          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Este es el saldo que tenías en esta cuenta al inicio del período. Se usa como punto de
            partida para calcular tu caja actual.
          </p>

          <Field label="Período fiscal" required>
            <select
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              className="tn-input"
            >
              <option value="">Seleccionar...</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
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
            disabled={!canSubmit}
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

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block mb-1.5 text-[var(--text-secondary)]"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500, fontSize: 13 }}
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
