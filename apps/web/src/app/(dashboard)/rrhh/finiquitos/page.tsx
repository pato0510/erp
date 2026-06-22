'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  ChevronDown,
  Info,
  Loader2,
  User,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { formatCLP } from '../../../../lib/formatters';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  nombre: string;
  rut: string;
  area: string;
  cargo: string;
  fechaIngreso: string;
  sueldoBruto: number | string;
}

type Causal =
  | 'necesidades_empresa'
  | 'desahucio'
  | 'renuncia'
  | 'caducidad';

interface DetalleItem {
  concepto: string;
  monto: number | string;
}

interface FiniquitoResult {
  indemnizacionAniosServicio: number | string;
  avisoPrevio: number | string;
  feriadoProporcional: number | string;
  total: number | string;
  detalle: DetalleItem[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CAUSALES: { value: Causal; label: string; artículo: string }[] = [
  {
    value: 'necesidades_empresa',
    label: 'Necesidades de la empresa (art. 161)',
    artículo: 'Art. 161',
  },
  { value: 'desahucio', label: 'Desahucio', artículo: 'Desahucio' },
  {
    value: 'renuncia',
    label: 'Renuncia voluntaria (art. 159)',
    artículo: 'Art. 159',
  },
  {
    value: 'caducidad',
    label: 'Caducidad (art. 160)',
    artículo: 'Art. 160',
  },
];

/** Returns which concepts are expected to be $0 for a given causal. */
function conceptosCero(causal: Causal): string[] {
  switch (causal) {
    case 'renuncia':
      return ['Indemnización por años de servicio', 'Aviso previo'];
    case 'caducidad':
      return ['Indemnización por años de servicio', 'Aviso previo'];
    case 'desahucio':
      return ['Aviso previo'];
    default:
      return [];
  }
}

function calcularAniosDesde(fechaIngreso: string): number {
  const inicio = new Date(fechaIngreso);
  const hoy = new Date();
  const ms = hoy.getTime() - inicio.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24 * 365.25));
}

function calcularMesesUltimoPeriodo(fechaIngreso: string): number {
  const inicio = new Date(fechaIngreso);
  const hoy = new Date();
  const totalMeses =
    (hoy.getFullYear() - inicio.getFullYear()) * 12 +
    (hoy.getMonth() - inicio.getMonth());
  return totalMeses % 12;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FormLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-1.5">
      {children}
    </label>
  );
}

