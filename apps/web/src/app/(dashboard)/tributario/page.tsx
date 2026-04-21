'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Receipt,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Scale,
  AlertCircle,
  CheckCircle,
  Search,
} from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { formatCLP, formatDate, formatRelativeDate } from '../../../lib/formatters';
import { PeriodSelector } from '../../../components/shared/PeriodSelector';
import { Toast } from '../../../components/shared/Toast';
import { TaxDocumentTypeBadge } from '../../../components/tax/TaxDocumentTypeBadge';

type Direction = 'EMITIDO' | 'RECIBIDO';
type Tab = 'EMITIDO' | 'RECIBIDO' | 'ALL';

interface TaxDocument {
  id: string;
  type: string;
  direction: Direction;
  folio: number;
  issuerRut: string;
  issuerName: string;
  receiverRut: string;
  receiverName: string;
  issueDate: string;
  netAmount: string;
  taxAmount: string;
  totalAmount: string;
  status: string;
  isReconciled: boolean;
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Summary {
  emitidos: { count: number; netTotal: number; taxTotal: number; total: number };
  recibidos: { count: number; netTotal: number; taxTotal: number; total: number };
  balance: number;
  pendingReconciliation: number;
  lastSync: { emitidos: string | null; recibidos: string | null };
}

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-700' },
  ACCEPTED: { label: 'Aceptado', cls: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Rechazado', cls: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'Anulado', cls: 'bg-gray-100 text-gray-500' },
};

const PAGE_SIZE = 20;

function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500" style={{ fontWeight: 500 }}>
            {title}
          </p>
          <p className={`amount text-[26px] mt-1 leading-tight ${color}`}>{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-1" style={{ fontWeight: 300 }}>
              {subtitle}
            </p>
          )}
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

