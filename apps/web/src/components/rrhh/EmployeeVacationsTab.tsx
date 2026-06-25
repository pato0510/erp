'use client';

/* HR-011 — the "Vacaciones" tab on the employee ficha. Drives /api/rrhh/vacations
 * (clone of the other RRHH tabs; no Operations API coupling). Shows the COMPUTED
 * feriado-legal balance (días hábiles) + the request list, and lets managers
 * request/approve/reject/cancel and set the manual días adicionales.
 *
 * The balance is días hábiles (Mon–Fri); festivos are NOT auto-handled in V1 —
 * an admin can override a request's día-count for festivos. Role gating mirrors
 * the other tabs: a 200 on the list/balance GET ⇒ this caller may also act; a
 * 403 ⇒ "sin permiso", no actions. Dates rendered in UTC. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Pencil, Plus, Sliders, X, XCircle } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';

const ACCENT = '#2563eb';

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  PENDIENTE: { label: 'Pendiente', bg: 'rgba(37,99,235,0.12)', fg: '#1d4ed8' },
  APROBADO: { label: 'Aprobado', bg: 'rgba(34,197,94,0.12)', fg: '#15803d' },
  RECHAZADO: { label: 'Rechazado', bg: 'rgba(239,68,68,0.12)', fg: '#b91c1c' },
  TOMADO: { label: 'Tomado', bg: 'rgba(100,116,139,0.16)', fg: '#475569' },
  CANCELADO: { label: 'Cancelado', bg: 'rgba(100,116,139,0.14)', fg: '#64748b' },
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

/* Días hábiles shown to ≤1 decimal where fractional (e.g. 12,5). */
function formatDias(n: number): string {
  return n.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

/* Mirror of the backend countBusinessDays (Mon–Fri inclusive, UTC) for the
   live pre-submit preview. The backend remains the source of truth. */
function countBusinessDaysLocal(startISO: string, endISO: string): number {
  if (!startISO || !endISO) return 0;
  const from = new Date(`${startISO}T00:00:00Z`).getTime();
  const to = new Date(`${endISO}T00:00:00Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  let c = 0;
  for (let t = from; t <= to; t += 86_400_000) {
    const dow = new Date(t).getUTCDay();
    if (dow >= 1 && dow <= 5) c++;
  }
  return c;
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

interface Balance {
  hireDate: string;
  feriadoAnualDiasHabiles: number;
  devengado: number;
  diasAdicionales: number;
  tomados: number;
  pendientes: number;
  saldoDisponible: number;
  asOf: string;
}

interface VacationRequest {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  diasHabiles: number;
  status: keyof typeof STATUS_META;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string;
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.CANCELADO;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </div>
      <div className="text-lg font-semibold" style={{ color: color ?? 'var(--text-primary)' }}>
        {value}
      </div>
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

export default function EmployeeVacationsTab({ employeeId }: { employeeId: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [balance, setBalance] = useState<Balance | null>(null);
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [requestOpen, setRequestOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rejectFor, setRejectFor] = useState<VacationRequest | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [bal, reqs] = await Promise.all([
        apiClient.get<Balance>(`/api/rrhh/vacations/balance/${employeeId}`),
        apiClient.get<VacationRequest[]>(`/api/rrhh/vacations?employeeId=${employeeId}`),
      ]);
      setBalance(bal);
      setRequests(reqs);
      setState('ok');
    } catch (e) {
      setState(e instanceof ApiError && e.status === 403 ? 'forbidden' : 'error');
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const canManage = state === 'ok';

  const action = async (path: string, body?: unknown) => {
    setActionMsg(null);
    try {
      await apiClient.post(path, body);
      await load();
    } catch (e) {
      setActionMsg(errMessage(e, 'No se pudo completar la acción.'));
    }
  };

  if (state === 'loading') return <Card>Cargando vacaciones…</Card>;
  if (state === 'forbidden')
    return (
      <Card>
        <p className="text-sm text-[var(--text-secondary)]">
          No tienes permiso para ver las vacaciones de este trabajador.
        </p>
      </Card>
    );
  if (state === 'error' || !balance)
    return (
      <Card>
        <p className="text-sm text-red-600">No se pudieron cargar las vacaciones.</p>
      </Card>
    );

  const saldoColor = balance.saldoDisponible < 0 ? '#b91c1c' : '#15803d';

  return (
    <div className="space-y-4">
      {/* Balance summary */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2
            className="text-sm font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            Saldo de feriado legal{' '}
            <span className="font-normal text-[var(--text-secondary)]">(días hábiles)</span>
          </h2>
          <div className="flex items-center gap-1.5">
            {canManage && (
              <button
                onClick={() => setSettingsOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <Sliders size={13} /> Días adicionales
              </button>
            )}
            {canManage && (
              <button
                onClick={() => setRequestOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                style={{ background: ACCENT }}
              >
                <Plus size={14} /> Solicitar vacaciones
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="Saldo disponible"
            value={formatDias(balance.saldoDisponible)}
            color={saldoColor}
          />
          <Stat label="Devengado" value={formatDias(balance.devengado)} />
          <Stat label="Días adicionales" value={formatDias(balance.diasAdicionales)} />
          <Stat label="Tomados" value={formatDias(balance.tomados)} />
          <Stat label="Pendientes" value={formatDias(balance.pendientes)} color="#1d4ed8" />
          <Stat label="Feriado anual" value={formatDias(balance.feriadoAnualDiasHabiles)} />
        </div>
        <p className="mt-3 text-xs text-[var(--text-secondary)]">
          Devengado = 1,25 días hábiles por mes desde el ingreso ({formatDateOnly(balance.hireDate)}
          ). Saldo = devengado + adicionales − días hábiles aprobados/tomados. Los festivos no se
          descuentan automáticamente (V1); el administrador puede ajustar los días hábiles de cada
          solicitud.
        </p>
      </Card>

      {actionMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionMsg}
        </div>
      )}

      {/* Requests list */}
      <Card>
        <h3
          className="mb-3 text-sm font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Solicitudes
        </h3>
        {requests.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No hay solicitudes de vacaciones.</p>
        ) : (
          <div className="divide-y divide-[var(--border-color)]">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <CalendarDays size={15} className="text-[var(--text-secondary)]" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-[var(--text-primary)]">
                    {formatDateOnly(r.startDate)} → {formatDateOnly(r.endDate)}{' '}
                    <span className="text-[var(--text-secondary)]">
                      · {formatDias(r.diasHabiles)} días hábiles
                    </span>
                  </div>
                  {r.status === 'RECHAZADO' && r.rejectionReason && (
                    <div className="text-xs text-red-600">Motivo: {r.rejectionReason}</div>
                  )}
                </div>
                <StatusBadge status={r.status} />
                {canManage && r.status === 'PENDIENTE' && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => action(`/api/rrhh/vacations/${r.id}/approve`)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-white"
                      style={{ background: '#16a34a' }}
                    >
                      <Check size={13} /> Aprobar
                    </button>
                    <button
                      onClick={() => setRejectFor(r)}
                      className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs text-red-700"
                    >
                      <X size={13} /> Rechazar
                    </button>
                    <button
                      onClick={() => action(`/api/rrhh/vacations/${r.id}/cancel`)}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)]"
                    >
                      <XCircle size={13} /> Cancelar
                    </button>
                  </div>
                )}
                {canManage && r.status === 'APROBADO' && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => action(`/api/rrhh/vacations/${r.id}/mark-taken`)}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)]"
                    >
                      Marcar tomado
                    </button>
                    <button
                      onClick={() => action(`/api/rrhh/vacations/${r.id}/cancel`)}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)]"
                    >
                      <XCircle size={13} /> Cancelar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {requestOpen && (
        <RequestModal
          employeeId={employeeId}
          balance={balance}
          onClose={() => setRequestOpen(false)}
          onDone={() => {
            setRequestOpen(false);
            load();
          }}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          employeeId={employeeId}
          current={balance.diasAdicionales}
          onClose={() => setSettingsOpen(false)}
          onDone={() => {
            setSettingsOpen(false);
            load();
          }}
        />
      )}
      {rejectFor && (
        <RejectModal
          request={rejectFor}
          onClose={() => setRejectFor(null)}
          onDone={() => {
            setRejectFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function RequestModal({
  employeeId,
  balance,
  onClose,
  onDone,
}: {
  employeeId: string;
  balance: Balance;
  onClose: () => void;
  onDone: () => void;
}) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dias = useMemo(() => countBusinessDaysLocal(startDate, endDate), [startDate, endDate]);
  // available nets out current pending requests, matching the backend warning
  const available = balance.saldoDisponible - balance.pendientes;
  const projected = available - dias;

  const submit = async () => {
    if (!startDate || !endDate) return setErr('Selecciona el rango de fechas.');
    if (endDate < startDate)
      return setErr('La fecha de término no puede ser anterior a la de inicio.');
    setBusy(true);
    setErr(null);
    try {
      await apiClient.post('/api/rrhh/vacations', {
        employeeId,
        startDate,
        endDate,
        notes: notes.trim() || undefined,
      });
      onDone();
    } catch (e) {
      setErr(errMessage(e, 'No se pudo crear la solicitud.'));
      setBusy(false);
    }
  };

  const inputCls =
    'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';
  const labelCls = 'mb-1 block text-xs text-[var(--text-secondary)]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            Solicitar vacaciones
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Desde</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Hasta</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Días hábiles (Mon–Fri)</span>
              <span className="font-semibold text-[var(--text-primary)]">{formatDias(dias)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-[var(--text-secondary)]">Saldo proyectado</span>
              <span
                className="font-semibold"
                style={{ color: projected < 0 ? '#b91c1c' : '#15803d' }}
              >
                {formatDias(projected)}
              </span>
            </div>
            {projected < 0 && (
              <p className="mt-2 text-xs text-red-600">
                La solicitud supera el saldo disponible. Puedes enviarla igual; el administrador la
                revisará.
              </p>
            )}
            <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
              No se descuentan festivos automáticamente (V1).
            </p>
          </div>

          <div>
            <label className={labelCls}>Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </div>
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
            onClick={submit}
            disabled={busy || dias === 0}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: ACCENT }}
          >
            {busy ? 'Enviando…' : 'Solicitar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({
  employeeId,
  current,
  onClose,
  onDone,
}: {
  employeeId: string;
  current: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState(String(current));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const n = Number(value);
    if (value.trim() === '' || Number.isNaN(n) || n < 0 || !Number.isInteger(n))
      return setErr('Ingresa un número entero ≥ 0.');
    setBusy(true);
    setErr(null);
    try {
      await apiClient.patch(`/api/rrhh/vacations/settings/${employeeId}`, {
        diasAdicionalesFeriado: n,
      });
      onDone();
    } catch (e) {
      setErr(errMessage(e, 'No se pudo guardar.'));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            <Pencil size={15} className="mr-1 inline" /> Días adicionales (feriado progresivo)
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-4">
          <label className="mb-1 block text-xs text-[var(--text-secondary)]">
            Días hábiles adicionales
          </label>
          <input
            type="number"
            min={0}
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            Campo manual. V1 no calcula el feriado progresivo automáticamente (requiere certificados
            del empleador anterior).
          </p>
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)]"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: ACCENT }}
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({
  request,
  onClose,
  onDone,
}: {
  request: VacationRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (reason.trim().length < 5) return setErr('El motivo debe tener al menos 5 caracteres.');
    setBusy(true);
    setErr(null);
    try {
      await apiClient.post(`/api/rrhh/vacations/${request.id}/reject`, { reason: reason.trim() });
      onDone();
    } catch (e) {
      setErr(errMessage(e, 'No se pudo rechazar la solicitud.'));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            Rechazar solicitud
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-4">
          <label className="mb-1 block text-xs text-[var(--text-secondary)]">
            Motivo del rechazo *
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)]"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? 'Rechazando…' : 'Rechazar'}
          </button>
        </div>
      </div>
    </div>
  );
}
