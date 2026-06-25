'use client';

/* HR-004b — the "Documentos" tab on the employee ficha. Drives the HR-004a
 * backend (/api/rrhh/documents, /document-types, /document-requirements). Reuses
 * the presentational doc-control components (ComplianceGauge, DocumentStatusBadge)
 * — which are pure UI and carry no Operations API coupling.
 *
 * ROLE GATING (mirrors the Remuneraciones tab, HR-003b): we do NOT look up the
 * user's role client-side. The documents/compliance GETs require `read` on
 * EmployeeDocument; in the current RBAC read⟺manage for that subject (only
 * MANAGER/ADMIN/SUPER_ADMIN have either — ACCOUNTANT/ANALYST/VIEWER get 403 even
 * on read). So a 200 proves the caller may also upload/approve/reject/supersede,
 * and a 403 flips the whole tab to "sin permiso" with no action buttons. The
 * backend stays the source of truth: every write is independently guarded, and
 * any per-row rule it enforces (uploader≠approver) is surfaced from its 403/400. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Check,
  ChevronDown,
  Download,
  FileText,
  RefreshCw,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { DocumentStatusBadge, type DerivedDocumentStatus } from '../operations/DocumentStatusBadge';
import { ComplianceGauge } from '../operations/ComplianceGauge';

const ACCENT = '#2563eb';
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx';

/* issueDate/expiryDate are @db.Date columns — the backend serializes them as
   UTC-midnight ISO strings ("2026-06-18T00:00:00.000Z"). The shared formatDate()
   renders in the browser's local zone, which in Chile (UTC-3/-4) shows the
   PREVIOUS calendar day. Format these date-only fields in UTC so the displayed
   day matches what was entered, regardless of timezone. */
function formatDateOnly(date: string): string {
  return new Date(date).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

type DocStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'REPLACED' | 'ARCHIVED';

interface DocType {
  id: string;
  name: string;
  category: string;
  requiresExpiry: boolean;
  defaultValidityDays: number | null;
  active: boolean;
}

interface EmpDoc {
  id: string;
  employeeId: string;
  documentTypeId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  issueDate: string | null;
  expiryDate: string | null;
  status: DocStatus;
  version: number;
  supersededById: string | null;
  approvalStatus: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
  rejectionReason: string | null;
  uploadedBy: string;
  createdAt: string;
  derivedStatus: DerivedDocumentStatus;
  documentType: { id: string; name: string; category: string; requiresExpiry: boolean };
}

interface ComplianceResp {
  employee: { id: string; fullName: string };
  compliance: {
    totalRequired: number;
    valid: number;
    expiringSoon: number;
    expired: number;
    missing: number;
    pendingReview: number;
    rejected: number;
    compliancePercentage: number;
  };
  requiredDocuments: Array<{
    documentType: { id: string; name: string };
    isMandatory: boolean;
    resolvedFrom: string;
    latestRecord: EmpDoc | null;
    derivedStatus: DerivedDocumentStatus;
    daysUntilExpiry: number | null;
  }>;
}

/* Translate any thrown error into a friendly Spanish message, preferring the
   backend's own message (bad mime/size, uploader≠approver, etc). A generic CASL
   403 ("Forbidden resource") is mapped to the friendly permission line. */
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

function CountChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-center">
      <div className="text-lg font-semibold" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </div>
    </div>
  );
}

