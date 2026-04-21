'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GitMerge,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  TrendingDown,
  Landmark,
  Receipt,
  X,
  Check,
} from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { formatCLP, formatDate } from '../../../lib/formatters';
import { PeriodSelector } from '../../../components/shared/PeriodSelector';
import { Toast } from '../../../components/shared/Toast';
import { MatchCard, MatchData } from '../../../components/reconciliation/MatchCard';
import { TaxDocumentTypeBadge } from '../../../components/tax/TaxDocumentTypeBadge';

interface PendingBank {
  id: string;
  date: string;
  description: string;
  amount: string;
  type: string;
}

interface PendingTax {
  id: string;
  folio: number;
  type: string;
  direction: string;
  issueDate: string;
  issuerName: string;
  receiverName: string;
  totalAmount: string;
}

interface Workbench {
  stats: {
    totalBankMovements: number;
    totalTaxDocuments: number;
    totalMovements: number;
    autoMatched: number;
    suggested: number;
    pending: number;
    confirmed: number;
  };
  pendingBankMovements: PendingBank[];
  pendingTaxDocuments: PendingTax[];
  suggestions: MatchData[];
}

interface Kpis {
  reconciledPercentage: number;
  pendingCount: number;
  suggestedCount: number;
  totalDiscrepancyAmount: number;
  totalBankMovements: number;
  reconciledBankMovements: number;
}

type PendingTab = 'BANK' | 'TAX';

function daysPending(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  return Math.max(0, Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24)));
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  children,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500" style={{ fontWeight: 500 }}>
            {title}
          </p>
          <p className={`amount text-[28px] mt-1 leading-tight ${color}`}>{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-1" style={{ fontWeight: 300 }}>
              {subtitle}
            </p>
          )}
          {children}
        </div>
        <div
          className={`p-2.5 rounded-lg ${color.replace('text-', 'bg-').replace('600', '100').replace('500', '100')}`}
        >
          <Icon size={20} className={color} />
        </div>
      </div>
    </div>
  );
}

