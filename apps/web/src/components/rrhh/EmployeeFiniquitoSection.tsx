'use client';

/* HR-010 — finiquito estimación + registro, rendered INSIDE the Remuneraciones
 * tab (already gated on the EmployeeCompensation read+update guard, so this is
 * MANAGER/ADMIN/SUPER_ADMIN-only; ACCOUNTANT/VIEWER never reach it). The
 * calculator is EPHEMERAL (POST /estimate persists nothing); "Registrar
 * finiquito" (POST /terminations) persists deliberately. This is an ESTIMATION,
 * not the definitive legal finiquito — the disclaimer is shown prominently.
 * Every fetch targets /api/rrhh/*. */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Calculator, Trash2, X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { formatCLP } from '../../lib/formatters';

const ACCENT = '#2563eb';

const CAUSAL_LABELS: Record<string, string> = {
  NECESIDADES_EMPRESA: 'Necesidades de la empresa (Art. 161)',
  DESAHUCIO_EMPLEADOR: 'Desahucio del empleador (Art. 161)',
  RENUNCIA: 'Renuncia (Art. 159 N°2)',
  MUTUO_ACUERDO: 'Mutuo acuerdo (Art. 159 N°1)',
  CADUCIDAD_ART160: 'Caducidad (Art. 160)',
  PLAZO_FIJO_TERMINO: 'Término de plazo / obra',
};
const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  REGISTRADO: { label: 'Registrado', bg: 'rgba(34,197,94,0.12)', fg: '#15803d' },
  ANULADO: { label: 'Anulado', bg: 'rgba(239,68,68,0.12)', fg: '#b91c1c' },
};

function formatDateOnly(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
function errMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    const data = (e.data ?? {}) as { message?: string | string[] };
    const raw = Array.isArray(data.message) ? data.message.join(' ') : data.message;
    if (e.status === 403)
      return raw && !/forbidden/i.test(raw) ? raw : 'No tienes permiso para esta acción.';
    return raw || e.message || fallback;
  }
  if (e instanceof Error) return e.message;
  return fallback;
}

interface Breakdown {
  causal: string;
  ufValue: number;
  baseMonthly: number;
  avisoPrevioDado: boolean;
  topeUf: number;
  topeBaseEnPesos: number;
  baseTopada: number;
  capBaseAplicado: boolean;
  aniosServicio: number;
  aniosIndemnizables: number;
  capAniosAplicado: boolean;
  dailyRate: number;
  feriadoDias: number;
  montoIas: number;
  montoAvisoPrevio: number;
  montoFeriado: number;
  montoTotal: number;
  disclaimer: string;
}
interface TerminationRecord {
  id: string;
  causal: string;
  terminationDate: string;
  montoTotal: string;
  status: keyof typeof STATUS_META;
}

