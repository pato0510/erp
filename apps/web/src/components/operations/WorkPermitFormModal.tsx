'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Box,
  ClipboardList,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { apiClient } from '../../lib/api';

type WorkPermitCategory =
  | 'HEIGHT_WORK'
  | 'HOT_WORK'
  | 'CONFINED_SPACE'
  | 'LOCKOUT_TAGOUT'
  | 'EXCAVATION'
  | 'LIFTING'
  | 'ELECTRICAL_WORK'
  | 'CHEMICAL_HANDLING'
  | 'OTHER';

interface WorkPermitTypeOption {
  id: string;
  name: string;
  code: string;
  category: WorkPermitCategory;
  description?: string | null;
  maxDurationHours: number;
  requiredRoles: string[];
  requiresMedicalAptitude: boolean;
  requiresSpecificTraining: boolean;
  requiresGasMeasurement: boolean;
  requiresIsolation: boolean;
  defaultRisks: string[];
  defaultControls: string[];
  icon?: string | null;
  color?: string | null;
  isActive: boolean;
}

interface AssetOption {
  id: string;
  code: string;
  name: string;
}

interface LocationOption {
  id: string;
  name: string;
  code?: string | null;
}

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
}

interface TeamMember {
  /* Local-only id used as the React key. */
  rowId: string;
  userId?: string;
  name: string;
  role: string;
  isInternal: boolean;
}

const CATEGORY_LABELS: Record<WorkPermitCategory, string> = {
  HEIGHT_WORK: 'Trabajo en altura',
  HOT_WORK: 'Trabajo en caliente',
  CONFINED_SPACE: 'Espacio confinado',
  LOCKOUT_TAGOUT: 'Bloqueo y tarjeteo (LOTO)',
  EXCAVATION: 'Excavación',
  LIFTING: 'Izaje de cargas',
  ELECTRICAL_WORK: 'Eléctrico',
  CHEMICAL_HANDLING: 'Manejo de químicos',
  OTHER: 'Otro',
};

interface Props {
  defaultAssetId?: string;
  onClose: () => void;
  onCreated: (permitId: string, submitted: boolean) => void;
}

let rowSeq = 0;
const newRowId = () => `r${++rowSeq}-${Date.now()}`;

/* OPS-025 — multi-section modal for issuing internal work permits.
   Sections in order: Type → Work → Schedule → Team → Risks →
   Controls → Conditional (gas / isolation) → Notes. The "Submit"
   button calls POST /work-permits with submitImmediately:true so
   the permit lands in PENDING_AUTHORIZATION. "Save as draft"
   saves with submitImmediately:false. */
