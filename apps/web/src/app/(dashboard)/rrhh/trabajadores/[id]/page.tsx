'use client';

/* HR-003 — Employee ficha (tabbed shell). Resumen + Datos personales are filled
 * from GET /api/rrhh/employees/:id (which carries NO salary/bank). The
 * Remuneraciones tab fetches the GUARDED compensation endpoint SEPARATELY and
 * renders it only when the caller has access (MANAGER/ADMIN); otherwise it shows
 * "sin permiso". The remaining tabs are placeholders for later tickets. */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil, X } from 'lucide-react';
import { apiClient } from '../../../../../lib/api';
import { formatCLP, formatDate, formatRUT } from '../../../../../lib/formatters';

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
const STATUS_LABELS: Record<string, string> = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  DESVINCULADO: 'Desvinculado',
};
const CONTRACT_LABELS: Record<string, string> = {
  INDEFINIDO: 'Indefinido',
  PLAZO_FIJO: 'Plazo fijo',
  POR_OBRA: 'Por obra',
  HONORARIOS: 'Honorarios',
  EXTERNO: 'Externo',
};

interface Employee {
  id: string;
  fullName: string;
  rut: string;
  area: string;
  status: string;
  contractType: string | null;
  base: string | null;
  hireDate: string;
  birthDate: string | null;
  nationality: string | null;
  personalEmail: string | null;
  companyEmail: string | null;
  phone: string | null;
  address: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  notes: string | null;
  jobPosition: { id: string; name: string; area: string } | null;
  supervisor: { id: string; fullName: string } | null;
  user: { id: string; email: string; firstName: string; lastName: string } | null;
}