export default function EmployeeFiniquitoSection({ employeeId }: { employeeId: string }) {
  const [records, setRecords] = useState<TerminationRecord[]>([]);
  const [calcOpen, setCalcOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiClient.get<TerminationRecord[]>(
        `/api/rrhh/terminations?employeeId=${employeeId}`,
      );
      setRecords(data);
    } catch {
      /* the parent tab already gates visibility; ignore here */
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const anular = async (id: string) => {
    if (!confirm('¿Anular este finiquito registrado? (no revierte el estado del trabajador)'))
      return;
    setMsg(null);
    try {
      await apiClient.post(`/api/rrhh/terminations/${id}/anular`);
      await load();
    } catch (e) {
      setMsg(errMessage(e, 'No se pudo anular el finiquito.'));
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3
          className="text-sm font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Finiquito
        </h3>
        <button
          onClick={() => setCalcOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
          style={{ background: ACCENT }}
        >
          <Calculator size={14} /> Calcular finiquito
        </button>
      </div>

      <p className="mb-3 text-[11px] text-[var(--text-secondary)]">
        Estimación referencial — no reemplaza el cálculo formal del finiquito.
      </p>

      {msg && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {msg}
        </div>
      )}

      {records.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">No hay finiquitos registrados.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-color)] text-left text-xs text-[var(--text-secondary)]">
              <th className="py-2 font-medium">Causal</th>
              <th className="py-2 font-medium">Fecha</th>
              <th className="py-2 font-medium">Total</th>
              <th className="py-2 font-medium">Estado</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {records.map((r) => (
              <tr key={r.id}>
                <td className="py-2 text-[var(--text-primary)]">
                  {CAUSAL_LABELS[r.causal] ?? r.causal}
                </td>
                <td className="py-2 text-[var(--text-secondary)]">
                  {formatDateOnly(r.terminationDate)}
                </td>
                <td className="py-2 text-[var(--text-primary)]">{formatCLP(r.montoTotal)}</td>
                <td className="py-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      background: (STATUS_META[r.status] ?? STATUS_META.ANULADO).bg,
                      color: (STATUS_META[r.status] ?? STATUS_META.ANULADO).fg,
                    }}
                  >
                    {(STATUS_META[r.status] ?? STATUS_META.ANULADO).label}
                  </span>
                </td>
                <td className="py-2 text-right">
                  {r.status === 'REGISTRADO' && (
                    <button
                      onClick={() => anular(r.id)}
                      className="rounded-md border border-red-300 p-1 text-red-700"
                      title="Anular"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {calcOpen && (
        <FiniquitoCalculatorModal
          employeeId={employeeId}
          onClose={() => setCalcOpen(false)}
          onRegistered={() => {
            setCalcOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function FiniquitoCalculatorModal({
  employeeId,
  onClose,
  onRegistered,
}: {
  employeeId: string;
  onClose: () => void;
  onRegistered: () => void;
}) {
  const [causal, setCausal] = useState('NECESIDADES_EMPRESA');
  const [ufValue, setUfValue] = useState('');
  const [baseMonthly, setBaseMonthly] = useState('');
  const [terminationDate, setTerminationDate] = useState('');
  const [avisoPrevioDado, setAvisoPrevioDado] = useState(true);
  const [feriadoDias, setFeriadoDias] = useState('');
  const [markDesvinculado, setMarkDesvinculado] = useState(false);
  const [notes, setNotes] = useState('');
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [busy, setBusy] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const body = () => ({
    employeeId,
    causal,
    terminationDate,
    ufValue: Number(ufValue),
    baseMonthly: baseMonthly.trim() === '' ? undefined : Number(baseMonthly),
    avisoPrevioDado,
    feriadoDias: feriadoDias.trim() === '' ? undefined : Number(feriadoDias),
  });

  const validate = (): string | null => {
    if (!terminationDate) return 'Selecciona la fecha de término.';
    if (ufValue.trim() === '' || Number.isNaN(Number(ufValue)) || Number(ufValue) <= 0)
      return 'Ingresa el valor de la UF (editable).';
    return null;
  };

  const calcular = async () => {
    const v = validate();
    if (v) return setErr(v);
    setBusy(true);
    setErr(null);
    try {
      const r = await apiClient.post<Breakdown>('/api/rrhh/terminations/estimate', body());
      setBreakdown(r);
    } catch (e) {
      setErr(errMessage(e, 'No se pudo calcular el finiquito.'));
    } finally {
      setBusy(false);
    }
  };

  const registrar = async () => {
    const v = validate();
    if (v) return setErr(v);
    if (!confirm('¿Registrar este finiquito? Es una acción deliberada que queda guardada.')) return;
    setRegistering(true);
    setErr(null);
    try {
      await apiClient.post('/api/rrhh/terminations', {
        ...body(),
        markEmployeeDesvinculado: markDesvinculado,
        notes: notes.trim() || undefined,
      });
      onRegistered();
    } catch (e) {
      setErr(errMessage(e, 'No se pudo registrar el finiquito.'));
      setRegistering(false);
    }
  };

  const inputCls =
    'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';
  const labelCls = 'mb-1 block text-xs text-[var(--text-secondary)]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            Calcular finiquito (estimación)
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 px-5 py-4">
          <div className="col-span-2">
            <label className={labelCls}>Causal</label>
            <select value={causal} onChange={(e) => setCausal(e.target.value)} className={inputCls}>
              {Object.entries(CAUSAL_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Valor UF * (editable)</label>
            <input
              type="number"
              min={0}
              step="0.0001"
              value={ufValue}
              onChange={(e) => setUfValue(e.target.value)}
              placeholder="Ej. 39000"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Base de cálculo (CLP, editable)</label>
            <input
              type="number"
              min={0}
              value={baseMonthly}
              onChange={(e) => setBaseMonthly(e.target.value)}
              placeholder="Desde remuneración"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Fecha de término *</label>
            <input
              type="date"
              value={terminationDate}
              onChange={(e) => setTerminationDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Feriado días (editable)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={feriadoDias}
              onChange={(e) => setFeriadoDias(e.target.value)}
              placeholder="Desde saldo de vacaciones"
              className={inputCls}
            />
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={avisoPrevioDado}
                onChange={(e) => setAvisoPrevioDado(e.target.checked)}
              />
              ¿Se dio aviso previo (30 días)?
            </label>
          </div>
          {err && <p className="col-span-2 text-sm text-red-600">{err}</p>}
        </div>

        <div className="px-5">
          <button
            onClick={calcular}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: ACCENT }}
          >
            <Calculator size={14} /> {busy ? 'Calculando…' : 'Calcular'}
          </button>
        </div>

        {breakdown && (
          <div className="px-5 py-4">
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-4">
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <BD
                  label="Años de servicio"
                  value={`${breakdown.aniosServicio}${breakdown.capAniosAplicado ? ` (tope 11)` : ''}`}
                />
                <BD label="Años indemnizables" value={String(breakdown.aniosIndemnizables)} />
                <BD
                  label="Base topada (90 UF)"
                  value={formatCLP(breakdown.baseTopada) + (breakdown.capBaseAplicado ? ' ⚑' : '')}
                />
                <BD label="Indemnización años servicio" value={formatCLP(breakdown.montoIas)} />
                <BD label="Aviso previo" value={formatCLP(breakdown.montoAvisoPrevio)} />
                <BD
                  label={`Feriado (${breakdown.feriadoDias} días × ${formatCLP(breakdown.dailyRate)})`}
                  value={formatCLP(breakdown.montoFeriado)}
                />
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-[var(--border-color)] pt-3">
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  Total estimado
                </span>
                <span className="text-lg font-semibold" style={{ color: ACCENT }}>
                  {formatCLP(breakdown.montoTotal)}
                </span>
              </div>
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{breakdown.disclaimer}</span>
            </div>

            {/* Deliberate register action */}
            <div className="mt-4 border-t border-[var(--border-color)] pt-4">
              <label className="mb-2 flex items-center gap-2 text-sm text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={markDesvinculado}
                  onChange={(e) => setMarkDesvinculado(e.target.checked)}
                />
                Marcar al trabajador como desvinculado al registrar
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Notas (opcional)"
                className={inputCls}
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)]"
                >
                  Cerrar
                </button>
                <button
                  onClick={registrar}
                  disabled={registering}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: '#15803d' }}
                >
                  {registering ? 'Registrando…' : 'Registrar finiquito'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BD({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </div>
      <div className="text-sm font-medium text-[var(--text-primary)]">{value}</div>
    </div>
  );
}