export function WorkPermitFormModal({ defaultAssetId, onClose, onCreated }: Props) {
  const [permitTypes, setPermitTypes] = useState<WorkPermitTypeOption[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [catalogsLoaded, setCatalogsLoaded] = useState(false);

  const [permitTypeId, setPermitTypeId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [workLocation, setWorkLocation] = useState('');
  const [assetId, setAssetId] = useState(defaultAssetId ?? '');
  const [locationId, setLocationId] = useState('');
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [team, setTeam] = useState<TeamMember[]>([
    { rowId: newRowId(), name: '', role: '', isInternal: false },
  ]);
  const [risks, setRisks] = useState<string[]>([]);
  const [controls, setControls] = useState<string[]>([]);
  const [additionalNotes, setAdditionalNotes] = useState('');

  const [submitting, setSubmitting] = useState<false | 'draft' | 'review'>(false);
  const [error, setError] = useState<string | null>(null);

  /* Load catalogs once. Failures swallow into empty selectors so the
     modal still renders. */
  useEffect(() => {
    let alive = true;
    Promise.all([
      apiClient.get<WorkPermitTypeOption[]>('/api/operations/work-permit-types'),
      apiClient.get<{ data: AssetOption[] }>('/api/operations/assets?limit=100'),
      apiClient.get<LocationOption[]>('/api/operations/locations'),
      apiClient.get<UserOption[]>('/api/users'),
    ])
      .then(([t, a, l, u]) => {
        if (!alive) return;
        setPermitTypes(t.filter((x) => x.isActive));
        setAssets(a.data ?? []);
        setLocations(l ?? []);
        setUsers(u.filter((x) => x.isActive));
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setCatalogsLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const selectedType = useMemo(
    () => permitTypes.find((p) => p.id === permitTypeId),
    [permitTypes, permitTypeId],
  );

  /* Pre-fill risks + controls when permit type changes. We don't
     overwrite once the user has edited (length differs from defaults). */
  useEffect(() => {
    if (!selectedType) return;
    setRisks((prev) => (prev.length === 0 ? [...selectedType.defaultRisks] : prev));
    setControls((prev) => (prev.length === 0 ? [...selectedType.defaultControls] : prev));
  }, [selectedType?.id]);

  const plannedHours = useMemo(() => {
    if (!plannedStart || !plannedEnd) return 0;
    const a = new Date(plannedStart).getTime();
    const b = new Date(plannedEnd).getTime();
    if (Number.isNaN(a) || Number.isNaN(b) || a >= b) return 0;
    return Math.round(((b - a) / 3_600_000) * 10) / 10;
  }, [plannedStart, plannedEnd]);

  const exceedsMax = !!selectedType && plannedHours > selectedType.maxDurationHours;

  const validate = (): string | null => {
    if (!permitTypeId) return 'Selecciona un tipo de permiso.';
    if (!title.trim() || title.trim().length < 3) return 'Ingresa un título descriptivo.';
    if (!description.trim() || description.trim().length < 3) return 'Describe el trabajo.';
    if (!plannedStart) return 'Define la fecha y hora de inicio planificado.';
    if (!plannedEnd) return 'Define la fecha y hora de término planificado.';
    if (new Date(plannedStart) >= new Date(plannedEnd)) {
      return 'La fecha de inicio debe ser anterior a la de término.';
    }
    if (exceedsMax) {
      return `La duración (${plannedHours}h) excede el máximo permitido para este tipo (${selectedType?.maxDurationHours}h).`;
    }
    if (!supervisorId) return 'Designa un supervisor responsable.';
    const cleanTeam = team.filter((m) => m.name.trim().length > 0);
    if (cleanTeam.length === 0) return 'El equipo de trabajo debe tener al menos una persona.';
    if (assetId && locationId)
      return 'Asocia el permiso a un activo o a una ubicación, no a ambos.';
    return null;
  };

  const buildPayload = () => {
    const cleanTeam = team
      .filter((m) => m.name.trim().length > 0)
      .map((m) => ({
        userId: m.isInternal && m.userId ? m.userId : undefined,
        name: m.name.trim(),
        role: m.role.trim() || undefined,
      }));
    return {
      permitTypeId,
      title: title.trim(),
      description: description.trim(),
      workLocation: workLocation.trim() || undefined,
      assetId: assetId || undefined,
      locationId: locationId || undefined,
      plannedStart: new Date(plannedStart).toISOString(),
      plannedEnd: new Date(plannedEnd).toISOString(),
      supervisorId,
      workTeam: cleanTeam,
      identifiedRisks: risks.filter((r) => r.trim()),
      controlMeasures: controls.filter((c) => c.trim()),
      additionalNotes: additionalNotes.trim() || undefined,
    };
  };

  const submit = async (mode: 'draft' | 'review') => {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(mode);
    try {
      const result = await apiClient.post<{ id: string }>('/api/operations/work-permits', {
        ...buildPayload(),
        submitImmediately: mode === 'review',
      });
      onCreated(result.id, mode === 'review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el permiso.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateTeamRow = (rowId: string, patch: Partial<TeamMember>) => {
    setTeam((prev) => prev.map((m) => (m.rowId === rowId ? { ...m, ...patch } : m)));
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-card)] z-10">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            Nuevo permiso de trabajo
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* SECTION 1 — Type */}
          <Section title="1. Tipo de permiso" icon={ShieldCheck}>
            <select
              value={permitTypeId}
              onChange={(e) => setPermitTypeId(e.target.value)}
              className="cp-input"
            >
              <option value="">— Selecciona un tipo —</option>
              {permitTypes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
            {selectedType && (
              <div
                className="mt-2 p-3 rounded-lg text-xs"
                style={{
                  background: 'rgba(37, 99, 235, 0.06)',
                  border: '1px solid rgba(37, 99, 235, 0.2)',
                }}
              >
                <div className="text-[var(--text-secondary)]">
                  {CATEGORY_LABELS[selectedType.category]} · max {selectedType.maxDurationHours}h ·
                  Roles autorizadores: {selectedType.requiredRoles.join(', ') || '—'}
                </div>
                {selectedType.description && (
                  <div className="mt-1 text-[var(--text-muted)]">{selectedType.description}</div>
                )}
                <div className="mt-1 flex flex-wrap gap-2 text-[var(--text-muted)]">
                  {selectedType.requiresMedicalAptitude && <Badge>Aptitud médica</Badge>}
                  {selectedType.requiresSpecificTraining && <Badge>Capacitación</Badge>}
                  {selectedType.requiresGasMeasurement && <Badge>Medición de gases</Badge>}
                  {selectedType.requiresIsolation && <Badge>Aislación LOTO</Badge>}
                </div>
              </div>
            )}
          </Section>

          {/* SECTION 2 — Work */}
          <Section title="2. Trabajo" icon={Wrench}>
            <Field label="Título" required>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Soldadura en techo nave 3"
                className="cp-input"
              />
            </Field>
            <Field label="Descripción" required>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="cp-input"
              />
            </Field>
            <Grid cols={3}>
              <Field label="Lugar específico">
                <input
                  value={workLocation}
                  onChange={(e) => setWorkLocation(e.target.value)}
                  placeholder="Ej: Sala de máquinas Nave 3"
                  className="cp-input"
                />
              </Field>
              <Field label="Activo asociado">
                <select
                  value={assetId}
                  onChange={(e) => {
                    setAssetId(e.target.value);
                    if (e.target.value) setLocationId('');
                  }}
                  className="cp-input"
                  disabled={!!defaultAssetId}
                >
                  <option value="">— Sin activo —</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ubicación">
                <select
                  value={locationId}
                  onChange={(e) => {
                    setLocationId(e.target.value);
                    if (e.target.value) setAssetId('');
                  }}
                  className="cp-input"
                  disabled={!!assetId}
                >
                  <option value="">— Sin ubicación —</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
            </Grid>
          </Section>

          {/* SECTION 3 — Schedule */}
          <Section title="3. Programación" icon={ClipboardList}>
            <Grid cols={2}>
              <Field label="Inicio planificado" required>
                <input
                  type="datetime-local"
                  value={plannedStart}
                  onChange={(e) => setPlannedStart(e.target.value)}
                  className="cp-input"
                />
              </Field>
              <Field label="Término planificado" required>
                <input
                  type="datetime-local"
                  value={plannedEnd}
                  onChange={(e) => setPlannedEnd(e.target.value)}
                  className="cp-input"
                />
              </Field>
            </Grid>
            {plannedStart && plannedEnd && (
              <p
                className={`mt-2 text-xs ${exceedsMax ? 'text-red-600' : 'text-[var(--text-muted)]'}`}
              >
                Duración planificada: {plannedHours}h
                {selectedType && exceedsMax
                  ? ` · excede el máximo (${selectedType.maxDurationHours}h)`
                  : selectedType
                    ? ` · dentro del máximo (${selectedType.maxDurationHours}h)`
                    : ''}
              </p>
            )}
          </Section>

          {/* SECTION 4 — Team */}
          <Section title="4. Equipo de trabajo" icon={ShieldCheck}>
            <Field label="Supervisor responsable" required>
              <select
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
                className="cp-input"
              >
                <option value="">— Selecciona un usuario —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} · {u.email}
                  </option>
                ))}
              </select>
            </Field>
            <div className="space-y-2 mt-2">
              {team.map((m) => (
                <div
                  key={m.rowId}
                  className="flex flex-wrap items-end gap-2 p-2 rounded-lg border border-[var(--border-color)]"
                  style={{ background: 'var(--input-bg)' }}
                >
                  <div style={{ flex: '1 1 200px' }}>
                    {m.isInternal ? (
                      <select
                        value={m.userId ?? ''}
                        onChange={(e) => {
                          const u = users.find((x) => x.id === e.target.value);
                          updateTeamRow(m.rowId, {
                            userId: u?.id,
                            name: u ? `${u.firstName} ${u.lastName}` : m.name,
                          });
                        }}
                        className="cp-input"
                      >
                        <option value="">— Selecciona usuario —</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.firstName} {u.lastName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={m.name}
                        onChange={(e) => updateTeamRow(m.rowId, { name: e.target.value })}
                        placeholder="Nombre"
                        className="cp-input"
                      />
                    )}
                  </div>
                  <div style={{ flex: '1 1 160px' }}>
                    <input
                      value={m.role}
                      onChange={(e) => updateTeamRow(m.rowId, { role: e.target.value })}
                      placeholder="Rol/cargo"
                      className="cp-input"
                    />
                  </div>
                  <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={m.isInternal}
                      onChange={(e) =>
                        updateTeamRow(m.rowId, {
                          isInternal: e.target.checked,
                          userId: undefined,
                        })
                      }
                    />
                    Interno
                  </label>
                  <button
                    onClick={() => setTeam((p) => p.filter((x) => x.rowId !== m.rowId))}
                    className="p-2 rounded-md hover:bg-red-50 text-red-600"
                    title="Quitar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setTeam((p) => [
                    ...p,
                    { rowId: newRowId(), name: '', role: '', isInternal: false },
                  ])
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-full border border-gray-300 hover:bg-gray-50"
                style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
              >
                <Plus size={12} /> Agregar persona
              </button>
            </div>
          </Section>

          {/* SECTION 5 — Risks */}
          <Section title="5. Riesgos identificados" icon={AlertTriangle}>
            <EditableList
              items={risks}
              onChange={setRisks}
              placeholder="Describe un riesgo"
              addLabel="Agregar riesgo"
            />
          </Section>

          {/* SECTION 6 — Controls */}
          <Section title="6. Medidas de control" icon={ClipboardList}>
            <EditableList
              items={controls}
              onChange={setControls}
              placeholder="Describe una medida de control"
              addLabel="Agregar medida"
            />
          </Section>

          {/* SECTION 7 — Conditional */}
          {selectedType?.category === 'CONFINED_SPACE' && (
            <Section title="7. Mediciones de gases" icon={Box}>
              <p className="text-xs text-[var(--text-muted)]">
                Las mediciones se registran después de crear el permiso, desde el detalle.
                Mediciones requeridas: O₂, H₂S, CO y % LEL antes del ingreso.
              </p>
            </Section>
          )}
          {selectedType?.category === 'LOCKOUT_TAGOUT' && (
            <Section title="7. Aislaciones (LOTO)" icon={Lock}>
              <p className="text-xs text-[var(--text-muted)]">
                Los puntos de aislación se registran desde el detalle del permiso después de
                crearlo. Asegúrate de listar TODAS las fuentes de energía antes de iniciar.
              </p>
            </Section>
          )}

          {/* SECTION 8 — Notes */}
          <Section title="8. Notas adicionales" icon={ClipboardList}>
            <textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              rows={2}
              className="cp-input"
              placeholder="Observaciones, referencias a procedimientos, contactos de emergencia"
            />
          </Section>

          {!catalogsLoaded && (
            <p className="text-xs text-[var(--text-muted)]">Cargando catálogos...</p>
          )}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)] sticky bottom-0 bg-[var(--bg-card)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-full hover:bg-gray-50"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
            disabled={submitting !== false}
          >
            Cancelar
          </button>
          <button
            onClick={() => submit('draft')}
            className="px-4 py-2 text-sm rounded-full border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
            disabled={submitting !== false}
          >
            {submitting === 'draft' ? 'Guardando...' : 'Guardar como borrador'}
          </button>
          <button
            onClick={() => submit('review')}
            className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
            style={{
              background: '#2563EB',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
            }}
            disabled={submitting !== false}
          >
            {submitting === 'review' ? 'Enviando...' : 'Enviar para autorización'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof ShieldCheck;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4
        className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-[var(--text-secondary)] mb-2"
        style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace', letterSpacing: '0.12em' }}
      >
        <Icon size={12} /> {title}
      </h4>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="block text-xs text-[var(--text-secondary)] mb-1"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
      >
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function Grid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full"
      style={{
        background: 'rgba(255,255,255,0.6)',
        border: '1px solid var(--border-color)',
        fontSize: 10,
        fontFamily: 'var(--font-outfit), sans-serif',
        fontWeight: 500,
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </span>
  );
}

function EditableList({
  items,
  onChange,
  placeholder,
  addLabel,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((value, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <textarea
            value={value}
            rows={1}
            onChange={(e) => {
              const next = [...items];
              next[idx] = e.target.value;
              onChange(next);
            }}
            placeholder={placeholder}
            className="cp-input"
            style={{ minHeight: 38 }}
          />
          <button
            onClick={() => onChange(items.filter((_, i) => i !== idx))}
            className="p-2 rounded-md hover:bg-red-50 text-red-600"
            title="Quitar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...items, ''])}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-full border border-gray-300 hover:bg-gray-50"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
      >
        <Plus size={12} /> {addLabel}
      </button>
    </div>
  );
}

export default WorkPermitFormModal;
