'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { formatCLP } from '../../lib/formatters';
import { ServiceLineModal, type CatalogService, type LineForForm } from './ServiceLineModal';

/* COM-007b — "Servicios": the opportunity's service bundle (COM-006 backend on
   screen). Self-loading. Renders the lines + the derived TOTAL (Σ qty × price), which
   IS the opportunity's estimatedValue while lines exist. Every rule lives in the
   backend; this UI renders it and relays 4xx messages:
     - canEdit (writers AND not closed) → Agregar / Editar / Quitar.
     - closed (GANADA/PERDIDA) → lines + total shown, NO controls, a historical note.
     - EN_PAUSA is not closed → editable (backend rule).
   After every mutation it reloads its lines AND calls onChanged() so the parent
   refreshes the opportunity (the derived estimatedValue changed). */

interface BundleLine {
  id: string;
  serviceId: string;
  quantity: string;
  unitPrice: string;
  notes: string | null;
}

export function OpportunityBundle({
  opportunityId,
  canEdit,
  closed,
  onChanged,
}: {
  opportunityId: string;
  canEdit: boolean;
  closed: boolean;
  onChanged: () => void;
}) {
  const [lines, setLines] = useState<BundleLine[]>([]);
  const [catalog, setCatalog] = useState<CatalogService[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [modal, setModal] = useState<{ editing: LineForForm | null } | null>(null);

  const loadLines = useCallback(
    () =>
      apiClient
        .get<BundleLine[]>(`/api/comercial/opportunities/${opportunityId}/services`)
        .then(setLines),
    [opportunityId],
  );

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [rows, cat] = await Promise.all([
        apiClient.get<BundleLine[]>(`/api/comercial/opportunities/${opportunityId}/services`),
        apiClient
          .get<CatalogService[]>('/api/comercial/service-catalog')
          .catch(() => [] as CatalogService[]),
      ]);
      setLines(rows);
      setCatalog(cat);
      setState('ok');
    } catch {
      setState('error');
    }
  }, [opportunityId]);

  useEffect(() => {
    load();
  }, [load]);

  const catalogById = useMemo(() => {
    const m = new Map<string, CatalogService>();
    catalog.forEach((c) => m.set(c.id, c));
    return m;
  }, [catalog]);
  const activeCatalog = useMemo(() => catalog.filter((c) => c.isActive), [catalog]);
  const existingServiceIds = useMemo(() => lines.map((l) => l.serviceId), [lines]);

  const total = lines.reduce((acc, l) => acc + Number(l.quantity) * Number(l.unitPrice), 0);

  const afterMutation = async () => {
    await loadLines();
    onChanged(); // the derived estimatedValue changed — refresh the opp header
  };

  const remove = async (l: BundleLine) => {
    const name = catalogById.get(l.serviceId)?.name ?? 'este servicio';
    if (!window.confirm(`¿Quitar “${name}” del paquete?`)) return;
    try {
      await apiClient.delete(`/api/comercial/opportunities/${opportunityId}/services/${l.id}`);
      await afterMutation();
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : 'No se pudo quitar el servicio.');
    }
  };

  const serviceName = (l: BundleLine) => {
    const s = catalogById.get(l.serviceId);
    if (!s) return 'Servicio';
    return s.name + (s.isActive ? '' : ' (inactivo)');
  };

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2
          className="text-sm font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Servicios
        </h2>
        {canEdit && (
          <button
            onClick={() => setModal({ editing: null })}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white"
            style={{ background: '#2563eb' }}
          >
            <Plus size={15} /> Agregar servicio
          </button>
        )}
      </div>

      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        {state === 'loading' ? (
          <p className="p-5 text-sm text-[var(--text-secondary)]">Cargando servicios…</p>
        ) : state === 'error' ? (
          <p className="p-5 text-sm text-red-600">No se pudo cargar el paquete de servicios.</p>
        ) : lines.length === 0 ? (
          <p className="p-5 text-sm text-[var(--text-secondary)]">
            Este paquete aún no tiene servicios.
            {closed && ' El paquete de una oportunidad cerrada es un registro histórico.'}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border-color)] bg-black/[0.02]">
                  <tr>
                    {['Servicio', 'Cantidad', 'Precio unit.', 'Subtotal', 'Notas'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--text-secondary)]"
                      >
                        {h}
                      </th>
                    ))}
                    {canEdit && <th className="px-4 py-2.5" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {lines.map((l) => {
                    const s = catalogById.get(l.serviceId);
                    const subtotal = Number(l.quantity) * Number(l.unitPrice);
                    return (
                      <tr key={l.id}>
                        <td className="px-4 py-3">
                          <span className="font-medium text-[var(--text-primary)]">
                            {serviceName(l)}
                          </span>
                          {s?.code && (
                            <span className="ml-2 font-mono text-[11px] text-[var(--text-secondary)]">
                              {s.code}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {Number(l.quantity)}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {formatCLP(l.unitPrice)}
                        </td>
                        <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                          {formatCLP(subtotal)}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{l.notes ?? '—'}</td>
                        {canEdit && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() =>
                                  setModal({
                                    editing: {
                                      id: l.id,
                                      serviceId: l.serviceId,
                                      serviceName: serviceName(l),
                                      quantity: l.quantity,
                                      unitPrice: l.unitPrice,
                                      notes: l.notes,
                                    },
                                  })
                                }
                                className="rounded-md border border-[var(--border-color)] p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                title="Editar"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => remove(l)}
                                className="rounded-md border border-[var(--border-color)] p-1 text-red-600 hover:bg-red-50"
                                title="Quitar"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Derived total — this IS the opportunity's value while lines exist. */}
            <div className="flex items-center justify-between gap-3 border-t border-[var(--border-color)] px-4 py-3">
              <p className="text-xs text-[var(--text-secondary)]">
                El valor se calcula del paquete de servicios
              </p>
              <div className="text-right">
                <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                  Total del paquete
                </p>
                <p
                  className="text-lg font-semibold text-[var(--text-primary)]"
                  style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
                >
                  {formatCLP(total)}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {closed && lines.length > 0 && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
          <Lock size={11} /> El paquete de una oportunidad cerrada es un registro histórico.
        </p>
      )}

      {modal && (
        <ServiceLineModal
          opportunityId={opportunityId}
          editing={modal.editing}
          catalog={activeCatalog}
          existingServiceIds={existingServiceIds}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            afterMutation();
          }}
        />
      )}
    </div>
  );
}

export default OpportunityBundle;
