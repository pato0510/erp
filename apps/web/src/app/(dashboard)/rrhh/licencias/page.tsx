'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X, FileText, CalendarDays, Clock } from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { formatDate } from '../../../../lib/formatters';
import { KpiCard } from '../../../../components/operations/dashboard/KpiCard';

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

type LicenciaTipo = 'ENFERMEDAD_COMUN' | 'ACCIDENTE' | 'MATERNAL' | 'OTRO';

interface Licencia {
  id: string;
  employeeId: string;
  nombre?: string;
  tipo: LicenciaTipo;
  fechaInicio: string;
  fechaFin: string;
  dias: number;
  folio?: string | null;
  estado?: string | null;
}

interface Employee {
  id: string;
  nombre: string;
  rut?: string;
  area?: string;
  cargo?: string;
}

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

const TIPO_LABELS: Record<LicenciaTipo, string> = {
  ENFERMEDAD_COMUN: 'Enfermedad común',
  ACCIDENTE: 'Accidente',
  MATERNAL: 'Maternal',
  OTRO: 'Otro',
};

const TIPO_COLORS: Record<LicenciaTipo, string> = {
  ENFERMEDAD_COMUN: 'bg-blue-100 text-blue-700',
  ACCIDENTE: 'bg-red-100 text-red-700',
  MATERNAL: 'bg-purple-100 text-purple-700',
  OTRO: 'bg-gray-100 text-gray-600',
};

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function daysBetween(from: string, to: string): number {
  if (!from || !to) return 0;
  const msPerDay = 86_400_000;
  const diff = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(0, Math.round(diff / msPerDay) + 1);
}

function isActive(lic: Licencia): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(lic.fechaFin);
  end.setHours(0, 0, 0, 0);
  const start = new Date(lic.fechaInicio);
  start.setHours(0, 0, 0, 0);
  return start <= today && today <= end;
}

/* ------------------------------------------------------------------ */
/* Create modal                                                         */
/* ------------------------------------------------------------------ */

interface CreateModalProps {
  employees: Employee[];
  onClose: () => void;
  onCreated: () => void;
}

