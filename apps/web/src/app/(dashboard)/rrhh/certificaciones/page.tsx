'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { formatDate } from '../../../../lib/formatters';
import { KpiCard } from '../../../../components/operations/dashboard/KpiCard';
import { ComplianceGauge } from '../../../../components/operations/ComplianceGauge';
import {
  DocumentStatusBadge,
} from '../../../../components/operations/DocumentStatusBadge';
import type { DerivedDocumentStatus } from '../../../../components/operations/DocumentStatusBadge';

/* ------------------------------------------------------------------ */
/* Domain types                                                         */
/* ------------------------------------------------------------------ */

type CertificationType =
  | 'PILOTO_DRONE'
  | 'SEGURIDAD'
  | 'TECNICA'
  | 'CLIENTE'
  | 'FAENA'
  | 'INDUCCION';

type CertificationStatus = 'VIGENTE' | 'POR_VENCER' | 'VENCIDA';

interface Certification {
  id: string;
  employeeId: string;
  employeeName: string;
  cargo: string;
  name: string;
  type: CertificationType;
  issuedDate?: string | null;
  expiryDate?: string | null;
  status: CertificationStatus;
  diasRestantes?: number | null;
  documentRef?: string | null;
}

interface Employee {
  id: string;
  nombre: string;
  rut?: string;
  area?: string;
  cargo?: string;
}

interface ExpiringCert {
  employeeId: string;
  employeeName: string;
  name: string;
  type: CertificationType;
  expiryDate?: string | null;
  status: CertificationStatus;
  diasRestantes?: number | null;
}

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

const CERT_TYPE_LABELS: Record<CertificationType, string> = {
  PILOTO_DRONE: 'Piloto de Drone',
  SEGURIDAD: 'Seguridad',
  TECNICA: 'Técnica',
  CLIENTE: 'Cliente',
  FAENA: 'Faena',
  INDUCCION: 'Inducción',
};

const CERT_TYPES = Object.keys(CERT_TYPE_LABELS) as CertificationType[];

const STATUS_LABELS: Record<CertificationStatus, string> = {
  VIGENTE: 'Vigente',
  POR_VENCER: 'Por vencer',
  VENCIDA: 'Vencida',
};

/* Map CertificationStatus → DerivedDocumentStatus accepted by the badge */
function toBadgeStatus(s: CertificationStatus): DerivedDocumentStatus {
  if (s === 'VIGENTE') return 'VIGENTE';
  if (s === 'POR_VENCER') return 'POR_VENCER';
  return 'VENCIDO'; // VENCIDA → VENCIDO
}

function certHint(diasRestantes?: number | null, expiryDate?: string | null): string {
  if (diasRestantes === undefined || diasRestantes === null) {
    if (expiryDate) return formatDate(expiryDate);
    return '';
  }
  if (diasRestantes < 0)
    return `(vencida hace ${Math.abs(diasRestantes)} día${Math.abs(diasRestantes) === 1 ? '' : 's'})`;
  if (diasRestantes === 0) return '(vence hoy)';
  return `(en ${diasRestantes} día${diasRestantes === 1 ? '' : 's'})`;
}

/* ------------------------------------------------------------------ */
/* Modal — create / edit                                                */
/* ------------------------------------------------------------------ */

interface ModalProps {
  employees: Employee[];
  initial?: Certification | null;
  /** If set, pre-fills employeeId and locks it */
  lockEmployeeId?: string;
  /** If set, pre-fills type and locks it */
  lockType?: CertificationType;
  onClose: () => void;
  onSaved: () => void;
}

