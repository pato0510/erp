'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Landmark, RefreshCw, Plus, ChevronDown, ChevronUp, History } from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { formatCLP, formatDate, formatRelativeDate } from '../../../lib/formatters';
import { Toast } from '../../../components/shared/Toast';

interface Connection {
  id: string;
  provider: string;
  providerAccountId: string;
  status: string;
  lastSyncAt: string | null;
  lastErrorMessage: string | null;
  bankAccount: { name: string; type: string; bankName?: string };
}

interface BankAccount {
  id: string;
  name: string;
  type: string;
}

interface ExternalMovement {
  id: string;
  externalId: string;
  date: string;
  description: string;
  amount: string;
  type: string;
  isReconciled: boolean;
}

interface SyncRun {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  movementsSynced: number;
  balancesSynced: number;
  errorMessage: string | null;
}

interface ToastData {
  message: string;
  type: 'success' | 'error' | 'info';
}

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: 'Activo', cls: 'bg-green-100 text-green-700' },
  ERROR: { label: 'Error', cls: 'bg-red-100 text-red-700' },
  PENDING: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-700' },
  INACTIVE: { label: 'Inactivo', cls: 'bg-gray-100 text-gray-500' },
};

const SYNC_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Pendiente', cls: 'bg-gray-100 text-gray-600' },
  RUNNING: { label: 'Ejecutando', cls: 'bg-blue-100 text-blue-700' },
  SUCCESS: { label: 'Exitoso', cls: 'bg-green-100 text-green-700' },
  FAILED: { label: 'Fallido', cls: 'bg-red-100 text-red-700' },
};