export default function EmployeeDocumentsTab({ employeeId }: { employeeId: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [docs, setDocs] = useState<EmpDoc[]>([]);
  const [comp, setComp] = useState<ComplianceResp | null>(null);
  const [types, setTypes] = useState<DocType[]>([]);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [supersedeDoc, setSupersedeDoc] = useState<EmpDoc | null>(null);
  const [rejectDoc, setRejectDoc] = useState<EmpDoc | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [docsRes, compRes, typesRes] = await Promise.all([
        apiClient.get<EmpDoc[]>(
          `/api/rrhh/documents?employeeId=${employeeId}&includeReplaced=true`,
        ),
        apiClient.get<ComplianceResp>(`/api/rrhh/documents/compliance/${employeeId}`),
        apiClient.get<DocType[]>(`/api/rrhh/document-types?activeOnly=true`),
      ]);
      setDocs(docsRes);
      setComp(compRes);
      setTypes(typesRes);
      setState('ok');
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setState(status === 403 ? 'forbidden' : 'error');
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  // a 200 on the guarded GET ⇒ this caller can manage documents (see header note)
  const canManage = state === 'ok';

  /* Group by documentType: the non-REPLACED rows are the active versions; the
     REPLACED ones collapse under "ver versiones anteriores". */
  const groups = useMemo(() => {
    const byType = new Map<
      string,
      { type: { id: string; name: string; category: string }; active: EmpDoc[]; previous: EmpDoc[] }
    >();
    for (const d of docs) {
      const g = byType.get(d.documentTypeId) ?? {
        type: d.documentType,
        active: [],
        previous: [],
      };
      if (d.status === 'REPLACED') g.previous.push(d);
      else g.active.push(d);
      byType.set(d.documentTypeId, g);
    }
    const arr = Array.from(byType.values());
    for (const g of arr) {
      g.active.sort((a, b) => b.version - a.version);
      g.previous.sort((a, b) => b.version - a.version);
    }
    arr.sort((a, b) => a.type.name.localeCompare(b.type.name));
    return arr;
  }, [docs]);

  const gaps = useMemo(
    () =>
      (comp?.requiredDocuments ?? []).filter((r) =>
        ['FALTANTE', 'VENCIDO', 'RECHAZADO'].includes(r.derivedStatus),
      ),
    [comp],
  );

  /* documentTypeId → id of the APPROVED, non-superseded doc of that type. Used to
     resolve the supersession target when a duplicate upload returns 409: the
     backend's structured 409 body (existingDocumentId) is flattened by the global
     SentryExceptionFilter, so we recover the id locally from the already-loaded
     list instead of depending on that field. */
  const approvedDocIdByType = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of docs) {
      if (d.status === 'APPROVED' && d.supersededById === null && !m.has(d.documentTypeId)) {
        m.set(d.documentTypeId, d.id);
      }
    }
    return m;
  }, [docs]);

  /* Refresh ONLY the types list (no setState('loading')) so seeding from inside
     the open upload modal doesn't unmount it and discard the user's input. */
  const reloadTypes = useCallback(async () => {
    try {
      const t = await apiClient.get<DocType[]>(`/api/rrhh/document-types?activeOnly=true`);
      setTypes(t);
    } catch {
      /* leave the modal usable; the seed already succeeded */
    }
  }, []);

  const approve = async (doc: EmpDoc) => {
    setActionBusy(doc.id);
    setActionMsg(null);
    try {
      await apiClient.post(`/api/rrhh/documents/${doc.id}/approve`);
      await load();
    } catch (e) {
      setActionMsg(errMessage(e, 'No se pudo aprobar el documento.'));
    } finally {
      setActionBusy(null);
    }
  };

  /* Reenviar a revisión — only the original uploader may resubmit a REJECTED doc;
     the backend enforces that and we surface its message if a different user tries. */
  const resubmit = async (doc: EmpDoc) => {
    setActionBusy(doc.id);
    setActionMsg(null);
    try {
      await apiClient.post(`/api/rrhh/documents/${doc.id}/resubmit`);
      await load();
    } catch (e) {
      setActionMsg(errMessage(e, 'No se pudo reenviar el documento a revisión.'));
    } finally {
      setActionBusy(null);
    }
  };

  const download = async (doc: EmpDoc) => {
    setActionMsg(null);
    try {
      const blob = await apiClient.fetchBlob(`/api/rrhh/documents/${doc.id}/file?download=1`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setActionMsg('No se pudo descargar el archivo.');
    }
  };

  if (state === 'loading') return <Card>Cargando documentos…</Card>;
  if (state === 'forbidden')
    return (
      <Card>
        <p className="text-sm text-[var(--text-secondary)]">
          No tienes permiso para ver los documentos de este trabajador.
        </p>
      </Card>
    );
  if (state === 'error' || !comp)
    return (
      <Card>
        <p className="text-sm text-red-600">No se pudieron cargar los documentos.</p>
      </Card>
    );

  const c = comp.compliance;

  return (
    <div className="space-y-4">
      {/* Compliance summary */}
      <Card>
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <ComplianceGauge
            percentage={c.compliancePercentage}
            size={150}
            subtitle={`${c.valid + c.expiringSoon} de ${c.totalRequired} al día`}
          />
          <div className="flex-1">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3
                className="text-sm font-semibold text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
              >
                Cumplimiento documental
              </h3>
              {canManage && (
                <button
                  onClick={() => setUploadOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                  style={{ background: ACCENT }}
                >
                  <Upload size={14} /> Subir documento
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <CountChip label="Vigentes" value={c.valid} color="#15803d" />
              <CountChip label="Por vencer" value={c.expiringSoon} color="#a16207" />
              <CountChip label="Vencidos" value={c.expired} color="#b91c1c" />
              <CountChip label="Faltantes" value={c.missing} color="#b91c1c" />
              <CountChip label="En revisión" value={c.pendingReview} color="#1d4ed8" />
              <CountChip label="Rechazados" value={c.rejected} color="#b91c1c" />
            </div>
            {c.totalRequired === 0 && (
              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                No hay documentos requeridos configurados para este trabajador (cargo o asignación
                individual).
              </p>
            )}
          </div>
        </div>

        {/* Required-but-missing gaps */}
        {gaps.length > 0 && (
          <div className="mt-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              Requeridos con brecha
            </div>
            <ul className="space-y-1.5">
              {gaps.map((g) => (
                <li
                  key={g.documentType.id}
                  className="flex items-center justify-between gap-2 text-sm text-[var(--text-primary)]"
                >
                  <span>
                    {g.documentType.name}
                    {g.isMandatory && (
                      <span className="ml-1 text-[10px] text-[var(--text-secondary)]">
                        (obligatorio)
                      </span>
                    )}
                  </span>
                  <DocumentStatusBadge status={g.derivedStatus} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {actionMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionMsg}
        </div>
      )}

      {/* Document list (grouped by type; previous versions collapsed) */}
      {groups.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">
            Este trabajador aún no tiene documentos cargados.
          </p>
        </Card>
      ) : (
        groups.map((g) => (
          <Card key={g.type.id}>
            <div className="mb-2 flex items-center gap-2">
              <FileText size={15} className="text-[var(--text-secondary)]" />
              <h4
                className="text-sm font-semibold text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
              >
                {g.type.name}
              </h4>
            </div>

            <div className="divide-y divide-[var(--border-color)]">
              {g.active.map((doc) => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  canManage={canManage}
                  busy={actionBusy === doc.id}
                  onDownload={() => download(doc)}
                  onSupersede={doc.status === 'APPROVED' ? () => setSupersedeDoc(doc) : undefined}
                  onApprove={() => approve(doc)}
                  onReject={() => setRejectDoc(doc)}
                  onResubmit={doc.status === 'REJECTED' ? () => resubmit(doc) : undefined}
                />
              ))}
            </div>

            {g.previous.length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setExpanded((s) => ({ ...s, [g.type.id]: !s[g.type.id] }))}
                  className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <ChevronDown
                    size={13}
                    style={{
                      transform: expanded[g.type.id] ? 'rotate(180deg)' : 'none',
                      transition: 'transform 150ms',
                    }}
                  />
                  Ver versiones anteriores ({g.previous.length})
                </button>
                {expanded[g.type.id] && (
                  <div className="mt-1 divide-y divide-[var(--border-color)] border-t border-[var(--border-color)] pt-1 opacity-80">
                    {g.previous.map((doc) => (
                      <DocRow
                        key={doc.id}
                        doc={doc}
                        canManage={false}
                        busy={false}
                        onDownload={() => download(doc)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        ))
      )}

      {uploadOpen && (
        <DocumentFormModal
          employeeId={employeeId}
          types={types}
          findApprovedDocId={(t) => approvedDocIdByType.get(t) ?? null}
          onClose={() => setUploadOpen(false)}
          onDone={() => {
            setUploadOpen(false);
            load();
          }}
          onSeeded={reloadTypes}
        />
      )}
      {supersedeDoc && (
        <DocumentFormModal
          employeeId={employeeId}
          types={types}
          supersedeDoc={supersedeDoc}
          onClose={() => setSupersedeDoc(null)}
          onDone={() => {
            setSupersedeDoc(null);
            load();
          }}
        />
      )}
      {rejectDoc && (
        <RejectModal
          doc={rejectDoc}
          onClose={() => setRejectDoc(null)}
          onDone={() => {
            setRejectDoc(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function DocRow({
  doc,
  canManage,
  busy,
  onDownload,
  onSupersede,
  onApprove,
  onReject,
  onResubmit,
}: {
  doc: EmpDoc;
  canManage: boolean;
  busy: boolean;
  onDownload: () => void;
  onSupersede?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onResubmit?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm text-[var(--text-primary)]">{doc.fileName}</span>
          <span className="text-[10px] text-[var(--text-secondary)]">v{doc.version}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-secondary)]">
          {doc.issueDate && <span>Emisión: {formatDateOnly(doc.issueDate)}</span>}
          {doc.expiryDate && <span>Vence: {formatDateOnly(doc.expiryDate)}</span>}
          {doc.status === 'REJECTED' && doc.rejectionReason && (
            <span className="text-red-600">Motivo: {doc.rejectionReason}</span>
          )}
        </div>
      </div>

      <DocumentStatusBadge status={doc.derivedStatus} />

      <div className="flex items-center gap-1.5">
        <IconBtn title="Descargar" onClick={onDownload} disabled={busy}>
          <Download size={14} />
        </IconBtn>
        {canManage && onSupersede && (
          <IconBtn title="Subir nueva versión" onClick={onSupersede} disabled={busy}>
            <RefreshCw size={14} />
          </IconBtn>
        )}
        {canManage && doc.status === 'PENDING_REVIEW' && onApprove && (
          <button
            onClick={onApprove}
            disabled={busy}
            title="Aprobar"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
            style={{ background: '#16a34a' }}
          >
            <Check size={13} /> Aprobar
          </button>
        )}
        {canManage && doc.status === 'PENDING_REVIEW' && onReject && (
          <button
            onClick={onReject}
            disabled={busy}
            title="Rechazar"
            className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 disabled:opacity-60"
          >
            <Ban size={13} /> Rechazar
          </button>
        )}
        {canManage && doc.status === 'REJECTED' && onResubmit && (
          <button
            onClick={onResubmit}
            disabled={busy}
            title="Reenviar a revisión"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
            style={{ background: ACCENT }}
          >
            <RotateCcw size={13} /> Reenviar a revisión
          </button>
        )}
      </div>
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-md border border-[var(--border-color)] p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      {children}
    </div>
  );
}

function DocumentFormModal({
  employeeId,
  types,
  supersedeDoc,
  findApprovedDocId,
  onClose,
  onDone,
  onSeeded,
}: {
  employeeId: string;
  types: DocType[];
  supersedeDoc?: EmpDoc;
  findApprovedDocId?: (documentTypeId: string) => string | null;
  onClose: () => void;
  onDone: () => void;
  onSeeded?: () => void;
}) {
  const [documentTypeId, setDocumentTypeId] = useState(supersedeDoc?.documentTypeId ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [issueDate, setIssueDate] = useState('');
  const [sendForReview, setSendForReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [conflictId, setConflictId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const submit = async () => {
    if (!file) {
      setErr('Selecciona un archivo.');
      return;
    }
    if (!supersedeDoc && !conflictId && !documentTypeId) {
      setErr('Selecciona el tipo de documento.');
      return;
    }
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append('file', file);
    if (issueDate) fd.append('issueDate', issueDate);
    fd.append('setStatus', sendForReview ? 'PENDING_REVIEW' : 'DRAFT');
    try {
      if (supersedeDoc) {
        await apiClient.uploadFile(`/api/rrhh/documents/${supersedeDoc.id}/supersede`, fd, 'POST');
      } else if (conflictId) {
        await apiClient.uploadFile(`/api/rrhh/documents/${conflictId}/supersede`, fd, 'POST');
      } else {
        fd.append('employeeId', employeeId);
        fd.append('documentTypeId', documentTypeId);
        await apiClient.uploadFile('/api/rrhh/documents', fd, 'POST');
      }
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const data = (e.data ?? {}) as { existingDocumentId?: string; message?: string };
        /* Prefer the backend's existingDocumentId; fall back to resolving the
           approved doc of this type locally (the global error filter strips the
           structured 409 envelope, so the field is usually absent on the wire). */
        const targetId =
          data.existingDocumentId ??
          (documentTypeId ? (findApprovedDocId?.(documentTypeId) ?? null) : null);
        if (targetId) {
          setConflictId(targetId);
          setErr(
            data.message ??
              'Ya existe un documento aprobado de este tipo. Puedes reemplazar la versión vigente.',
          );
        } else {
          setErr(
            data.message ?? 'Ya existe un documento aprobado de este tipo para este trabajador.',
          );
        }
      } else {
        setErr(errMessage(e, 'No se pudo subir el documento.'));
      }
      setBusy(false);
    }
  };

  const seed = async () => {
    setSeeding(true);
    setErr(null);
    try {
      await apiClient.post('/api/rrhh/document-types/seed-recommended');
      onSeeded?.();
    } catch (e) {
      setErr(errMessage(e, 'No se pudieron sembrar los tipos de documento.'));
    } finally {
      setSeeding(false);
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
            {supersedeDoc ? `Nueva versión — ${supersedeDoc.documentType.name}` : 'Subir documento'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          {!supersedeDoc && !conflictId && (
            <div>
              <label className={labelCls}>Tipo de documento *</label>
              {types.length === 0 ? (
                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-3 text-sm text-[var(--text-secondary)]">
                  No hay tipos de documento configurados.
                  <button
                    onClick={seed}
                    disabled={seeding}
                    className="ml-2 font-medium disabled:opacity-60"
                    style={{ color: ACCENT }}
                  >
                    {seeding ? 'Sembrando…' : 'Sembrar tipos recomendados'}
                  </button>
                </div>
              ) : (
                <select
                  value={documentTypeId}
                  onChange={(e) => setDocumentTypeId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Selecciona —</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {conflictId && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              Ya existe un documento aprobado de este tipo. Si continúas, se subirá como una nueva
              versión y la anterior quedará marcada como reemplazada.
            </div>
          )}

          <div>
            <label className={labelCls}>Archivo * (PDF, imagen u Office, máx. 10 MB)</label>
            <input
              type="file"
              accept={ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Fecha de emisión</label>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className={inputCls}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={sendForReview}
              onChange={(e) => setSendForReview(e.target.checked)}
            />
            Enviar a revisión (en vez de guardar como borrador)
          </label>

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
            disabled={busy || (types.length === 0 && !supersedeDoc && !conflictId)}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: ACCENT }}
          >
            {busy
              ? 'Subiendo…'
              : conflictId
                ? 'Reemplazar versión vigente'
                : supersedeDoc
                  ? 'Subir nueva versión'
                  : 'Subir'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({
  doc,
  onClose,
  onDone,
}: {
  doc: EmpDoc;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (reason.trim().length < 10) {
      setErr('El motivo debe tener al menos 10 caracteres.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await apiClient.post(`/api/rrhh/documents/${doc.id}/reject`, { reason: reason.trim() });
      onDone();
    } catch (e) {
      setErr(errMessage(e, 'No se pudo rechazar el documento.'));
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
            Rechazar documento
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="mb-2 text-sm text-[var(--text-secondary)]">{doc.fileName}</p>
          <label className="mb-1 block text-xs text-[var(--text-secondary)]">
            Motivo del rechazo * (mínimo 10 caracteres)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
            placeholder="Explica qué debe corregir el trabajador para reenviar el documento."
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