function FormInput({
  id,
  type = 'text',
  value,
  onChange,
  placeholder,
  min,
  max,
  disabled,
}: {
  id: string;
  type?: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      max={max}
      disabled={disabled}
      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[#2563eb] disabled:opacity-50"
    />
  );
}

function FormSelect({
  id,
  value,
  onChange,
  children,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full appearance-none rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#2563eb] disabled:opacity-50 pr-8"
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
      />
    </div>
  );
}

function ResultRow({
  concepto,
  monto,
  isCero,
  isTotal,
}: {
  concepto: string;
  monto: number | string;
  isCero?: boolean;
  isTotal?: boolean;
}) {
  const num = Number(monto);
  return (
    <div
      className={`flex items-center justify-between py-2 ${
        isTotal
          ? 'border-t-2 border-[#2563eb] mt-1 pt-3'
          : 'border-b border-[var(--border-color)]'
      }`}
    >
      <span
        className={`text-sm ${
          isTotal
            ? 'font-bold text-[var(--text-primary)]'
            : isCero
              ? 'text-[var(--text-secondary)] line-through'
              : 'text-[var(--text-primary)]'
        }`}
      >
        {concepto}
        {isCero && (
          <span className="ml-2 text-xs text-[var(--text-secondary)] no-underline">
            (no aplica para esta causal)
          </span>
        )}
      </span>
      <span
        className={`text-sm font-semibold tabular-nums ${
          isTotal
            ? 'text-[#2563eb] text-base'
            : isCero
              ? 'text-[var(--text-secondary)]'
              : 'text-[var(--text-primary)]'
        }`}
      >
        {formatCLP(num)}
      </span>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function FiniquitosPage() {
  // Form state
  const [sueldo, setSueldo] = useState('');
  const [anios, setAnios] = useState('');
  const [meses, setMeses] = useState('');
  const [causal, setCausal] = useState<Causal>('necesidades_empresa');
  const [avisoPrevio, setAvisoPrevio] = useState(true);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  // Data state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);

  // Calculation state
  const [result, setResult] = useState<FiniquitoResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  // Fetch employees on mount
  useEffect(() => {
    setLoadingEmployees(true);
    apiClient
      .get<Employee[]>('/api/rrhh/employees')
      .then((data) => setEmployees(data))
      .catch(() => setEmployees([]))
      .finally(() => setLoadingEmployees(false));
  }, []);

  // Prefill form when an employee is selected
  function handleSelectEmployee(empId: string) {
    setSelectedEmployeeId(empId);
    setResult(null);
    setCalcError(null);
    if (!empId) return;
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    setSueldo(String(Number(emp.sueldoBruto)));
    const a = calcularAniosDesde(emp.fechaIngreso);
    const m = calcularMesesUltimoPeriodo(emp.fechaIngreso);
    setAnios(String(a));
    setMeses(String(m));
  }

  async function handleCalcular() {
    const sueldoNum = Number(sueldo);
    const aniosNum = Number(anios);
    const mesesNum = Number(meses);

    if (!sueldoNum || sueldoNum <= 0) {
      setCalcError('Ingresa un sueldo válido mayor a $0.');
      return;
    }
    if (aniosNum < 0 || mesesNum < 0) {
      setCalcError('Los años y meses de servicio no pueden ser negativos.');
      return;
    }

    setCalculating(true);
    setCalcError(null);
    setResult(null);

    try {
      const data = await apiClient.post<FiniquitoResult>(
        '/api/rrhh/finiquito/calculate',
        {
          sueldo: sueldoNum,
          aniosServicio: aniosNum,
          mesesUltimoPeriodo: mesesNum,
          causal,
          dioAvisoPrevio: avisoPrevio,
        },
      );
      setResult(data);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No se pudo calcular el finiquito. Intenta nuevamente.';
      setCalcError(msg);
    } finally {
      setCalculating(false);
    }
  }

  const cerosParaCausal = conceptosCero(causal);

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-outfit), Outfit, sans-serif' }}
        >
          Calculadora de Finiquito
        </h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
          Cálculo referencial según legislación laboral chilena
        </p>
      </div>

      {/* Disclaimer banner */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950/30">
        <Info size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-xs text-amber-800 dark:text-amber-300">
          <strong>Cálculo referencial (demo).</strong> Los montos calculados son
          aproximados y se basan en los parámetros ingresados. No constituyen
          asesoría legal ni reemplazan la revisión de un abogado laboral o
          contador. Los valores reales pueden diferir dependiendo de
          gratificaciones, bonos, feriados acumulados y circunstancias
          específicas del contrato.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── FORM PANEL ── */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Calculator size={16} className="text-[#2563eb]" />
              Datos del finiquito
            </h2>

            {/* Cargar desde trabajador */}
            <div className="mb-4">
              <FormLabel>Cargar desde trabajador (opcional)</FormLabel>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <FormSelect
                    id="empleado"
                    value={selectedEmployeeId}
                    onChange={handleSelectEmployee}
                    disabled={loadingEmployees}
                  >
                    <option value="">
                      {loadingEmployees
                        ? 'Cargando trabajadores...'
                        : '— Seleccionar trabajador —'}
                    </option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.nombre} · {emp.cargo}
                      </option>
                    ))}
                  </FormSelect>
                </div>
                {selectedEmployee && (
                  <button
                    type="button"
                    onClick={() => handleSelectEmployee('')}
                    className="shrink-0 text-xs text-[var(--text-secondary)] hover:text-red-500 px-2 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]"
                    title="Limpiar selección"
                  >
                    ✕
                  </button>
                )}
              </div>
              {selectedEmployee && (
                <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <User size={11} />
                  <span>
                    {selectedEmployee.area} · ingresó{' '}
                    {new Date(selectedEmployee.fechaIngreso).toLocaleDateString(
                      'es-CL',
                    )}
                  </span>
                </div>
              )}
            </div>

            <div className="h-px bg-[var(--border-color)] mb-4" />

            {/* Sueldo */}
            <div className="mb-4">
              <FormLabel>Última remuneración (CLP)</FormLabel>
              <FormInput
                id="sueldo"
                type="number"
                value={sueldo}
                onChange={(v) => {
                  setSueldo(v);
                  setResult(null);
                }}
                placeholder="Ej: 850000"
                min={0}
              />
              {sueldo && Number(sueldo) > 0 && (
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {formatCLP(Number(sueldo))}
                </p>
              )}
            </div>

            {/* Años de servicio */}
            <div className="mb-4">
              <FormLabel>Años de servicio</FormLabel>
              <FormInput
                id="anios"
                type="number"
                value={anios}
                onChange={(v) => {
                  setAnios(v);
                  setResult(null);
                }}
                placeholder="Ej: 3"
                min={0}
              />
            </div>

            {/* Meses del último período */}
            <div className="mb-4">
              <FormLabel>Meses del último período (feriado proporcional)</FormLabel>
              <FormInput
                id="meses"
                type="number"
                value={meses}
                onChange={(v) => {
                  setMeses(v);
                  setResult(null);
                }}
                placeholder="Ej: 7"
                min={0}
                max={11}
              />
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Meses trabajados en el año en curso (0–11)
              </p>
            </div>

            {/* Causal */}
            <div className="mb-4">
              <FormLabel>Causal de término</FormLabel>
              <FormSelect
                id="causal"
                value={causal}
                onChange={(v) => {
                  setCausal(v as Causal);
                  setResult(null);
                }}
              >
                {CAUSALES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </FormSelect>
              {cerosParaCausal.length > 0 && (
                <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                  Esta causal no genera:{' '}
                  {cerosParaCausal.join(', ').toLowerCase()}.
                </p>
              )}
            </div>

            {/* Aviso previo toggle */}
            <div className="mb-5">
              <FormLabel>¿Se dio aviso previo de 30 días?</FormLabel>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setAvisoPrevio(true);
                    setResult(null);
                  }}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition ${
                    avisoPrevio
                      ? 'border-[#2563eb] bg-[#2563eb] text-white'
                      : 'border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:border-[#2563eb]'
                  }`}
                >
                  Sí
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAvisoPrevio(false);
                    setResult(null);
                  }}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition ${
                    !avisoPrevio
                      ? 'border-[#2563eb] bg-[#2563eb] text-white'
                      : 'border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:border-[#2563eb]'
                  }`}
                >
                  No
                </button>
              </div>
              {!avisoPrevio && causal === 'necesidades_empresa' && (
                <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                  Sin aviso previo, se sumará indemnización sustitutiva de un
                  mes de sueldo.
                </p>
              )}
            </div>

            {/* Error */}
            {calcError && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                {calcError}
              </div>
            )}

            {/* CTA */}
            <button
              type="button"
              onClick={handleCalcular}
              disabled={calculating || !sueldo}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-50"
            >
              {calculating ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Calculando...
                </>
              ) : (
                <>
                  <Calculator size={15} />
                  Calcular finiquito
                </>
              )}
            </button>
          </section>

          {/* Causal legend card */}
          <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-3">
              Referencia de causales
            </h3>
            <div className="flex flex-col gap-2">
              {CAUSALES.map((c) => {
                const zeros = conceptosCero(c.value);
                return (
                  <div
                    key={c.value}
                    className={`rounded-lg px-3 py-2 border text-xs transition ${
                      causal === c.value
                        ? 'border-[#2563eb] bg-[#2563eb]/8'
                        : 'border-[var(--border-color)] bg-transparent'
                    }`}
                  >
                    <div
                      className={`font-semibold mb-0.5 ${
                        causal === c.value
                          ? 'text-[#2563eb]'
                          : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {c.artículo}
                    </div>
                    <div className="text-[var(--text-secondary)]">
                      {zeros.length === 0
                        ? 'Genera todos los conceptos'
                        : `Sin ${zeros.map((z) => z.toLowerCase()).join(', ')}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* ── RESULT PANEL ── */}
        <div className="lg:col-span-3 flex flex-col gap-5">
          {!result && !calculating && (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-center bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm">
              <Calculator size={40} className="text-[var(--text-secondary)] opacity-40" />
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Ingresa los datos del finiquito
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Completa el formulario y haz clic en "Calcular finiquito"
                </p>
              </div>
            </div>
          )}

          {calculating && (
            <div className="flex flex-col items-center justify-center gap-3 py-20 bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm">
              <Loader2 size={28} className="animate-spin text-[#2563eb]" />
              <p className="text-sm text-[var(--text-secondary)]">
                Calculando...
              </p>
            </div>
          )}

          {result && !calculating && (
            <>
              {/* Context header */}
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2
                      className="text-lg font-semibold text-[var(--text-primary)]"
                      style={{ fontFamily: 'var(--font-outfit), Outfit, sans-serif' }}
                    >
                      Resultado del cálculo
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      {CAUSALES.find((c) => c.value === causal)?.label} ·{' '}
                      {anios} año{Number(anios) !== 1 ? 's' : ''} de servicio ·
                      Sueldo {formatCLP(Number(sueldo))}
                    </p>
                  </div>
                  {selectedEmployee && (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] shrink-0">
                      <User size={13} />
                      {selectedEmployee.nombre}
                    </div>
                  )}
                </div>

                {/* Main concepts */}
                <div className="flex flex-col gap-0">
                  <ResultRow
                    concepto="Indemnización por años de servicio"
                    monto={result.indemnizacionAniosServicio}
                    isCero={cerosParaCausal.includes(
                      'Indemnización por años de servicio',
                    )}
                  />
                  <ResultRow
                    concepto="Aviso previo"
                    monto={result.avisoPrevio}
                    isCero={cerosParaCausal.includes('Aviso previo')}
                  />
                  <ResultRow
                    concepto="Feriado proporcional"
                    monto={result.feriadoProporcional}
                  />

                  {/* Additional detalle items (excluding the 3 already shown) */}
                  {result.detalle
                    .filter((item) => {
                      const lower = item.concepto.toLowerCase();
                      return (
                        !lower.includes('indemnizaci') &&
                        !lower.includes('aviso previo') &&
                        !lower.includes('feriado')
                      );
                    })
                    .map((item, idx) => (
                      <ResultRow
                        key={idx}
                        concepto={item.concepto}
                        monto={item.monto}
                      />
                    ))}

                  <ResultRow
                    concepto="Total finiquito"
                    monto={result.total}
                    isTotal
                  />
                </div>
              </div>

              {/* Detalle completo (all API items) */}
              {result.detalle.length > 0 && (
                <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                    Desglose completo
                  </h3>
                  <div className="flex flex-col gap-0">
                    {result.detalle.map((item, idx) => {
                      const ceroNames = cerosParaCausal.map((s) =>
                        s.toLowerCase(),
                      );
                      const isCero = ceroNames.some((n) =>
                        item.concepto.toLowerCase().includes(n.split(' ')[0]),
                      );
                      return (
                        <div
                          key={idx}
                          className={`flex items-center justify-between py-2 border-b border-[var(--border-color)] last:border-0 ${
                            isCero ? 'opacity-50' : ''
                          }`}
                        >
                          <span className="text-sm text-[var(--text-primary)]">
                            {item.concepto}
                          </span>
                          <span className="text-sm font-medium tabular-nums text-[var(--text-primary)]">
                            {formatCLP(Number(item.monto))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Disclaimer under result */}
              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3 text-xs text-[var(--text-secondary)]">
                <strong className="text-[var(--text-primary)]">
                  Cálculo referencial (demo).
                </strong>{' '}
                Este resultado es aproximado. Los montos definitivos requieren
                revisión de gratificaciones, bonos, horas extras y feriados
                acumulados. Consulte a un abogado laboral o contador para
                valores oficiales.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
