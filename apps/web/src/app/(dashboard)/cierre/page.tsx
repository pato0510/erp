'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckSquare, Lock, Unlock, Printer, AlertTriangle, ChevronRight, X } from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { formatCLP, formatDate } from '../../../lib/formatters';
import { Toast } from '../../../components/shared/Toast';
import { ChecklistItem, ChecklistItemData } from '../../../components/closing/ChecklistItem';

type PeriodStatus = 'OPEN' | 'IN_REVIEW' | 'CLOSED';

interface FiscalPeriod {
  id: string;
  name: string;
  year: number;
  month: number;
  status: PeriodStatus;
  closedAt: string | null;
  closedBy: string | null;
  notes: string | null;
}

interface Checklist {
  items: ChecklistItemData[];
  canClose: boolean;
  blockedReasons: string[];
}

interface ClosingSummary {
  period: {
    id: string;
    name: string;
    year: number;
    month: number;
    status: string;
    notes: string | null;
  };
  company: { name: string; taxId: string; legalName: string } | null;
  movements: { totalIncome: number; totalExpense: number; balance: number; count: number };
  cash: { opening: number; closing: number; free: number; committed: number };
  reconciliation: {
    reconciledPercentage: number;
    pendingCount: number;
    totalBankMovements: number;
    reconciledBankMovements: number;
  };
  tax: { emitidosTotal: number; recibidosTotal: number; balance: number };
  topCategories: { name: string; color: string; total: number; percentage: number }[];
  commitments: { paid: number; pending: number; cancelled: number };
  closedBy: string | null;
  closedAt: string | null;
}

const STATUS_BADGE: Record<PeriodStatus, { label: string; cls: string }> = {
  OPEN: { label: 'Abierto', cls: 'bg-green-100 text-green-700' },
  IN_REVIEW: { label: 'En revisión', cls: 'bg-yellow-100 text-yellow-700' },
  CLOSED: { label: 'Cerrado', cls: 'bg-gray-200 text-gray-700' },
};

