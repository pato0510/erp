'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Users, TrendingUp, Building2, Clock } from 'lucide-react';
import { KpiCard } from '../../../../components/operations/dashboard/KpiCard';
import { apiClient } from '../../../../lib/api';
import { formatCLP, formatDate, formatRUT } from '../../../../lib/formatters';

/* ---- API shapes -------------------------------------------------- */

interface ClientRow {
  counterpartyId: string;
  name: string;
  taxId: string;
  email: string;
  oportunidades: number;
  valorPipeline: number | string;
  ultimaActividad: string | null;
}

/* ---- Helpers ----------------------------------------------------- */

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-[rgba(128,128,128,0.12)] ${className}`} />
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="py-10 text-center text-sm text-[var(--text-secondary)]">{text}</p>
  );
}

/* ---- Page -------------------------------------------------------- */

export default function ComercialClientesPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    apiClient
      .get<ClientRow[]>('/api/comercial/clients')
      .then((data) => setClients(data))
      .catch(() => setError('No se pudieron cargar los clientes.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.trim().toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.taxId || '').toLowerCase().replace(/[.\-\s]/g, '').includes(q.replace(/[.\-\s]/g, '')),
    );
  }, [clients, search]);

  /* KPI aggregates */
  const totalClientes = clients.length;
  const totalPipeline = clients.reduce((sum, c) => sum + Number(c.valorPipeline ?? 0), 0);
  const conOportunidades = clients.filter((c) => c.oportunidades > 0).length;
  const conActividad = clients.filter((c) => c.ultimaActividad != null).length;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 11,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: '#2563eb',
          }}
        >
          Comercial · Clientes
        </span>
        <h1
          className="mt-1 text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
        >
          Clientes
        </h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
          Base de clientes y oportunidades de negocio
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <KpiCard
              label="Total clientes"
              value={String(totalClientes)}
              subtitle="Contrapartes registradas"
              icon={Users}
            />
            <KpiCard
              label="Valor pipeline total"
              value={formatCLP(totalPipeline)}
              subtitle="Suma de oportunidades abiertas"
              icon={TrendingUp}
              valueColor="#2563eb"
            />
            <KpiCard
              label="Con oportunidades"
              value={String(conOportunidades)}
              subtitle="Clientes en pipeline activo"
              icon={Building2}
            />
            <KpiCard
              label="Con actividad"
              value={String(conActividad)}
              subtitle="Al menos una interacción"
              icon={Clock}
            />
          </>
        )}
      </div>

      {/* Search */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
          />
          <input
            type="text"
            placeholder="Buscar por nombre o RUT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
          />
        </div>
        {!loading && (
          <span className="text-xs text-[var(--text-secondary)]">
            {filtered.length} de {clients.length} cliente{clients.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border-color)] bg-[rgba(128,128,128,0.04)]">
              <tr>
                {['Cliente', 'RUT', 'Email', '# Oportunidades', 'Valor pipeline', 'Última actividad'].map(
                  (col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
                    >
                      {col}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-[rgba(128,128,128,0.12)] w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyHint
                      text={
                        search
                          ? `Sin resultados para "${search}".`
                          : 'No hay clientes registrados aún.'
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((client) => (
                  <tr
                    key={client.counterpartyId}
                    onClick={() => router.push(`/comercial/clientes/${client.counterpartyId}`)}
                    className="cursor-pointer transition-colors hover:bg-[rgba(37,99,235,0.04)]"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                      {client.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
                      {client.taxId ? formatRUT(client.taxId) : '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {client.email || '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {client.oportunidades > 0 ? (
                        <span className="inline-flex items-center justify-center rounded-full bg-[rgba(37,99,235,0.1)] px-2.5 py-0.5 text-xs font-semibold text-[#2563eb]">
                          {client.oportunidades}
                        </span>
                      ) : (
                        <span className="text-[var(--text-secondary)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                      {Number(client.valorPipeline) > 0
                        ? formatCLP(Number(client.valorPipeline))
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {client.ultimaActividad ? formatDate(client.ultimaActividad) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
