'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../hooks/useAuth';
import { ServiceOrderStatusBadge } from '../../../../components/operations/ServiceOrderStatusBadge';

/* CAL-015 — "Servicios activos": the in-flight orders (RECIBIDA + EN_EJECUCION) where ops sets the
   execution window "cuando se empiezan las órdenes". Writers edit Inicio/Fin de ejecución INLINE
   with autosave on blur (the CAL-011 spirit); readers (ACCOUNTANT) see the dates as text. Orders
   without dates carry the forward pointer "Sin fechas — no aparece en el calendario maestro"
   (CAL-016). Estado uses the ops vocabulary badge (Recibida/En ejecución) — never activity words.
   The backend @CheckPolicies is the real gate; canManage only shapes the affordances. */

interface ServiceOrder {
  id: string;
  orderNumber: string;
  clientName: string;
  title: string;
  status: string;
  executionStart: string | null;
  executionEnd: string | null;
}

/** UTC day slice of an @db.Date ISO ("…T00:00:00.000Z" → "YYYY-MM-DD"), or '' when null. */
function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CL', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function ServiciosActivosPage() {
  const { user } = useAuth();
  const activeCompanyId = apiClient.getCompanyId();
  const role = user?.companies.find((c) => c.companyId === activeCompanyId)?.role ?? null;
  const canManage = role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';

  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const fetchOrders = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    return apiClient
      .get<ServiceOrder[]>('/api/operations/service-orders/active')
      .then((data) => {
        setOrders(data);
        setError(null);
        setDenied(false);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setDenied(true);
        else setError('No se pudieron cargar los servicios.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1200px] mx-auto">
      <div className="mb-2 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
        Operaciones / Servicios activos
      </div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Servicios activos</h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Órdenes recibidas y en ejecución — fechas de ejecución
          </p>
        </div>
        {!denied && (
          <button
            type="button"
            onClick={() => fetchOrders()}
            disabled={loading}
            aria-label="Actualizar"
            className="inline-flex items-center rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] p-1.5 text-[var(--text-primary)] disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {denied ? (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center text-sm text-[var(--text-secondary)] shadow-sm">
          No tienes acceso a las órdenes de servicio.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-[var(--border-color)] bg-gray-50 dark:bg-white/5">
              <tr>
                {['Orden', 'Estado', 'Inicio de ejecución', 'Fin de ejecución'].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {loading && orders.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-10 text-center text-sm text-[var(--text-secondary)]"
                  >
                    <RefreshCw size={16} className="mx-auto mb-2 animate-spin opacity-60" />{' '}
                    Cargando…
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-10 text-center text-sm text-[var(--text-secondary)]"
                  >
                    No hay servicios activos.
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <OrderRow
                    key={o.id}
                    order={o}
                    canManage={canManage}
                    onSaved={() => fetchOrders(true)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrderRow({
  order,
  canManage,
  onSaved,
}: {
  order: ServiceOrder;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [start, setStart] = useState(toDateInput(order.executionStart));
  const [end, setEnd] = useState(toDateInput(order.executionEnd));
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);

  const noDates = !order.executionStart && !order.executionEnd;

  const saveField = async (field: 'executionStart' | 'executionEnd', value: string) => {
    const serverVal = toDateInput(
      field === 'executionStart' ? order.executionStart : order.executionEnd,
    );
    if (value === serverVal) return; // unchanged → no request
    setState('saving');
    setErr(null);
    try {
      // Clearing sends null; a value sends the YYYY-MM-DD string. The end ≥ start rule (400) lives
      // in the backend and surfaces verbatim below; local values are kept on error.
      await apiClient.patch(`/api/operations/service-orders/${order.id}/execution-dates`, {
        [field]: value || null,
      });
      setState('saved');
      onSaved();
      window.setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 1500);
    } catch (e) {
      setState('error');
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar.');
    }
  };

  const dateInputCls =
    'rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-1.5 py-1 text-sm text-[var(--text-primary)]';

  return (
    <>
      <tr className={state === 'error' ? 'bg-red-50 dark:bg-red-950/30' : ''}>
        <td className="px-3 py-2.5">
          <div className="font-medium text-[var(--text-primary)]">
            {order.orderNumber} · {order.clientName}
          </div>
          <div className="text-xs text-[var(--text-secondary)]">{order.title}</div>
          {noDates && (
            <div className="mt-1 text-[11px] italic text-[var(--text-secondary)] opacity-70">
              Sin fechas — no aparece en el calendario maestro
            </div>
          )}
        </td>
        <td className="px-3 py-2.5">
          <ServiceOrderStatusBadge status={order.status} />
        </td>
        <td className="px-3 py-2.5">
          {canManage ? (
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              onBlur={() => saveField('executionStart', start)}
              className={dateInputCls}
            />
          ) : (
            <span className="text-[var(--text-secondary)]">{formatDate(order.executionStart)}</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            {canManage ? (
              <input
                type="date"
                value={end}
                min={start || undefined}
                onChange={(e) => setEnd(e.target.value)}
                onBlur={() => saveField('executionEnd', end)}
                className={dateInputCls}
              />
            ) : (
              <span className="text-[var(--text-secondary)]">{formatDate(order.executionEnd)}</span>
            )}
            {state === 'saving' && (
              <RefreshCw size={13} className="animate-spin text-[var(--text-secondary)]" />
            )}
            {state === 'saved' && <Check size={14} className="text-green-600" />}
          </div>
        </td>
      </tr>
      {state === 'error' && err && (
        <tr className="bg-red-50 dark:bg-red-950/30">
          <td colSpan={4} className="px-3 pb-2 text-xs text-red-600">
            {err}
          </td>
        </tr>
      )}
    </>
  );
}
