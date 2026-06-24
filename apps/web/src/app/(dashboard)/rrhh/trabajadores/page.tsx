'use client';

/* HR-003 — Trabajadores (employees) list + create/edit. Self-contained: table +
 * filters + modal. Imports nothing hard-coding /api/operations/*. The payload
 * carries NO salary/bank — compensation lives behind the ficha's guarded tab.
 * Tokens: accent #2563eb, Outfit headings. */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, X } from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { formatRUT } from '../../../../lib/formatters';

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
const STATUSES = ['ACTIVO', 'INACTIVO', 'DESVINCULADO'] as const;
const STATUS_LABELS: Record<string, string> = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  DESVINCULADO: 'Desvinculado',
};
const CONTRACT_TYPES = ['INDEFINIDO', 'PLAZO_FIJO', 'POR_OBRA', 'HONORARIOS', 'EXTERNO'] as const;
const CONTRACT_LABELS: Record<string, string> = {
  INDEFINIDO: 'Indefinido',
  PLAZO_FIJO: 'Plazo fijo',
  POR_OBRA: 'Por obra',
  HONORARIOS: 'Honorarios',
  EXTERNO: 'Externo',
};

interface EmployeeRow {
  id: string;
  fullName: string;
  rut: string;
  area: string;
  status: string;
  jobPosition: { id: string; name: string } | null;
}
interface JobPositionOpt {
  id: string;
  name: string;
}
interface SupervisorOpt {
  id: string;
  fullName: string;
}
interface UserOpt {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

function statusStyle(status: string): React.CSSProperties {
  if (status === 'ACTIVO') return { background: 'rgba(34,197,94,0.12)', color: '#15803d' };
  if (status === 'DESVINCULADO') return { background: 'rgba(239,68,68,0.12)', color: '#b91c1c' };
  return { background: 'rgba(100,116,139,0.12)', color: '#475569' };
}

export default function TrabajadoresPage() {
  const router = useRouter();
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchEmployees = useCallback(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (areaFilter) params.set('area', areaFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (search.trim()) params.set('search', search.trim());
    const qs = params.toString();
    apiClient
      .get<EmployeeRow[]>(`/api/rrhh/employees${qs ? `?${qs}` : ''}`)
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch(() => setError('No se pudieron cargar los trabajadores.'))
      .finally(() => setIsLoading(false));
  }, [areaFilter, statusFilter, search]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  return (
    <div className="pt-2">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
          <h1
            className="text-2xl font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            Trabajadores
          </h1>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: '#2563eb' }}
        >
          <Plus size={16} /> Nuevo trabajador
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o RUT…"
          className="min-w-[220px] flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
        />
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
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          <option value="">Todos los estados</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border-color)] bg-gray-50">
            <tr>
              {['Nombre', 'RUT', 'Área', 'Cargo', 'Estado'].map((h) => (
                <th
                  key={h}
                  className="label px-4 py-3 text-left text-[11px] uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  {h}
                </th>
              ))}
              <th className="label px-4 py-3 text-right text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-24 rounded bg-gray-200" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-[var(--text-secondary)]"
                >
                  No hay trabajadores registrados.
                </td>
              </tr>
            ) : (
              rows.map((e) => (
                <tr
                  key={e.id}
                  className="cursor-pointer hover:bg-black/[0.02]"
                  onClick={() => router.push(`/rrhh/trabajadores/${e.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{e.fullName}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{formatRUT(e.rut)}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {AREA_LABELS[e.area] ?? e.area}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {e.jobPosition?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={statusStyle(e.status)}
                    >
                      {STATUS_LABELS[e.status] ?? e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setEditingId(e.id);
                        setModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <Pencil size={13} /> Editar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <EmployeeModal
          editingId={editingId}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            fetchEmployees();
          }}
        />
      )}
    </div>
  );
}

interface FormState {
  fullName: string;
  rut: string;
  area: string;
  jobPositionId: string;
  supervisorId: string;
  userId: string;
  base: string;
  hireDate: string;
  status: string;
  contractType: string;
  birthDate: string;
  nationality: string;
  personalEmail: string;
  companyEmail: string;
  phone: string;
  address: string;
  emergencyContact: string;
  emergencyPhone: string;
  notes: string;
}

const EMPTY: FormState = {
  fullName: '',
  rut: '',
  area: 'OPERACIONES',
  jobPositionId: '',
  supervisorId: '',
  userId: '',
  base: '',
  hireDate: '',
  status: 'ACTIVO',
  contractType: '',
  birthDate: '',
  nationality: '',
  personalEmail: '',
  companyEmail: '',
  phone: '',
  address: '',
  emergencyContact: '',
  emergencyPhone: '',
  notes: '',
};

function EmployeeModal({
  editingId,
  onClose,
  onSaved,
}: {
  editingId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [positions, setPositions] = useState<JobPositionOpt[]>([]);
  const [supervisors, setSupervisors] = useState<SupervisorOpt[]>([]);
  const [users, setUsers] = useState<UserOpt[] | null>(null); // null = no access to user list
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<JobPositionOpt[]>('/api/rrhh/job-positions?active=true')
      .then(setPositions)
      .catch(() => undefined);
    apiClient
      .get<SupervisorOpt[]>('/api/rrhh/employees?status=ACTIVO')
      .then((d) => setSupervisors(d.filter((s) => s.id !== editingId)))
      .catch(() => undefined);
    // Listing users is admin-only; degrade gracefully for non-admin managers.
    apiClient
      .get<UserOpt[]>('/api/users')
      .then(setUsers)
      .catch(() => setUsers(null));
    if (editingId) {
      apiClient
        .get<Record<string, unknown>>(`/api/rrhh/employees/${editingId}`)
        .then((e) => {
          setForm({
            fullName: (e.fullName as string) ?? '',
            rut: (e.rut as string) ?? '',
            area: (e.area as string) ?? 'OPERACIONES',
            jobPositionId: (e.jobPositionId as string) ?? '',
            supervisorId: (e.supervisorId as string) ?? '',
            userId: (e.userId as string) ?? '',
            base: (e.base as string) ?? '',
            hireDate: e.hireDate ? String(e.hireDate).slice(0, 10) : '',
            status: (e.status as string) ?? 'ACTIVO',
            contractType: (e.contractType as string) ?? '',
            birthDate: e.birthDate ? String(e.birthDate).slice(0, 10) : '',
            nationality: (e.nationality as string) ?? '',
            personalEmail: (e.personalEmail as string) ?? '',
            companyEmail: (e.companyEmail as string) ?? '',
            phone: (e.phone as string) ?? '',
            address: (e.address as string) ?? '',
            emergencyContact: (e.emergencyContact as string) ?? '',
            emergencyPhone: (e.emergencyPhone as string) ?? '',
            notes: (e.notes as string) ?? '',
          });
        })
        .catch(() => undefined);
    }
  }, [editingId]);

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.fullName.trim()) return setErr('El nombre es obligatorio.');
    if (!form.rut.trim()) return setErr('El RUT es obligatorio.');
    if (!form.hireDate) return setErr('La fecha de ingreso es obligatoria.');
    setSaving(true);
    setErr(null);
    const body: Record<string, unknown> = {
      fullName: form.fullName.trim(),
      rut: form.rut.trim(),
      area: form.area,
      hireDate: form.hireDate,
      status: form.status,
      jobPositionId: form.jobPositionId || undefined,
      supervisorId: form.supervisorId || undefined,
      userId: form.userId || undefined,
      base: form.base.trim() || undefined,
      contractType: form.contractType || undefined,
      birthDate: form.birthDate || undefined,
      nationality: form.nationality.trim() || undefined,
      personalEmail: form.personalEmail.trim() || undefined,
      companyEmail: form.companyEmail.trim() || undefined,
      phone: form.phone.trim() || undefined,
      address: form.address.trim() || undefined,
      emergencyContact: form.emergencyContact.trim() || undefined,
      emergencyPhone: form.emergencyPhone.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    try {
      if (editingId) await apiClient.patch(`/api/rrhh/employees/${editingId}`, body);
      else await apiClient.post('/api/rrhh/employees', body);
      onSaved();
    } catch (e) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: unknown }).message)
          : 'No se pudo guardar el trabajador.';
      setErr(msg.includes('RUT') ? msg : 'No se pudo guardar el trabajador.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            {editingId ? 'Editar trabajador' : 'Nuevo trabajador'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <Section title="Datos personales">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nombre completo *">
                <Input value={form.fullName} onChange={(v) => set('fullName', v)} />
              </Field>
              <Field label="RUT *">
                <Input
                  value={form.rut}
                  onChange={(v) => set('rut', v)}
                  placeholder="12.345.678-5"
                />
              </Field>
              <Field label="Fecha de nacimiento">
                <Input type="date" value={form.birthDate} onChange={(v) => set('birthDate', v)} />
              </Field>
              <Field label="Nacionalidad">
                <Input value={form.nationality} onChange={(v) => set('nationality', v)} />
              </Field>
              <Field label="Email personal">
                <Input value={form.personalEmail} onChange={(v) => set('personalEmail', v)} />
              </Field>
              <Field label="Email corporativo">
                <Input value={form.companyEmail} onChange={(v) => set('companyEmail', v)} />
              </Field>
              <Field label="Teléfono">
                <Input value={form.phone} onChange={(v) => set('phone', v)} />
              </Field>
              <Field label="Dirección">
                <Input value={form.address} onChange={(v) => set('address', v)} />
              </Field>
            </div>
          </Section>

          <Section title="Laboral">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Área *">
                <Select value={form.area} onChange={(v) => set('area', v)}>
                  {AREAS.map((a) => (
                    <option key={a} value={a}>
                      {AREA_LABELS[a]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Cargo">
                <Select value={form.jobPositionId} onChange={(v) => set('jobPositionId', v)}>
                  <option value="">— Sin cargo —</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Supervisor">
                <Select value={form.supervisorId} onChange={(v) => set('supervisorId', v)}>
                  <option value="">— Sin supervisor —</option>
                  {supervisors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Base / faena">
                <Input value={form.base} onChange={(v) => set('base', v)} />
              </Field>
              <Field label="Fecha de ingreso *">
                <Input type="date" value={form.hireDate} onChange={(v) => set('hireDate', v)} />
              </Field>
              <Field label="Tipo de contrato">
                <Select value={form.contractType} onChange={(v) => set('contractType', v)}>
                  <option value="">— Sin especificar —</option>
                  {CONTRACT_TYPES.map((c) => (
                    <option key={c} value={c}>
                      {CONTRACT_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Estado">
                <Select value={form.status} onChange={(v) => set('status', v)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Section>

          <Section title="Vínculo de usuario (opcional)">
            {users === null ? (
              <p className="text-xs text-[var(--text-secondary)]">
                Solo administradores pueden vincular un usuario de acceso. El trabajador puede
                guardarse sin vínculo.
              </p>
            ) : (
              <Field label="Usuario de acceso">
                <Select value={form.userId} onChange={(v) => set('userId', v)}>
                  <option value="">— Sin usuario —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} · {u.email}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </Section>

          <Section title="Contacto de emergencia">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Contacto">
                <Input value={form.emergencyContact} onChange={(v) => set('emergencyContact', v)} />
              </Field>
              <Field label="Teléfono">
                <Input value={form.emergencyPhone} onChange={(v) => set('emergencyPhone', v)} />
              </Field>
            </div>
          </Section>

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        {title}
      </h3>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-[var(--text-secondary)]">{label}</label>
      {children}
    </div>
  );
}
function Input({
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
    />
  );
}
function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
    >
      {children}
    </select>
  );
}
