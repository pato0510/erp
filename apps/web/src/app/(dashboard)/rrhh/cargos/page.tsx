'use client';

/* HR-002 — Cargos (job_positions) CRUD. Self-contained: table + filters +
 * create/edit modal + deactivate. Clones the movimientos table markup and the
 * standard modal overlay; imports nothing that hard-codes /api/operations/*.
 * Tokens: accent #2563eb, Outfit headings. */
import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Ban, X } from 'lucide-react';
import { apiClient } from '../../../../lib/api';

const AREAS = [
  'OPERACIONES',
  'ADMINISTRACION',
  'COMERCIAL',
  'GERENCIA',
  'FINANZAS',
  'PREVENCION_RIESGOS',
  'MANTENIMIENTO',
  'RRHH',
] as const;

const AREA_LABELS: Record<string, string> = {
  OPERACIONES: 'Operaciones',
  ADMINISTRACION: 'Administración',
  COMERCIAL: 'Comercial',
  GERENCIA: 'Gerencia',
  FINANZAS: 'Finanzas',
  PREVENCION_RIESGOS: 'Prevención de Riesgos',
  MANTENIMIENTO: 'Mantenimiento',
  RRHH: 'RRHH',
};

interface JobPosition {
  id: string;
  name: string;
  area: string;
  description: string | null;
  requiredCertTypes: string[];
  requiredDocTypes: string[];
  enabledServices: string[];
  active: boolean;
}

interface FormState {
  name: string;
  area: string;
  description: string;
  requiredCertTypes: string[];
  requiredDocTypes: string[];
  enabledServices: string[];
  active: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  area: 'OPERACIONES',
  description: '',
  requiredCertTypes: [],
  requiredDocTypes: [],
  enabledServices: [],
  active: true,
};

export default function CargosPage() {
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<JobPosition | null>(null);

  const fetchPositions = useCallback(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (areaFilter) params.set('area', areaFilter);
    if (activeFilter) params.set('active', activeFilter);
    const qs = params.toString();
    apiClient
      .get<JobPosition[]>(`/api/rrhh/job-positions${qs ? `?${qs}` : ''}`)
      .then((data) => {
        setPositions(data);
        setError(null);
      })
      .catch(() => setError('No se pudieron cargar los cargos.'))
      .finally(() => setIsLoading(false));
  }, [areaFilter, activeFilter]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (p: JobPosition) => {
    setEditing(p);
    setModalOpen(true);
  };

  const deactivate = async (p: JobPosition) => {
    if (!window.confirm(`¿Desactivar el cargo "${p.name}"?`)) return;
    try {
      await apiClient.delete(`/api/rrhh/job-positions/${p.id}`);
      fetchPositions();
    } catch {
      window.alert('No se pudo desactivar el cargo.');
    }
  };

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
          <h1
            className="text-2xl font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            Cargos
          </h1>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: '#2563eb' }}
        >
          <Plus size={16} /> Nuevo cargo
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          <option value="">Todas las áreas</option>
          {AREAS.map((a) => (
            <option key={a} value={a}>
              {AREA_LABELS[a]}
            </option>
          ))}
        </select>
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          <option value="">Todos los estados</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-[var(--border-color)]">
            <tr>
              {['Nombre', 'Área', 'Certs', 'Docs', 'Servicios', 'Estado'].map((h) => (
                <th
                  key={h}
                  className="label text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  {h}
                </th>
              ))}
              <th className="label text-right px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-20 rounded bg-gray-200" />
                    </td>
                  ))}
                </tr>
              ))
            ) : positions.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-sm text-[var(--text-secondary)]"
                >
                  No hay cargos registrados.
                </td>
              </tr>
            ) : (
              positions.map((p) => (
                <tr key={p.id} className="hover:bg-black/[0.02]">
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{p.name}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {AREA_LABELS[p.area] ?? p.area}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {p.requiredCertTypes.length}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {p.requiredDocTypes.length}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {p.enabledServices.length}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={
                        p.active
                          ? { background: 'rgba(34,197,94,0.12)', color: '#15803d' }
                          : { background: 'rgba(100,116,139,0.12)', color: '#475569' }
                      }
                    >
                      {p.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(p)}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        <Pencil size={13} /> Editar
                      </button>
                      {p.active && (
                        <button
                          onClick={() => deactivate(p)}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          <Ban size={13} /> Desactivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <CargoModal
          initial={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            fetchPositions();
          }}
        />
      )}
    </div>
  );
}

function CargoModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: JobPosition | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          name: initial.name,
          area: initial.area,
          description: initial.description ?? '',
          requiredCertTypes: initial.requiredCertTypes,
          requiredDocTypes: initial.requiredDocTypes,
          enabledServices: initial.enabledServices,
          active: initial.active,
        }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!form.name.trim()) {
      setErr('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setErr(null);
    const body = {
      name: form.name.trim(),
      area: form.area,
      description: form.description.trim() || undefined,
      requiredCertTypes: form.requiredCertTypes,
      requiredDocTypes: form.requiredDocTypes,
      enabledServices: form.enabledServices,
      active: form.active,
    };
    try {
      if (initial) {
        await apiClient.patch(`/api/rrhh/job-positions/${initial.id}`, body);
      } else {
        await apiClient.post('/api/rrhh/job-positions', body);
      }
      onSaved();
    } catch {
      setErr('No se pudo guardar el cargo.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            {initial ? 'Editar cargo' : 'Nuevo cargo'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <Field label="Nombre">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
              placeholder="Ej. Piloto de Drone"
            />
          </Field>
          <Field label="Área">
            <select
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {AREA_LABELS[a]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Descripción">
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </Field>
          <TagField
            label="Certificaciones requeridas"
            values={form.requiredCertTypes}
            onChange={(v) => setForm({ ...form, requiredCertTypes: v })}
          />
          <TagField
            label="Documentos requeridos"
            values={form.requiredDocTypes}
            onChange={(v) => setForm({ ...form, requiredDocTypes: v })}
          />
          <TagField
            label="Servicios habilitados"
            values={form.enabledServices}
            onChange={(v) => setForm({ ...form, enabledServices: v })}
          />
          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Activo
          </label>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)]"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: '#2563eb' }}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </label>
      {children}
    </div>
  );
}

/* Lightweight tag input — type + Enter (or comma) to add a chip. Backing value
 * is a free String[] (validated against catalogs in later RRHH tickets). */
function TagField({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setDraft('');
  };
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
            style={{ background: 'rgba(37,99,235,0.1)', color: '#2563eb' }}
          >
            {v}
            <button
              onClick={() => onChange(values.filter((x) => x !== v))}
              aria-label={`Quitar ${v}`}
            >
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="Escribe y presiona Enter"
        className="mt-1.5 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
      />
    </Field>
  );
}