export default function ConciliacionPage() {
  const [periodId, setPeriodId] = useState('');
  const [workbench, setWorkbench] = useState<Workbench | null>(null);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [busyMatchIds, setBusyMatchIds] = useState<Set<string>>(new Set());
  const [pendingTab, setPendingTab] = useState<PendingTab>('BANK');
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  const [manualModal, setManualModal] = useState<
    null | { side: 'BANK'; item: PendingBank } | { side: 'TAX'; item: PendingTax }
  >(null);

  const reloadRef = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const qs = periodId ? `?fiscalPeriodId=${periodId}` : '';
      const [wb, k] = await Promise.all([
        apiClient.get<Workbench>(`/api/reconciliation/workbench${qs}`),
        apiClient.get<Kpis>(`/api/reconciliation/kpis${qs}`),
      ]);
      setWorkbench(wb);
      setKpis(k);
    } catch {
      /* handled */
    } finally {
      setIsLoading(false);
    }
  }, [periodId]);

  useEffect(() => {
    load();
  }, [load]);

  reloadRef.current = load;

  const handleRun = async () => {
    setIsRunning(true);
    try {
      const qs = periodId ? `?fiscalPeriodId=${periodId}` : '';
      const summary = await apiClient.post<{
        exactMatches: number;
        suggestions: number;
      }>(`/api/reconciliation/run${qs}`);
      setToast({
        message: `Conciliación completada: ${summary.exactMatches} automáticos, ${summary.suggestions} sugerencias`,
        type: 'success',
      });
      reloadRef.current?.();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error ejecutando conciliación',
        type: 'error',
      });
    } finally {
      setIsRunning(false);
    }
  };

  const toggleBusy = (id: string, on: boolean) => {
    setBusyMatchIds((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const handleConfirm = async (id: string) => {
    toggleBusy(id, true);
    try {
      await apiClient.patch(`/api/reconciliation/matches/${id}/confirm`);
      setToast({ message: 'Match confirmado', type: 'success' });
      reloadRef.current?.();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error al confirmar',
        type: 'error',
      });
    } finally {
      toggleBusy(id, false);
    }
  };

  const handleReject = async (id: string) => {
    toggleBusy(id, true);
    try {
      await apiClient.patch(`/api/reconciliation/matches/${id}/reject`, {});
      setToast({ message: 'Match rechazado', type: 'info' });
      reloadRef.current?.();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error al rechazar',
        type: 'error',
      });
    } finally {
      toggleBusy(id, false);
    }
  };

  const pctColor = useMemo(() => {
    const pct = kpis?.reconciledPercentage ?? 0;
    if (pct >= 80) return 'text-green-600';
    if (pct >= 50) return 'text-yellow-500';
    return 'text-red-500';
  }, [kpis?.reconciledPercentage]);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl text-gray-900 flex items-center gap-2">
            <GitMerge size={24} className="text-gray-500" /> Conciliación
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Cruza movimientos bancarios, documentos tributarios y movimientos internos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector value={periodId} onChange={setPeriodId} />
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            <RefreshCw size={14} className={isRunning ? 'animate-spin' : ''} />
            {isRunning ? 'Ejecutando...' : 'Ejecutar Conciliación'}
          </button>
        </div>
      </div>

      {/* SECTION 1 — KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {isLoading || !kpis ? (
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm animate-pulse"
              >
                <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
                <div className="h-8 bg-gray-200 rounded w-20" />
              </div>
            ))}
          </>
        ) : (
          <>
            <KpiCard
              title="% Conciliado"
              value={`${kpis.reconciledPercentage}%`}
              icon={GitMerge}
              color={pctColor}
              subtitle={`${kpis.reconciledBankMovements} de ${kpis.totalBankMovements} movimientos bancarios`}
            >
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${kpis.reconciledPercentage >= 80 ? 'bg-green-500' : kpis.reconciledPercentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${kpis.reconciledPercentage}%` }}
                />
              </div>
            </KpiCard>
            <KpiCard
              title="Conciliados automáticamente"
              value={String(workbench?.stats.autoMatched ?? 0)}
              subtitle="Match exacto detectado"
              icon={CheckCircle}
              color="text-green-600"
            />
            <KpiCard
              title="Sugerencias pendientes"
              value={String(kpis.suggestedCount)}
              subtitle="Revisa y confirma"
              icon={AlertTriangle}
              color="text-yellow-500"
            />
            <KpiCard
              title="Sin conciliar"
              value={String(kpis.pendingCount)}
              subtitle="Movimientos bancarios"
              icon={XCircle}
              color="text-red-500"
            />
            <KpiCard
              title="Discrepancia total"
              value={formatCLP(kpis.totalDiscrepancyAmount)}
              subtitle="Suma de diferencias"
              icon={TrendingDown}
              color="text-orange-500"
            />
          </>
        )}
      </div>

      {/* SECTION 2 — Suggestions panel */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <AlertTriangle size={16} className="text-yellow-500" />
          <h2 className="text-sm font-semibold text-gray-900">Sugerencias pendientes</h2>
          <span className="text-xs text-gray-400">
            {workbench?.suggestions.length ?? 0} para revisar
          </span>
        </div>
        <div className="p-5 space-y-3">
          {isLoading ? (
            <div className="text-sm text-gray-400 text-center py-6">Cargando...</div>
          ) : !workbench || workbench.suggestions.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No hay sugerencias pendientes</p>
            </div>
          ) : (
            workbench.suggestions.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                onConfirm={handleConfirm}
                onReject={handleReject}
                isBusy={busyMatchIds.has(m.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* SECTION 3 — Pending items tabs */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3 flex items-center gap-2">
          <button
            onClick={() => setPendingTab('BANK')}
            className={`px-4 py-2 text-sm rounded-lg transition ${
              pendingTab === 'BANK' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Landmark size={14} />
              Movimientos bancarios sin conciliar
              <span className="text-xs opacity-80">
                ({workbench?.pendingBankMovements.length ?? 0})
              </span>
            </span>
          </button>
          <button
            onClick={() => setPendingTab('TAX')}
            className={`px-4 py-2 text-sm rounded-lg transition ${
              pendingTab === 'TAX' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Receipt size={14} />
              Documentos tributarios sin conciliar
              <span className="text-xs opacity-80">
                ({workbench?.pendingTaxDocuments.length ?? 0})
              </span>
            </span>
          </button>
        </div>

        <div className="overflow-x-auto">
          {pendingTab === 'BANK' ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Fecha</th>
                  <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Descripción</th>
                  <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Monto</th>
                  <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Días</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!workbench || workbench.pendingBankMovements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                      Todos los movimientos bancarios están conciliados ✓
                    </td>
                  </tr>
                ) : (
                  workbench.pendingBankMovements.map((m) => {
                    const amount = Math.abs(Number(m.amount));
                    return (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="mono px-4 py-2 text-gray-600">{formatDate(m.date)}</td>
                        <td className="px-4 py-2 text-gray-900">{m.description}</td>
                        <td
                          className={`amount px-4 py-2 text-right ${m.type === 'CREDIT' ? 'text-green-600' : 'text-red-500'}`}
                        >
                          {m.type === 'CREDIT' ? '+' : '-'}
                          {formatCLP(amount)}
                        </td>
                        <td className="px-4 py-2 text-right text-xs text-gray-400">
                          {daysPending(m.date)}d
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => setManualModal({ side: 'BANK', item: m })}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Conciliar manualmente
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Folio</th>
                  <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Tipo</th>
                  <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Emisor</th>
                  <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Total</th>
                  <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Días</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!workbench || workbench.pendingTaxDocuments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                      Todos los documentos tributarios están conciliados ✓
                    </td>
                  </tr>
                ) : (
                  workbench.pendingTaxDocuments.map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-900 font-medium">{d.folio}</td>
                      <td className="px-4 py-2">
                        <TaxDocumentTypeBadge type={d.type} />
                      </td>
                      <td className="px-4 py-2 text-gray-900">{d.issuerName}</td>
                      <td className="amount px-4 py-2 text-right text-gray-900">
                        {formatCLP(d.totalAmount)}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-gray-400">
                        {daysPending(d.issueDate)}d
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => setManualModal({ side: 'TAX', item: d })}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Conciliar manualmente
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* SECTION 4 — Manual reconciliation modal */}
      {manualModal && (
        <ManualMatchModal
          source={manualModal}
          onClose={() => setManualModal(null)}
          onDone={() => {
            setManualModal(null);
            setToast({ message: 'Conciliación manual creada', type: 'success' });
            reloadRef.current?.();
          }}
          onError={(msg) => setToast({ message: msg, type: 'error' })}
          fiscalPeriodId={periodId}
        />
      )}
    </div>
  );
}

// ───────────────────────── Manual match modal ─────────────────────────

interface SearchableItem {
  id: string;
  label: string;
  amount: string;
  sublabel?: string;
}

function ManualMatchModal({
  source,
  onClose,
  onDone,
  onError,
  fiscalPeriodId,
}: {
  source: { side: 'BANK'; item: PendingBank } | { side: 'TAX'; item: PendingTax };
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
  fiscalPeriodId: string;
}) {
  const [query, setQuery] = useState('');
  const [targetKind, setTargetKind] = useState<'TAX' | 'MOVEMENT' | 'BANK'>(
    source.side === 'BANK' ? 'TAX' : 'BANK',
  );
  const [candidates, setCandidates] = useState<SearchableItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const runSearch = useCallback(async () => {
    setIsLoading(true);
    try {
      if (targetKind === 'TAX') {
        const params = new URLSearchParams({ limit: '10', isReconciled: 'false' });
        if (query.trim()) params.set('search', query.trim());
        if (fiscalPeriodId) params.set('fiscalPeriodId', fiscalPeriodId);
        const res = await apiClient.get<{
          data: {
            id: string;
            folio: number;
            issuerName: string;
            totalAmount: string;
            issueDate: string;
          }[];
        }>(`/api/tax/documents?${params.toString()}`);
        setCandidates(
          res.data.map((d) => ({
            id: d.id,
            label: `Folio ${d.folio} · ${d.issuerName}`,
            amount: d.totalAmount,
            sublabel: formatDate(d.issueDate),
          })),
        );
      } else if (targetKind === 'MOVEMENT') {
        const params = new URLSearchParams({ limit: '10' });
        if (query.trim()) params.set('search', query.trim());
        const res = await apiClient.get<{
          data: {
            id: string;
            description: string;
            amount: string;
            date: string;
            type: string;
          }[];
        }>(`/api/movements?${params.toString()}`);
        setCandidates(
          res.data.map((m) => ({
            id: m.id,
            label: m.description,
            amount: m.amount,
            sublabel: `${formatDate(m.date)} · ${m.type}`,
          })),
        );
      } else {
        // Target BANK — reuse workbench pending list, filtered locally.
        const q = query.trim().toLowerCase();
        const res = await apiClient.get<{ pendingBankMovements: PendingBank[] }>(
          `/api/reconciliation/workbench${fiscalPeriodId ? `?fiscalPeriodId=${fiscalPeriodId}` : ''}`,
        );
        const filtered = q
          ? res.pendingBankMovements.filter(
              (b) =>
                b.description.toLowerCase().includes(q) ||
                String(Math.abs(Number(b.amount))).includes(q),
            )
          : res.pendingBankMovements;
        setCandidates(
          filtered.slice(0, 10).map((b) => ({
            id: b.id,
            label: b.description,
            amount: b.amount,
            sublabel: `${formatDate(b.date)} · ${b.type}`,
          })),
        );
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error en búsqueda');
    } finally {
      setIsLoading(false);
    }
  }, [query, targetKind, fiscalPeriodId, onError]);

  useEffect(() => {
    runSearch();
  }, [runSearch]);

  const submit = async () => {
    if (!selectedId) return;
    setIsSubmitting(true);
    try {
      const body: Record<string, string> = {};
      if (source.side === 'BANK') body.externalMovementId = source.item.id;
      else body.taxDocumentId = source.item.id;

      if (targetKind === 'TAX') body.taxDocumentId = selectedId;
      else if (targetKind === 'MOVEMENT') body.movementId = selectedId;
      else body.externalMovementId = selectedId;

      await apiClient.post('/api/reconciliation/matches/manual', body);
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al crear conciliación');
    } finally {
      setIsSubmitting(false);
    }
  };

  const sourceLabel =
    source.side === 'BANK'
      ? `${source.item.description} · ${formatCLP(Math.abs(Number(source.item.amount)))}`
      : `Folio ${source.item.folio} · ${source.item.issuerName} · ${formatCLP(source.item.totalAmount)}`;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Conciliar manualmente</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs text-gray-500 font-medium mb-1">Origen seleccionado</div>
            <div className="text-sm text-gray-900">{sourceLabel}</div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Conciliar con</label>
            <div className="flex gap-2">
              {source.side === 'BANK' ? (
                <>
                  <TargetButton
                    active={targetKind === 'TAX'}
                    onClick={() => setTargetKind('TAX')}
                    label="Documento tributario"
                  />
                  <TargetButton
                    active={targetKind === 'MOVEMENT'}
                    onClick={() => setTargetKind('MOVEMENT')}
                    label="Movimiento interno"
                  />
                </>
              ) : (
                <>
                  <TargetButton
                    active={targetKind === 'BANK'}
                    onClick={() => setTargetKind('BANK')}
                    label="Movimiento bancario"
                  />
                  <TargetButton
                    active={targetKind === 'MOVEMENT'}
                    onClick={() => setTargetKind('MOVEMENT')}
                    label="Movimiento interno"
                  />
                </>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Buscar por descripción o monto
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
            />
          </div>

          <div className="border border-gray-200 rounded-lg max-h-60 overflow-auto">
            {isLoading ? (
              <div className="p-4 text-center text-sm text-gray-400">Buscando...</div>
            ) : candidates.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-400">Sin resultados</div>
            ) : (
              candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between border-b border-gray-100 last:border-0 hover:bg-gray-50 transition ${
                    selectedId === c.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-gray-900 truncate">{c.label}</div>
                    {c.sublabel && <div className="text-xs text-gray-400">{c.sublabel}</div>}
                  </div>
                  <div className="text-sm font-semibold text-gray-900 flex-shrink-0 ml-3">
                    {formatCLP(Math.abs(Number(c.amount)))}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!selectedId || isSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            <Check size={14} />
            {isSubmitting ? 'Creando...' : 'Confirmar conciliación manual'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TargetButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-lg border transition ${
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );
}
