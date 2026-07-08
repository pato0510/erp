'use client';

/* COM-013a — "Órdenes de Servicio": the read-only list of service orders (the work a won
   Comercial deal becomes). Orders are BORN from the COM-013b handoff — there is NO create
   UI here. Mirrors the operations list screens (tokens: var(--bg-card)/--border-color/
   --text-*, Outfit headings, #2563eb accent). Row → dedicated [id] detail page (the
   operations convention). Reads are open to every role; the status machine (on the detail
   page) is management-only. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Search } from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { formatCLP, formatDate } from '../../../../lib/formatters';
import {
  SERVICE_ORDER_STATUSES,
  SERVICE_ORDER_STATUS_LABELS,
  ServiceOrderStatusBadge,
} from '../../../../components/operations/ServiceOrderStatusBadge';

interface ServiceOrderRow {
  id: string;
  orderNumber: string;
  status: string;
  clientName: string;
  title: string;
  totalAmount: string;
  createdAt: string;
  sourceOpportunityId: string | null;
}

const INPUT =
  'rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)]';

export default function ServiceOrdersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ServiceOrderRow[]>([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  const load = useCallback(() => {
    setState('loading');
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search.trim()) params.set('search', search.trim());
    const qs = params.toString();
    apiClient
      .get<ServiceOrderRow[]>(`/api/operations/service-orders${qs ? `?${qs}` : ''}`)
      .then((data) => {
        setRows(data);
        setState('ok');
      })
      .catch(() => setState('error'));
  }, [status, search]);

  useEffect(() => {
    load();
  }, [load]);

  const hasFilters = useMemo(() => !!status || !!search.trim(), [status, search]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="ops-breadcrumb">Operaciones / Órdenes de Servicio</div>
        <h1
          className="text-[var(--text-primary)]"
          style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 600,
            fontSize: 28,
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          Órdenes de Servicio
        </h1>
        <p
          className="mt-1"
          style={{
            fontFamily: 'var(--font-ibm-plex-mono), monospace',
            fontSize: 11,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
          }}
        >
          Trabajos contratados originados en oportunidades ganadas
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por N° / cliente / título…"
            className={`${INPUT} min-w-[260px] pl-9`}
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={INPUT}>
          <option value="">Todos los estados</option>
          {SERVICE_ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SERVICE_ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => {
              setStatus('');
              setSearch('');
            }}
            className="text-sm text-[var(--text-secondary)] underline-offset-2 hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border-color)]">
            <tr>
              {['N°', 'Cliente', 'Título', 'Estado', 'Total', 'Creada'].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-[var(--text-secondary)]"
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
            {state === 'loading' ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-20 rounded bg-[var(--border-color)]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : state === 'error' ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-red-600">
                  No se pudieron cargar las órdenes de servicio.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-sm text-[var(--text-secondary)]"
                >
                  <ClipboardList size={22} className="mx-auto mb-2 opacity-40" />
                  No hay órdenes de servicio{hasFilters ? ' para ese filtro' : ' todavía'}.
                </td>
              </tr>
            ) : (
              rows.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => router.push(`/operaciones/ordenes-de-servicio/${o.id}`)}
                  className="cursor-pointer hover:bg-black/[0.02]"
                >
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-[var(--text-primary)]">
                    {o.orderNumber}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-primary)]">{o.clientName}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{o.title}</td>
                  <td className="px-4 py-3">
                    <ServiceOrderStatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                    {formatCLP(o.totalAmount)}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {formatDate(o.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