export default function TributarioPage() {
  const [periodId, setPeriodId] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [documents, setDocuments] = useState<Paginated<TaxDocument> | null>(null);
  const [tab, setTab] = useState<Tab>('EMITIDO');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [isDocsLoading, setIsDocsLoading] = useState(true);
  const [syncingAction, setSyncingAction] = useState<'EMITIDO' | 'RECIBIDO' | 'ALL' | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const reloadRef = useRef<(() => void) | null>(null);

  const loadSummary = useCallback(async () => {
    setIsSummaryLoading(true);
    try {
      const qs = periodId ? `?fiscalPeriodId=${periodId}` : '';
      const res = await apiClient.get<Summary>(`/api/tax/summary${qs}`);
      setSummary(res);
    } catch {
      /* handled */
    } finally {
      setIsSummaryLoading(false);
    }
  }, [periodId]);

  const loadDocuments = useCallback(async () => {
    setIsDocsLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab !== 'ALL') params.set('direction', tab);
      if (periodId) params.set('fiscalPeriodId', periodId);
      if (search.trim()) params.set('search', search.trim());
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      const res = await apiClient.get<Paginated<TaxDocument>>(
        `/api/tax/documents?${params.toString()}`,
      );
      setDocuments(res);
    } catch {
      /* handled */
    } finally {
      setIsDocsLoading(false);
    }
  }, [tab, periodId, search, page]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Reset page when tab / filters change
  useEffect(() => {
    setPage(1);
  }, [tab, periodId, search]);

  reloadRef.current = () => {
    loadSummary();
    loadDocuments();
  };

  const handleSync = async (action: 'EMITIDO' | 'RECIBIDO' | 'ALL') => {
    if (!periodId) {
      setToast({
        message: 'Selecciona un período fiscal antes de sincronizar',
        type: 'info',
      });
      return;
    }
    setSyncingAction(action);
    try {
      if (action === 'ALL') {
        const res = await apiClient.post<{ totalSynced: number; totalSkipped: number }>(
          `/api/tax/sync-all?fiscalPeriodId=${periodId}`,
        );
        setToast({
          message: `Sincronización completa: ${res.totalSynced} nuevos, ${res.totalSkipped} ya existían`,
          type: 'success',
        });
      } else {
        const res = await apiClient.post<{ synced: number; skipped: number }>(
          `/api/tax/sync?fiscalPeriodId=${periodId}&direction=${action}`,
        );
        setToast({
          message: `Sincronizados ${res.synced} documentos (${res.skipped} ya existían)`,
          type: 'success',
        });
      }
      reloadRef.current?.();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error en sincronización',
        type: 'error',
      });
    } finally {
      setSyncingAction(null);
    }
  };

  const balanceColor = summary && summary.balance >= 0 ? 'text-green-600' : 'text-red-500';

  const lastSyncLabel = (() => {
    if (!summary) return null;
    const dates = [summary.lastSync.emitidos, summary.lastSync.recibidos]
      .filter((d): d is string => !!d)
      .map((d) => new Date(d).getTime());
    if (dates.length === 0) return null;
    const latest = new Date(Math.max(...dates));
    return formatRelativeDate(latest.toISOString());
  })();

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl text-gray-900 flex items-center gap-2">
            <Receipt size={24} className="text-gray-500" /> Tributario
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Facturación electrónica y documentos tributarios sincronizados desde SII
          </p>
        </div>
        <PeriodSelector value={periodId} onChange={setPeriodId} />
      </div>

      {/* SECTION 1 — Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {isSummaryLoading || !summary ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm animate-pulse"
              >
                <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
                <div className="h-6 bg-gray-200 rounded w-32" />
              </div>
            ))}
          </>
        ) : (
          <>
            <SummaryCard
              title="Facturas Emitidas"
              value={formatCLP(summary.emitidos.total)}
              subtitle={`${summary.emitidos.count} documento${summary.emitidos.count === 1 ? '' : 's'}`}
              icon={TrendingUp}
              color="text-blue-600"
            />
            <SummaryCard
              title="Facturas Recibidas"
              value={formatCLP(summary.recibidos.total)}
              subtitle={`${summary.recibidos.count} documento${summary.recibidos.count === 1 ? '' : 's'}`}
              icon={TrendingDown}
              color="text-orange-500"
            />
            <SummaryCard
              title="Balance Tributario"
              value={formatCLP(summary.balance)}
              subtitle={summary.balance >= 0 ? 'Emitidas − Recibidas' : 'Gasto mayor al ingreso'}
              icon={Scale}
              color={balanceColor}
            />
            <SummaryCard
              title="Pendientes conciliación"
              value={String(summary.pendingReconciliation)}
              subtitle="Aún sin movimiento vinculado"
              icon={AlertCircle}
              color="text-yellow-500"
            />
          </>
        )}
      </div>

      {/* SECTION 2 — Sync controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-700">Sincronización con SII (mock)</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {lastSyncLabel
              ? `Última sincronización: ${lastSyncLabel}`
              : 'Aún no se ha sincronizado este período'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => handleSync('EMITIDO')}
            disabled={!!syncingAction}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
          >
            <RefreshCw size={14} className={syncingAction === 'EMITIDO' ? 'animate-spin' : ''} />
            Sincronizar Emitidos
          </button>
          <button
            onClick={() => handleSync('RECIBIDO')}
            disabled={!!syncingAction}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
          >
            <RefreshCw size={14} className={syncingAction === 'RECIBIDO' ? 'animate-spin' : ''} />
            Sincronizar Recibidos
          </button>
          <button
            onClick={() => handleSync('ALL')}
            disabled={!!syncingAction}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            <RefreshCw size={14} className={syncingAction === 'ALL' ? 'animate-spin' : ''} />
            Sincronizar Todo
          </button>
        </div>
      </div>

      {/* SECTION 3 — Documents */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* Tabs + search */}
        <div className="border-b border-gray-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex gap-1">
            {(
              [
                { value: 'EMITIDO', label: 'Emitidos' },
                { value: 'RECIBIDO', label: 'Recibidos' },
                { value: 'ALL', label: 'Todos' },
              ] as { value: Tab; label: string }[]
            ).map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`px-4 py-2 text-sm rounded-lg transition ${
                  tab === t.value ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 flex justify-end">
            <div className="relative w-full sm:w-72">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Buscar por RUT o nombre..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Folio</th>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Tipo</th>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Fecha</th>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium">
                  {tab === 'EMITIDO' ? 'Receptor' : tab === 'RECIBIDO' ? 'Emisor' : 'Contraparte'}
                </th>
                <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Neto</th>
                <th className="text-right px-4 py-2.5 text-gray-500 font-medium">IVA</th>
                <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Total</th>
                <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Estado</th>
                <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Concilia.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isDocsLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">
                    Cargando documentos...
                  </td>
                </tr>
              ) : !documents || documents.data.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">
                    <Receipt size={32} className="mx-auto text-gray-300 mb-2" />
                    Sin documentos. Sincroniza para ver datos.
                  </td>
                </tr>
              ) : (
                documents.data.map((doc) => {
                  const st = STATUS_BADGES[doc.status] || STATUS_BADGES.PENDING;
                  const counterpartyName =
                    doc.direction === 'EMITIDO' ? doc.receiverName : doc.issuerName;
                  const counterpartyRut =
                    doc.direction === 'EMITIDO' ? doc.receiverRut : doc.issuerRut;
                  return (
                    <tr key={doc.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{doc.folio}</td>
                      <td className="px-4 py-2.5">
                        <TaxDocumentTypeBadge type={doc.type} />
                      </td>
                      <td className="mono px-4 py-2.5 text-gray-600">
                        {formatDate(doc.issueDate)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-gray-900">{counterpartyName}</div>
                        <div className="text-xs text-gray-400">{counterpartyRut}</div>
                      </td>
                      <td className="amount px-4 py-2.5 text-right text-gray-700">
                        {formatCLP(doc.netAmount)}
                      </td>
                      <td className="amount px-4 py-2.5 text-right text-gray-500">
                        {formatCLP(doc.taxAmount)}
                      </td>
                      <td className="amount px-4 py-2.5 text-right text-gray-900">
                        {formatCLP(doc.totalAmount)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {doc.isReconciled ? (
                          <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                            <CheckCircle size={12} /> Conciliado
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">Pendiente</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {documents && documents.totalPages > 1 && (
          <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Página {documents.page} de {documents.totalPages} · {documents.total} documentos
            </span>
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition"
              >
                Anterior
              </button>
              <button
                disabled={page >= documents.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