export default function CierrePage() {
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [period, setPeriod] = useState<FiscalPeriod | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [summary, setSummary] = useState<ClosingSummary | null>(null);
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'review' | 'close' | 'reopen' | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const reloadRef = useRef<(() => void) | null>(null);

  // Load period list once.
  useEffect(() => {
    apiClient
      .get<FiscalPeriod[]>('/api/fiscal-periods')
      .then((ps) => {
        setPeriods(ps);
        const now = new Date();
        const current = ps.find(
          (p) => p.year === now.getFullYear() && p.month === now.getMonth() + 1,
        );
        setPeriodId((prev) => prev || current?.id || ps[0]?.id || '');
      })
      .catch(() => setToast({ message: 'Error cargando períodos', type: 'error' }));
  }, []);

  const load = useCallback(async () => {
    if (!periodId) return;
    setIsLoading(true);
    try {
      const [p, cl] = await Promise.all([
        apiClient.get<FiscalPeriod>(`/api/fiscal-periods/${periodId}`),
        apiClient.get<Checklist>(`/api/closing/checklist?fiscalPeriodId=${periodId}`),
      ]);
      setPeriod(p);
      setChecklist(cl);
      setNotes(p.notes ?? '');
      // Auto-load summary for closed periods so the user sees it immediately.
      if (p.status === 'CLOSED') {
        const s = await apiClient.get<ClosingSummary>(
          `/api/closing/summary?fiscalPeriodId=${periodId}`,
        );
        setSummary(s);
        setShowSummary(true);
      } else {
        setSummary(null);
        setShowSummary(false);
      }
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error cargando período',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [periodId]);

  useEffect(() => {
    load();
  }, [load]);

  reloadRef.current = load;

  const okCount = useMemo(
    () => checklist?.items.filter((i) => i.status === 'OK').length ?? 0,
    [checklist],
  );
  const totalCount = checklist?.items.length ?? 0;
  const progressPct = totalCount > 0 ? Math.round((okCount / totalCount) * 100) : 0;

  const handleStartReview = async () => {
    if (!periodId) return;
    setBusyAction('review');
    try {
      await apiClient.patch(`/api/fiscal-periods/${periodId}/status`, {
        status: 'IN_REVIEW',
      });
      setToast({ message: 'Período pasó a En revisión', type: 'success' });
      reloadRef.current?.();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error al iniciar revisión',
        type: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleClose = async () => {
    if (!periodId) return;
    setBusyAction('close');
    try {
      await apiClient.post('/api/closing/close', {
        fiscalPeriodId: periodId,
        notes: notes.trim() || undefined,
      });
      setToast({ message: 'Período cerrado exitosamente', type: 'success' });
      setShowCloseConfirm(false);
      reloadRef.current?.();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error al cerrar período',
        type: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleReopen = async () => {
    if (!periodId || reopenReason.trim().length < 5) return;
    setBusyAction('reopen');
    try {
      await apiClient.post('/api/closing/reopen', {
        fiscalPeriodId: periodId,
        reason: reopenReason.trim(),
      });
      setToast({ message: 'Período reabierto', type: 'success' });
      setShowReopenConfirm(false);
      setReopenReason('');
      reloadRef.current?.();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error al reabrir período',
        type: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleViewSummary = async () => {
    if (!periodId) return;
    try {
      const s = await apiClient.get<ClosingSummary>(
        `/api/closing/summary?fiscalPeriodId=${periodId}`,
      );
      setSummary(s);
      setShowSummary(true);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error al cargar resumen',
        type: 'error',
      });
    }
  };

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl text-gray-900 flex items-center gap-2">
            <CheckSquare size={24} className="text-gray-500" /> Cierre mensual
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Valida los requisitos y formaliza el cierre del período fiscal
          </p>
        </div>
      </div>

      {/* SECTION 1 — Period selector + status */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">Período fiscal</label>
          <select
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {period && (
          <div className="flex items-center gap-4">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${STATUS_BADGE[period.status].cls}`}
            >
              {STATUS_BADGE[period.status].label}
            </span>
            {period.status === 'CLOSED' && period.closedAt && (
              <span className="text-xs text-gray-500">
                Cerrado el {formatDate(period.closedAt)}
                {summary?.closedBy ? ` por ${summary.closedBy}` : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* SECTION 2 — Checklist */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Checklist de cierre</h2>
          {checklist && (
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>
                {okCount} de {totalCount} ítems OK
              </span>
              <div className="w-40 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${progressPct === 100 ? 'bg-green-500' : progressPct >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="p-5 space-y-3">
          {isLoading ? (
            <div className="text-sm text-gray-400 text-center py-6">Cargando checklist...</div>
          ) : !checklist ? (
            <div className="text-sm text-gray-400 text-center py-6">Sin datos</div>
          ) : (
            checklist.items.map((item) => <ChecklistItem key={item.key} item={item} />)
          )}
        </div>
      </div>

      {/* SECTION 3 — Closing actions */}
      {period && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 p-5">
          {period.status === 'OPEN' && (
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Iniciar revisión</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Mueve el período a "En revisión" para bloquear la creación de nuevos movimientos
                  mientras revisas y concilias.
                </p>
              </div>
              <button
                onClick={handleStartReview}
                disabled={busyAction !== null}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
              >
                <ChevronRight size={14} />
                {busyAction === 'review' ? 'Iniciando...' : 'Iniciar revisión'}
              </button>
            </div>
          )}

          {period.status === 'IN_REVIEW' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Cerrar período</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Una vez cerrado, los movimientos quedan bloqueados y solo un ADMIN puede
                  reabrirlo.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Notas de cierre (opcional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Observaciones del cierre..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowCloseConfirm(true)}
                  disabled={!checklist?.canClose || busyAction !== null}
                  title={
                    !checklist?.canClose
                      ? `Bloqueado por: ${checklist?.blockedReasons.join(', ')}`
                      : undefined
                  }
                  className="flex items-center gap-2 px-5 py-2.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <Lock size={14} /> Cerrar período
                </button>
                {!checklist?.canClose && (
                  <span className="text-xs text-red-500 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    {checklist?.blockedReasons.length ?? 0} requisito
                    {(checklist?.blockedReasons.length ?? 0) === 1 ? '' : 's'} bloqueado
                    {(checklist?.blockedReasons.length ?? 0) === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </div>
          )}

          {period.status === 'CLOSED' && (
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Período cerrado</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Los movimientos de este período están bloqueados. Solo un ADMIN puede reabrirlo.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleViewSummary}
                  className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Ver resumen de cierre
                </button>
                <button
                  onClick={() => setShowReopenConfirm(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                >
                  <Unlock size={14} /> Reabrir período
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 4 — Closing summary */}
      {showSummary && summary && (
        <ClosingSummaryCard summary={summary} onExport={() => window.print()} />
      )}

      {/* Close confirmation modal */}
      {showCloseConfirm && (
        <ConfirmModal
          title="Confirmar cierre del período"
          description={
            <>
              Vas a cerrar el período <strong>{period?.name}</strong>. Esta acción:
              <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
                <li>Bloquea todos los movimientos (no se podrán editar)</li>
                <li>Marca el período como CLOSED</li>
                <li>Solo un ADMIN podrá reabrirlo</li>
              </ul>
            </>
          }
          confirmLabel={busyAction === 'close' ? 'Cerrando...' : 'Sí, cerrar período'}
          confirmVariant="danger"
          disabled={busyAction === 'close'}
          onConfirm={handleClose}
          onCancel={() => setShowCloseConfirm(false)}
        />
      )}

      {/* Reopen confirmation modal */}
      {showReopenConfirm && (
        <ConfirmModal
          title="Reabrir período"
          description={
            <>
              <p className="mb-3">
                Vas a reabrir el período <strong>{period?.name}</strong>. Los movimientos volverán a
                ser editables.
              </p>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Razón (mínimo 5 caracteres, se registra en auditoría)
              </label>
              <textarea
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Ej: Ajuste contable por error de categorización..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
              />
            </>
          }
          confirmLabel={busyAction === 'reopen' ? 'Reabriendo...' : 'Sí, reabrir'}
          confirmVariant="danger"
          disabled={busyAction === 'reopen' || reopenReason.trim().length < 5}
          onConfirm={handleReopen}
          onCancel={() => {
            setShowReopenConfirm(false);
            setReopenReason('');
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────

function ConfirmModal({
  title,
  description,
  confirmLabel,
  confirmVariant,
  disabled,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  confirmVariant: 'primary' | 'danger';
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmCls =
    confirmVariant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button onClick={onCancel} className="p-1 rounded hover:bg-gray-100 transition">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 text-sm text-gray-700">{description}</div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={disabled}
            className={`px-4 py-2 text-sm text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${confirmCls}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClosingSummaryCard({
  summary,
  onExport,
}: {
  summary: ClosingSummary;
  onExport: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 print:shadow-none print:border-0">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between print:hidden">
        <h2 className="text-sm font-semibold text-gray-900">
          Resumen de cierre — {summary.period.name}
        </h2>
        <button
          onClick={onExport}
          className="flex items-center gap-2 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          <Printer size={12} /> Exportar / Imprimir
        </button>
      </div>

      <div className="p-6 space-y-6">
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Empresa
          </h3>
          <p className="text-sm text-gray-900">
            {summary.company?.legalName ?? summary.company?.name ?? '—'}
          </p>
          {summary.company?.taxId && (
            <p className="text-xs text-gray-500">RUT {summary.company.taxId}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryStat
            label="Ingresos"
            value={formatCLP(summary.movements.totalIncome)}
            color="text-green-600"
          />
          <SummaryStat
            label="Egresos"
            value={formatCLP(summary.movements.totalExpense)}
            color="text-red-500"
          />
          <SummaryStat
            label="Balance"
            value={formatCLP(summary.movements.balance)}
            color={summary.movements.balance >= 0 ? 'text-green-600' : 'text-red-500'}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SummaryStat
            label="Caja apertura"
            value={formatCLP(summary.cash.opening)}
            color="text-gray-900"
          />
          <SummaryStat
            label="Caja cierre"
            value={formatCLP(summary.cash.closing)}
            color="text-gray-900"
          />
          <SummaryStat label="Libre" value={formatCLP(summary.cash.free)} color="text-blue-600" />
          <SummaryStat
            label="Comprometido"
            value={formatCLP(summary.cash.committed)}
            color="text-orange-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Conciliación bancaria
            </h3>
            <p className="amount text-[28px] leading-tight text-gray-900">
              {summary.reconciliation.reconciledPercentage}%
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {summary.reconciliation.reconciledBankMovements} de{' '}
              {summary.reconciliation.totalBankMovements} movimientos ·{' '}
              {summary.reconciliation.pendingCount} pendientes
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              SII / Tributario
            </h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Emitidos</span>
              <span className="amount text-gray-900">{formatCLP(summary.tax.emitidosTotal)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-500">Recibidos</span>
              <span className="amount text-gray-900">{formatCLP(summary.tax.recibidosTotal)}</span>
            </div>
            <div className="flex justify-between text-sm mt-2 pt-2 border-t border-gray-100">
              <span className="text-gray-600" style={{ fontWeight: 500 }}>
                Balance
              </span>
              <span
                className={`amount ${summary.tax.balance >= 0 ? 'text-green-600' : 'text-red-500'}`}
              >
                {formatCLP(summary.tax.balance)}
              </span>
            </div>
          </div>
        </div>

        {summary.topCategories.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Top categorías
            </h3>
            <div className="space-y-2">
              {summary.topCategories.map((c) => (
                <div key={c.name} className="flex items-center gap-3">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="text-sm text-gray-900 flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-gray-500">{c.percentage}%</span>
                  <span className="amount text-sm text-gray-900 w-28 text-right">
                    {formatCLP(c.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          <SummaryStat
            label="Compromisos pagados"
            value={String(summary.commitments.paid)}
            color="text-green-600"
          />
          <SummaryStat
            label="Pendientes"
            value={String(summary.commitments.pending)}
            color="text-yellow-500"
          />
          <SummaryStat
            label="Cancelados"
            value={String(summary.commitments.cancelled)}
            color="text-gray-500"
          />
        </div>

        {summary.closedBy && summary.closedAt && (
          <div className="text-xs text-gray-500 border-t border-gray-100 pt-3">
            Cerrado por <span className="font-medium text-gray-700">{summary.closedBy}</span> el{' '}
            {formatDate(summary.closedAt)}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <p className="label text-gray-500 text-[11px]">{label}</p>
      <p className={`amount text-[22px] mt-1 leading-tight ${color}`}>{value}</p>
    </div>
  );
}