function CertModal({
  employees,
  initial,
  lockEmployeeId,
  lockType,
  onClose,
  onSaved,
}: ModalProps) {
  const isEdit = !!initial;

  const [employeeId, setEmployeeId] = useState(
    initial?.employeeId ?? lockEmployeeId ?? '',
  );
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<CertificationType>(
    initial?.type ?? lockType ?? 'SEGURIDAD',
  );
  const [issuedDate, setIssuedDate] = useState(initial?.issuedDate?.slice(0, 10) ?? '');
  const [expiryDate, setExpiryDate] = useState(initial?.expiryDate?.slice(0, 10) ?? '');
  const [documentRef, setDocumentRef] = useState(initial?.documentRef ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !name.trim()) {
      setError('Empleado y nombre son obligatorios.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        employeeId,
        name: name.trim(),
        type,
        issuedDate: issuedDate || undefined,
        expiryDate: expiryDate || undefined,
        documentRef: documentRef.trim() || undefined,
      };
      if (isEdit && initial) {
        await apiClient.patch(`/api/rrhh/certifications/${initial.id}`, payload);
      } else {
        await apiClient.post('/api/rrhh/certifications', payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la certificación.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-2xl w-full max-w-lg border border-[var(--border-color)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <h2
            className="text-base font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
          >
            {isEdit ? 'Editar certificación' : 'Nueva certificación'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Empleado */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Empleado <span className="text-red-500">*</span>
            </label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={!!lockEmployeeId}
              className="w-full border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              required
            >
              <option value="">Seleccionar empleado...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nombre}
                  {emp.cargo ? ` — ${emp.cargo}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Nombre de la certificación <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Licencia RPAS Categoría Específica A1/A3"
              className="w-full border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Tipo <span className="text-red-500">*</span>
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as CertificationType)}
              disabled={!!lockType}
              className="w-full border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            >
              {CERT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CERT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Fecha de emisión
              </label>
              <input
                type="date"
                value={issuedDate}
                onChange={(e) => setIssuedDate(e.target.value)}
                className="w-full border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Fecha de vencimiento
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                min={issuedDate || undefined}
                className="w-full border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Referencia documental */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Referencia documental (opcional)
            </label>
            <input
              type="text"
              value={documentRef}
              onChange={(e) => setDocumentRef(e.target.value)}
              placeholder="Ej: Certificado N° 2024-0042 — DGAC"
              className="w-full border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2 border-t border-[var(--border-color)] mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-white/5 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm rounded-lg bg-[#2563eb] text-white font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear certificación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** Build a lookup: employeeId → CertificationType → Certification */
function buildCertMap(certs: Certification[]): Map<string, Map<CertificationType, Certification>> {
  const map = new Map<string, Map<CertificationType, Certification>>();
  for (const cert of certs) {
    if (!map.has(cert.employeeId)) map.set(cert.employeeId, new Map());
    // If an employee has multiple certs of same type, keep the most recent / worst status
    const existing = map.get(cert.employeeId)!.get(cert.type);
    if (!existing) {
      map.get(cert.employeeId)!.set(cert.type, cert);
    } else {
      // Priority: VENCIDA > POR_VENCER > VIGENTE (show the worst one)
      const rank = (s: CertificationStatus) =>
        s === 'VENCIDA' ? 2 : s === 'POR_VENCER' ? 1 : 0;
      if (rank(cert.status) >= rank(existing.status)) {
        map.get(cert.employeeId)!.set(cert.type, cert);
      }
    }
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function CertificacionesPage() {
  const [certs, setCerts] = useState<Certification[]>([]);
  const [expiring, setExpiring] = useState<ExpiringCert[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<CertificationType | ''>('');
  const [filterStatus, setFilterStatus] = useState<CertificationStatus | ''>('');
  const [search, setSearch] = useState('');

  // Modal
  const [modal, setModal] = useState<{
    open: boolean;
    cert?: Certification | null;
    lockEmployeeId?: string;
    lockType?: CertificationType;
  }>({ open: false });

  /* ---- Data fetching ---- */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [certsData, expiringData, empData] = await Promise.all([
        apiClient.get<Certification[]>('/api/rrhh/certifications'),
        apiClient.get<ExpiringCert[]>('/api/rrhh/certifications/expiring'),
        apiClient.get<Employee[]>('/api/rrhh/employees'),
      ]);
      setCerts(certsData);
      setExpiring(expiringData);
      setEmployees(empData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos de certificaciones.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /* ---- Derived KPIs ---- */
  const kpis = useMemo(() => {
    const total = certs.length;
    const vigentes = certs.filter((c) => c.status === 'VIGENTE').length;
    const porVencer = certs.filter((c) => c.status === 'POR_VENCER').length;
    const vencidas = certs.filter((c) => c.status === 'VENCIDA').length;
    const pct = total > 0 ? Math.round((vigentes / total) * 100) : 0;
    return { total, vigentes, porVencer, vencidas, pct };
  }, [certs]);

  /* ---- Matrix data ---- */
  const certMap = useMemo(() => buildCertMap(certs), [certs]);

  // Unique employees that appear in certifications, merged with /employees list
  const matrixEmployees = useMemo(() => {
    const empMap = new Map(employees.map((e) => [e.id, e]));
    // Start from employees list; include all who have at least one cert (or just show all employees)
    // We show ALL employees from /employees (so the matrix shows full roster)
    return employees;
  }, [employees]);

  // Apply search + status filter on matrix rows
  const filteredEmployees = useMemo(() => {
    let list = matrixEmployees;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.nombre.toLowerCase().includes(q) ||
          (e.cargo ?? '').toLowerCase().includes(q) ||
          (e.area ?? '').toLowerCase().includes(q),
      );
    }
    if (filterStatus) {
      // Keep only employees who have at least one cert of that status
      list = list.filter((e) => {
        const empCerts = certMap.get(e.id);
        if (!empCerts) return false;
        return [...empCerts.values()].some((c) => c.status === filterStatus);
      });
    }
    return list;
  }, [matrixEmployees, search, filterStatus, certMap]);

  // Columns: all 6 types, or filtered to one type
  const columns: CertificationType[] = filterType ? [filterType] : CERT_TYPES;

  /* ---- Render ---- */
  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            className="text-2xl font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
          >
            Habilitaciones del Personal
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Matriz de certificaciones — drones, SSOMA, técnica y faena
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ open: true })}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#2563eb] text-white font-medium hover:bg-blue-700 transition self-start sm:self-auto"
        >
          <Plus size={16} />
          Nueva certificación
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* KPI strip + gauge */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6 items-start">
        <KpiCard
          label="Total certificaciones"
          value={loading ? '—' : String(kpis.total)}
          subtitle="Registradas en el sistema"
          icon={Award}
        />
        <KpiCard
          label="Vigentes"
          value={loading ? '—' : String(kpis.vigentes)}
          subtitle="Al día"
          icon={CheckCircle2}
          valueColor={kpis.vigentes > 0 ? '#15803d' : undefined}
        />
        <KpiCard
          label="Por vencer"
          value={loading ? '—' : String(kpis.porVencer)}
          subtitle="Próximos 30 días"
          icon={Clock}
          valueColor={kpis.porVencer > 0 ? '#a16207' : undefined}
        />
        <KpiCard
          label="Vencidas"
          value={loading ? '—' : String(kpis.vencidas)}
          subtitle="Requieren renovación"
          icon={ShieldAlert}
          valueColor={kpis.vencidas > 0 ? '#b91c1c' : undefined}
        />
        {/* Compliance gauge as 5th tile */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5 flex items-center justify-center h-full">
          {loading ? (
            <div className="w-24 h-24 rounded-full bg-gray-200 dark:bg-white/10 animate-pulse" />
          ) : (
            <ComplianceGauge
              percentage={kpis.pct}
              size={100}
              subtitle={`${kpis.vigentes} de ${kpis.total}`}
            />
          )}
        </div>
      </div>

      {/* Alertas de vencimiento */}
      {(expiring.length > 0 || loading) && (
        <section className="mb-6 bg-[var(--bg-card)] rounded-xl border border-amber-300/40 dark:border-amber-500/30 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            <h2
              className="text-sm font-semibold text-[var(--text-primary)]"
              style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
            >
              Alertas de vencimiento
            </h2>
            {!loading && (
              <span className="ml-auto text-xs text-[var(--text-secondary)]">
                {expiring.length} habilitación{expiring.length !== 1 ? 'es' : ''} por atender
              </span>
            )}
          </div>
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-gray-100 dark:bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-color)]">
                    <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Empleado
                    </th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Certificación
                    </th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Tipo
                    </th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Vencimiento
                    </th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {expiring.map((item, idx) => (
                    <tr
                      key={`${item.employeeId}-${item.name}-${idx}`}
                      className="hover:bg-amber-50/30 dark:hover:bg-amber-900/10 transition-colors"
                    >
                      <td className="px-3 py-2.5 font-medium text-[var(--text-primary)] whitespace-nowrap">
                        {item.employeeName}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--text-secondary)] whitespace-nowrap max-w-[220px] truncate">
                        {item.name}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 whitespace-nowrap">
                          {CERT_TYPE_LABELS[item.type] ?? item.type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[var(--text-secondary)] font-mono text-xs whitespace-nowrap">
                        {item.expiryDate ? formatDate(item.expiryDate) : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <DocumentStatusBadge
                          status={toBadgeStatus(item.status)}
                          hint={certHint(item.diasRestantes, item.expiryDate)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-[280px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
          />
          <input
            type="text"
            placeholder="Buscar empleado o cargo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-[var(--border-color)] rounded-lg pl-8 pr-3 py-1.5 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Type filter chips */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilterType('')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              filterType === ''
                ? 'bg-[#2563eb] text-white border-[#2563eb]'
                : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-blue-400'
            }`}
          >
            Todos los tipos
          </button>
          {CERT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterType(t === filterType ? '' : t)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                filterType === t
                  ? 'bg-[#2563eb] text-white border-[#2563eb]'
                  : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-blue-400'
              }`}
            >
              {CERT_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as CertificationStatus | '')}
          className="border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xs bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los estados</option>
          {(Object.keys(STATUS_LABELS) as CertificationStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {/* ---- Matrix ---- */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 700 }}>
            <thead className="bg-gray-50 dark:bg-white/5 border-b border-[var(--border-color)]">
              <tr>
                {/* Sticky employee column header */}
                <th
                  className="sticky left-0 z-10 bg-gray-50 dark:bg-[#14141e] text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] whitespace-nowrap border-r border-[var(--border-color)] min-w-[180px]"
                  style={{ minWidth: 180 }}
                >
                  Empleado / Cargo
                </th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] whitespace-nowrap"
                    style={{ minWidth: 140 }}
                  >
                    {CERT_TYPE_LABELS[col]}
                  </th>
                ))}
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] whitespace-nowrap">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {loading ? (
                Array.from({ length: 7 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="sticky left-0 z-10 bg-[var(--bg-card)] px-4 py-3 border-r border-[var(--border-color)]">
                      <div className="h-4 bg-gray-200 dark:bg-white/10 rounded w-32 mb-1" />
                      <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-20" />
                    </td>
                    {CERT_TYPES.map((col) => (
                      <td key={col} className="px-4 py-3 text-center">
                        <div className="h-5 bg-gray-100 dark:bg-white/5 rounded-full w-20 mx-auto" />
                      </td>
                    ))}
                    <td className="px-4 py-3" />
                  </tr>
                ))
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 2}
                    className="px-4 py-16 text-center text-sm text-[var(--text-secondary)]"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Award size={32} className="opacity-30" />
                      <span>
                        {search || filterStatus || filterType
                          ? 'No se encontraron empleados con los filtros aplicados.'
                          : 'No hay empleados registrados.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const empCertMap = certMap.get(emp.id);
                  // Count compliance for row indicator
                  const rowVigentes = columns.filter(
                    (col) => empCertMap?.get(col)?.status === 'VIGENTE',
                  ).length;
                  const rowVencidas = columns.filter(
                    (col) => empCertMap?.get(col)?.status === 'VENCIDA',
                  ).length;
                  const hasIssues = rowVencidas > 0;

                  return (
                    <tr
                      key={emp.id}
                      className={`transition-colors ${
                        hasIssues
                          ? 'hover:bg-red-50/30 dark:hover:bg-red-950/10'
                          : 'hover:bg-gray-50 dark:hover:bg-white/5'
                      }`}
                    >
                      {/* Employee name cell — sticky */}
                      <td className="sticky left-0 z-10 bg-[var(--bg-card)] px-4 py-3 border-r border-[var(--border-color)]">
                        <div className="flex items-center gap-2">
                          {/* Tiny compliance dot */}
                          <span
                            className="shrink-0 w-2 h-2 rounded-full"
                            style={{
                              background: hasIssues
                                ? '#dc2626'
                                : rowVigentes === columns.length
                                ? '#16a34a'
                                : '#ca8a04',
                            }}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[var(--text-primary)] truncate leading-tight">
                              {emp.nombre}
                            </p>
                            {emp.cargo && (
                              <p className="text-xs text-[var(--text-secondary)] truncate leading-tight">
                                {emp.cargo}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* One cell per certification type */}
                      {columns.map((col) => {
                        const cert = empCertMap?.get(col);
                        return (
                          <td key={col} className="px-3 py-3 text-center">
                            {cert ? (
                              <button
                                type="button"
                                title={`${cert.name}\nEditar certificación`}
                                onClick={() =>
                                  setModal({
                                    open: true,
                                    cert,
                                    lockEmployeeId: emp.id,
                                    lockType: col,
                                  })
                                }
                                className="group inline-flex flex-col items-center gap-1 focus:outline-none"
                              >
                                <DocumentStatusBadge
                                  status={toBadgeStatus(cert.status)}
                                  hint={certHint(cert.diasRestantes, cert.expiryDate)}
                                />
                                {cert.expiryDate && (
                                  <span className="text-[10px] text-[var(--text-secondary)] font-mono opacity-70 group-hover:opacity-100">
                                    {formatDate(cert.expiryDate)}
                                  </span>
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                title="Agregar certificación"
                                onClick={() =>
                                  setModal({
                                    open: true,
                                    cert: null,
                                    lockEmployeeId: emp.id,
                                    lockType: col,
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-[var(--text-secondary)] hover:text-[#2563eb] hover:bg-blue-50 dark:hover:bg-blue-950/20 transition border border-dashed border-[var(--border-color)] hover:border-[#2563eb]"
                              >
                                <Plus size={10} />
                                <span>Agregar</span>
                              </button>
                            )}
                          </td>
                        );
                      })}

                      {/* Row actions */}
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          title="Nueva certificación para este empleado"
                          onClick={() =>
                            setModal({ open: true, cert: null, lockEmployeeId: emp.id })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[#2563eb] hover:bg-blue-50 dark:hover:bg-blue-950/20 transition border border-[var(--border-color)] hover:border-[#2563eb]"
                        >
                          <Pencil size={11} />
                          <span className="hidden sm:inline">Agregar</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer summary */}
        {!loading && filteredEmployees.length > 0 && (
          <div className="px-4 py-3 border-t border-[var(--border-color)] bg-gray-50 dark:bg-white/5 text-xs text-[var(--text-secondary)] flex flex-wrap gap-4 items-center">
            <span>
              {filteredEmployees.length} empleado{filteredEmployees.length !== 1 ? 's' : ''}
              {search ? ` que coinciden con "${search}"` : ''}
            </span>
            <span>·</span>
            <span>{kpis.total} certificaciones totales</span>
            {kpis.vencidas > 0 && (
              <>
                <span>·</span>
                <span className="text-red-600 font-medium">
                  {kpis.vencidas} vencida{kpis.vencidas !== 1 ? 's' : ''}
                </span>
              </>
            )}
            {kpis.porVencer > 0 && (
              <>
                <span>·</span>
                <span className="text-amber-600 font-medium">
                  {kpis.porVencer} por vencer
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {modal.open && (
        <CertModal
          employees={employees}
          initial={modal.cert}
          lockEmployeeId={modal.lockEmployeeId}
          lockType={modal.lockType}
          onClose={() => setModal({ open: false })}
          onSaved={fetchAll}
        />
      )}
    </div>
  );
}
