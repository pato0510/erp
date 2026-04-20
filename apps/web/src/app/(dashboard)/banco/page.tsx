'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Landmark, RefreshCw, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { formatCLP, formatDate, formatRelativeDate } from '../../../lib/formatters';

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

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: 'Activo', cls: 'bg-green-100 text-green-700' },
  ERROR: { label: 'Error', cls: 'bg-red-100 text-red-700' },
  PENDING: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-700' },
  INACTIVE: { label: 'Inactivo', cls: 'bg-gray-100 text-gray-500' },
};

export default function BancoPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [movements, setMovements] = useState<ExternalMovement[]>([]);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);

  // Form state
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
      // handled
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  reloadRef.current = load;

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
      reloadRef.current?.();
    } catch {
      // handled
    } finally {
      setIsCreating(false);
    }
  };

  const handleSyncBalance = async (id: string) => {
    setIsSyncing(id + '-balance');
    try {
      await apiClient.post(`/api/banking/connections/${id}/sync-balance`);
      reloadRef.current?.();
    } catch {
      // handled
    } finally {
      setIsSyncing(null);
    }
  };

  const handleSyncMovements = async (id: string) => {
    setIsSyncing(id + '-movements');
    try {
      await apiClient.post(`/api/banking/connections/${id}/sync-movements`, {});
      // Load external movements
      const res = await apiClient.get<{ data: ExternalMovement[] }>(
        `/api/banking/connections/${id}/movements?limit=30`,
      );
      setMovements(res.data);
      setExpandedId(id);
      reloadRef.current?.();
    } catch {
      // handled
    } finally {
      setIsSyncing(null);
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
      // handled
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Conexiones Bancarias</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={16} /> Nueva Conexión
        </button>
      </div>

      {/* Add connection form */}
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
              ID de cuenta del proveedor
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

      {/* Connections list */}
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
                        onClick={() => handleSyncBalance(conn.id)}
                        disabled={isSyncing === conn.id + '-balance'}
                        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition flex items-center gap-1"
                      >
                        <RefreshCw
                          size={12}
                          className={isSyncing === conn.id + '-balance' ? 'animate-spin' : ''}
                        />
                        Saldos
                      </button>
                      <button
                        onClick={() => handleSyncMovements(conn.id)}
                        disabled={isSyncing === conn.id + '-movements'}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-1"
                      >
                        <RefreshCw
                          size={12}
                          className={isSyncing === conn.id + '-movements' ? 'animate-spin' : ''}
                        />
                        Movimientos
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

                {/* External movements table */}
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
                              Sin movimientos. Presiona &ldquo;Movimientos&rdquo; para sincronizar.
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
