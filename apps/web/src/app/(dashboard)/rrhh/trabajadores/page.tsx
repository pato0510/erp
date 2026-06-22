'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Search, X, ChevronLeft, ChevronRight, User } from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { formatCLP, formatDate, formatRUT } from '../../../../lib/formatters';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface Employee {
  id: string;
  rut: string;
  nombres: string;
  apellidos: string;
  nombre: string;
  email: string | null;
  area: string;
  cargo: string;
  estado: string;
  fechaIngreso: string;
  tipoContrato: string;
  sueldoBruto: string | number;
  afp: string;
  salud: string;
}

interface EmployeeDetail {
  id: string;
  rut: string;
  nombres: string;
  apellidos: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  fechaNacimiento: string | null;
  fechaIngreso: string;
  area: string;
  cargo: string;
  estado: string;
  activeContract: {
    tipoContrato: string;
    sueldoBruto: string | number;
    jornada: string;
    afp: string;
    salud: string;
    fechaInicio: string;
  } | null;
}

/* ------------------------------------------------------------------ */
/*  Estado badge                                                        */
/* ------------------------------------------------------------------ */

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    ACTIVO: { label: 'Activo', bg: 'bg-green-100', text: 'text-green-700' },
    INACTIVO: { label: 'Inactivo', bg: 'bg-gray-100', text: 'text-gray-600' },
    VACACIONES: { label: 'Vacaciones', bg: 'bg-blue-100', text: 'text-blue-700' },
    LICENCIA: { label: 'Licencia', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  };
  const cfg = map[estado] ?? { label: estado, bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Contrato badge                                                      */
/* ------------------------------------------------------------------ */

function ContratoBadge({ tipo }: { tipo: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    INDEFINIDO: { label: 'Indefinido', bg: 'bg-indigo-50', text: 'text-indigo-700' },
    PLAZO_FIJO: { label: 'Plazo Fijo', bg: 'bg-orange-50', text: 'text-orange-700' },
    HONORARIOS: { label: 'Honorarios', bg: 'bg-purple-50', text: 'text-purple-700' },
    OBRA_FAENA: { label: 'Obra/Faena', bg: 'bg-teal-50', text: 'text-teal-700' },
  };
  const cfg = map[tipo] ?? { label: tipo, bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Form field helper                                                   */
/* ------------------------------------------------------------------ */

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
    <div>
      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT =
  'w-full border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500';

const SELECT =
  'w-full border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500';

/* ------------------------------------------------------------------ */
/*  Create / Edit modal                                                 */
/* ------------------------------------------------------------------ */

interface EmployeeFormProps {
  mode: 'create' | 'edit';
  initial: EmployeeDetail | null;
  onClose: () => void;
  onSaved: () => void;
}

function EmployeeFormModal({ mode, initial, onClose, onSaved }: EmployeeFormProps) {
  /* datos personales */
  const [nombres, setNombres] = useState(initial?.nombres ?? '');
  const [apellidos, setApellidos] = useState(initial?.apellidos ?? '');
  const [rut, setRut] = useState(initial?.rut ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [telefono, setTelefono] = useState(initial?.telefono ?? '');
  const [fechaNacimiento, setFechaNacimiento] = useState(
    initial?.fechaNacimiento ? initial.fechaNacimiento.slice(0, 10) : '',
  );

  /* domicilio */
  const [direccion, setDireccion] = useState(initial?.direccion ?? '');
  const [comuna, setComuna] = useState(initial?.comuna ?? '');
  const [ciudad, setCiudad] = useState(initial?.ciudad ?? '');

  /* laboral */
  const [fechaIngreso, setFechaIngreso] = useState(
    initial?.fechaIngreso ? initial.fechaIngreso.slice(0, 10) : '',
  );
  const [area, setArea] = useState(initial?.area ?? '');
  const [cargo, setCargo] = useState(initial?.cargo ?? '');

  /* contrato */
  const [tipoContrato, setTipoContrato] = useState(
    initial?.activeContract?.tipoContrato ?? 'INDEFINIDO',
  );
  const [sueldoBruto, setSueldoBruto] = useState(
    initial?.activeContract?.sueldoBruto != null
      ? String(Number(initial.activeContract.sueldoBruto))
      : '',
  );
  const [jornada, setJornada] = useState(initial?.activeContract?.jornada ?? 'COMPLETA');
  const [afp, setAfp] = useState(initial?.activeContract?.afp ?? 'CAPITAL');
  const [salud, setSalud] = useState(initial?.activeContract?.salud ?? 'FONASA');
  const [fechaInicioContrato, setFechaInicioContrato] = useState(
    initial?.activeContract?.fechaInicio
      ? initial.activeContract.fechaInicio.slice(0, 10)
      : initial?.fechaIngreso
        ? initial.fechaIngreso.slice(0, 10)
        : '',
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = () => {
    if (!nombres.trim()) return 'Nombres es requerido.';
    if (!apellidos.trim()) return 'Apellidos es requerido.';
    if (!rut.trim()) return 'RUT es requerido.';
    if (!fechaIngreso) return 'Fecha de ingreso es requerida.';
    if (!area.trim()) return 'Área es requerida.';
    if (!cargo.trim()) return 'Cargo es requerido.';
    if (!sueldoBruto || isNaN(Number(sueldoBruto)) || Number(sueldoBruto) <= 0)
      return 'Sueldo bruto debe ser un número positivo.';
    if (!fechaInicioContrato) return 'Fecha de inicio de contrato es requerida.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'create') {
        const body: Record<string, unknown> = {
          nombres: nombres.trim(),
          apellidos: apellidos.trim(),
          rut: rut.trim(),
          fechaIngreso,
          area: area.trim(),
          cargo: cargo.trim(),
          contract: {
            tipoContrato,
            sueldoBruto: Number(sueldoBruto),
            jornada,
            afp,
            salud,
            fechaInicio: fechaInicioContrato,
          },
        };
        if (email.trim()) body['email'] = email.trim();
        if (telefono.trim()) body['telefono'] = telefono.trim();
        if (direccion.trim()) body['direccion'] = direccion.trim();
        if (comuna.trim()) body['comuna'] = comuna.trim();
        if (ciudad.trim()) body['ciudad'] = ciudad.trim();
        if (fechaNacimiento) body['fechaNacimiento'] = fechaNacimiento;

        await apiClient.post('/api/rrhh/employees', body);
      } else if (initial) {
        const body: Record<string, unknown> = {
          nombres: nombres.trim(),
          apellidos: apellidos.trim(),
          rut: rut.trim(),
          fechaIngreso,
          area: area.trim(),
          cargo: cargo.trim(),
        };
        if (email.trim()) body['email'] = email.trim();
        if (telefono.trim()) body['telefono'] = telefono.trim();
        if (direccion.trim()) body['direccion'] = direccion.trim();
        if (comuna.trim()) body['comuna'] = comuna.trim();
        if (ciudad.trim()) body['ciudad'] = ciudad.trim();
        if (fechaNacimiento) body['fechaNacimiento'] = fechaNacimiento;
        await apiClient.patch(`/api/rrhh/employees/${initial.id}`, body);
      }
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al guardar. Verifica los datos e intenta de nuevo.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {mode === 'create' ? 'Nuevo trabajador' : 'Editar trabajador'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgba(0,0,0,0.06)] text-[var(--text-secondary)] transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Datos personales */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
              Datos personales
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Nombres" required>
                <input className={INPUT} value={nombres} onChange={(e) => setNombres(e.target.value)} placeholder="Juan Patricio" />
              </Field>
              <Field label="Apellidos" required>
                <input className={INPUT} value={apellidos} onChange={(e) => setApellidos(e.target.value)} placeholder="González Muñoz" />
              </Field>
              <Field label="RUT" required>
                <input
                  className={INPUT}
                  value={rut}
                  onChange={(e) => setRut(e.target.value)}
                  placeholder="12.345.678-9"
                />
              </Field>
              <Field label="Email">
                <input className={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@empresa.cl" />
              </Field>
              <Field label="Teléfono">
                <input className={INPUT} value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+56 9 1234 5678" />
              </Field>
              <Field label="Fecha de nacimiento">
                <input className={INPUT} type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} />
              </Field>
            </div>
          </section>

          {/* Domicilio */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
              Domicilio
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Field label="Dirección">
                  <input className={INPUT} value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Av. Providencia 1234, Depto 5" />
                </Field>
              </div>
              <Field label="Comuna">
                <input className={INPUT} value={comuna} onChange={(e) => setComuna(e.target.value)} placeholder="Providencia" />
              </Field>
              <Field label="Ciudad">
                <input className={INPUT} value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Santiago" />
              </Field>
            </div>
          </section>

          {/* Datos laborales */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
              Datos laborales
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Fecha de ingreso" required>
                <input className={INPUT} type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} />
              </Field>
              <Field label="Área" required>
                <input className={INPUT} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Operaciones" />
              </Field>
              <Field label="Cargo" required>
                <input className={INPUT} value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Jefe de Turno" />
              </Field>
            </div>
          </section>

          {/* Contrato — solo en create */}
          {mode === 'create' && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
                Contrato
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Tipo de contrato" required>
                  <select className={SELECT} value={tipoContrato} onChange={(e) => setTipoContrato(e.target.value)}>
                    <option value="INDEFINIDO">Indefinido</option>
                    <option value="PLAZO_FIJO">Plazo Fijo</option>
                    <option value="HONORARIOS">Honorarios</option>
                    <option value="OBRA_FAENA">Obra/Faena</option>
                  </select>
                </Field>
                <Field label="Sueldo bruto (CLP)" required>
                  <input
                    className={INPUT}
                    type="number"
                    min={0}
                    value={sueldoBruto}
                    onChange={(e) => setSueldoBruto(e.target.value)}
                    placeholder="1000000"
                  />
                </Field>
                <Field label="Jornada">
                  <select className={SELECT} value={jornada} onChange={(e) => setJornada(e.target.value)}>
                    <option value="COMPLETA">Completa (45h)</option>
                    <option value="PARCIAL">Parcial</option>
                    <option value="TURNO">Turno</option>
                  </select>
                </Field>
                <Field label="Fecha inicio contrato" required>
                  <input className={INPUT} type="date" value={fechaInicioContrato} onChange={(e) => setFechaInicioContrato(e.target.value)} />
                </Field>
                <Field label="AFP">
                  <select className={SELECT} value={afp} onChange={(e) => setAfp(e.target.value)}>
                    <option value="CAPITAL">Capital</option>
                    <option value="CUPRUM">Cuprum</option>
                    <option value="HABITAT">Habitat</option>
                    <option value="MODELO">Modelo</option>
                    <option value="PLANVITAL">PlanVital</option>
                    <option value="PROVIDA">Provida</option>
                    <option value="UNO">Uno</option>
                  </select>
                </Field>
                <Field label="Salud">
                  <select className={SELECT} value={salud} onChange={(e) => setSalud(e.target.value)}>
                    <option value="FONASA">Fonasa</option>
                    <option value="ISAPRE_BANMEDICA">Isapre Banmédica</option>
                    <option value="ISAPRE_COLMENA">Isapre Colmena</option>
                    <option value="ISAPRE_CONSALUD">Isapre Consalud</option>
                    <option value="ISAPRE_CRUZ_BLANCA">Isapre Cruz Blanca</option>
                    <option value="ISAPRE_MASVIDA">Isapre MásVida</option>
                    <option value="ISAPRE_VIDA_TRES">Isapre Vida Tres</option>
                  </select>
                </Field>
              </div>
            </section>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[rgba(0,0,0,0.04)] transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={(e) => {
              const form = (e.currentTarget.closest('.flex.flex-col') as HTMLElement)?.querySelector('form');
              form?.requestSubmit();
            }}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-lg bg-[#2563eb] text-white font-medium hover:bg-[#1d4ed8] transition disabled:opacity-50"
          >
            {submitting ? 'Guardando...' : mode === 'create' ? 'Crear trabajador' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail / Ficha modal                                                */
/* ------------------------------------------------------------------ */

interface FichaModalProps {
  employeeId: string;
  onClose: () => void;
  onEdit: (detail: EmployeeDetail) => void;
}

function FichaModal({ employeeId, onClose, onEdit }: FichaModalProps) {
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiClient
      .get<EmployeeDetail>(`/api/rrhh/employees/${employeeId}`)
      .then(setDetail)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'No se pudo cargar la ficha.'),
      )
      .finally(() => setLoading(false));
  }, [employeeId]);

  const labelCls = 'text-xs text-[var(--text-secondary)] mb-0.5';
  const valueCls = 'text-sm font-medium text-[var(--text-primary)]';

  function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
    return (
      <div>
        <p className={labelCls}>{label}</p>
        <p className={valueCls}>{value || '—'}</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
              <User size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {detail?.nombre ?? 'Ficha del trabajador'}
              </h2>
              {detail && (
                <p className="text-xs text-[var(--text-secondary)]">
                  {formatRUT(detail.rut)} · {detail.cargo}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgba(0,0,0,0.06)] text-[var(--text-secondary)] transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {loading && (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-4 bg-[rgba(0,0,0,0.06)] rounded animate-pulse" />
              ))}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {detail && (
            <>
              {/* Datos personales */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
                  Datos personales
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow label="Nombres" value={detail.nombres} />
                  <InfoRow label="Apellidos" value={detail.apellidos} />
                  <InfoRow label="RUT" value={formatRUT(detail.rut)} />
                  <InfoRow label="Email" value={detail.email} />
                  <InfoRow label="Teléfono" value={detail.telefono} />
                  {detail.fechaNacimiento && (
                    <InfoRow label="Fecha de nacimiento" value={formatDate(detail.fechaNacimiento)} />
                  )}
                </div>
              </section>

              {/* Domicilio */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
                  Domicilio
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <InfoRow label="Dirección" value={detail.direccion} />
                  </div>
                  <InfoRow label="Comuna" value={detail.comuna} />
                  <InfoRow label="Ciudad" value={detail.ciudad} />
                </div>
              </section>

              {/* Datos laborales */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
                  Datos laborales
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow label="Área" value={detail.area} />
                  <InfoRow label="Cargo" value={detail.cargo} />
                  <InfoRow label="Fecha de ingreso" value={formatDate(detail.fechaIngreso)} />
                  <InfoRow label="Estado" value={detail.estado} />
                </div>
              </section>

              {/* Contrato activo */}
              {detail.activeContract && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
                    Contrato activo
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <InfoRow label="Tipo" value={detail.activeContract.tipoContrato} />
                    <InfoRow
                      label="Sueldo bruto"
                      value={formatCLP(Number(detail.activeContract.sueldoBruto))}
                    />
                    <InfoRow label="Jornada" value={detail.activeContract.jornada} />
                    <InfoRow label="AFP" value={detail.activeContract.afp} />
                    <InfoRow label="Salud" value={detail.activeContract.salud} />
                    <InfoRow
                      label="Inicio contrato"
                      value={formatDate(detail.activeContract.fechaInicio)}
                    />
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[rgba(0,0,0,0.04)] transition"
          >
            Cerrar
          </button>
          {detail && (
            <button
              type="button"
              onClick={() => onEdit(detail)}
              className="px-4 py-2 text-sm rounded-lg bg-[#2563eb] text-white font-medium hover:bg-[#1d4ed8] transition"
            >
              Editar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 15;

export default function TrabajadoresPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [page, setPage] = useState(1);

  /* modals */
  const [showCreate, setShowCreate] = useState(false);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [editEmployee, setEditEmployee] = useState<EmployeeDetail | null>(null);

  const fetchEmployees = useCallback(() => {
    setLoading(true);
    apiClient
      .get<Employee[]>('/api/rrhh/employees')
      .then(setEmployees)
      .catch(() => setEmployees([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  /* reset page when filters change */
  useEffect(() => {
    setPage(1);
  }, [search, filterArea, filterEstado]);

  /* derive unique areas for filter */
  const areas = Array.from(new Set(employees.map((e) => e.area))).sort();

  /* client-side filter */
  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      e.nombre.toLowerCase().includes(q) ||
      e.area.toLowerCase().includes(q) ||
      e.cargo.toLowerCase().includes(q) ||
      e.rut.includes(q);
    const matchArea = !filterArea || e.area === filterArea;
    const matchEstado = !filterEstado || e.estado === filterEstado;
    return matchSearch && matchArea && matchEstado;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const clearFilters = () => {
    setSearch('');
    setFilterArea('');
    setFilterEstado('');
    setPage(1);
  };

  const activeFilters = [search, filterArea, filterEstado].filter(Boolean).length;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Trabajadores</h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Nómina y fichas del personal
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#2563eb] text-white font-medium hover:bg-[#1d4ed8] transition self-start sm:self-auto"
        >
          <Plus size={16} />
          Nuevo trabajador
        </button>
      </div>

      {/* Filters */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* search */}
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Buscar</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-2.5 text-[var(--text-secondary)]" />
              <input
                type="text"
                placeholder="Nombre, RUT, cargo o área..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-[var(--border-color)] rounded-lg pl-9 pr-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* area filter */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Área</label>
            <select
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
              className="border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* estado filter */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Estado</label>
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
              className="border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              <option value="ACTIVO">Activo</option>
              <option value="INACTIVO">Inactivo</option>
              <option value="VACACIONES">Vacaciones</option>
              <option value="LICENCIA">Licencia</option>
            </select>
          </div>

          {activeFilters > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-[#2563eb] hover:underline px-2 py-2"
            >
              Limpiar ({activeFilters})
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[rgba(0,0,0,0.03)] border-b border-[var(--border-color)]">
            <tr>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                RUT
              </th>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                Nombre
              </th>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                Área
              </th>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                Cargo
              </th>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                Contrato
              </th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                Sueldo base
              </th>
              <th className="text-center px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                Estado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-[rgba(0,0,0,0.06)] rounded w-24" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-14 text-center text-sm text-[var(--text-secondary)]"
                >
                  <User size={32} className="mx-auto mb-2 opacity-30" />
                  {filtered.length === 0 && employees.length > 0
                    ? 'No se encontraron trabajadores con esos filtros.'
                    : 'No hay trabajadores registrados aún.'}
                </td>
              </tr>
            ) : (
              paginated.map((emp) => (
                <tr
                  key={emp.id}
                  onClick={() => setFichaId(emp.id)}
                  className="hover:bg-[rgba(0,0,0,0.025)] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
                    {formatRUT(emp.rut)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-[var(--text-primary)]">{emp.nombre}</span>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{emp.area}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{emp.cargo}</td>
                  <td className="px-4 py-3">
                    <ContratoBadge tipo={emp.tipoContrato} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-[var(--text-primary)]">
                    {formatCLP(Number(emp.sueldoBruto))}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <EstadoBadge estado={emp.estado} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {!loading && (totalPages > 1 || filtered.length > 0) && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)] bg-[rgba(0,0,0,0.02)]">
            <p className="text-xs text-[var(--text-secondary)]">
              {filtered.length} trabajador{filtered.length !== 1 ? 'es' : ''} · página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-2 rounded border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--bg-card)] transition"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-2 rounded border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--bg-card)] transition"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <EmployeeFormModal
          mode="create"
          initial={null}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            fetchEmployees();
          }}
        />
      )}

      {/* Ficha (detail) modal */}
      {fichaId && !editEmployee && (
        <FichaModal
          employeeId={fichaId}
          onClose={() => setFichaId(null)}
          onEdit={(detail) => {
            setFichaId(null);
            setEditEmployee(detail);
          }}
        />
      )}

      {/* Edit modal */}
      {editEmployee && (
        <EmployeeFormModal
          mode="edit"
          initial={editEmployee}
          onClose={() => setEditEmployee(null)}
          onSaved={() => {
            setEditEmployee(null);
            fetchEmployees();
          }}
        />
      )}
    </div>
  );
}
