'use client';

/* COM-013a — service order detail (read-only fields + the frozen scope snapshot + the
   status machine for the management audience). Dedicated [id] route (the operations
   convention). NO create/edit-of-scope UI — the snapshot is frozen from the handoff.
   Status-advance actions gate on the client-side role (MANAGER/ADMIN/SUPER_ADMIN),
   matching the backend `update ServiceOrder` grant; the @CheckPolicies gate is the real
   enforcement. */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Ban, CheckCircle2, PlayCircle } from 'lucide-react';
import { apiClient, ApiError } from '../../../../../lib/api';
import { formatCLP, formatDate } from '../../../../../lib/formatters';
import { useAuth } from '../../../../../hooks/useAuth';
import {
  SERVICE_ORDER_STATUS_LABELS,
  ServiceOrderStatusBadge,
} from '../../../../../components/operations/ServiceOrderStatusBadge';

interface ScopeLine {
  serviceName: string;
  quantity: number | string;
  unitPrice: number | string;
  lineTotal: number | string;
}
interface ServiceOrder {
  id: string;
  orderNumber: string;
  status: string;
  clientName: string;
  title: string;
  description: string | null;
  scopeLines: ScopeLine[];
  netAmount: string;
  taxAmount: string;
  totalAmount: string;
  currency: string;
  ownerId: string | null;
  sourceOpportunityId: string | null;
  sourceQuoteId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function ServiceOrderDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const { user } = useAuth();
  const activeCompanyId = apiClient.getCompanyId();
  const role = user?.companies.find((c) => c.companyId === activeCompanyId)?.role ?? null;
  const canManage = role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';

  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'notfound'>('loading');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    apiClient
      .get<ServiceOrder>(`/api/operations/service-orders/${id}`)
      .then((data) => {
        setOrder(data);
        setState('ok');
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setState('forbidden');
        else setState('notfound');
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (status: string, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    setErr(null);
    try {
      const updated = await apiClient.patch<ServiceOrder>(
        `/api/operations/service-orders/${id}/status`,
        { status },
      );
      setOrder(updated);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo actualizar el estado.');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading')
    return <div className="pt-6 text-sm text-[var(--text-secondary)]">Cargando orden…</div>;
  if (state === 'forbidden')
    return (
      <div className="pt-6">
        <p className="text-sm text-[var(--text-secondary)]">
          No tienes permiso para ver esta orden.
        </p>
        <Back />
      </div>
    );
  if (state === 'notfound' || !order)
    return (
      <div className="pt-6">
        <p className="text-sm text-[var(--text-secondary)]">Orden de servicio no encontrada.</p>
        <Back />
      </div>
    );

  const isTerminal = order.status === 'COMPLETADA' || order.status === 'CANCELADA';

  return (
    <div>
      <Link
        href="/operaciones/ordenes-de-servicio"
        className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={13} /> Órdenes de Servicio
      </Link>

      {/* Header */}
      <div className="mb-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-semibold text-[var(--text-secondary)]">
                {order.orderNumber}
              </span>
              <ServiceOrderStatusBadge status={order.status} />
            </div>
            <h1
              className="mt-1 text-[var(--text-primary)]"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
                fontSize: 24,
                letterSpacing: '-0.01em',
              }}
            >
              {order.title}
            </h1>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{order.clientName}</p>
            {order.sourceOpportunityId && (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Originada en Comercial</p>
            )}
          </div>

          {/* Status machine (management audience) */}
          {canManage && !isTerminal && (
            <div className="flex flex-wrap items-center gap-2">
              {order.status === 'RECIBIDA' && (
                <ActionButton
                  onClick={() => changeStatus('EN_EJECUCION')}
                  disabled={busy}
                  icon={<PlayCircle size={14} />}
                >
                  Iniciar ejecución
                </ActionButton>
              )}
              {order.status === 'EN_EJECUCION' && (
                <ActionButton
                  onClick={() =>
                    changeStatus('COMPLETADA', `¿Marcar ${order.orderNumber} como completada?`)
                  }
                  disabled={busy}
                  icon={<CheckCircle2 size={14} />}
                >
                  Marcar completada
                </ActionButton>
              )}
              <ActionButton
                onClick={() =>
                  changeStatus(
                    'CANCELADA',
                    `¿Cancelar ${order.orderNumber}? Esta acción es terminal.`,
                  )
                }
                disabled={busy}
                icon={<Ban size={14} />}
                danger
              >
                Cancelar
              </ActionButton>
            </div>
          )}
        </div>
        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      </div>

      {/* Scope snapshot */}
      <div className="mb-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        <div className="border-b border-[var(--border-color)] px-4 py-3">
          <span
            className="text-[var(--text-secondary)]"
            style={{
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            Alcance (copia de la cotización aceptada)
          </span>
        </div>
        {order.scopeLines.length === 0 ? (
          <p className="p-4 text-sm text-[var(--text-secondary)]">Sin líneas de alcance.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border-color)]">
                <tr>
                  {['Servicio', 'Cantidad', 'Precio unit.', 'Subtotal'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2 text-left text-[var(--text-secondary)]"
                      style={{
                        fontFamily: 'var(--font-ibm-plex-mono), monospace',
                        fontSize: 10,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {order.scopeLines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 font-medium text-[var(--text-primary)]">
                      {l.serviceName}
                    </td>
                    <td className="px-4 py-2 text-[var(--text-secondary)]">{Number(l.quantity)}</td>
                    <td className="px-4 py-2 text-[var(--text-secondary)]">
                      {formatCLP(l.unitPrice)}
                    </td>
                    <td className="px-4 py-2 font-medium text-[var(--text-primary)]">
                      {formatCLP(l.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* Amounts */}
        <div className="flex justify-end border-t border-[var(--border-color)] px-4 py-3">
          <div className="w-full max-w-xs space-y-1 text-sm">
            <Row label="Neto" value={formatCLP(order.netAmount)} />
            <Row label="IVA" value={formatCLP(order.taxAmount)} />
            <div className="border-t border-[var(--border-color)] pt-1">
              <Row label={`Total (${order.currency})`} value={formatCLP(order.totalAmount)} bold />
            </div>
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KV label="Estado" value={SERVICE_ORDER_STATUS_LABELS[order.status] ?? order.status} />
          <KV label="Creada" value={formatDate(order.createdAt)} />
          <KV label="Actualizada" value={formatDate(order.updatedAt)} />
        </div>
        {order.description && (
          <div className="mt-4 border-t border-[var(--border-color)] pt-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Descripción
            </p>
            <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
              {order.description}
            </p>
          </div>
        )}
        {order.notes && (
          <div className="mt-4 border-t border-[var(--border-color)] pt-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Notas
            </p>
            <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{order.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  icon,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm disabled:opacity-60"
      style={{ color: danger ? '#b91c1c' : 'var(--text-secondary)' }}
    >
      {icon} {children}
    </button>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span
        className={bold ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}
      >
        {value}
      </span>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </p>
      <p className="text-sm text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function Back() {
  return (
    <Link
      href="/operaciones/ordenes-de-servicio"
      className="mt-2 inline-block text-sm"
      style={{ color: '#2563eb' }}
    >
      ← Volver a Órdenes de Servicio
    </Link>
  );
}
