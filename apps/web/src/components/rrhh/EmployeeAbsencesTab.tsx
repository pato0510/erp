'use client';

/* HR-012 — the "Licencias" tab on the employee ficha. Covers BOTH permisos and
 * licencias médicas (one unified tab, filterable). Drives /api/rrhh/absences +
 * /api/rrhh/absence-types (clone of the other RRHH tabs; no Operations coupling).
 *
 * The disponibilidad indicator is a SOFT read-only marker from the availability
 * endpoint — it does NOT enforce anything in Operations (that's HR-016).
 * Role gating mirrors the other tabs: a 200 on the list GET ⇒ this caller may
 * also act; a 403 ⇒ "sin permiso", no actions. Dates rendered in UTC. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, Plus, X, XCircle } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';

const ACCENT = '#2563eb';

const CATEGORY_LABELS: Record<string, string> = { PERMISO: 'Permiso', LICENCIA: 'Licencia médica' };
const UNIT_LABELS: Record<string, string> = {
  CORRIDOS: 'días corridos',
  HABILES: 'días hábiles',
  MEDIO_DIA: 'medio día',
  HORAS: 'horas',
};
const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  PENDIENTE: { label: 'Pendiente', bg: 'rgba(37,99,235,0.12)', fg: '#1d4ed8' },
  APROBADO: { label: 'Aprobado', bg: 'rgba(34,197,94,0.12)', fg: '#15803d' },
  RECHAZADO: { label: 'Rechazado', bg: 'rgba(239,68,68,0.12)', fg: '#b91c1c' },
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

interface AbsenceType {
  id: string;
  name: string;
  category: string;
  daysDefault: number | null;
  unit: string;
  withPay: boolean;
  active: boolean;
}

interface Absence {
  id: string;
  category: string;
  absenceTypeId: string | null;
  startDate: string;
  endDate: string;
  dias: number;
  withPay: boolean;
  blocksAvailability: boolean;
  status: keyof typeof STATUS_META;
  medicalFolio: string | null;
  healthEntity: string | null;
  rejectionReason: string | null;
  notes: string | null;
  absenceType: { id: string; name: string; unit: string } | null;
  document: { id: string; fileName: string } | null;
}

interface Availability {
  available: boolean;
  date: string;
  blockingAbsence: Absence | null;
}

interface DocRef {
  id: string;
  fileName: string;
  documentType: { name: string };
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

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      {children}
    </div>
  );
}

async function downloadDocument(documentId: string, fileName: string) {
  const blob = await apiClient.fetchBlob(`/api/rrhh/documents/${documentId}/file?download=1`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function EmployeeAbsencesTab({ employeeId }: { employeeId: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [types, setTypes] = useState<AbsenceType[]>([]);
  const [formMode, setFormMode] = useState<'PERMISO' | 'LICENCIA' | null>(null);
  const [rejectFor, setRejectFor] = useState<Absence | null>(null);
  const [filter, setFilter] = useState<'TODOS' | 'PERMISO' | 'LICENCIA'>('TODOS');
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [abs, avail, tps] = await Promise.all([
        apiClient.get<Absence[]>(`/api/rrhh/absences?employeeId=${employeeId}`),
        apiClient.get<Availability>(`/api/rrhh/absences/availability/${employeeId}`),
        apiClient.get<AbsenceType[]>(`/api/rrhh/absence-types?activeOnly=true`),
      ]);
      setAbsences(abs);
      setAvailability(avail);
      setTypes(tps);
      setState('ok');
    } catch (e) {
      setState(e instanceof ApiError && e.status === 403 ? 'forbidden' : 'error');
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const canManage = state === 'ok';

  const visible = useMemo(
    () => (filter === 'TODOS' ? absences : absences.filter((a) => a.category === filter)),
    [absences, filter],
  );

  const action = async (path: string, body?: unknown) => {
    setActionMsg(null);
    try {
      await apiClient.post(path, body);
      await load();
    } catch (e) {
      setActionMsg(errMessage(e, 'No se pudo completar la acción.'));
    }
  };

  if (state === 'loading') return <Card>Cargando ausencias…</Card>;
  if (state === 'forbidden')
    return (
      <Card>
        <p className="text-sm text-[var(--text-secondary)]">
          No tienes permiso para ver los permisos y licencias de este trabajador.
        </p>
      </Card>
    );
  if (state === 'error' || !availability)
    return (
      <Card>
        <p className="text-sm text-red-600">No se pudieron cargar los permisos y licencias.</p>
      </Card>
    );

  const blocking = availability.blockingAbsence;

  return (
    <div className="space-y-4">
      {/* Disponibilidad indicator (SOFT marker) */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-4"
        style={
          availability.available
            ? { borderColor: 'rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.06)' }
            : { borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.06)' }
        }
      >
        <div className="flex items-center gap-2">
          {availability.available ? (
            <CheckCircle2 size={18} style={{ color: '#15803d' }} />
          ) : (
            <XCircle size={18} style={{ color: '#b91c1c' }} />
          )}
          <span
            className="text-sm font-semibold"
            style={{ color: availability.available ? '#15803d' : '#b91c1c' }}
          >
            {availability.available ? 'Disponible hoy' : 'No disponible hoy'}
          </span>
          {!availability.available && blocking && (
            <span className="text-xs text-[var(--text-secondary)]">
              ({CATEGORY_LABELS[blocking.category] ?? blocking.category}
              {blocking.absenceType ? ` · ${blocking.absenceType.name}` : ''} hasta{' '}
              {formatDateOnly(blocking.endDate)})
            </span>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFormMode('PERMISO')}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
              style={{ background: ACCENT }}
            >
              <Plus size={14} /> Registrar permiso
            </button>
            <button
              onClick={() => setFormMode('LICENCIA')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)]"
            >
              <Plus size={14} /> Registrar licencia
            </button>
          </div>
        )}
      </div>

      {actionMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionMsg}
        </div>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3
            className="text-sm font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            Permisos y licencias
          </h3>
          <div className="flex gap-1">
            {(['TODOS', 'PERMISO', 'LICENCIA'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="rounded-md px-2 py-1 text-xs"
                style={{
                  background: filter === f ? ACCENT : 'transparent',
                  color: filter === f ? '#fff' : 'var(--text-secondary)',
                  border: filter === f ? 'none' : '1px solid var(--border-color)',
                }}
              >
                {f === 'TODOS' ? 'Todos' : CATEGORY_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No hay permisos ni licencias registrados.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border-color)]">
            {visible.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-primary)]">
                    <span className="font-medium">{CATEGORY_LABELS[a.category] ?? a.category}</span>
                    {a.absenceType && (
                      <span className="text-[var(--text-secondary)]">· {a.absenceType.name}</span>
                    )}
                    <span className="text-[var(--text-secondary)]">
                      · {formatDateOnly(a.startDate)} → {formatDateOnly(a.endDate)}
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      · {a.dias}{' '}
                      {a.absenceType ? (UNIT_LABELS[a.absenceType.unit] ?? 'días') : 'días'}
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)]">
                      {a.withPay ? 'con goce' : 'sin goce'}
                    </span>
                  </div>
                  {a.category === 'LICENCIA' && (a.medicalFolio || a.healthEntity) && (
                    <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      {a.medicalFolio ? `Folio ${a.medicalFolio}` : ''}
                      {a.medicalFolio && a.healthEntity ? ' · ' : ''}
                      {a.healthEntity ?? ''}
                    </div>
                  )}
                  {a.status === 'RECHAZADO' && a.rejectionReason && (
                    <div className="text-xs text-red-600">Motivo: {a.rejectionReason}</div>
                  )}
                  {a.document &&
                    (() => {
                      const doc = a.document;
                      return (
                        <button
                          onClick={() => downloadDocument(doc.id, doc.fileName)}
                          className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium"
                          style={{ color: ACCENT }}
                        >
                          <FileText size={12} /> {doc.fileName}
                        </button>
                      );
                    })()}
                </div>
                <StatusBadge status={a.status} />
                {canManage && (a.status === 'PENDIENTE' || a.status === 'APROBADO') && (
                  <div className="flex items-center gap-1.5">
                    {a.status === 'PENDIENTE' && (
                      <>
                        <button
                          onClick={() => action(`/api/rrhh/absences/${a.id}/approve`)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-white"
                          style={{ background: '#16a34a' }}
                        >
                          Aprobar
                        </button>
                        <button
                          onClick={() => setRejectFor(a)}
                          className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700"
                        >
                          Rechazar
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => action(`/api/rrhh/absences/${a.id}/cancel`)}
                      className="rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)]"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {formMode && (
        <AbsenceFormModal
          employeeId={employeeId}
          mode={formMode}
          types={types}
          onClose={() => setFormMode(null)}
          onDone={() => {
            setFormMode(null);
            load();
          }}
          onSeeded={async () => {
            const tps = await apiClient
              .get<AbsenceType[]>(`/api/rrhh/absence-types?activeOnly=true`)
              .catch(() => [] as AbsenceType[]);
            setTypes(tps);
          }}
        />
      )}
      {rejectFor && (
        <RejectModal
          absence={rejectFor}
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

function AbsenceFormModal({
  employeeId,
  mode,
  types,
  onClose,
  onDone,
  onSeeded,
}: {
  employeeId: string;
  mode: 'PERMISO' | 'LICENCIA';
  types: AbsenceType[];
  onClose: () => void;
  onDone: () => void;
  onSeeded: () => void;
}) {
  const permisoTypes = useMemo(() => types.filter((t) => t.category === 'PERMISO'), [types]);
  const [absenceTypeId, setAbsenceTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dias, setDias] = useState('');
  const [withPay, setWithPay] = useState(true);
  const [blocksAvailability, setBlocksAvailability] = useState(true);
  const [medicalFolio, setMedicalFolio] = useState('');
  const [healthEntity, setHealthEntity] = useState('');
  const [registerApproved, setRegisterApproved] = useState(mode === 'LICENCIA');
  const [documentId, setDocumentId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [docs, setDocs] = useState<DocRef[]>([]);

  useEffect(() => {
    apiClient
      .get<DocRef[]>(`/api/rrhh/documents?employeeId=${employeeId}`)
      .then(setDocs)
      .catch(() => setDocs([]));
  }, [employeeId]);

  const onTypeChange = (id: string) => {
    setAbsenceTypeId(id);
    const t = permisoTypes.find((x) => x.id === id);
    if (t) {
      if (t.daysDefault != null) setDias(String(t.daysDefault));
      setWithPay(t.withPay);
    }
  };

  const seed = async () => {
    setSeeding(true);
    setErr(null);
    try {
      await apiClient.post('/api/rrhh/absence-types/seed-recommended');
      onSeeded();
    } catch (e) {
      setErr(errMessage(e, 'No se pudieron sembrar los tipos.'));
    } finally {
      setSeeding(false);
    }
  };

  const submit = async () => {
    if (!startDate || !endDate) return setErr('Selecciona el rango de fechas.');
    if (endDate < startDate)
      return setErr('La fecha de término no puede ser anterior a la de inicio.');
    const diasNum = dias.trim() === '' ? undefined : Number(dias);
    if (diasNum !== undefined && (Number.isNaN(diasNum) || diasNum < 0))
      return setErr('Los días deben ser un número ≥ 0.');
    setBusy(true);
    setErr(null);
    try {
      await apiClient.post('/api/rrhh/absences', {
        employeeId,
        category: mode,
        absenceTypeId: mode === 'PERMISO' ? absenceTypeId || undefined : undefined,
        startDate,
        endDate,
        dias: diasNum,
        withPay,
        blocksAvailability,
        status: registerApproved ? 'APROBADO' : 'PENDIENTE',
        medicalFolio: mode === 'LICENCIA' ? medicalFolio.trim() || undefined : undefined,
        healthEntity: mode === 'LICENCIA' ? healthEntity.trim() || undefined : undefined,
        documentId: documentId || undefined,
        notes: notes.trim() || undefined,
      });
      onDone();
    } catch (e) {
      setErr(errMessage(e, 'No se pudo registrar.'));
      setBusy(false);
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
            {mode === 'PERMISO' ? 'Registrar permiso' : 'Registrar licencia médica'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          {mode === 'PERMISO' && (
            <div>
              <label className={labelCls}>Tipo de permiso</label>
              {permisoTypes.length === 0 ? (
                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-3 text-sm text-[var(--text-secondary)]">
                  No hay tipos configurados.
                  <button
                    onClick={seed}
                    disabled={seeding}
                    className="ml-2 font-medium disabled:opacity-60"
                    style={{ color: ACCENT }}
                  >
                    {seeding ? 'Sembrando…' : 'Sembrar permisos legales chilenos'}
                  </button>
                </div>
              ) : (
                <select
                  value={absenceTypeId}
                  onChange={(e) => onTypeChange(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Selecciona (opcional) —</option>
                  {permisoTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Días (informativo)</label>
              <input
                type="number"
                min={0}
                value={dias}
                onChange={(e) => setDias(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="flex items-end gap-3 pb-2">
              <label className="flex items-center gap-1.5 text-sm text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={withPay}
                  onChange={(e) => setWithPay(e.target.checked)}
                />{' '}
                Con goce
              </label>
              <label className="flex items-center gap-1.5 text-sm text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={blocksAvailability}
                  onChange={(e) => setBlocksAvailability(e.target.checked)}
                />{' '}
                Bloquea disponibilidad
              </label>
            </div>
          </div>

          {mode === 'LICENCIA' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Folio licencia</label>
                  <input
                    value={medicalFolio}
                    onChange={(e) => setMedicalFolio(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Entidad de salud (Isapre/Fonasa)</label>
                  <input
                    value={healthEntity}
                    onChange={(e) => setHealthEntity(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Las licencias se registran únicamente; no se calcula subsidio.
              </p>
            </>
          )}

          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={registerApproved}
              onChange={(e) => setRegisterApproved(e.target.checked)}
            />
            Registrar como aprobada {mode === 'PERMISO' ? '(en vez de dejarla pendiente)' : ''}
          </label>

          <div>
            <label className={labelCls}>Documento de respaldo (cargado en Documentos)</label>
            <select
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              className={inputCls}
            >
              <option value="">— Sin vincular —</option>
              {docs.map((dref) => (
                <option key={dref.id} value={dref.id}>
                  {dref.documentType?.name ? `${dref.documentType.name} · ` : ''}
                  {dref.fileName}
                </option>
              ))}
            </select>
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
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: ACCENT }}
          >
            {busy ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({
  absence,
  onClose,
  onDone,
}: {
  absence: Absence;
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
      await apiClient.post(`/api/rrhh/absences/${absence.id}/reject`, { reason: reason.trim() });
      onDone();
    } catch (e) {
      setErr(errMessage(e, 'No se pudo rechazar.'));
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
            Rechazar
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
