'use client';

/* HR-009 — settlements history, rendered INSIDE the Remuneraciones tab (which is
 * already gated on the EmployeeCompensation read+update guard, so this section is
 * MANAGER/ADMIN/SUPER_ADMIN-only; ACCOUNTANT/VIEWER never reach it). Records
 * settlements computed ELSEWHERE — it STORES + DISPLAYS, never computes the
 * liquidación. costo empresa is a SUM of entered values; the PDF is UPLOADED (a
 * linked EmployeeDocument), not generated. Every fetch targets /api/rrhh/*. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Pencil, Plus, Trash2, X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { formatCLP } from '../../lib/formatters';

const ACCENT = '#2563eb';
const MONTHS = [
  '',
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  BORRADOR: { label: 'Borrador', bg: 'rgba(100,116,139,0.14)', fg: '#475569' },
  EMITIDA: { label: 'Emitida', bg: 'rgba(37,99,235,0.12)', fg: '#1d4ed8' },
  PAGADA: { label: 'Pagada', bg: 'rgba(34,197,94,0.12)', fg: '#15803d' },
  ANULADA: { label: 'Anulada', bg: 'rgba(239,68,68,0.12)', fg: '#b91c1c' },
};

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

interface Settlement {
  id: string;
  periodYear: number;
  periodMonth: number;
  totalHaberes: string;
  totalDescuentos: string;
  liquidoPagado: string;
  costoEmpresaComputed: number;
  afpName: string | null;
  status: keyof typeof STATUS_META;
  document: { id: string; fileName: string } | null;
  documentId: string | null;
}
interface DocRef {
  id: string;
  fileName: string;
  documentType: { name: string };
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

export default function EmployeeSettlementsSection({ employeeId }: { employeeId: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [rows, setRows] = useState<Settlement[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Settlement | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const data = await apiClient.get<Settlement[]>(
        `/api/rrhh/settlements?employeeId=${employeeId}`,
      );
      setRows(data);
      setState('ok');
    } catch {
      setState('error');
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const action = async (fn: () => Promise<unknown>) => {
    setMsg(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setMsg(errMessage(e, 'No se pudo completar la acción.'));
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3
          className="text-sm font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Liquidaciones registradas
        </h3>
        <button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
          style={{ background: ACCENT }}
        >
          <Plus size={14} /> Registrar liquidación
        </button>
      </div>

      <p className="mb-3 text-[11px] text-[var(--text-secondary)]">
        Las liquidaciones se registran (calculadas externamente); el sistema no calcula la
        liquidación. El costo empresa es la suma de los valores ingresados.
      </p>

      {msg && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {msg}
        </div>
      )}

      {state === 'loading' ? (
        <p className="text-sm text-[var(--text-secondary)]">Cargando…</p>
      ) : state === 'error' ? (
        <p className="text-sm text-red-600">No se pudieron cargar las liquidaciones.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">No hay liquidaciones registradas.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-color)] text-left text-xs text-[var(--text-secondary)]">
              <th className="py-2 font-medium">Período</th>
              <th className="py-2 font-medium">Líquido</th>
              <th className="py-2 font-medium">Costo empresa</th>
              <th className="py-2 font-medium">Estado</th>
              <th className="py-2 font-medium">PDF</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="py-2 text-[var(--text-primary)]">
                  {MONTHS[s.periodMonth]} {s.periodYear}
                </td>
                <td className="py-2 text-[var(--text-primary)]">{formatCLP(s.liquidoPagado)}</td>
                <td className="py-2 text-[var(--text-secondary)]">
                  {formatCLP(s.costoEmpresaComputed)}
                </td>
                <td className="py-2">
                  <StatusBadge status={s.status} />
                </td>
                <td className="py-2">
                  {s.document ? (
                    (() => {
                      const doc = s.document;
                      return (
                        <button
                          onClick={() => downloadDocument(doc.id, doc.fileName)}
                          className="inline-flex items-center gap-1 text-xs font-medium"
                          style={{ color: ACCENT }}
                        >
                          <FileText size={12} /> Ver
                        </button>
                      );
                    })()
                  ) : (
                    <span className="text-xs text-[var(--text-secondary)]">—</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  <div className="inline-flex items-center gap-1.5">
                    {(s.status === 'BORRADOR' || s.status === 'EMITIDA') && (
                      <button
                        onClick={() => {
                          setEditing(s);
                          setFormOpen(true);
                        }}
                        className="rounded-md border border-[var(--border-color)] p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        title="Editar"
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                    <select
                      value={s.status}
                      onChange={(e) =>
                        action(() =>
                          apiClient.post(`/api/rrhh/settlements/${s.id}/status`, {
                            status: e.target.value,
                          }),
                        )
                      }
                      title="Cambiar estado"
                      className="rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] px-1 py-0.5 text-[11px] text-[var(--text-secondary)]"
                    >
                      {Object.keys(STATUS_META).map((k) => (
                        <option key={k} value={k}>
                          {STATUS_META[k].label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        if (confirm('¿Eliminar esta liquidación?'))
                          action(() => apiClient.delete(`/api/rrhh/settlements/${s.id}`));
                      }}
                      className="rounded-md border border-red-300 p-1 text-red-700"
                      title="Eliminar"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {formOpen && (
        <SettlementFormModal
          employeeId={employeeId}
          editing={editing}
          onClose={() => setFormOpen(false)}
          onDone={() => {
            setFormOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.BORRADOR;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}

const HABER_FIELDS: { key: string; label: string }[] = [
  { key: 'haberesImponibles', label: 'Haberes imponibles' },
  { key: 'haberesNoImponibles', label: 'Haberes no imponibles' },
  { key: 'sueldoBase', label: 'Sueldo base (opcional)' },
  { key: 'gratificacion', label: 'Gratificación (opcional)' },
  { key: 'totalHaberes', label: 'Total haberes' },
];
const DESC_FIELDS: { key: string; label: string }[] = [
  { key: 'descUAfp', label: 'Desc. AFP' },
  { key: 'descSalud', label: 'Desc. salud' },
  { key: 'descAfc', label: 'Desc. AFC' },
  { key: 'descImpuestoUnico', label: 'Impuesto único' },
  { key: 'otrosDescuentos', label: 'Otros descuentos' },
  { key: 'totalDescuentos', label: 'Total descuentos' },
  { key: 'liquidoPagado', label: 'Líquido pagado' },
];
const APORTE_FIELDS: { key: string; label: string }[] = [
  { key: 'aporteAfcEmpleador', label: 'AFC empleador' },
  { key: 'aporteSis', label: 'SIS' },
  { key: 'aporteMutual', label: 'Mutual' },
  { key: 'otrosAportesEmpleador', label: 'Otros aportes' },
];
const REQUIRED = new Set([
  'haberesImponibles',
  'haberesNoImponibles',
  'totalHaberes',
  'descUAfp',
  'descSalud',
  'descAfc',
  'descImpuestoUnico',
  'otrosDescuentos',
  'totalDescuentos',
  'liquidoPagado',
]);

function SettlementFormModal({
  employeeId,
  editing,
  onClose,
  onDone,
}: {
  employeeId: string;
  editing: Settlement | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(String(editing?.periodYear ?? now.getUTCFullYear()));
  const [month, setMonth] = useState(String(editing?.periodMonth ?? now.getUTCMonth() + 1));
  const [vals, setVals] = useState<Record<string, string>>({});
  const [afpName, setAfpName] = useState(editing?.afpName ?? '');
  const [documentId, setDocumentId] = useState(editing?.documentId ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedWarnings, setSavedWarnings] = useState<string[] | null>(null);
  const [docs, setDocs] = useState<DocRef[]>([]);

  useEffect(() => {
    apiClient
      .get<DocRef[]>(`/api/rrhh/documents?employeeId=${employeeId}`)
      .then(setDocs)
      .catch(() => setDocs([]));
    if (editing) {
      apiClient.get<Record<string, string>>(`/api/rrhh/settlements/${editing.id}`).then((full) => {
        const v: Record<string, string> = {};
        for (const f of [...HABER_FIELDS, ...DESC_FIELDS, ...APORTE_FIELDS]) {
          const raw = full[f.key];
          v[f.key] = raw == null ? '' : String(Number(raw));
        }
        setVals(v);
      });
    }
  }, [employeeId, editing]);

  const setV = (k: string, v: string) => setVals((s) => ({ ...s, [k]: v }));
  const num = (k: string) => (vals[k]?.trim() ? Number(vals[k]) : 0);
  const costoPreview = useMemo(
    () =>
      num('totalHaberes') +
      num('aporteAfcEmpleador') +
      num('aporteSis') +
      num('aporteMutual') +
      num('otrosAportesEmpleador'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vals],
  );

  const submit = async () => {
    for (const k of REQUIRED) {
      if (!vals[k]?.trim()) return setErr(`Falta el campo: ${k}.`);
    }
    setBusy(true);
    setErr(null);
    const body: Record<string, unknown> = {
      afpName: afpName.trim() || undefined,
      documentId: documentId || undefined,
    };
    for (const f of [...HABER_FIELDS, ...DESC_FIELDS, ...APORTE_FIELDS]) {
      if (vals[f.key]?.trim()) body[f.key] = Number(vals[f.key]);
    }
    try {
      let res: { warnings?: string[] };
      if (editing) {
        res = await apiClient.patch(`/api/rrhh/settlements/${editing.id}`, body);
      } else {
        body.employeeId = employeeId;
        body.periodYear = Number(year);
        body.periodMonth = Number(month);
        res = await apiClient.post('/api/rrhh/settlements', body);
      }
      if (res.warnings && res.warnings.length > 0) {
        setSavedWarnings(res.warnings);
        setBusy(false);
      } else {
        onDone();
      }
    } catch (e) {
      setErr(errMessage(e, 'No se pudo guardar la liquidación.'));
      setBusy(false);
    }
  };

  const inputCls =
    'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm text-[var(--text-primary)]';
  const labelCls = 'mb-0.5 block text-[11px] text-[var(--text-secondary)]';

  if (savedWarnings) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-xl bg-[var(--bg-card)] p-5 shadow-xl">
          <h2
            className="mb-2 text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            Guardada con observaciones
          </h2>
          <p className="mb-2 text-sm text-[var(--text-secondary)]">
            La liquidación se guardó. Observaciones de validación (no bloquean, no recalculan):
          </p>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-amber-700">
            {savedWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <div className="flex justify-end">
            <button
              onClick={onDone}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ background: ACCENT }}
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            {editing ? 'Editar liquidación' : 'Registrar liquidación'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4">
          {!editing && (
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Año</label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Mes</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className={inputCls}
                >
                  {MONTHS.slice(1).map((m, i) => (
                    <option key={i + 1} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <Section
            title="Haberes"
            fields={HABER_FIELDS}
            vals={vals}
            setV={setV}
            req={REQUIRED}
            inputCls={inputCls}
            labelCls={labelCls}
          />
          <Section
            title="Descuentos"
            fields={DESC_FIELDS}
            vals={vals}
            setV={setV}
            req={REQUIRED}
            inputCls={inputCls}
            labelCls={labelCls}
          />
          <Section
            title="Aportes empleador (para costo empresa)"
            fields={APORTE_FIELDS}
            vals={vals}
            setV={setV}
            req={REQUIRED}
            inputCls={inputCls}
            labelCls={labelCls}
          />

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>AFP (este período)</label>
              <input
                value={afpName}
                onChange={(e) => setAfpName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>PDF firmado (cargado en Documentos)</label>
              <select
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                className={inputCls}
              >
                <option value="">— Sin vincular —</option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.documentType?.name ? `${d.documentType.name} · ` : ''}
                    {d.fileName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Costo empresa (suma calculada)</span>
              <span className="font-semibold text-[var(--text-primary)]">
                {formatCLP(costoPreview)}
              </span>
            </div>
          </div>

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

function Section({
  title,
  fields,
  vals,
  setV,
  req,
  inputCls,
  labelCls,
}: {
  title: string;
  fields: { key: string; label: string }[];
  vals: Record<string, string>;
  setV: (k: string, v: string) => void;
  req: Set<string>;
  inputCls: string;
  labelCls: string;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        {title}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {fields.map((f) => (
          <div key={f.key}>
            <label className={labelCls}>
              {f.label}
              {req.has(f.key) ? ' *' : ''}
            </label>
            <input
              type="number"
              min={0}
              value={vals[f.key] ?? ''}
              onChange={(e) => setV(f.key, e.target.value)}
              className={inputCls}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