interface Compensation {
  baseSalaryGross: string;
  afp: string | null;
  health: string | null;
  bank: string | null;
  bankAccountType: string | null;
  bankAccount: string | null;
}

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'personales', label: 'Datos personales' },
  { key: 'remuneraciones', label: 'Remuneraciones' },
  { key: 'contrato', label: 'Contrato' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'vacaciones', label: 'Vacaciones' },
  { key: 'licencias', label: 'Licencias' },
  { key: 'certificaciones', label: 'Certificaciones' },
  { key: 'habilitaciones', label: 'Habilitaciones' },
  { key: 'historial', label: 'Historial' },
  { key: 'alertas', label: 'Alertas' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function EmployeeFichaPage() {
  const params = useParams();
  const id = String(params.id);
  const [emp, setEmp] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<TabKey>('resumen');

  useEffect(() => {
    apiClient
      .get<Employee>(`/api/rrhh/employees/${id}`)
      .then(setEmp)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="pt-6 text-sm text-[var(--text-secondary)]">Cargando ficha…</div>;
  }
  if (notFound || !emp) {
    return (
      <div className="pt-6">
        <p className="text-sm text-[var(--text-secondary)]">Trabajador no encontrado.</p>
        <Link
          href="/rrhh/trabajadores"
          className="mt-2 inline-block text-sm"
          style={{ color: '#2563eb' }}
        >
          ← Volver a trabajadores
        </Link>
      </div>
    );
  }

  return (
    <div className="pt-2">
      <Link
        href="/rrhh/trabajadores"
        className="mb-3 inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={13} /> Trabajadores
      </Link>

      {/* Header */}
      <div className="mb-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
        <div className="flex items-center gap-3">
          <span className="h-7 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
          <div>
            <h1
              className="text-xl font-semibold text-[var(--text-primary)]"
              style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
            >
              {emp.fullName}
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {formatRUT(emp.rut)} · {emp.jobPosition?.name ?? 'Sin cargo'} ·{' '}
              {AREA_LABELS[emp.area] ?? emp.area} · {STATUS_LABELS[emp.status] ?? emp.status}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-[var(--border-color)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="relative px-3 py-2 text-sm"
            style={{
              color: tab === t.key ? '#2563eb' : 'var(--text-secondary)',
              fontWeight: tab === t.key ? 600 : 400,
              borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && <ResumenTab emp={emp} />}
      {tab === 'personales' && <PersonalesTab emp={emp} />}
      {tab === 'remuneraciones' && <RemuneracionesTab employeeId={id} />}
      {tab !== 'resumen' && tab !== 'personales' && tab !== 'remuneraciones' && (
        <Placeholder label={TABS.find((t) => t.key === tab)?.label ?? ''} />
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      {children}
    </div>
  );
}
function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">{label}</div>
      <div className="mt-0.5 text-sm text-[var(--text-primary)]">{value ?? '—'}</div>
    </div>
  );
}

function ResumenTab({ emp }: { emp: Employee }) {
  return (
    <Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KV label="Cargo" value={emp.jobPosition?.name} />
        <KV label="Área" value={AREA_LABELS[emp.area] ?? emp.area} />
        <KV label="Estado" value={STATUS_LABELS[emp.status] ?? emp.status} />
        <KV label="Base / faena" value={emp.base} />
        <KV label="Fecha de ingreso" value={formatDate(emp.hireDate)} />
        <KV
          label="Tipo de contrato"
          value={emp.contractType ? CONTRACT_LABELS[emp.contractType] : '—'}
        />
        <KV label="Supervisor" value={emp.supervisor?.fullName} />
        <KV
          label="Usuario de acceso"
          value={emp.user ? `${emp.user.firstName} ${emp.user.lastName}` : 'Sin usuario'}
        />
      </div>
    </Card>
  );
}

function PersonalesTab({ emp }: { emp: Employee }) {
  return (
    <Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KV label="Nombre completo" value={emp.fullName} />
        <KV label="RUT" value={formatRUT(emp.rut)} />
        <KV label="Fecha de nacimiento" value={emp.birthDate ? formatDate(emp.birthDate) : '—'} />
        <KV label="Nacionalidad" value={emp.nationality} />
        <KV label="Email personal" value={emp.personalEmail} />
        <KV label="Email corporativo" value={emp.companyEmail} />
        <KV label="Teléfono" value={emp.phone} />
        <KV label="Dirección" value={emp.address} />
        <KV label="Contacto de emergencia" value={emp.emergencyContact} />
        <KV label="Teléfono de emergencia" value={emp.emergencyPhone} />
      </div>
      {emp.notes && (
        <div className="mt-4">
          <KV label="Notas" value={emp.notes} />
        </div>
      )}
    </Card>
  );
}

const HEALTH_LABELS: Record<string, string> = { FONASA: 'Fonasa', ISAPRE: 'Isapre' };

function RemuneracionesTab({ employeeId }: { employeeId: string }) {
  const [comp, setComp] = useState<Compensation | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(() => {
    setState('loading');
    apiClient
      .get<Compensation | null>(`/api/rrhh/employees/${employeeId}/compensation`)
      .then((c) => {
        setComp(c);
        setState('ok');
      })
      .catch((e) => {
        const status =
          e && typeof e === 'object' && 'status' in e ? (e as { status: number }).status : 0;
        setState(status === 403 ? 'forbidden' : 'error');
      });
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  if (state === 'loading') {
    return <Card>Cargando…</Card>;
  }
  if (state === 'forbidden') {
    return (
      <Card>
        <p className="text-sm text-[var(--text-secondary)]">
          No tienes permiso para ver la información de remuneraciones de este trabajador.
        </p>
      </Card>
    );
  }
  if (state === 'error') {
    return (
      <Card>
        <p className="text-sm text-red-600">No se pudo cargar la información de remuneraciones.</p>
      </Card>
    );
  }

  // state === 'ok' — the compensation GET requires read AND update, so a 200
  // means this caller (MANAGER/ADMIN/SUPER_ADMIN) may also edit. Gating the edit
  // button on the same signal mirrors how the tab decides whether to show
  // compensation at all — no separate role lookup needed. (VIEWER/ACCOUNTANT get
  // 403 → 'forbidden' above → no button.)
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3
          className="text-sm font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Remuneración
        </h3>
        <button
          onClick={() => setEditOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
          style={{ background: '#2563eb' }}
        >
          <Pencil size={14} />
          {comp ? 'Editar' : 'Ingresar remuneración'}
        </button>
      </div>

      {comp ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KV label="Sueldo base bruto" value={formatCLP(comp.baseSalaryGross)} />
          <KV label="AFP" value={comp.afp} />
          <KV label="Sistema de salud" value={comp.health ? HEALTH_LABELS[comp.health] : '—'} />
          <KV label="Banco" value={comp.bank} />
          <KV label="Tipo de cuenta" value={comp.bankAccountType} />
          <KV label="N° de cuenta" value={comp.bankAccount} />
        </div>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">
          Este trabajador aún no tiene remuneración registrada.
        </p>
      )}

      {editOpen && (
        <CompensationModal
          employeeId={employeeId}
          initial={comp}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            load();
          }}
        />
      )}
    </Card>
  );
}

function CompensationModal({
  employeeId,
  initial,
  onClose,
  onSaved,
}: {
  employeeId: string;
  initial: Compensation | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [baseSalaryGross, setBaseSalaryGross] = useState(
    initial?.baseSalaryGross != null ? String(initial.baseSalaryGross) : '',
  );
  const [afp, setAfp] = useState(initial?.afp ?? '');
  const [health, setHealth] = useState(initial?.health ?? '');
  const [bank, setBank] = useState(initial?.bank ?? '');
  const [bankAccountType, setBankAccountType] = useState(initial?.bankAccountType ?? '');
  const [bankAccount, setBankAccount] = useState(initial?.bankAccount ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const num = Number(baseSalaryGross);
    if (baseSalaryGross.trim() === '' || Number.isNaN(num) || num < 0) {
      setErr('El sueldo base bruto es obligatorio y debe ser un número mayor o igual a 0.');
      return;
    }
    setSaving(true);
    setErr(null);
    const body: Record<string, unknown> = {
      baseSalaryGross: num,
      afp: afp.trim() || undefined,
      health: health || undefined,
      bank: bank.trim() || undefined,
      bankAccountType: bankAccountType.trim() || undefined,
      bankAccount: bankAccount.trim() || undefined,
    };
    try {
      // Existing endpoint (HR-003) — upserts the 1:1 compensation, MANAGER/ADMIN only.
      await apiClient.put(`/api/rrhh/employees/${employeeId}/compensation`, body);
      onSaved();
    } catch (e) {
      const status =
        e && typeof e === 'object' && 'status' in e ? (e as { status: number }).status : 0;
      setErr(
        status === 403
          ? 'No tienes permiso para editar la remuneración.'
          : 'No se pudo guardar la remuneración. Revisa los datos e inténtalo de nuevo.',
      );
      setSaving(false);
    }
  };

  const inputCls =
    'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';
  const labelCls = 'mb-1 block text-xs text-[var(--text-secondary)]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            {initial ? 'Editar remuneración' : 'Ingresar remuneración'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>Sueldo base bruto (CLP) *</label>
            <input
              type="number"
              min={0}
              step="1"
              value={baseSalaryGross}
              onChange={(e) => setBaseSalaryGross(e.target.value)}
              className={inputCls}
              placeholder="Ej. 1250000"
            />
            {baseSalaryGross.trim() !== '' && !Number.isNaN(Number(baseSalaryGross)) && (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {formatCLP(Number(baseSalaryGross))}
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>AFP</label>
            <input value={afp} onChange={(e) => setAfp(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Sistema de salud</label>
            <select value={health} onChange={(e) => setHealth(e.target.value)} className={inputCls}>
              <option value="">— Sin especificar —</option>
              <option value="FONASA">Fonasa</option>
              <option value="ISAPRE">Isapre</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Banco</label>
            <input value={bank} onChange={(e) => setBank(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Tipo de cuenta</label>
            <input
              value={bankAccountType}
              onChange={(e) => setBankAccountType(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>N° de cuenta</label>
            <input
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              className={inputCls}
            />
          </div>
          {err && <p className="text-sm text-red-600 sm:col-span-2">{err}</p>}
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

function Placeholder({ label }: { label: string }) {
  return (
    <Card>
      <p className="text-sm text-[var(--text-secondary)]">
        {label} — disponible en próximos tickets del módulo RRHH.
      </p>
    </Card>
  );
}