export default function BancoPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [movements, setMovements] = useState<ExternalMovement[]>([]);
  const [syncHistory, setSyncHistory] = useState<SyncRun[]>([]);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastData | null>(null);

  const [formAccountId, setFormAccountId] = useState('');
  const [formProviderId, setFormProviderId] = useState('MOCK-001');
  const [isCreating, setIsCreating] = useState(false);

  const reloadRef = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [conns, accts] = await Promise.all([
        apiClient.get<Connection[]>('/api/banking/connections'),
        apiClient.get<BankAccount[]>('/api/cashflow/accounts'),
      ]);
      setConnections(conns);
      setAccounts(accts);
    } catch {
      /* handled */
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  reloadRef.current = load;

  const pollJob = useCallback(async (jobId: string, connId: string, type: string) => {
    const key = `${connId}-${type}`;
    setSyncingIds((s) => new Set(s).add(key));

    const poll = async () => {
      try {
        const status = await apiClient.get<{
          status: string;
          result: unknown;
          failedReason?: string;
        }>(`/api/banking/jobs/${jobId}/status`);
        if (status.status === 'completed') {
          setSyncingIds((s) => {
            const n = new Set(s);
            n.delete(key);
            return n;
          });
          setToast({
            message: `Sincronización de ${type === 'balance' ? 'saldos' : 'movimientos'} completada`,
            type: 'success',
          });
          reloadRef.current?.();
          if (type === 'movements') {
            const res = await apiClient.get<{ data: ExternalMovement[] }>(
              `/api/banking/connections/${connId}/movements?limit=30`,
            );
            setMovements(res.data);
            setExpandedId(connId);
          }
          return;
        }
        if (status.status === 'failed') {
          setSyncingIds((s) => {
            const n = new Set(s);
            n.delete(key);
            return n;
          });
          setToast({ message: status.failedReason || 'Error en sincronización', type: 'error' });
          reloadRef.current?.();
          return;
        }
        setTimeout(poll, 2000);
      } catch {
        setSyncingIds((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
      }
    };
    setTimeout(poll, 1000);
  }, []);

  const handleCreate = async () => {
    if (!formAccountId) return;
    setIsCreating(true);
    try {
      await apiClient.post('/api/banking/connections', {
        bankAccountId: formAccountId,
        provider: 'mock',
        providerAccountId: formProviderId,
      });
      setShowForm(false);
      setFormAccountId('');
      setToast({ message: 'Conexión creada exitosamente', type: 'success' });
      reloadRef.current?.();
    } catch {
      /* handled */
    } finally {
      setIsCreating(false);
    }
  };

  const handleSync = async (connId: string, type: 'balance' | 'movements') => {
    try {
      const endpoint = type === 'balance' ? 'sync-balance' : 'sync-movements';
      const res = await apiClient.post<{ jobId: string }>(
        `/api/banking/connections/${connId}/${endpoint}`,
        {},
      );
      pollJob(res.jobId, connId, type);
    } catch {
      setToast({ message: 'Error al iniciar sincronización', type: 'error' });
    }
  };

  const toggleMovements = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    try {
      const res = await apiClient.get<{ data: ExternalMovement[] }>(
        `/api/banking/connections/${id}/movements?limit=30`,
      );
      setMovements(res.data);
      setExpandedId(id);
    } catch {
      /* handled */
    }
  };

  const toggleHistory = async (id: string) => {
    if (historyId === id) {
      setHistoryId(null);
      return;
    }
    try {
      const runs = await apiClient.get<SyncRun[]>(`/api/banking/connections/${id}/sync-history`);
      setSyncHistory(runs);
      setHistoryId(id);
    } catch {
      /* handled */
    }
  };

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Conexiones Bancarias</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={16} /> Nueva Conexión
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 max-w-lg space-y-4">
          <h3 className="font-semibold text-gray-900">Conectar cuenta bancaria</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta bancaria</label>
            <select
              value={formAccountId}
              onChange={(e) => setFormAccountId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Seleccionar...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" disabled>
              <option>Mock (Simulación)</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">Fintoc y Unnax disponibles próximamente</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ID cuenta proveedor
            </label>
            <input
              type="text"
              value={formProviderId}
              onChange={(e) => setFormProviderId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="MOCK-001"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={isCreating || !formAccountId}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {isCreating ? 'Conectando...' : 'Conectar'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-48 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-32" />
            </div>
          ))}
        </div>
      ) : connections.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <Landmark size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Sin conexiones bancarias</p>
          <p className="text-gray-400 text-sm mt-1">
            Conecta una cuenta para sincronizar movimientos
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {connections.map((conn) => {
            const status = STATUS_BADGES[conn.status] || STATUS_BADGES.PENDING;
            const isExpanded = expandedId === conn.id;
            const isHistoryOpen = historyId === conn.id;
            const isSyncingBal = syncingIds.has(`${conn.id}-balance`);
            const isSyncingMov = syncingIds.has(`${conn.id}-movements`);
            return (
              <div key={conn.id} className="bg-white border border-gray-200 rounded-xl shadow-sm">
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Landmark size={18} className="text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {conn.bankAccount.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {conn.provider.toUpperCase()} · {conn.providerAccountId}
                          {conn.lastSyncAt &&
                            ` · Últ. sync: ${formatRelativeDate(conn.lastSyncAt)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${status.cls}`}
                      >
                        {status.label}
                      </span>
                      <button
                        onClick={() => handleSync(conn.id, 'balance')}
                        disabled={isSyncingBal}
                        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition flex items-center gap-1"
                      >
                        <RefreshCw size={12} className={isSyncingBal ? 'animate-spin' : ''} />{' '}
                        Saldos
                      </button>
                      <button
                        onClick={() => handleSync(conn.id, 'movements')}
                        disabled={isSyncingMov}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-1"
                      >
                        <RefreshCw size={12} className={isSyncingMov ? 'animate-spin' : ''} />{' '}
                        Movimientos
                      </button>
                      <button
                        onClick={() => toggleHistory(conn.id)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition"
                        title="Historial"
                      >
                        <History
                          size={16}
                          className={isHistoryOpen ? 'text-blue-600' : 'text-gray-400'}
                        />
                      </button>
                      <button
                        onClick={() => toggleMovements(conn.id)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>
                  {conn.lastErrorMessage && (
                    <p className="mt-2 text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded">
                      {conn.lastErrorMessage}
                    </p>
                  )}
                </div>

                {/* Sync History */}
                {isHistoryOpen && (
                  <div className="border-t border-gray-200 bg-gray-50">
                    <div className="px-5 py-3 flex items-center gap-2">
                      <History size={14} className="text-gray-400" />
                      <span className="text-xs font-medium text-gray-500">
                        Historial de sincronización
                      </span>
                    </div>
                    <table className="w-full text-xs">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="text-left px-4 py-2 text-gray-500">Inicio</th>
                          <th className="text-center px-4 py-2 text-gray-500">Estado</th>
                          <th className="text-right px-4 py-2 text-gray-500">Mov. sincronizados</th>
                          <th className="text-right px-4 py-2 text-gray-500">Duración</th>
                          <th className="text-left px-4 py-2 text-gray-500">Error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {syncHistory.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                              Sin historial
                            </td>
                          </tr>
                        ) : (
                          syncHistory.slice(0, 10).map((run) => {
                            const st = SYNC_STATUS[run.status] || SYNC_STATUS.PENDING;
                            const duration = run.completedAt
                              ? `${Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s`
                              : '-';
                            return (
                              <tr key={run.id}>
                                <td className="px-4 py-2 text-gray-600">
                                  {formatRelativeDate(run.startedAt)}
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}
                                  >
                                    {st.label}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right text-gray-700">
                                  {run.movementsSynced + run.balancesSynced}
                                </td>
                                <td className="px-4 py-2 text-right text-gray-500">{duration}</td>
                                <td className="px-4 py-2 text-red-500 truncate max-w-[200px]">
                                  {run.errorMessage || '-'}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* External movements */}
                {isExpanded && (
                  <div className="border-t border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-2 text-gray-500">Fecha</th>
                          <th className="text-left px-4 py-2 text-gray-500">Descripción</th>
                          <th className="text-left px-4 py-2 text-gray-500">Tipo</th>
                          <th className="text-right px-4 py-2 text-gray-500">Monto</th>
                          <th className="text-center px-4 py-2 text-gray-500">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {movements.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                              Sin movimientos. Sincroniza para ver datos.
                            </td>
                          </tr>
                        ) : (
                          movements.map((m) => (
                            <tr key={m.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-gray-700">{formatDate(m.date)}</td>
                              <td className="px-4 py-2 text-gray-900">{m.description}</td>
                              <td className="px-4 py-2">
                                <span
                                  className={`text-xs font-medium ${m.type === 'CREDIT' ? 'text-green-600' : 'text-red-500'}`}
                                >
                                  {m.type === 'CREDIT' ? '↑ Crédito' : '↓ Débito'}
                                </span>
                              </td>
                              <td
                                className={`px-4 py-2 text-right font-semibold ${m.type === 'CREDIT' ? 'text-green-600' : 'text-red-500'}`}
                              >
                                {m.type === 'CREDIT' ? '+' : '-'}
                                {formatCLP(m.amount)}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.isReconciled ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}
                                >
                                  {m.isReconciled ? 'Conciliado' : 'Pendiente'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
