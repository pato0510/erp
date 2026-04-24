'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Save,
  Building2,
  CalendarClock,
  Bell,
  Calendar,
  Users as UsersIcon,
  ChevronRight,
} from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { formatCLP } from '../../../lib/formatters';
import { Toast } from '../../../components/shared/Toast';

interface Company {
  id: string;
  name: string;
  taxId: string;
  legalName: string;
}

interface CompanySettings {
  fiscalYearStart: number;
  defaultCurrency: string;
  timezone: string;
  taxRate: string | number; // Prisma Decimal arrives as string
  invoicePrefix?: string | null;
  decimalSeparator?: string;
  thousandSeparator?: string;
}

interface FiscalPeriod {
  id: string;
  name: string;
  year: number;
  month: number;
  status: 'OPEN' | 'IN_REVIEW' | 'CLOSED';
  startDate: string;
  endDate: string;
  closedAt?: string | null;
}

interface Thresholds {
  lowCashThreshold: string | number;
  commitmentDaysWarning: number;
  commitmentDaysCritical: number;
}

const STATUS_BADGE: Record<FiscalPeriod['status'], { label: string; cls: string }> = {
  OPEN: { label: 'Abierto', cls: 'bg-green-100 text-green-700' },
  IN_REVIEW: { label: 'En revisión', cls: 'bg-yellow-100 text-yellow-700' },
  CLOSED: { label: 'Cerrado', cls: 'bg-gray-100 text-[var(--text-secondary)]' },
};

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export default function ConfiguracionPage() {
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <h1 className="text-2xl text-[var(--text-primary)] mb-2">Configuración</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-6" style={{ fontWeight: 300 }}>
        Ajusta los parámetros operacionales de tu empresa
      </p>

      {/* Anchors */}
      <nav className="flex gap-2 flex-wrap mb-6 text-xs">
        {[
          { id: 'empresa', label: 'Empresa' },
          { id: 'periodos', label: 'Períodos' },
          { id: 'alertas', label: 'Alertas' },
        ].map((a) => (
          <a
            key={a.id}
            href={`#${a.id}`}
            className="px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-gray-300 transition"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            {a.label}
          </a>
        ))}
      </nav>

      <div className="space-y-6">
        <Link
          href="/configuracion/usuarios"
          className="block bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-sm hover:border-gray-300 transition"
        >
          <div className="px-6 py-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50">
              <UsersIcon size={18} className="text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-[var(--text-primary)]"
                style={{
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                Gestionar usuarios
              </p>
              <p
                className="text-xs text-[var(--text-secondary)] mt-0.5"
                style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 300 }}
              >
                Crea, edita y administra los usuarios con acceso a la empresa
              </p>
            </div>
            <ChevronRight size={16} className="text-[var(--text-muted)]" />
          </div>
        </Link>

        <CompanySection onToast={setToast} />
        <PeriodsSection onToast={setToast} />
        <ThresholdsSection onToast={setToast} />
      </div>

      <style jsx global>{`
        .cfg-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-family: var(--font-outfit), sans-serif;
          font-size: 14px;
          color: var(--text-primary);
          background: var(--input-bg);
          outline: none;
          transition:
            border-color 120ms ease,
            box-shadow 120ms ease;
        }
        .cfg-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
        .cfg-input:disabled {
          background: var(--bg-secondary);
          color: var(--text-muted);
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────── Company section ───────────────────────────────

function CompanySection({
  onToast,
}: {
  onToast: (t: { message: string; type: 'success' | 'error' | 'info' }) => void;
}) {
  const [company, setCompany] = useState<Company | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [legalName, setLegalName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [fiscalYearStart, setFiscalYearStart] = useState(1);
  const [defaultCurrency, setDefaultCurrency] = useState('CLP');
  const [timezone, setTimezone] = useState('America/Santiago');
  const [taxRatePct, setTaxRatePct] = useState('19');

  useEffect(() => {
    const companyId = apiClient.getCompanyId();
    if (!companyId) {
      setLoading(false);
      return;
    }
    Promise.all([
      apiClient.get<Company>(`/api/companies/${companyId}`),
      apiClient.get<CompanySettings>(`/api/companies/${companyId}/settings`),
    ])
      .then(([c, s]) => {
        setCompany(c);
        setSettings(s);
        setLegalName(c.legalName);
        setTaxId(c.taxId);
        setFiscalYearStart(s.fiscalYearStart);
        setDefaultCurrency(s.defaultCurrency);
        setTimezone(s.timezone);
        setTaxRatePct(String(Math.round(Number(s.taxRate) * 10000) / 100));
      })
      .catch(() => onToast({ message: 'Error cargando configuración', type: 'error' }))
      .finally(() => setLoading(false));
  }, [onToast]);

  const save = async () => {
    const companyId = apiClient.getCompanyId();
    if (!companyId) return;
    setSaving(true);
    try {
      const companyBody = {
        legalName: legalName.trim(),
        taxId: taxId.trim(),
      };
      const settingsBody = {
        fiscalYearStart,
        defaultCurrency,
        timezone,
        taxRate: Number(taxRatePct) / 100,
      };
      const [updatedCompany, updatedSettings] = await Promise.all([
        apiClient.patch<Company>(`/api/companies/${companyId}`, companyBody),
        apiClient.patch<CompanySettings>(`/api/companies/${companyId}/settings`, settingsBody),
      ]);
      setCompany(updatedCompany);
      setSettings(updatedSettings);
      onToast({ message: 'Configuración guardada', type: 'success' });
    } catch (err) {
      onToast({
        message: err instanceof Error ? err.message : 'Error al guardar',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      id="empresa"
      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-sm"
    >
      <header className="px-6 py-4 border-b border-[var(--border-color)] flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-50">
          <Building2 size={18} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-base text-[var(--text-primary)]" style={{ fontWeight: 600 }}>
            Empresa
          </h2>
          <p className="text-xs text-[var(--text-secondary)]" style={{ fontWeight: 300 }}>
            Información legal y parámetros contables
          </p>
        </div>
      </header>

      {loading || !company || !settings ? (
        <div className="p-6 space-y-3">
          <div className="h-4 bg-gray-100 rounded w-48 animate-pulse" />
          <div className="h-10 bg-gray-100 rounded animate-pulse" />
          <div className="h-10 bg-gray-100 rounded animate-pulse" />
        </div>
      ) : (
        <>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <CfgField label="Razón social">
                <input
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  className="cfg-input"
                  maxLength={200}
                />
              </CfgField>
              <CfgField label="RUT">
                <input
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  className="cfg-input"
                  maxLength={20}
                  style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                />
              </CfgField>
              <CfgField label="Moneda por defecto">
                <select
                  value={defaultCurrency}
                  onChange={(e) => setDefaultCurrency(e.target.value)}
                  className="cfg-input"
                >
                  <option value="CLP">CLP · Peso chileno</option>
                  <option value="USD">USD · Dólar estadounidense</option>
                  <option value="EUR">EUR · Euro</option>
                </select>
              </CfgField>
              <CfgField label="Inicio del año fiscal">
                <select
                  value={fiscalYearStart}
                  onChange={(e) => setFiscalYearStart(Number(e.target.value))}
                  className="cfg-input"
                >
                  {MONTH_NAMES.map((m, i) => (
                    <option key={i + 1} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </CfgField>
              <CfgField label="Tasa de IVA (%)" help="Valor por defecto aplicado a movimientos">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={taxRatePct}
                  onChange={(e) => setTaxRatePct(e.target.value)}
                  className="cfg-input"
                />
              </CfgField>
              <CfgField label="Zona horaria">
                <input
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="cfg-input"
                  style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                />
              </CfgField>
            </div>
          </div>
          <footer className="px-6 py-3 border-t border-[var(--border-color)] flex justify-end bg-gray-50 rounded-b-xl">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
              style={{
                background: '#1C1C1E',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Save size={14} />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </footer>
        </>
      )}
    </section>
  );
}

// ─────────────────────────────── Periods section ───────────────────────────────

interface PeriodsStatus {
  total: number;
  existing: number;
  missing: number[];
}

function PeriodsSection({
  onToast,
}: {
  onToast: (t: { message: string; type: 'success' | 'error' | 'info' }) => void;
}) {
  const currentYear = new Date().getFullYear();
  const YEAR_OPTIONS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028];

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [statusByYear, setStatusByYear] = useState<Record<number, PeriodsStatus>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadStatuses = useCallback(async () => {
    try {
      const entries = await Promise.all(
        YEAR_OPTIONS.map(async (y) => {
          const s = await apiClient.get<PeriodsStatus>(`/api/fiscal-periods/status/${y}`);
          return [y, s] as const;
        }),
      );
      setStatusByYear(Object.fromEntries(entries));
    } catch (err) {
      onToast({
        message: err instanceof Error ? err.message : 'Error cargando estado de períodos',
        type: 'error',
      });
    }
    // YEAR_OPTIONS is a constant literal; safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onToast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<FiscalPeriod[]>(`/api/fiscal-periods?year=${selectedYear}`);
      res.sort((a, b) => a.month - b.month);
      setPeriods(res);
    } catch (err) {
      onToast({
        message: err instanceof Error ? err.message : 'Error cargando períodos',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedYear, onToast]);

  // Primitive-only deps (selectedYear + stable setter) — no infinite loop.
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await apiClient.post<{ created: number; periods: string[] }>(
        `/api/fiscal-periods/generate/${selectedYear}`,
      );
      onToast({
        message:
          res.created === 0
            ? `Todos los períodos de ${selectedYear} ya existían`
            : `${res.created} período${res.created === 1 ? '' : 's'} de ${selectedYear} generado${res.created === 1 ? '' : 's'}`,
        type: 'success',
      });
      // Immediate refresh so new cards appear without a manual reload.
      await Promise.all([load(), loadStatuses()]);
    } catch (err) {
      onToast({
        message: err instanceof Error ? err.message : 'Error al generar períodos',
        type: 'error',
      });
    } finally {
      setGenerating(false);
    }
  };

  // Index existing periods by month so the 12-card grid can look them up in O(1).
  const byMonth = new Map(periods.map((p) => [p.month, p]));
  const selectedStatus = statusByYear[selectedYear];
  const hasMissing = !selectedStatus || selectedStatus.missing.length > 0;

  return (
    <section
      id="periodos"
      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-sm"
    >
      <header className="px-6 py-4 border-b border-[var(--border-color)] flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-50">
          <CalendarClock size={18} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-base text-[var(--text-primary)]" style={{ fontWeight: 600 }}>
            Períodos fiscales
          </h2>
          <p className="text-xs text-[var(--text-secondary)]" style={{ fontWeight: 300 }}>
            Selecciona un año para ver o generar sus períodos
          </p>
        </div>
      </header>

      {/* Year selector + generate action */}
      <div className="px-6 py-3 border-b border-[var(--border-color)] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 overflow-x-auto max-w-full pb-1 -mb-1 fiscal-years-scroll">
          {YEAR_OPTIONS.map((y) => {
            const active = selectedYear === y;
            const status = statusByYear[y];
            let dotColor: string | null = null;
            if (status) {
              if (status.existing === 12)
                dotColor = '#22C55E'; // green
              else if (status.existing > 0) dotColor = '#EAB308'; // yellow
            }
            return (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`relative shrink-0 px-3 py-1.5 text-sm rounded-md transition border ${
                  active ? 'text-white' : 'text-[var(--text-primary)] hover:bg-gray-50'
                }`}
                style={{
                  background: active ? '#2563EB' : '#FFFFFF',
                  borderColor: active ? '#2563EB' : 'var(--border-color)',
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                }}
              >
                {y}
                {dotColor && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-white"
                    style={{ background: dotColor }}
                  />
                )}
              </button>
            );
          })}
        </div>
        {hasMissing && (
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            <Calendar size={14} />
            {generating ? 'Generando...' : `Generar períodos ${selectedYear}`}
          </button>
        )}
      </div>

      {/* Grid or empty state */}
      <div className="p-6">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : periods.length === 0 ? (
          <div className="text-center py-10">
            <p
              className="text-sm text-[var(--text-secondary)]"
              style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
            >
              No hay períodos para {selectedYear}. Genera los períodos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 12 }, (_, i) => {
              const month = i + 1;
              const period = byMonth.get(month);
              const monthLabel = MONTH_NAMES[i];

              if (!period) {
                return (
                  <div
                    key={month}
                    className="rounded-lg border-2 border-dashed border-[var(--border-color)] p-3 flex flex-col gap-1.5 min-h-[80px]"
                  >
                    <p
                      className="text-sm text-[var(--text-muted)]"
                      style={{
                        fontFamily: 'var(--font-outfit), sans-serif',
                        fontWeight: 500,
                      }}
                    >
                      {monthLabel} {selectedYear}
                    </p>
                    <span
                      className="text-[11px] text-[var(--text-muted)] mt-auto"
                      style={{
                        fontFamily: 'var(--font-outfit), sans-serif',
                        fontWeight: 300,
                        fontStyle: 'italic',
                      }}
                    >
                      No generado
                    </span>
                  </div>
                );
              }

              const badge = STATUS_BADGE[period.status];
              return (
                <div
                  key={period.id}
                  className="rounded-lg border border-[var(--border-color)] p-3 flex flex-col gap-1.5 min-h-[80px]"
                >
                  <p
                    className="text-sm text-[var(--text-primary)]"
                    style={{
                      fontFamily: 'var(--font-outfit), sans-serif',
                      fontWeight: 500,
                    }}
                  >
                    {monthLabel} {selectedYear}
                  </p>
                  <span
                    className={`badge self-start text-[10px] px-2 py-0.5 rounded-full ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────── Thresholds section ───────────────────────────

function ThresholdsSection({
  onToast,
}: {
  onToast: (t: { message: string; type: 'success' | 'error' | 'info' }) => void;
}) {
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [cash, setCash] = useState('');
  const [warn, setWarn] = useState('');
  const [crit, setCrit] = useState('');

  useEffect(() => {
    apiClient
      .get<Thresholds>('/api/alerts/thresholds')
      .then((t) => {
        setThresholds(t);
        setCash(String(Number(t.lowCashThreshold)));
        setWarn(String(t.commitmentDaysWarning));
        setCrit(String(t.commitmentDaysCritical));
      })
      .catch(() => onToast({ message: 'Error cargando umbrales', type: 'error' }))
      .finally(() => setLoading(false));
  }, [onToast]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiClient.patch<Thresholds>('/api/alerts/thresholds', {
        lowCashThreshold: Number(cash),
        commitmentDaysWarning: Number(warn),
        commitmentDaysCritical: Number(crit),
      });
      setThresholds(res);
      onToast({ message: 'Umbrales actualizados', type: 'success' });
    } catch (err) {
      onToast({
        message: err instanceof Error ? err.message : 'Error al guardar',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      id="alertas"
      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-sm"
    >
      <header className="px-6 py-4 border-b border-[var(--border-color)] flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-50">
          <Bell size={18} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-base text-[var(--text-primary)]" style={{ fontWeight: 600 }}>
            Umbrales de alerta
          </h2>
          <p className="text-xs text-[var(--text-secondary)]" style={{ fontWeight: 300 }}>
            Ajusta cuándo la plataforma debe notificarte
          </p>
        </div>
      </header>

      {loading || !thresholds ? (
        <div className="p-6 space-y-3">
          <div className="h-4 bg-gray-100 rounded w-48 animate-pulse" />
          <div className="h-10 bg-gray-100 rounded animate-pulse" />
        </div>
      ) : (
        <>
          <div className="p-6 space-y-5">
            <CfgField
              label="Saldo mínimo de alerta"
              help={`Actualmente: ${formatCLP(thresholds.lowCashThreshold)}`}
            >
              <input
                type="number"
                min="0"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                className="cfg-input"
                style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
              />
            </CfgField>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <CfgField
                label="Días de advertencia antes del vencimiento"
                help="Se marca como 'advertencia' cuando falta este número de días o menos"
              >
                <input
                  type="number"
                  min="0"
                  value={warn}
                  onChange={(e) => setWarn(e.target.value)}
                  className="cfg-input"
                  style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                />
              </CfgField>
              <CfgField
                label="Días críticos antes del vencimiento"
                help="Se marca como 'crítico' al acercarse este umbral"
              >
                <input
                  type="number"
                  min="0"
                  value={crit}
                  onChange={(e) => setCrit(e.target.value)}
                  className="cfg-input"
                  style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                />
              </CfgField>
            </div>
          </div>
          <footer className="px-6 py-3 border-t border-[var(--border-color)] flex justify-end bg-gray-50 rounded-b-xl">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
              style={{
                background: '#1C1C1E',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Save size={14} />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </footer>
        </>
      )}
    </section>
  );
}

// ─────────────────────────────── Helpers ───────────────────────────────

function CfgField({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block mb-1.5 text-[var(--text-secondary)]"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500, fontSize: 13 }}
      >
        {label}
      </label>
      {children}
      {help && (
        <p
          className="mt-1.5 text-xs text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 300 }}
        >
          {help}
        </p>
      )}
    </div>
  );
}
