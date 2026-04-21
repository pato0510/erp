'use client';

import { useCallback, useEffect, useState } from 'react';
import { Save, Building2, CalendarClock, Bell, Calendar } from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { formatCLP, formatDate } from '../../../lib/formatters';
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
  CLOSED: { label: 'Cerrado', cls: 'bg-gray-100 text-gray-500' },
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

const CURRENT_YEAR = new Date().getFullYear();
const NEXT_YEAR = CURRENT_YEAR + 1;

export default function ConfiguracionPage() {
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <h1 className="text-2xl text-gray-900 mb-2">Configuración</h1>
      <p className="text-sm text-gray-500 mb-6" style={{ fontWeight: 300 }}>
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
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-gray-600 hover:text-gray-900 hover:border-gray-300 transition"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            {a.label}
          </a>
        ))}
      </nav>

      <div className="space-y-6">
        <CompanySection onToast={setToast} />
        <PeriodsSection onToast={setToast} />
        <ThresholdsSection onToast={setToast} />
      </div>

      <style jsx global>{`
        .cfg-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #e8eaed;
          border-radius: 8px;
          font-family: var(--font-outfit), sans-serif;
          font-size: 14px;
          color: #1c1c1e;
          background: #ffffff;
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
          background: #f8f9fa;
          color: #64748b;
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
      const body = {
        fiscalYearStart,
        defaultCurrency,
        timezone,
        taxRate: Number(taxRatePct) / 100,
      };
      const updated = await apiClient.patch<CompanySettings>(
        `/api/companies/${companyId}/settings`,
        body,
      );
      setSettings(updated);
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
    <section id="empresa" className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <header className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-50">
          <Building2 size={18} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-base text-gray-900" style={{ fontWeight: 600 }}>
            Empresa
          </h2>
          <p className="text-xs text-gray-500" style={{ fontWeight: 300 }}>
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
              <CfgField label="Razón social" help="Editable desde la administración de la cuenta">
                <input value={company.legalName} disabled className="cfg-input" />
              </CfgField>
              <CfgField label="RUT" help="Editable desde la administración de la cuenta">
                <input
                  value={company.taxId}
                  disabled
                  className="cfg-input"
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
          <footer className="px-6 py-3 border-t border-gray-100 flex justify-end bg-gray-50 rounded-b-xl">
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

function PeriodsSection({
  onToast,
}: {
  onToast: (t: { message: string; type: 'success' | 'error' | 'info' }) => void;
}) {
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<FiscalPeriod[]>(`/api/fiscal-periods?year=${CURRENT_YEAR}`);
      // Sort ascending by month just in case
      res.sort((a, b) => a.month - b.month);
      setPeriods(res);
    } catch {
      onToast({ message: 'Error cargando períodos', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    load();
  }, [load]);

  const generateNext = async () => {
    setGenerating(true);
    try {
      await apiClient.post(`/api/fiscal-periods/generate/${NEXT_YEAR}`);
      onToast({ message: `Períodos ${NEXT_YEAR} generados`, type: 'success' });
    } catch (err) {
      onToast({
        message: err instanceof Error ? err.message : 'Error al generar períodos',
        type: 'error',
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section id="periodos" className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <header className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50">
            <CalendarClock size={18} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-base text-gray-900" style={{ fontWeight: 600 }}>
              Períodos fiscales
            </h2>
            <p className="text-xs text-gray-500" style={{ fontWeight: 300 }}>
              Períodos del año {CURRENT_YEAR}
            </p>
          </div>
        </div>
        <button
          onClick={generateNext}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
          style={{
            background: '#1C1C1E',
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 500,
          }}
        >
          <Calendar size={14} />
          {generating ? 'Generando...' : `Generar períodos ${NEXT_YEAR}`}
        </button>
      </header>

      {loading ? (
        <div className="p-6 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : periods.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-400">
          Sin períodos para {CURRENT_YEAR}
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {periods.map((p) => {
            const badge = STATUS_BADGE[p.status];
            return (
              <div key={p.id} className="px-6 py-3 flex items-center gap-3">
                <div
                  className="mono text-xs text-gray-400 w-8"
                  style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                >
                  {String(p.month).padStart(2, '0')}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-gray-900"
                    style={{
                      fontFamily: 'var(--font-outfit), sans-serif',
                      fontWeight: 500,
                      fontSize: 14,
                    }}
                  >
                    {p.name}
                  </p>
                  <p
                    className="mono text-xs text-gray-400"
                    style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                  >
                    {formatDate(p.startDate)} — {formatDate(p.endDate)}
                  </p>
                </div>
                <span className={`badge text-[11px] px-2.5 py-0.5 rounded-full ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
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
    <section id="alertas" className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <header className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-50">
          <Bell size={18} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-base text-gray-900" style={{ fontWeight: 600 }}>
            Umbrales de alerta
          </h2>
          <p className="text-xs text-gray-500" style={{ fontWeight: 300 }}>
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
          <footer className="px-6 py-3 border-t border-gray-100 flex justify-end bg-gray-50 rounded-b-xl">
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
        className="block mb-1.5 text-gray-700"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500, fontSize: 13 }}
      >
        {label}
      </label>
      {children}
      {help && (
        <p
          className="mt-1.5 text-xs text-gray-400"
          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 300 }}
        >
          {help}
        </p>
      )}
    </div>
  );
}
