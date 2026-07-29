'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Download, Pencil, Plus, Power, Trash2, X } from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/api';
import type { EppItem } from '../../../../components/hsec/eppTypes';

/* HSEC-009 — Configuración: the "Catálogo EPP" section (the /operaciones/configuracion tab
 * idiom on a single page). Inactivate-not-delete when used: the referenced-item 409 surfaces
 * VERBATIM ('El elemento tiene entregas registradas; desactivalo en su lugar.'), as does the
 * duplicate-name 409. "Cargar catálogo chileno" hits the idempotent seed-defaults endpoint
 * and shows { created, total } inline. DIRECTOR RULING (HSEC-006): every mutation refetches
 * the shaped GET — response bodies discarded (the seed result line is display-only feedback,
 * not row state). */

const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

export default function HsecConfiguracionPage() {
  const [items, setItems] = useState<EppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  // Inline create + rename editors.
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const fetchItems = useCallback(() => {
    setLoading(true);
    apiClient
      .get<EppItem[]>('/api/hsec/epp-items')
      .then((data) => {
        setItems(data);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar el catálogo.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await apiClient.post('/api/hsec/epp-items', { name: newName.trim() });
      setNewName('');
      fetchItems(); // ruling: refetch
    } catch (e) {
      // Verbatim: the duplicate-name 409.
      setError(e instanceof ApiError ? e.message : 'No se pudo crear el elemento.');
    } finally {
      setCreating(false);
    }
  };

  const rename = async (item: EppItem) => {
    if (!editingName.trim() || editingName.trim() === item.name) {
      setEditingId(null);
      return;
    }
    setBusyId(item.id);
    setError(null);
    try {
      await apiClient.patch(`/api/hsec/epp-items/${item.id}`, { name: editingName.trim() });
      setEditingId(null);
      fetchItems(); // ruling: refetch
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo renombrar el elemento.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (item: EppItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      await apiClient.patch(`/api/hsec/epp-items/${item.id}`, { active: !item.active });
      fetchItems(); // ruling: refetch
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cambiar el estado.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: EppItem) => {
    if (!window.confirm(`¿Eliminar el elemento "${item.name}"? Esta acción no se puede deshacer.`))
      return;
    setBusyId(item.id);
    setError(null);
    try {
      await apiClient.delete(`/api/hsec/epp-items/${item.id}`);
      fetchItems(); // ruling: refetch
    } catch (e) {
      // Verbatim: 'El elemento tiene entregas registradas; desactivalo en su lugar.'
      setError(e instanceof ApiError ? e.message : 'No se pudo eliminar el elemento.');
    } finally {
      setBusyId(null);
    }
  };

  const seed = async () => {
    setError(null);
    setSeedResult(null);
    try {
      const res = await apiClient.post<{ created: number; total: number }>(
        '/api/hsec/epp-items/seed-defaults',
      );
      // Display-only feedback; the rows themselves come from the refetch (ruling).
      setSeedResult(`Catálogo chileno cargado: ${res.created} creados, ${res.total} en total.`);
      fetchItems();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar el catálogo chileno.');
    }
  };

  return (
    <div className="pt-2">
      <div className="mb-5 flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Configuración
        </h1>
      </div>

      <div className="max-w-3xl rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Catálogo EPP
          </h2>
          <button
            onClick={seed}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]"
          >
            <Download size={13} /> Cargar catálogo chileno
          </button>
        </div>

        {seedResult && <p className="mb-3 text-sm text-green-700">{seedResult}</p>}
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {/* Inline create row. */}
        <div className="mb-4 flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create();
            }}
            placeholder="Nuevo elemento (ej. Bloqueador solar)"
            className={INPUT}
          />
          <button
            onClick={create}
            disabled={creating || !newName.trim()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: '#2563eb' }}
          >
            <Plus size={14} /> Agregar
          </button>
        </div>

        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border-color)]">
            <tr>
              {['Nombre', 'Estado', ''].map((h, i) => (
                <th
                  key={i}
                  className="py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {loading ? (
              <tr>
                <td colSpan={3} className="py-6 text-center text-sm text-[var(--text-secondary)]">
                  Cargando…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-6 text-center text-sm text-[var(--text-secondary)]">
                  Catálogo vacío — usa &quot;Cargar catálogo chileno&quot; para partir.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 text-[var(--text-primary)]">
                    {editingId === item.id ? (
                      <span className="flex items-center gap-2">
                        <input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') rename(item);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className={INPUT}
                          autoFocus
                        />
                        <button
                          onClick={() => rename(item)}
                          className="text-green-700"
                          aria-label="Guardar nombre"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-[var(--text-secondary)]"
                          aria-label="Cancelar"
                        >
                          <X size={15} />
                        </button>
                      </span>
                    ) : (
                      item.name
                    )}
                  </td>
                  <td className="py-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={
                        item.active
                          ? { background: 'rgba(34,197,94,0.12)', color: '#15803d' }
                          : { background: 'rgba(100,116,139,0.14)', color: '#475569' }
                      }
                    >
                      {item.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <span className="inline-flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingId(item.id);
                          setEditingName(item.name);
                        }}
                        disabled={busyId === item.id}
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                        aria-label={`Renombrar ${item.name}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => toggleActive(item)}
                        disabled={busyId === item.id}
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                        aria-label={
                          item.active ? `Desactivar ${item.name}` : `Activar ${item.name}`
                        }
                        title={item.active ? 'Desactivar' : 'Activar'}
                      >
                        <Power size={14} />
                      </button>
                      <button
                        onClick={() => remove(item)}
                        disabled={busyId === item.id}
                        className="text-[var(--text-secondary)] hover:text-red-600 disabled:opacity-50"
                        aria-label={`Eliminar ${item.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
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
