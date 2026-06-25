'use client';

/* HR-007 — the "Contrato" tab on the employee ficha. Drives /api/rrhh/contracts
 * (clone of the other RRHH tabs; no Operations API coupling). Shows the current
 * principal VIGENTE contract + its anexos + history of prior contracts, and lets
 * managers create contracts/anexos, edit, terminate and delete.
 *
 * ROLE GATING mirrors the other tabs: read⟺manage for EmployeeContract in the
 * current RBAC (MANAGER/ADMIN/SUPER_ADMIN; others 403). A 200 on the list GET
 * ⇒ this caller may also write; a 403 ⇒ "sin permiso", no actions. Backend is
 * the source of truth. Dates rendered in UTC (avoids the Chile off-by-one). */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Pencil, Plus, Trash2, XCircle } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { formatCLP } from '../../lib/formatters';

const ACCENT = '#2563eb';

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  INDEFINIDO: 'Indefinido',
  PLAZO_FIJO: 'Plazo fijo',
  POR_OBRA: 'Por obra o faena',
  HONORARIOS: 'Honorarios',
  EXTERNO: 'Externo',
};
const SCHEDULE_LABELS: Record<string, string> = {
  COMPLETA: 'Jornada completa',
  PARCIAL: 'Jornada parcial',
  TURNO: 'Por turnos',
  ESPECIAL: 'Especial',
};
const GRATIFICATION_LABELS: Record<string, string> = {
  NO: 'Sin gratificación',
  LEGAL: 'Legal',
  PACTADA: 'Pactada',
};
const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  VIGENTE: { label: 'Vigente', bg: 'rgba(34,197,94,0.12)', fg: '#15803d' },
  VENCIDO: { label: 'Vencido', bg: 'rgba(239,68,68,0.12)', fg: '#b91c1c' },
  REEMPLAZADO: { label: 'Reemplazado', bg: 'rgba(100,116,139,0.14)', fg: '#475569' },
  TERMINADO: { label: 'Terminado', bg: 'rgba(100,116,139,0.14)', fg: '#475569' },
};
const FIXED_TERM = ['PLAZO_FIJO', 'POR_OBRA'];

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

interface Contract {
  id: string;
  employeeId: string;
  contractType: string;
  startDate: string;
  endDate: string | null;
  contractualRole: string | null;
  workSchedule: string;
  baseSalary: string;
  gratification: string;
  gratificationAmount: string | null;
  mealAllowance: string | null;
  transportAllowance: string | null;
  workLocation: string | null;
  mainDuties: string | null;
  supervisorId: string | null;
  documentId: string | null;
  parentContractId: string | null;
  status: string;
  notes: string | null;
  isAnexo: boolean;
  supervisor: { id: string; fullName: string } | null;
  document: { id: string; fileName: string } | null;
}