function CreateLicenciaModal({ employees, onClose, onCreated }: CreateModalProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [tipo, setTipo] = useState<LicenciaTipo>('ENFERMEDAD_COMUN');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [folio, setFolio] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const diasCalculados = daysBetween(fechaInicio, fechaFin);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !fechaInicio || !fechaFin) {
      setError('Trabajador, fecha de inicio y fecha de fin son obligatorios.');
      return;
    }
    if (new Date(fechaFin) < new Date(fechaInicio)) {
      setError('La fecha de fin no puede ser anterior a la fecha de inicio.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiClient.post('/api/rrhh/licenses', {
        employeeId,
        tipo,
        fechaInicio,
        fechaFin,
        dias: diasCalculados,
        folio: folio.trim() || undefined,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar la licencia.');
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
            Registrar licencia médica
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

          {/* Trabajador */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Trabajador <span className="text-red-500">*</span>
            </label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Seleccionar trabajador...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nombre}
                  {emp.cargo ? ` — ${emp.cargo}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Tipo de licencia <span className="text-red-500">*</span>
            </label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as LicenciaTipo)}
              className="w-full border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              {(Object.keys(TIPO_LABELS) as LicenciaTipo[]).map((t) => (
                <option key={t} value={t}>
                  {TIPO_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Fecha de inicio <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Fecha de fin <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                min={fechaInicio || undefined}
                className="w-full border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Auto-calculated days */}
          {diasCalculados > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
              <Clock size={14} />
              <span>
                Duración calculada: <strong>{diasCalculados} día{diasCalculados !== 1 ? 's' : ''}</strong>
              </span>
            </div>
          )}

          {/* Folio */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Folio (opcional)
            </label>
            <input
              type="text"
              value={folio}
              onChange={(e) => setFolio(e.target.value)}
              placeholder="Ej: L-2026-0042"
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
              {saving ? 'Guardando...' : 'Registrar licencia'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function LicenciasPage() {
  const [licencias, setLicencias] = useState<Licencia[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTipo, setFilterTipo] = useState('');
  const [showModal, setShowModal] = useState(false);

  const fetchLicencias = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<Licencia[]>('/api/rrhh/licenses');
      setLicencias(data);
    } catch {
      // handled by apiClient
    } finally {
      setLoading(false);
    }
  }, []);

  // Load employees once for the create modal dropdown
  useEffect(() => {
    apiClient
      .get<Employee[]>('/api/rrhh/employees')
      .then(setEmployees)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetchLicencias();
  }, [fetchLicencias]);

  /* Derived KPIs */
  const activas = licencias.filter(isActive);
  const totalDias = licencias.reduce((sum, l) => sum + (l.dias ?? 0), 0);

  /* Filtered list */
  const filtered = filterTipo
    ? licencias.filter((l) => l.tipo === filterTipo)
    : licencias;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            className="text-2xl font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
          >
            Licencias médicas
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Registro y seguimiento de licencias del personal
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#2563eb] text-white font-medium hover:bg-blue-700 transition self-start sm:self-auto"
        >
          <Plus size={16} />
          Registrar licencia
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <KpiCard
          label="Licencias activas"
          value={String(activas.length)}
          subtitle="En curso hoy"
          icon={FileText}
          valueColor={activas.length > 0 ? '#2563eb' : undefined}
        />
        <KpiCard
          label="Total registradas"
          value={String(licencias.length)}
          subtitle="Historial completo"
          icon={CalendarDays}
        />
        <KpiCard
          label="Días acumulados"
          value={String(totalDias)}
          subtitle="Suma total del período"
          icon={Clock}
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={() => setFilterTipo('')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
            filterTipo === ''
              ? 'bg-[#2563eb] text-white border-[#2563eb]'
              : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-blue-400'
          }`}
        >
          Todos
        </button>
        {(Object.keys(TIPO_LABELS) as LicenciaTipo[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilterTipo(t === filterTipo ? '' : t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              filterTipo === t
                ? 'bg-[#2563eb] text-white border-[#2563eb]'
                : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-blue-400'
            }`}
          >
            {TIPO_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-white/5 border-b border-[var(--border-color)]">
            <tr>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Trabajador
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Tipo
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Fecha inicio
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Fecha fin
              </th>
              <th className="text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Días
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Folio
              </th>
              <th className="text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Estado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-200 dark:bg-white/10 rounded w-24" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-14 text-center text-sm text-[var(--text-secondary)]"
                >
                  <div className="flex flex-col items-center gap-2">
                    <FileText size={28} className="opacity-40" />
                    <span>
                      {filterTipo
                        ? 'No hay licencias de este tipo registradas.'
                        : 'No hay licencias registradas aún.'}
                    </span>
                    {!filterTipo && (
                      <button
                        type="button"
                        onClick={() => setShowModal(true)}
                        className="mt-2 text-xs text-[#2563eb] hover:underline"
                      >
                        Registrar primera licencia
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((lic) => {
                const active = isActive(lic);
                return (
                  <tr
                    key={lic.id}
                    className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    {/* Trabajador */}
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)] whitespace-nowrap">
                      {lic.nombre ?? '—'}
                    </td>

                    {/* Tipo */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          TIPO_COLORS[lic.tipo] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {TIPO_LABELS[lic.tipo] ?? lic.tipo}
                      </span>
                    </td>

                    {/* Fecha inicio */}
                    <td className="px-4 py-3 text-[var(--text-secondary)] whitespace-nowrap font-mono text-xs">
                      {formatDate(lic.fechaInicio)}
                    </td>

                    {/* Fecha fin */}
                    <td className="px-4 py-3 text-[var(--text-secondary)] whitespace-nowrap font-mono text-xs">
                      {formatDate(lic.fechaFin)}
                    </td>

                    {/* Días */}
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-10 h-6 rounded-md bg-gray-100 dark:bg-white/10 text-xs font-semibold text-[var(--text-primary)]">
                        {lic.dias ?? daysBetween(lic.fechaInicio, lic.fechaFin)}
                      </span>
                    </td>

                    {/* Folio */}
                    <td className="px-4 py-3 text-[var(--text-secondary)] font-mono text-xs">
                      {lic.folio ?? <span className="opacity-40">—</span>}
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-3 text-center">
                      {active ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          Activa
                        </span>
                      ) : new Date(lic.fechaFin) < new Date() ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          Finalizada
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                          Programada
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Footer summary */}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-[var(--border-color)] bg-gray-50 dark:bg-white/5 text-xs text-[var(--text-secondary)]">
            {filtered.length} licencia{filtered.length !== 1 ? 's' : ''}
            {filterTipo ? ` de tipo "${TIPO_LABELS[filterTipo as LicenciaTipo]}"` : ''} &middot;{' '}
            {filtered.reduce((s, l) => s + (l.dias ?? 0), 0)} días acumulados
          </div>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <CreateLicenciaModal
          employees={employees}
          onClose={() => setShowModal(false)}
          onCreated={fetchLicencias}
        />
      )}
    </div>
  );
}
