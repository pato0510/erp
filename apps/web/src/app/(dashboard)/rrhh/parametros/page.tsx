'use client';

/* HR-008 — Parámetros previsionales (company-level config). Period-versioned
 * payroll parameter sets + AFP comisiones. Drives /api/rrhh/payroll-parameters
 * (clone of the cargos config screen; no Operations coupling). These are DATA —
 * there is NO liquidación engine here (V2). Role gating mirrors the other RRHH
 * screens: a 200 on the list GET ⇒ this caller may also edit; a 403 ⇒ "sin
 * permiso", no edit actions. Tokens: accent #2563eb, Outfit headings. UF shown
 * with 2 decimals, % with up to 3. */
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/api';

const ACCENT = '#2563eb';

function formatDateOnly(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
function fmtUf(v: string | number | null): string {
  if (v === null) return '—';
  return Number(v).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(v: string | number | null): string {
  if (v === null) return '—';
  return `${Number(v).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}%`;
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

interface AfpRate {
  id: string;
  afpName: string;
  comisionPorcentaje: string | null;
  active: boolean;
}
interface ParameterSet {
  id: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  topeImponibleAfpSaludUf: string;
  topeImponibleAfcUf: string;
  tasaAfpObligatoria: string;
  tasaSalud: string;
  tasaAfcIndefinidoTrabajador: string;
  tasaAfcIndefinidoEmpleador: string;
  tasaAfcPlazoFijoEmpleador: string;
  tasaSis: string | null;
  active: boolean;
  notes: string | null;
  afpRates?: AfpRate[];
}

const TASA_FIELDS: { key: keyof ParameterSet; label: string }[] = [
  { key: 'tasaAfpObligatoria', label: 'AFP obligatoria' },
  { key: 'tasaSalud', label: 'Salud' },
  { key: 'tasaAfcIndefinidoTrabajador', label: 'AFC indefinido — trabajador' },
  { key: 'tasaAfcIndefinidoEmpleador', label: 'AFC indefinido — empleador' },
  { key: 'tasaAfcPlazoFijoEmpleador', label: 'AFC plazo fijo — empleador' },
  { key: 'tasaSis', label: 'SIS (empleador)' },
];

export default function ParametrosPage() {
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [sets, setSets] = useState<ParameterSet[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ParameterSet | null>(null);
  const [editSet, setEditSet] = useState<ParameterSet | null>(null);
  const [editAfp, setEditAfp] = useState<AfpRate | null>(null);
  const [addAfpForSet, setAddAfpForSet] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const loadSet = useCallback(async (id: string) => {
    const full = await apiClient.get<ParameterSet>(`/api/rrhh/payroll-parameters/${id}`);
    setSelected(full);
    setSelectedId(id);
  }, []);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [list, current] = await Promise.all([
        apiClient.get<ParameterSet[]>('/api/rrhh/payroll-parameters'),
        apiClient.get<ParameterSet | null>('/api/rrhh/payroll-parameters/current'),
      ]);
      setSets(list);
      setCurrentId(current?.id ?? null);
      if (current) {
        setSelected(current);
        setSelectedId(current.id);
      } else if (list.length > 0) {
        await loadSet(list[0].id);
      } else {
        setSelected(null);
        setSelectedId(null);
      }
      setState('ok');
    } catch (e) {
      setState(e instanceof ApiError && e.status === 403 ? 'forbidden' : 'error');
    }
  }, [loadSet]);

  useEffect(() => {
    load();
  }, [load]);

  const canManage = state === 'ok';

  const seed2026 = async () => {
    setSeeding(true);
    setMsg(null);
    try {
      await apiClient.post('/api/rrhh/payroll-parameters/seed-2026');
      await load();
    } catch (e) {
      setMsg(errMessage(e, 'No se pudieron cargar los parámetros 2026.'));
    } finally {
      setSeeding(false);
    }
  };

  if (state === 'loading')
    return <p className="pt-6 text-sm text-[var(--text-secondary)]">Cargando parámetros…</p>;
  if (state === 'forbidden')
    return (
      <p className="pt-6 text-sm text-[var(--text-secondary)]">
        No tienes permiso para ver los parámetros previsionales.
      </p>
    );
  if (state === 'error')
    return <p className="pt-6 text-sm text-red-600">No se pudieron cargar los parámetros.</p>;

  return (
    <div className="pt-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="h-6 w-1.5 rounded-full" style={{ background: ACCENT }} />
          <h1
            className="text-2xl font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            Parámetros previsionales
          </h1>
        </div>
        {canManage && (
          <button
            onClick={seed2026}
            disabled={seeding}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: ACCENT }}
          >
            <SlidersHorizontal size={14} /> {seeding ? 'Cargando…' : 'Cargar parámetros 2026'}
          </button>
        )}
      </div>

      {msg && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {msg}
        </div>
      )}

      {sets.length === 0 || !selected ? (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">
            Aún no hay parámetros previsionales configurados. Usa “Cargar parámetros 2026” para
            sembrar los valores verificados.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Period selector */}
          {sets.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-secondary)]">Período</label>
              <select
                value={selectedId ?? ''}
                onChange={(e) => loadSet(e.target.value)}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
              >
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.id === currentId ? '(vigente)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Set card */}
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2
                  className="text-sm font-semibold text-[var(--text-primary)]"
                  style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
                >
                  Conjunto {selected.name}
                </h2>
                {selected.id === currentId && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ background: 'rgba(34,197,94,0.12)', color: '#15803d' }}
                  >
                    Vigente
                  </span>
                )}
                <span className="text-xs text-[var(--text-secondary)]">
                  {formatDateOnly(selected.effectiveFrom)} →{' '}
                  {selected.effectiveTo ? formatDateOnly(selected.effectiveTo) : 'abierto'}
                </span>
              </div>
              {canManage && (
                <button
                  onClick={() => setEditSet(selected)}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <Pencil size={13} /> Editar
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Tope AFP/Salud (UF)" value={fmtUf(selected.topeImponibleAfpSaludUf)} />
              <Stat label="Tope AFC (UF)" value={fmtUf(selected.topeImponibleAfcUf)} />
              {TASA_FIELDS.map((f) => (
                <Stat
                  key={f.key}
                  label={f.label}
                  value={fmtPct(selected[f.key] as string | null)}
                />
              ))}
            </div>
            {selected.notes && (
              <p className="mt-3 text-xs text-[var(--text-secondary)]">{selected.notes}</p>
            )}
          </Card>

          {/* AFP table */}
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3
                className="text-sm font-semibold text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
              >
                Comisiones AFP
              </h3>
              {canManage && (
                <button
                  onClick={() => setAddAfpForSet(selected.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <Plus size={13} /> Agregar AFP
                </button>
              )}
            </div>
            {(selected.afpRates ?? []).length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">Sin AFP registradas.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-color)] text-left text-xs text-[var(--text-secondary)]">
                    <th className="py-2 font-medium">AFP</th>
                    <th className="py-2 font-medium">Comisión</th>
                    {canManage && <th className="py-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {(selected.afpRates ?? []).map((a) => (
                    <tr key={a.id}>
                      <td className="py-2 text-[var(--text-primary)]">{a.afpName}</td>
                      <td className="py-2">
                        {a.comisionPorcentaje === null ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{ background: 'rgba(234,179,8,0.14)', color: '#a16207' }}
                          >
                            Por completar
                          </span>
                        ) : (
                          <span className="text-[var(--text-primary)]">
                            {fmtPct(a.comisionPorcentaje)}
                          </span>
                        )}
                      </td>
                      {canManage && (
                        <td className="py-2 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => setEditAfp(a)}
                              className="rounded-md border border-[var(--border-color)] p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                              title="Editar comisión"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm(`¿Eliminar ${a.afpName}?`)) return;
                                try {
                                  await apiClient.delete(
                                    `/api/rrhh/payroll-parameters/afp/${a.id}`,
                                  );
                                  await loadSet(selected.id);
                                } catch (e) {
                                  setMsg(errMessage(e, 'No se pudo eliminar.'));
                                }
                              }}
                              className="rounded-md border border-red-300 p-1 text-red-700"
                              title="Eliminar AFP"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-3 text-[11px] text-[var(--text-secondary)]">
              Las comisiones marcadas “Por completar” no están verificadas — complétalas desde
              spensiones.cl.
            </p>
          </Card>
        </div>
      )}

      {editSet && (
        <SetEditModal
          set={editSet}
          onClose={() => setEditSet(null)}
          onDone={async () => {
            setEditSet(null);
            await load();
          }}
        />
      )}
      {editAfp && selected && (
        <AfpEditModal
          afp={editAfp}
          onClose={() => setEditAfp(null)}
          onDone={async () => {
            setEditAfp(null);
            await loadSet(selected.id);
          }}
        />
      )}
      {addAfpForSet && (
        <AfpAddModal
          setId={addAfpForSet}
          onClose={() => setAddAfpForSet(null)}
          onDone={async () => {
            const id = addAfpForSet;
            setAddAfpForSet(null);
            if (id) await loadSet(id);
          }}
        />
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
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </div>
      <div className="text-sm font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

const SET_NUM_FIELDS: { key: keyof ParameterSet; label: string; uf?: boolean }[] = [
  { key: 'topeImponibleAfpSaludUf', label: 'Tope AFP/Salud (UF)', uf: true },
  { key: 'topeImponibleAfcUf', label: 'Tope AFC (UF)', uf: true },
  { key: 'tasaAfpObligatoria', label: 'AFP obligatoria (%)' },
  { key: 'tasaSalud', label: 'Salud (%)' },
  { key: 'tasaAfcIndefinidoTrabajador', label: 'AFC indef. trabajador (%)' },
  { key: 'tasaAfcIndefinidoEmpleador', label: 'AFC indef. empleador (%)' },
  { key: 'tasaAfcPlazoFijoEmpleador', label: 'AFC plazo fijo empleador (%)' },
  { key: 'tasaSis', label: 'SIS empleador (%)' },
];

function SetEditModal({
  set,
  onClose,
  onDone,
}: {
  set: ParameterSet;
  onClose: () => void;
  onDone: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {
      name: set.name,
      effectiveFrom: set.effectiveFrom.slice(0, 10),
      effectiveTo: set.effectiveTo ? set.effectiveTo.slice(0, 10) : '',
      notes: set.notes ?? '',
    };
    for (const f of SET_NUM_FIELDS) {
      const raw = set[f.key] as string | null;
      v[f.key] = raw === null ? '' : String(Number(raw));
    }
    return v;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set1 = (k: string, val: string) => setValues((s) => ({ ...s, [k]: val }));

  const submit = async () => {
    setBusy(true);
    setErr(null);
    const body: Record<string, unknown> = {
      name: values.name,
      effectiveFrom: values.effectiveFrom,
      effectiveTo: values.effectiveTo || null,
      notes: values.notes.trim() || undefined,
    };
    for (const f of SET_NUM_FIELDS) {
      const raw = values[f.key];
      if (raw.trim() === '') {
        if (f.key === 'tasaSis') continue; // SIS may stay null/omitted
      } else {
        body[f.key] = Number(raw);
      }
    }
    try {
      await apiClient.patch(`/api/rrhh/payroll-parameters/${set.id}`, body);
      onDone();
    } catch (e) {
      setErr(errMessage(e, 'No se pudo guardar.'));
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
            Editar conjunto {set.name}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 px-5 py-4">
          <div>
            <label className={labelCls}>Nombre</label>
            <input
              value={values.name}
              onChange={(e) => set1('name', e.target.value)}
              className={inputCls}
            />
          </div>
          <div />
          <div>
            <label className={labelCls}>Vigente desde</label>
            <input
              type="date"
              value={values.effectiveFrom}
              onChange={(e) => set1('effectiveFrom', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Vigente hasta (opcional)</label>
            <input
              type="date"
              value={values.effectiveTo}
              onChange={(e) => set1('effectiveTo', e.target.value)}
              className={inputCls}
            />
          </div>
          {SET_NUM_FIELDS.map((f) => (
            <div key={f.key}>
              <label className={labelCls}>{f.label}</label>
              <input
                type="number"
                step={f.uf ? '0.01' : '0.001'}
                min={0}
                value={values[f.key]}
                onChange={(e) => set1(f.key, e.target.value)}
                className={inputCls}
              />
            </div>
          ))}
          <div className="col-span-2">
            <label className={labelCls}>Notas</label>
            <textarea
              value={values.notes}
              onChange={(e) => set1('notes', e.target.value)}
              rows={2}
              className={inputCls}
            />
          </div>
          {err && <p className="col-span-2 text-sm text-red-600">{err}</p>}
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

function AfpEditModal({
  afp,
  onClose,
  onDone,
}: {
  afp: AfpRate;
  onClose: () => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState(
    afp.comisionPorcentaje === null ? '' : String(Number(afp.comisionPorcentaje)),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    const comision = value.trim() === '' ? null : Number(value);
    if (comision !== null && (Number.isNaN(comision) || comision < 0)) {
      setErr('Ingresa un porcentaje ≥ 0 o déjalo vacío para “por completar”.');
      setBusy(false);
      return;
    }
    try {
      await apiClient.patch(`/api/rrhh/payroll-parameters/afp/${afp.id}`, {
        comisionPorcentaje: comision,
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
            Comisión {afp.afpName}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-4">
          <label className="mb-1 block text-xs text-[var(--text-secondary)]">Comisión (%)</label>
          <input
            type="number"
            step="0.001"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Vacío = por completar"
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

function AfpAddModal({
  setId,
  onClose,
  onDone,
}: {
  setId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [afpName, setAfpName] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!afpName.trim()) return setErr('Ingresa el nombre de la AFP.');
    setBusy(true);
    setErr(null);
    const comision = value.trim() === '' ? null : Number(value);
    try {
      await apiClient.post(`/api/rrhh/payroll-parameters/${setId}/afp`, {
        afpName: afpName.trim(),
        comisionPorcentaje: comision,
      });
      onDone();
    } catch (e) {
      setErr(errMessage(e, 'No se pudo agregar.'));
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
            Agregar AFP
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs text-[var(--text-secondary)]">Nombre AFP</label>
            <input
              value={afpName}
              onChange={(e) => setAfpName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-secondary)]">
              Comisión (%) — opcional
            </label>
            <input
              type="number"
              step="0.001"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Vacío = por completar"
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
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
            {busy ? 'Agregando…' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  );
}
