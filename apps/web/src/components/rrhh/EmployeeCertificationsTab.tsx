'use client';

/* HR-014 — Certificaciones / Habilitaciones tab on the employee ficha. Copy-adapt
 * of the HR-004 documents tab, driven by /api/rrhh/certifications +
 * /certification-types. Reuses ComplianceGauge. One component, two modes:
 *   - 'certificaciones' → compliance gauge (cargo required certs) + CERTIFICACION list
 *   - 'habilitaciones'  → HABILITACION_CLIENTE/FAENA list (with client/faena)
 * The cross-employee MATRIZ lives in HR-015 (availability board); this is the
 * per-employee view. Role gating mirrors the other tabs: a 200 on the list GET ⇒
 * this caller may also act; 403 ⇒ "sin permiso". Dates UTC. Every fetch /api/rrhh/*. */
import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, FileText, Plus, Trash2, X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { ComplianceGauge } from '../operations/ComplianceGauge';

const ACCENT = '#2563eb';

const CATEGORY_LABELS: Record<string, string> = {
  CERTIFICACION: 'Certificación',
  HABILITACION_CLIENTE: 'Habilitación cliente',
  HABILITACION_FAENA: 'Habilitación faena',
};
const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  VIGENTE: { label: 'Vigente', bg: 'rgba(34,197,94,0.12)', fg: '#15803d' },
  POR_VENCER: { label: 'Por vencer', bg: 'rgba(234,179,8,0.14)', fg: '#a16207' },
  VENCIDA: { label: 'Vencida', bg: 'rgba(239,68,68,0.12)', fg: '#b91c1c' },
  FALTANTE: { label: 'Faltante', bg: 'rgba(239,68,68,0.12)', fg: '#b91c1c' },
  ANULADA: { label: 'Anulada', bg: 'rgba(100,116,139,0.14)', fg: '#64748b' },
};
const HABILITACION_CATS = ['HABILITACION_CLIENTE', 'HABILITACION_FAENA'];

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