interface EmployeeRef {
  id: string;
  fullName: string;
}
interface DocRef {
  id: string;
  fileName: string;
  documentType: { name: string };
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.REEMPLAZADO;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
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

export default function EmployeeContractsTab({ employeeId }: { employeeId: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [formMode, setFormMode] = useState<
    | { kind: 'create' }
    | { kind: 'anexo'; parentId: string }
    | { kind: 'edit'; contract: Contract }
    | null
  >(null);
  const [terminateFor, setTerminateFor] = useState<Contract | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const rows = await apiClient.get<Contract[]>(`/api/rrhh/contracts?employeeId=${employeeId}`);
      setContracts(rows);
      setState('ok');
    } catch (e) {
      setState(e instanceof ApiError && e.status === 403 ? 'forbidden' : 'error');
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const canManage = state === 'ok';

  const { current, currentAnexos, history } = useMemo(() => {
    const principals = contracts.filter((c) => !c.parentContractId);
    const cur = principals.find((c) => c.status === 'VIGENTE') ?? null;
    const anexosOf = (id: string) =>
      contracts
        .filter((c) => c.parentContractId === id)
        .sort((a, b) => b.startDate.localeCompare(a.startDate));
    const hist = principals
      .filter((c) => c.id !== cur?.id)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
    return {
      current: cur,
      currentAnexos: cur ? anexosOf(cur.id) : [],
      history: hist.map((p) => ({ principal: p, anexos: anexosOf(p.id) })),
    };
  }, [contracts]);

  const remove = async (c: Contract) => {
    if (!confirm('¿Eliminar este contrato? Esta acción no se puede deshacer.')) return;
    setActionMsg(null);
    try {
      await apiClient.delete(`/api/rrhh/contracts/${c.id}`);
      await load();
    } catch (e) {
      setActionMsg(errMessage(e, 'No se pudo eliminar el contrato.'));
    }
  };

  if (state === 'loading') return <Card>Cargando contrato…</Card>;
  if (state === 'forbidden')
    return (
      <Card>
        <p className="text-sm text-[var(--text-secondary)]">
          No tienes permiso para ver los contratos de este trabajador.
        </p>
      </Card>
    );
  if (state === 'error')
    return (
      <Card>
        <p className="text-sm text-red-600">No se pudieron cargar los contratos.</p>
      </Card>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2
          className="text-sm font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Contrato vigente
        </h2>
        {canManage && (
          <button
            onClick={() => setFormMode({ kind: 'create' })}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: ACCENT }}
          >
            <Plus size={14} /> Nuevo contrato
          </button>
        )}
      </div>

      {actionMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionMsg}
        </div>
      )}

      {current ? (
        <ContractCard
          contract={current}
          canManage={canManage}
          highlight
          onEdit={() => setFormMode({ kind: 'edit', contract: current })}
          onTerminate={() => setTerminateFor(current)}
          onDelete={() => remove(current)}
          onAddAnexo={() => setFormMode({ kind: 'anexo', parentId: current.id })}
          anexos={currentAnexos}
          onEditAnexo={(a) => setFormMode({ kind: 'edit', contract: a })}
          onDeleteAnexo={(a) => remove(a)}
        />
      ) : (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">
            Este trabajador no tiene un contrato vigente registrado.
          </p>
        </Card>
      )}

      {history.length > 0 && (
        <div className="space-y-3">
          <h2
            className="pt-2 text-sm font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            Historial de contratos
          </h2>
          {history.map(({ principal, anexos }) => (
            <ContractCard
              key={principal.id}
              contract={principal}
              canManage={canManage}
              onEdit={() => setFormMode({ kind: 'edit', contract: principal })}
              onDelete={() => remove(principal)}
              anexos={anexos}
              onEditAnexo={(a) => setFormMode({ kind: 'edit', contract: a })}
              onDeleteAnexo={(a) => remove(a)}
            />
          ))}
        </div>
      )}

      {formMode && (
        <ContractFormModal
          employeeId={employeeId}
          mode={formMode}
          onClose={() => setFormMode(null)}
          onDone={() => {
            setFormMode(null);
            load();
          }}
        />
      )}
      {terminateFor && (
        <TerminateModal
          contract={terminateFor}
          onClose={() => setTerminateFor(null)}
          onDone={() => {
            setTerminateFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function ContractCard({
  contract,
  canManage,
  highlight,
  anexos,
  onEdit,
  onTerminate,
  onDelete,
  onAddAnexo,
  onEditAnexo,
  onDeleteAnexo,
}: {
  contract: Contract;
  canManage: boolean;
  highlight?: boolean;
  anexos: Contract[];
  onEdit: () => void;
  onTerminate?: () => void;
  onDelete: () => void;
  onAddAnexo?: () => void;
  onEditAnexo: (a: Contract) => void;
  onDeleteAnexo: (a: Contract) => void;
}) {
  return (
    <div
      className="rounded-xl border bg-[var(--bg-card)] p-5"
      style={{ borderColor: highlight ? ACCENT : 'var(--border-color)' }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {CONTRACT_TYPE_LABELS[contract.contractType] ?? contract.contractType}
          </span>
          <StatusBadge status={contract.status} />
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-1.5">
            {onAddAnexo && (
              <button
                onClick={onAddAnexo}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <Plus size={13} /> Anexo
              </button>
            )}
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <Pencil size={13} /> Editar
            </button>
            {onTerminate && contract.status === 'VIGENTE' && (
              <button
                onClick={onTerminate}
                className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-700"
              >
                <XCircle size={13} /> Terminar
              </button>
            )}
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs text-red-700"
            >
              <Trash2 size={13} /> Eliminar
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KV label="Inicio" value={formatDateOnly(contract.startDate)} />
        <KV label="Término" value={formatDateOnly(contract.endDate)} />
        <KV
          label="Jornada"
          value={SCHEDULE_LABELS[contract.workSchedule] ?? contract.workSchedule}
        />
        <KV label="Cargo en contrato" value={contract.contractualRole ?? '—'} />
        <KV label="Sueldo base" value={formatCLP(contract.baseSalary)} />
        <KV
          label="Gratificación"
          value={
            GRATIFICATION_LABELS[contract.gratification] +
            (contract.gratificationAmount ? ` · ${formatCLP(contract.gratificationAmount)}` : '')
          }
        />
        <KV
          label="Colación"
          value={contract.mealAllowance ? formatCLP(contract.mealAllowance) : '—'}
        />
        <KV
          label="Movilización"
          value={contract.transportAllowance ? formatCLP(contract.transportAllowance) : '—'}
        />
        <KV label="Lugar de trabajo" value={contract.workLocation ?? '—'} />
        <KV label="Supervisor" value={contract.supervisor?.fullName ?? '—'} />
      </div>

      {contract.mainDuties && (
        <div className="mt-3">
          <KV label="Funciones principales" value={contract.mainDuties} />
        </div>
      )}

      {contract.document && (
        <div className="mt-3">
          {(() => {
            const signed = contract.document;
            return (
              <button
                onClick={() => downloadDocument(signed.id, signed.fileName)}
                className="inline-flex items-center gap-1.5 text-sm font-medium"
                style={{ color: ACCENT }}
              >
                <FileText size={14} /> Ver documento firmado ({signed.fileName})
              </button>
            );
          })()}
        </div>
      )}

      {anexos.length > 0 && (
        <div className="mt-4 border-t border-[var(--border-color)] pt-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Anexos ({anexos.length})
          </div>
          <ul className="space-y-2">
            {anexos.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--bg-primary)] px-3 py-2"
              >
                <div className="min-w-0 text-sm text-[var(--text-primary)]">
                  {a.contractualRole || CONTRACT_TYPE_LABELS[a.contractType]} ·{' '}
                  <span className="text-[var(--text-secondary)]">
                    desde {formatDateOnly(a.startDate)}
                  </span>{' '}
                  · {formatCLP(a.baseSalary)}
                </div>
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={a.status} />
                  {canManage && (
                    <>
                      <button
                        onClick={() => onEditAnexo(a)}
                        className="rounded-md border border-[var(--border-color)] p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        title="Editar anexo"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => onDeleteAnexo(a)}
                        className="rounded-md border border-red-300 p-1 text-red-700"
                        title="Eliminar anexo"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">{label}</div>
      <div className="mt-0.5 text-sm text-[var(--text-primary)]">{value}</div>
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

function ContractFormModal({
  employeeId,
  mode,
  onClose,
  onDone,
}: {
  employeeId: string;
  mode:
    | { kind: 'create' }
    | { kind: 'anexo'; parentId: string }
    | { kind: 'edit'; contract: Contract };
  onClose: () => void;
  onDone: () => void;
}) {
  const editing = mode.kind === 'edit' ? mode.contract : null;
  const [contractType, setContractType] = useState(editing?.contractType ?? 'INDEFINIDO');
  const [startDate, setStartDate] = useState(editing?.startDate?.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(editing?.endDate?.slice(0, 10) ?? '');
  const [contractualRole, setContractualRole] = useState(editing?.contractualRole ?? '');
  const [workSchedule, setWorkSchedule] = useState(editing?.workSchedule ?? 'COMPLETA');
  const [baseSalary, setBaseSalary] = useState(editing ? String(editing.baseSalary) : '');
  const [gratification, setGratification] = useState(editing?.gratification ?? 'NO');
  const [gratificationAmount, setGratificationAmount] = useState(
    editing?.gratificationAmount ? String(editing.gratificationAmount) : '',
  );
  const [mealAllowance, setMealAllowance] = useState(
    editing?.mealAllowance ? String(editing.mealAllowance) : '',
  );
  const [transportAllowance, setTransportAllowance] = useState(
    editing?.transportAllowance ? String(editing.transportAllowance) : '',
  );
  const [workLocation, setWorkLocation] = useState(editing?.workLocation ?? '');
  const [mainDuties, setMainDuties] = useState(editing?.mainDuties ?? '');
  const [supervisorId, setSupervisorId] = useState(editing?.supervisorId ?? '');
  const [documentId, setDocumentId] = useState(editing?.documentId ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [employees, setEmployees] = useState<EmployeeRef[]>([]);
  const [docs, setDocs] = useState<DocRef[]>([]);

  useEffect(() => {
    apiClient
      .get<EmployeeRef[]>('/api/rrhh/employees')
      .then((rows) => setEmployees(rows.filter((e) => e.id !== employeeId)))
      .catch(() => setEmployees([]));
    apiClient
      .get<DocRef[]>(`/api/rrhh/documents?employeeId=${employeeId}`)
      .then(setDocs)
      .catch(() => setDocs([]));
  }, [employeeId]);

  const needsEndDate = FIXED_TERM.includes(contractType);

  const submit = async () => {
    if (!startDate) return setErr('La fecha de inicio es obligatoria.');
    if (needsEndDate && !endDate)
      return setErr('Los contratos a plazo fijo o por obra requieren fecha de término.');
    const salaryNum = Number(baseSalary);
    if (baseSalary.trim() === '' || Number.isNaN(salaryNum) || salaryNum < 0)
      return setErr('El sueldo base es obligatorio y debe ser un número ≥ 0.');

    const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
    const body: Record<string, unknown> = {
      contractType,
      startDate,
      endDate: endDate || undefined,
      contractualRole: contractualRole.trim() || undefined,
      workSchedule,
      baseSalary: salaryNum,
      gratification,
      gratificationAmount: num(gratificationAmount),
      mealAllowance: num(mealAllowance),
      transportAllowance: num(transportAllowance),
      workLocation: workLocation.trim() || undefined,
      mainDuties: mainDuties.trim() || undefined,
      supervisorId: supervisorId || undefined,
      documentId: documentId || undefined,
      notes: notes.trim() || undefined,
    };

    setBusy(true);
    setErr(null);
    try {
      if (mode.kind === 'edit') {
        await apiClient.patch(`/api/rrhh/contracts/${mode.contract.id}`, body);
      } else {
        body.employeeId = employeeId;
        if (mode.kind === 'anexo') body.parentContractId = mode.parentId;
        await apiClient.post('/api/rrhh/contracts', body);
      }
      onDone();
    } catch (e) {
      setErr(errMessage(e, 'No se pudo guardar el contrato.'));
      setBusy(false);
    }
  };

  const inputCls =
    'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';
  const labelCls = 'mb-1 block text-xs text-[var(--text-secondary)]';
  const title =
    mode.kind === 'edit'
      ? 'Editar contrato'
      : mode.kind === 'anexo'
        ? 'Nuevo anexo'
        : 'Nuevo contrato';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Tipo de contrato *</label>
            <select
              value={contractType}
              onChange={(e) => setContractType(e.target.value)}
              className={inputCls}
            >
              {Object.entries(CONTRACT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Jornada *</label>
            <select
              value={workSchedule}
              onChange={(e) => setWorkSchedule(e.target.value)}
              className={inputCls}
            >
              {Object.entries(SCHEDULE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Fecha de inicio *</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Fecha de término {needsEndDate ? '*' : '(opcional)'}</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Cargo en el contrato</label>
            <input
              value={contractualRole}
              onChange={(e) => setContractualRole(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Sueldo base (CLP) *</label>
            <input
              type="number"
              min={0}
              value={baseSalary}
              onChange={(e) => setBaseSalary(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Gratificación</label>
            <select
              value={gratification}
              onChange={(e) => setGratification(e.target.value)}
              className={inputCls}
            >
              {Object.entries(GRATIFICATION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Monto gratificación (CLP)</label>
            <input
              type="number"
              min={0}
              value={gratificationAmount}
              onChange={(e) => setGratificationAmount(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Colación (CLP)</label>
            <input
              type="number"
              min={0}
              value={mealAllowance}
              onChange={(e) => setMealAllowance(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Movilización (CLP)</label>
            <input
              type="number"
              min={0}
              value={transportAllowance}
              onChange={(e) => setTransportAllowance(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Lugar de trabajo</label>
            <input
              value={workLocation}
              onChange={(e) => setWorkLocation(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Supervisor</label>
            <select
              value={supervisorId}
              onChange={(e) => setSupervisorId(e.target.value)}
              className={inputCls}
            >
              <option value="">— Sin supervisor —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Documento firmado (PDF cargado en Documentos)</label>
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
          <div className="sm:col-span-2">
            <label className={labelCls}>Funciones principales</label>
            <textarea
              value={mainDuties}
              onChange={(e) => setMainDuties(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </div>

          {err && <p className="text-sm text-red-600 sm:col-span-2">{err}</p>}
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

function TerminateModal({
  contract,
  onClose,
  onDone,
}: {
  contract: Contract;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await apiClient.post(`/api/rrhh/contracts/${contract.id}/terminate`, {
        reason: reason.trim() || undefined,
        date: date || undefined,
      });
      onDone();
    } catch (e) {
      setErr(errMessage(e, 'No se pudo terminar el contrato.'));
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
            Terminar contrato
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs text-[var(--text-secondary)]">
              Fecha de término
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-secondary)]">
              Motivo (opcional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
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
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? 'Terminando…' : 'Terminar contrato'}
          </button>
        </div>
      </div>
    </div>
  );
}
