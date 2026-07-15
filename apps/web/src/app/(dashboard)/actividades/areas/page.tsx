'use client';

/* CAL-002 — Áreas config screen. The area catalog: list (nombre · swatch · estado),
 * create/edit modal (fixed color palette), activar/desactivar toggle, eliminar con
 * confirmación. Write affordances gate on useCanWriteActividades('activityArea')
 * (MANAGER/ADMIN/SUPER_ADMIN); ACCOUNTANT/ANALYST/VIEWER get the FULL read-only view — a
 * platform first: a config screen VIEWER can see. Backend errors (esp. the duplicate-name
 * 409) shown verbatim. Tokens: accent #2563eb, Outfit, glassmorphism. */
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/api';
import { useCanWriteActividades } from '../../../../hooks/useActividadesPermissions';
import { AreaFormModal, AreaForForm } from '../../../../components/actividades/AreaFormModal';

interface AreaRow {
  id: string;
  name: string;
  color: string | null;
  active: boolean;
  updatedAt: string;
}

export default function ActividadesAreasPage() {
  const canWrite = useCanWriteActividades('activityArea');
  const [rows, setRows] = useState<AreaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AreaForForm | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchAreas = useCallback(() => {
    setLoading(true);
    apiClient
      .get<AreaRow[]>('/api/actividades/areas')
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch(() => setError('No se pudieron cargar las áreas.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAreas();
  }, [fetchAreas]);

  const toggleActive = async (a: AreaRow) => {
    setBusyId(a.id);
    setError(null);
    try {
      await apiClient.patch(`/api/actividades/areas/${a.id}`, { active: !a.active });
      fetchAreas();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cambiar el estado del área.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (a: AreaRow) => {
    if (!window.confirm(`¿Eliminar el área "${a.name}"? Esta acción no se puede deshacer.`)) return;
    setBusyId(a.id);
    setError(null);
    try {
      await apiClient.delete(`/api/actividades/areas/${a.id}`);
      fetchAreas();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo eliminar el área.');
    } finally {
      setBusyId(null);
    }
  };

  const Header = (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Áreas
        </h1>
      </div>
      {canWrite && (
        <button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: '#2563eb' }}
        >
          <Plus size={16} /> Nueva área
        </button>
      )}
    </div>
  );

  const cols = canWrite ? 4 : 3;

  return (
    <div className="pt-2">
      {Header}
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Catálogo de áreas para organizar las actividades del calendario. Las áreas inactivas no
        aparecen en los formularios, pero sus actividades siguen visibles.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border-color)] bg-gray-50">
            <tr>
              {['Nombre', 'Color', 'Estado'].map((h) => (
                <th
                  key={h}
                  className="label px-4 py-3 text-left text-[11px] uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  {h}
                </th>
              ))}
              {canWrite && (
                <th className="label px-4 py-3 text-right text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: cols }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-24 rounded bg-gray-200" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={cols}
                  className="px-4 py-10 text-center text-sm text-[var(--text-secondary)]"
                >
                  No hay áreas registradas.
                  {canWrite && ' Crea la primera con «Nueva área».'}
                </td>
              </tr>
            ) : (
              rows.map((a) => (
                <tr key={a.id} className={a.active ? '' : 'opacity-60'}>
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{a.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-block h-4 w-4 rounded-full border border-[var(--border-color)]"
                      style={{ background: a.color ?? 'transparent' }}
                      title={a.color ?? 'Sin color'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={
                        a.active
                          ? { background: 'rgba(34,197,94,0.12)', color: '#15803d' }
                          : { background: 'rgba(100,116,139,0.12)', color: '#475569' }
                      }
                    >
                      {a.active ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditing({ id: a.id, name: a.name, color: a.color });
                            setModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                          <Pencil size={13} /> Editar
                        </button>
                        <button
                          onClick={() => toggleActive(a)}
                          disabled={busyId === a.id}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60"
                        >
                          <Power size={13} /> {a.active ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          onClick={() => remove(a)}
                          disabled={busyId === a.id}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          <Trash2 size={13} /> Eliminar
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <AreaFormModal
          editing={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            fetchAreas();
          }}
        />
      )}
    </div>
  );
}