interface CertType {
  id: string;
  name: string;
  category: string;
  requiresExpiry: boolean;
  defaultValidityDays: number | null;
  active: boolean;
}
interface Certification {
  id: string;
  category: string;
  certificationTypeId: string;
  issueDate: string | null;
  expiryDate: string | null;
  status: string;
  derivedStatus: keyof typeof STATUS_META;
  clientOrSite: string | null;
  notes: string | null;
  certificationType: { id: string; name: string; category: string; issuingEntity: string | null };
  document: { id: string; fileName: string } | null;
}
interface Compliance {
  compliance: {
    totalRequired: number;
    valid: number;
    expiringSoon: number;
    expired: number;
    missing: number;
    compliancePercentage: number;
  };
  requiredCerts: { certTypeName: string; derivedStatus: keyof typeof STATUS_META }[];
}
interface DocRef {
  id: string;
  fileName: string;
  documentType: { name: string };
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.ANULADA;
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
async function downloadDocument(id: string, fileName: string) {
  const blob = await apiClient.fetchBlob(`/api/rrhh/documents/${id}/file?download=1`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function EmployeeCertificationsTab({
  employeeId,
  mode,
}: {
  employeeId: string;
  mode: 'certificaciones' | 'habilitaciones';
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [certs, setCerts] = useState<Certification[]>([]);
  const [compliance, setCompliance] = useState<Compliance | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const isHab = mode === 'habilitaciones';

  const load = useCallback(async () => {
    setState('loading');
    try {
      const all = await apiClient.get<Certification[]>(
        `/api/rrhh/certifications?employeeId=${employeeId}`,
      );
      setCerts(all);
      if (!isHab) {
        const comp = await apiClient.get<Compliance>(
          `/api/rrhh/certifications/compliance/${employeeId}`,
        );
        setCompliance(comp);
      }
      setState('ok');
    } catch (e) {
      setState(e instanceof ApiError && e.status === 403 ? 'forbidden' : 'error');
    }
  }, [employeeId, isHab]);

  useEffect(() => {
    load();
  }, [load]);

  const canManage = state === 'ok';
  const visible = certs.filter((c) =>
    isHab ? HABILITACION_CATS.includes(c.category) : c.category === 'CERTIFICACION',
  );

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este registro?')) return;
    setMsg(null);
    try {
      await apiClient.delete(`/api/rrhh/certifications/${id}`);
      await load();
    } catch (e) {
      setMsg(errMessage(e, 'No se pudo eliminar.'));
    }
  };
  const anular = async (id: string) => {
    setMsg(null);
    try {
      await apiClient.patch(`/api/rrhh/certifications/${id}`, { status: 'ANULADA' });
      await load();
    } catch (e) {
      setMsg(errMessage(e, 'No se pudo anular.'));
    }
  };

  if (state === 'loading') return <Card>Cargando…</Card>;
  if (state === 'forbidden')
    return (
      <Card>
        <p className="text-sm text-[var(--text-secondary)]">
          No tienes permiso para ver {isHab ? 'las habilitaciones' : 'las certificaciones'} de este
          trabajador.
        </p>
      </Card>
    );
  if (state === 'error')
    return (
      <Card>
        <p className="text-sm text-red-600">No se pudieron cargar los datos.</p>
      </Card>
    );

  return (
    <div className="space-y-4">
      {/* Compliance summary (certificaciones only — cargo required certs) */}
      {!isHab && compliance && (
        <Card>
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <ComplianceGauge
              percentage={compliance.compliance.compliancePercentage}
              size={150}
              subtitle={`${compliance.compliance.valid + compliance.compliance.expiringSoon} de ${compliance.compliance.totalRequired} al día`}
            />
            <div className="flex-1">
              <h3
                className="mb-2 text-sm font-semibold text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
              >
                Cumplimiento de certificaciones requeridas (cargo)
              </h3>
              {compliance.requiredCerts.length === 0 ? (
                <p className="text-xs text-[var(--text-secondary)]">
                  El cargo no define certificaciones requeridas.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {compliance.requiredCerts.map((r) => (
                    <li
                      key={r.certTypeName}
                      className="flex items-center justify-between gap-2 text-sm text-[var(--text-primary)]"
                    >
                      <span>{r.certTypeName}</span>
                      <StatusBadge status={r.derivedStatus} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}

      {msg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {msg}
        </div>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3
            className="text-sm font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            {isHab ? 'Habilitaciones' : 'Certificaciones'}
          </h3>
          {canManage && (
            <button
              onClick={() => setFormOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
              style={{ background: ACCENT }}
            >
              <Plus size={14} /> {isHab ? 'Registrar habilitación' : 'Registrar certificación'}
            </button>
          )}
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No hay {isHab ? 'habilitaciones' : 'certificaciones'} registradas.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border-color)]">
            {visible.map((c) => {
              const doc = c.document;
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <BadgeCheck size={15} className="text-[var(--text-secondary)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-primary)]">
                      <span className="font-medium">{c.certificationType.name}</span>
                      {isHab && (
                        <span className="text-[var(--text-secondary)]">
                          · {CATEGORY_LABELS[c.category]}
                        </span>
                      )}
                      {c.clientOrSite && (
                        <span className="text-[var(--text-secondary)]">· {c.clientOrSite}</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-secondary)]">
                      {c.issueDate && <span>Emisión: {formatDateOnly(c.issueDate)}</span>}
                      {c.expiryDate && <span>Vence: {formatDateOnly(c.expiryDate)}</span>}
                      {c.certificationType.issuingEntity && (
                        <span>{c.certificationType.issuingEntity}</span>
                      )}
                    </div>
                    {doc && (
                      <button
                        onClick={() => downloadDocument(doc.id, doc.fileName)}
                        className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium"
                        style={{ color: ACCENT }}
                      >
                        <FileText size={12} /> {doc.fileName}
                      </button>
                    )}
                  </div>
                  <StatusBadge status={c.derivedStatus} />
                  {canManage && c.status !== 'ANULADA' && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => anular(c.id)}
                        className="rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)]"
                        title="Anular"
                      >
                        Anular
                      </button>
                      <button
                        onClick={() => remove(c.id)}
                        className="rounded-md border border-red-300 p-1 text-red-700"
                        title="Eliminar"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {formOpen && (
        <CertFormModal
          employeeId={employeeId}
          mode={mode}
          onClose={() => setFormOpen(false)}
          onDone={() => {
            setFormOpen(false);
            load();
          }}
          onSeeded={async () => {
            /* refresh types after seeding without tearing down the modal */
          }}
        />
      )}
    </div>
  );
}

function CertFormModal({
  employeeId,
  mode,
  onClose,
  onDone,
}: {
  employeeId: string;
  mode: 'certificaciones' | 'habilitaciones';
  onClose: () => void;
  onDone: () => void;
  onSeeded?: () => void;
}) {
  const isHab = mode === 'habilitaciones';
  const [types, setTypes] = useState<CertType[]>([]);
  const [docs, setDocs] = useState<DocRef[]>([]);
  const [certificationTypeId, setCertificationTypeId] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [clientOrSite, setClientOrSite] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadTypes = useCallback(async () => {
    const all = await apiClient
      .get<CertType[]>('/api/rrhh/certification-types?activeOnly=true')
      .catch(() => [] as CertType[]);
    setTypes(
      all.filter((t) =>
        isHab ? HABILITACION_CATS.includes(t.category) : t.category === 'CERTIFICACION',
      ),
    );
  }, [isHab]);

  useEffect(() => {
    loadTypes();
    apiClient
      .get<DocRef[]>(`/api/rrhh/documents?employeeId=${employeeId}`)
      .then(setDocs)
      .catch(() => setDocs([]));
  }, [employeeId, loadTypes]);

  const seed = async () => {
    setSeeding(true);
    setErr(null);
    try {
      await apiClient.post('/api/rrhh/certification-types/seed-recommended');
      await loadTypes();
    } catch (e) {
      setErr(errMessage(e, 'No se pudieron sembrar los tipos.'));
    } finally {
      setSeeding(false);
    }
  };

  const submit = async () => {
    if (!certificationTypeId) return setErr('Selecciona el tipo.');
    setBusy(true);
    setErr(null);
    try {
      await apiClient.post('/api/rrhh/certifications', {
        employeeId,
        certificationTypeId,
        issueDate: issueDate || undefined,
        expiryDate: expiryDate || undefined,
        clientOrSite: clientOrSite.trim() || undefined,
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
            {isHab ? 'Registrar habilitación' : 'Registrar certificación'}
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
            <label className={labelCls}>Tipo *</label>
            {types.length === 0 ? (
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-3 text-sm text-[var(--text-secondary)]">
                No hay tipos configurados.
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
                value={certificationTypeId}
                onChange={(e) => setCertificationTypeId(e.target.value)}
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Fecha de emisión</label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Fecha de vencimiento</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <p className="text-[11px] text-[var(--text-secondary)]">
            Si dejas el vencimiento en blanco, se calcula desde la validez por defecto del tipo (si
            la tiene).
          </p>

          {isHab && (
            <div>
              <label className={labelCls}>Cliente / faena</label>
              <input
                value={clientOrSite}
                onChange={(e) => setClientOrSite(e.target.value)}
                className={inputCls}
              />
            </div>
          )}

          <div>
            <label className={labelCls}>Certificado (PDF cargado en Documentos)</label>
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
