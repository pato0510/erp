'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Paperclip, Plus } from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/api';
import { EppDeliveryFormModal } from '../../../../components/hsec/EppDeliveryFormModal';
import { formatIncidentDate } from '../../../../components/hsec/incidentTypes';
import type { RosterEntry } from '../../../../components/hsec/incidentTypes';
import type { EppDeliveryListRow, EppItem } from '../../../../components/hsec/eppTypes';

/* HSEC-009 — EPP deliveries list. Empleado is SERVER-side (?employeeId via the roster
 * select); the date range is CLIENT-side over the fetched set. Row click → detail. DIRECTOR
 * RULING (HSEC-006): every mutation refetches the shaped GET — response bodies discarded
 * (the create modal's id-for-navigation exception applies). */

function truncate(text: string, n = 40): string {
  return text.length > n ? text.slice(0, n - 1) + '…' : text;
}

export default function HsecEppPage() {
  const router = useRouter();
  const [rows, setRows] = useState<EppDeliveryListRow[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [items, setItems] = useState<EppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [empleado, setEmpleado] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const fetchList = useCallback(() => {
    setLoading(true);
    const qs = empleado ? `?employeeId=${empleado}` : '';
    apiClient
      .get<EppDeliveryListRow[]>(`/api/hsec/epp-deliveries${qs}`)
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : 'No se pudieron cargar las entregas.'),
      )
      .finally(() => setLoading(false));
  }, [empleado]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    apiClient
      .get<RosterEntry[]>('/api/hsec/roster')
      .then(setRoster)
      .catch(() => setRoster([]));
    apiClient
      .get<EppItem[]>('/api/hsec/epp-items')
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  /* Client-side date range — ISO day-slice comparison; no local-zone Date render. */
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const day = r.date.slice(0, 10);
      if (desde && day < desde) return false;
      if (hasta && day > hasta) return false;
      return true;
    });
  }, [rows, desde, hasta]);

  const SELECT =
    'rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm text-[var(--text-primary)]';

  return (
    <div className="pt-2">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
          <h1
            className="text-2xl font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            Entregas de EPP
          </h1>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: '#2563eb' }}
        >
          <Plus size={16} /> Nueva entrega
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={empleado}
          onChange={(e) => setEmpleado(e.target.value)}
          className={SELECT}
          aria-label="Empleado"
        >
          <option value="">Empleado: todos</option>
          {roster.map((r) => (
            <option key={r.employeeId} value={r.employeeId}>
              {r.fullName}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          className={SELECT}
          aria-label="Desde"
        />
        <span className="text-xs text-[var(--text-secondary)]">→</span>
        <input
          type="date"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          className={SELECT}
          aria-label="Hasta"
        />
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-[var(--border-color)] bg-gray-50 dark:bg-white/5">
            <tr>
              {['Fecha', 'Empleado', 'Elementos', 'Acuse', 'Notas'].map((h, i) => (
                <th
                  key={i}
                  className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-sm text-[var(--text-secondary)]"
                >
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-sm text-[var(--text-secondary)]"
                >
                  No hay entregas que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/hsec/epp/${r.id}`)}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <td className="px-3 py-2.5 text-[var(--text-primary)]">
                    {formatIncidentDate(r.date)}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-[var(--text-primary)]">
                    {r.fullName ?? r.employeeId}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text-primary)]">{r.linesCount}</td>
                  <td className="px-3 py-2.5">
                    {r.fileName ? (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                        <Paperclip size={13} /> Sí
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--text-secondary)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                    {r.notes ? truncate(r.notes) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <EppDeliveryFormModal
          editing={null}
          roster={roster}
          items={items}
          onClose={() => setModalOpen(false)}
          onSaved={(id) => {
            setModalOpen(false);
            router.push(`/hsec/epp/${id}`);
          }}
        />
      )}
    </div>
  );
}
