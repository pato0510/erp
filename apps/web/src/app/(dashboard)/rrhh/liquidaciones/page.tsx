'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Calculator, ChevronDown, Info, Loader2, User } from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { formatCLP } from '../../../../lib/formatters';
import { KpiCard } from '../../../../components/operations/dashboard/KpiCard';

/* ── Types ─────────────────────────────────────────────────────────── */

interface AfpRates {
  [afpName: string]: number;
}

interface TaxBracket {
  desde: number;
  hasta: number | null;
  factor: number;
  rebaja: number;
}

interface PayrollParameters {
  id: string;
  anio: number;
  mes: number;
  ufValue: number;
  utmValue: number;
  topeImponibleUf: number;
  topeCesantiaUf: number;
  saludRate: number;
  cesantiaRateTrabajador: number;
  afpRates: AfpRates;
  taxBrackets: TaxBracket[];
}

interface PayrollResult {
  baseImponible: number;
  afp: { nombre: string; monto: number };
  salud: number;
  cesantia: number;
  totalPrevisional: number;
  baseTributable: number;
  impuestoUnico: number;
  totalDescuentos: number;
  sueldoLiquido: number;
}

interface Employee {
  id: string;
  nombre: string;
  rut: string;
  cargo: string;
  area: string;
  sueldoBruto: number | string;
  afp?: string;
  salud?: string;
}

interface EmployeePayrollResponse {
  employee: Employee;
  activeContract?: {
    sueldoBruto: number | string;
    afp?: string;
    salud?: string;
  };
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function toNum(v: number | string | undefined | null): number {
  if (v === undefined || v === null) return 0;
  return Number(v);
}

function RowLine({
  label,
  amount,
  muted,
  indent,
}: {
  label: string;
  amount: number;
  muted?: boolean;
  indent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--border-color)]">
      <span
        className={`text-sm ${indent ? 'pl-4' : ''} ${
          muted ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'
        }`}
      >
        {label}
      </span>
      <span
        className={`text-sm tabular-nums ${
          muted ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'
        }`}
      >
        {formatCLP(amount)}
      </span>
    </div>
  );
}

function DeductionLine({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--border-color)]">
      <span className="text-sm pl-4 text-[var(--text-primary)]">{label}</span>
      <span className="text-sm tabular-nums text-red-600">-{formatCLP(amount)}</span>
    </div>
  );
}

function SubtotalLine({
  label,
  amount,
  negative,
}: {
  label: string;
  amount: number;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 px-2 mt-1 rounded bg-[rgba(0,0,0,0.02)] border-b border-[var(--border-color)]">
      <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
      <span
        className={`text-sm font-medium tabular-nums ${negative ? 'text-red-600' : 'text-[var(--text-primary)]'}`}
      >
        {negative ? '-' : ''}
        {formatCLP(amount)}
      </span>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────── */

export default function LiquidacionesPage() {
  /* -- parameters -- */
  const [params, setParams] = useState<PayrollParameters | null>(null);
  const [paramsLoading, setParamsLoading] = useState(true);
  const [paramsError, setParamsError] = useState<string | null>(null);

  /* -- employees list (for "Cargar desde trabajador") -- */
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [employeeLoading, setEmployeeLoading] = useState(false);

  /* -- form (all primitives for stable useEffect deps) -- */
  const [sueldoBruto, setSueldoBruto] = useState('');
  const [afpKey, setAfpKey] = useState('');
  const [saludTipo, setSaludTipo] = useState<'FONASA' | 'ISAPRE'>('FONASA');

  /* -- result -- */
  const [result, setResult] = useState<PayrollResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  /* ── Fetch parameters on mount ── */
  useEffect(() => {
    setParamsLoading(true);
    apiClient
      .get<PayrollParameters>('/api/rrhh/payroll/parameters')
      .then((data) => {
        setParams(data);
        const firstAfp = Object.keys(data.afpRates ?? {})[0] ?? '';
        setAfpKey(firstAfp);
      })
      .catch((err: unknown) => {
        setParamsError(
          err instanceof Error ? err.message : 'No se pudieron cargar los parámetros.',
        );
      })
      .finally(() => setParamsLoading(false));
  }, []);

  /* ── Fetch employee list on mount ── */
  useEffect(() => {
    apiClient
      .get<Employee[]>('/api/rrhh/employees')
      .then((data) => setEmployees(data))
      .catch(() => {
        /* non-critical */
      });
  }, []);

  /* ── Load from employee ── */
  const handleLoadEmployee = useCallback(
    (employeeId: string) => {
      setSelectedEmployeeId(employeeId);
      if (!employeeId) return;
      setEmployeeLoading(true);
      setResult(null);
      setCalcError(null);
      apiClient
        .get<EmployeePayrollResponse>(`/api/rrhh/payroll/employee/${employeeId}`)
        .then((data) => {
          const bruto = data.activeContract?.sueldoBruto ?? data.employee?.sueldoBruto ?? 0;
          setSueldoBruto(String(toNum(bruto)));
          const afpFromApi = data.activeContract?.afp ?? data.employee?.afp ?? '';
          if (afpFromApi && params?.afpRates && afpFromApi in params.afpRates) {
            setAfpKey(afpFromApi);
          }
          const saludFromApi = data.activeContract?.salud ?? data.employee?.salud ?? 'FONASA';
          setSaludTipo(saludFromApi === 'ISAPRE' ? 'ISAPRE' : 'FONASA');
        })
        .catch(() => {
          /* ignore — user can type manually */
        })
        .finally(() => setEmployeeLoading(false));
    },
    [params],
  );

  /* ── Calculate ── */
  const handleCalculate = useCallback(async () => {
    const bruto = Number(String(sueldoBruto).replace(/[^0-9]/g, ''));
    if (!bruto || bruto <= 0) {
      setCalcError('Ingresa un sueldo bruto válido.');
      return;
    }
    setCalculating(true);
    setCalcError(null);
    setResult(null);
    try {
      const data = await apiClient.post<PayrollResult>('/api/rrhh/payroll/calculate', {
        sueldoBruto: bruto,
        afp: afpKey || undefined,
        salud: saludTipo,
      });
      setResult(data);
    } catch (err: unknown) {
      setCalcError(
        err instanceof Error ? err.message : 'Error al calcular la liquidación.',
      );
    } finally {
      setCalculating(false);
    }
  }, [sueldoBruto, afpKey, saludTipo]);

  /* ── Derived ── */
  const afpKeys = params ? Object.keys(params.afpRates) : [];
  const topeImponibleCLP = params
    ? Math.round(toNum(params.ufValue) * toNum(params.topeImponibleUf))
    : 0;

  const afpRateDisplay =
    result && params
      ? (toNum(params.afpRates[result.afp.nombre] ?? params.afpRates[afpKey]) * 100).toFixed(2)
      : '';

  /* ── Render ── */
  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}
        >
          Liquidación de Sueldo
        </h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
          Calculadora de remuneraciones · Módulo RRHH
        </p>
      </div>

      {/* Disclaimer */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950/30">
        <Info size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-xs text-amber-700 dark:text-amber-300">
          <span className="font-semibold">Cálculo referencial (demo).</span> Los resultados son
          aproximaciones basadas en los parámetros configurados para el año/mes activo. No reemplazan
          una liquidación oficial emitida por un contador habilitado.
        </p>
      </div>

      {paramsLoading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] py-8">
          <Loader2 size={16} className="animate-spin" />
          Cargando parámetros previsionales…
        </div>
      )}

      {paramsError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle size={14} />
          {paramsError}
        </div>
      )}

      {params && (
        <>
          {/* Parameters strip */}
          <div className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
              Parámetros {params.anio} — valores referenciales/configurables
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard
                label="UF"
                value={`$${toNum(params.ufValue).toLocaleString('es-CL', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`}
                subtitle="Valor Unidad de Fomento"
              />
              <KpiCard
                label="UTM"
                value={formatCLP(params.utmValue)}
                subtitle="Unidad Tributaria Mensual"
              />
              <KpiCard
                label="Tope imponible"
                value={formatCLP(topeImponibleCLP)}
                subtitle={`${params.topeImponibleUf} UF`}
              />
              <KpiCard
                label="Cesantía trabajador"
                value={`${(toNum(params.cesantiaRateTrabajador) * 100).toFixed(1)}%`}
                subtitle="Contrato indefinido"
              />
            </div>
          </div>

          {/* Two-column: form left, breakdown right */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
            {/* LEFT — form */}
            <div className="lg:col-span-2">
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
                <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <Calculator size={16} className="text-[#2563eb]" />
                  Datos de la liquidación
                </h2>

                {/* Load from employee */}
                <div className="mb-5">
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Cargar desde trabajador{' '}
                    <span className="font-normal text-[var(--text-secondary)]">(opcional)</span>
                  </label>
                  <div className="relative">
                    <User
                      size={13}
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                    />
                    <select
                      value={selectedEmployeeId}
                      onChange={(e) => handleLoadEmployee(e.target.value)}
                      disabled={employeeLoading}
                      className="w-full appearance-none rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] py-2 pl-8 pr-8 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#2563eb] disabled:opacity-50"
                    >
                      <option value="">— Seleccionar trabajador —</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.nombre} · {emp.cargo}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={13}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                    />
                  </div>
                  {employeeLoading && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                      <Loader2 size={11} className="animate-spin" />
                      Cargando datos del trabajador…
                    </div>
                  )}
                </div>

                <div className="border-t border-[var(--border-color)] pt-4 mb-4">
                  <p className="text-xs text-[var(--text-secondary)]">Datos manuales</p>
                </div>

                {/* Sueldo bruto */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Sueldo bruto (CLP) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={sueldoBruto}
                    onChange={(e) => {
                      setSueldoBruto(e.target.value);
                      setResult(null);
                      setCalcError(null);
                    }}
                    placeholder="Ej: 850000"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                  />
                  {sueldoBruto && Number(sueldoBruto) > 0 && (
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {formatCLP(Number(sueldoBruto))}
                    </p>
                  )}
                </div>

                {/* AFP */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    AFP
                  </label>
                  <div className="relative">
                    <select
                      value={afpKey}
                      onChange={(e) => {
                        setAfpKey(e.target.value);
                        setResult(null);
                      }}
                      className="w-full appearance-none rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 pr-8 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                    >
                      {afpKeys.map((key) => (
                        <option key={key} value={key}>
                          {key} — {(toNum(params.afpRates[key]) * 100).toFixed(2)}%
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={13}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                    />
                  </div>
                </div>

                {/* Salud */}
                <div className="mb-6">
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Previsión de salud
                  </label>
                  <div className="flex gap-2">
                    {(['FONASA', 'ISAPRE'] as const).map((tipo) => (
                      <button
                        key={tipo}
                        type="button"
                        onClick={() => {
                          setSaludTipo(tipo);
                          setResult(null);
                        }}
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                          saludTipo === tipo
                            ? 'border-[#2563eb] bg-[#2563eb] text-white'
                            : 'border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[rgba(37,99,235,0.06)]'
                        }`}
                      >
                        {tipo}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Descuento 7% del sueldo imponible (tope legal)
                  </p>
                </div>

                {/* Error */}
                {calcError && (
                  <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    {calcError}
                  </div>
                )}

                {/* CTA */}
                <button
                  type="button"
                  onClick={() => void handleCalculate()}
                  disabled={calculating || !sueldoBruto}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {calculating ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Calculando…
                    </>
                  ) : (
                    <>
                      <Calculator size={14} />
                      Calcular liquidación
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* RIGHT — breakdown */}
            <div className="lg:col-span-3">
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
                <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
                  Detalle de la liquidación
                </h2>

                {!result && !calculating && (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-[var(--text-secondary)]">
                    <Calculator size={36} className="opacity-25" />
                    <p className="text-sm">
                      Completa los datos y presiona{' '}
                      <span className="font-semibold">Calcular</span> para ver el desglose.
                    </p>
                  </div>
                )}

                {calculating && (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-[var(--text-secondary)]">
                    <Loader2 size={28} className="animate-spin opacity-50" />
                    <p className="text-sm">Calculando…</p>
                  </div>
                )}

                {result && !calculating && (
                  <div>
                    {/* Haberes */}
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Haberes
                    </p>
                    <RowLine label="Sueldo bruto" amount={toNum(sueldoBruto)} />
                    <RowLine
                      label="Base imponible previsional"
                      amount={toNum(result.baseImponible)}
                      muted
                      indent
                    />

                    {/* Descuentos previsionales */}
                    <p className="mt-5 mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Descuentos previsionales
                    </p>
                    <DeductionLine
                      label={`AFP ${result.afp.nombre}${afpRateDisplay ? ` (${afpRateDisplay}%)` : ''}`}
                      amount={toNum(result.afp.monto)}
                    />
                    <DeductionLine
                      label={`Salud ${saludTipo} (${(toNum(params.saludRate) * 100).toFixed(0)}%)`}
                      amount={toNum(result.salud)}
                    />
                    <DeductionLine
                      label={`Seguro de cesantía (${(toNum(params.cesantiaRateTrabajador) * 100).toFixed(1)}%)`}
                      amount={toNum(result.cesantia)}
                    />
                    <SubtotalLine
                      label="Total descuentos previsionales"
                      amount={toNum(result.totalPrevisional)}
                      negative
                    />

                    {/* Impuesto */}
                    <p className="mt-5 mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Impuesto único 2ª categoría
                    </p>
                    <RowLine
                      label="Base tributable (después de previsión)"
                      amount={toNum(result.baseTributable)}
                      muted
                    />
                    <DeductionLine
                      label="Impuesto único 2ª categoría"
                      amount={toNum(result.impuestoUnico)}
                    />

                    {/* Total descuentos */}
                    <SubtotalLine
                      label="Total descuentos"
                      amount={toNum(result.totalDescuentos)}
                      negative
                    />

                    {/* Sueldo líquido highlight */}
                    <div className="mt-6 rounded-xl border-2 border-[#2563eb] bg-[rgba(37,99,235,0.05)] px-5 py-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#2563eb]">
                          Sueldo líquido
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                          Monto a pagar al trabajador
                        </p>
                      </div>
                      <p
                        className="text-3xl font-bold tabular-nums shrink-0"
                        style={{
                          color: '#2563eb',
                          fontFamily: 'var(--font-outfit, sans-serif)',
                        }}
                      >
                        {formatCLP(toNum(result.sueldoLiquido))}
                      </p>
                    </div>

                    {/* Summary tiles */}
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <div className="rounded-lg border border-[var(--border-color)] p-3 text-center">
                        <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] mb-1">
                          Bruto
                        </p>
                        <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                          {formatCLP(toNum(sueldoBruto))}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[var(--border-color)] p-3 text-center">
                        <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] mb-1">
                          Descuentos
                        </p>
                        <p className="text-sm font-semibold text-red-600 tabular-nums">
                          -{formatCLP(toNum(result.totalDescuentos))}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[#2563eb]/40 bg-[rgba(37,99,235,0.04)] p-3 text-center">
                        <p className="text-[10px] uppercase tracking-wide text-[#2563eb] mb-1">
                          Líquido
                        </p>
                        <p
                          className="text-sm font-semibold tabular-nums"
                          style={{ color: '#2563eb' }}
                        >
                          {formatCLP(toNum(result.sueldoLiquido))}
                        </p>
                      </div>
                    </div>

                    {/* Effective rate */}
                    {toNum(sueldoBruto) > 0 && (
                      <p className="mt-3 text-center text-xs text-[var(--text-secondary)]">
                        Tasa de descuento efectiva:{' '}
                        <span className="font-semibold">
                          {(
                            (toNum(result.totalDescuentos) / toNum(sueldoBruto)) *
                            100
                          ).toFixed(1)}
                          %
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Tax brackets collapsible */}
              {params.taxBrackets && params.taxBrackets.length > 0 && (
                <details className="mt-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm overflow-hidden">
                  <summary className="cursor-pointer px-5 py-3 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] select-none flex items-center justify-between list-none">
                    <span>Tabla Impuesto Único 2ª Categoría (tramos en UTM)</span>
                    <ChevronDown size={14} />
                  </summary>
                  <div className="px-5 pb-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border-color)] text-[var(--text-secondary)]">
                          <th className="py-1.5 text-left font-medium">Desde (UTM)</th>
                          <th className="py-1.5 text-left font-medium">Hasta (UTM)</th>
                          <th className="py-1.5 text-right font-medium">Factor</th>
                          <th className="py-1.5 text-right font-medium">Rebaja (UTM)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {params.taxBrackets.map((bracket, i) => (
                          <tr
                            key={i}
                            className="border-b border-[var(--border-color)] text-[var(--text-primary)]"
                          >
                            <td className="py-1.5">{bracket.desde}</td>
                            <td className="py-1.5">{bracket.hasta ?? '∞'}</td>
                            <td className="py-1.5 text-right">
                              {(toNum(bracket.factor) * 100).toFixed(0)}%
                            </td>
                            <td className="py-1.5 text-right">{bracket.rebaja}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-[10px] text-[var(--text-secondary)]">
                      Tramos vigentes según UTM del mes activo. Valores referenciales/configurables.
                    </p>
                  </div>
                </details>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
