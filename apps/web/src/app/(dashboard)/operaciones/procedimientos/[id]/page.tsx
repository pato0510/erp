'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Edit,
  Eye,
  FileText,
  HardHat,
  History,
  Leaf,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../../../../../lib/api';
import { useAuth } from '../../../../../hooks/useAuth';
import { Toast } from '../../../../../components/shared/Toast';
import { ProcedureNewVersionModal } from '../../../../../components/operations/ProcedureNewVersionModal';
import { ProcedureRevisionsTimeline } from '../../../../../components/operations/ProcedureRevisionsTimeline';
import { ProcedureAcknowledgmentSection } from '../../../../../components/operations/ProcedureAcknowledgmentSection';

type ProcedureStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'SUPERSEDED' | 'DEPRECATED';
type ProcedureCategory =
  | 'OPERATION'
  | 'MAINTENANCE'
  | 'EMERGENCY'
  | 'SAFETY'
  | 'QUALITY'
  | 'ENVIRONMENTAL'
  | 'OTHER';

interface AttachmentRecord {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  description?: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

interface Procedure {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category: ProcedureCategory;
  authoredBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  deprecatedBy: string | null;
  deprecatedAt: string | null;
  version: string;
  changelog: string | null;
  replacesProcedureId: string | null;
  replacedByProcedureId: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  attachments: AttachmentRecord[];
  keywords: string[];
  scope: string | null;
  estimatedReadingMinutes: number | null;
  requiresAcknowledgment: boolean;
  acknowledgmentDeadlineDays: number | null;
  applicableAssetTypeIds: string[];
  applicableAssetIds: string[];
  applicableLocationIds: string[];
  applicableRoles: string[];
  status: ProcedureStatus;
  statusReason: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  replaces: { id: string; code: string; version: string; status: string } | null;
  replacedBy: Array<{ id: string; code: string; version: string; status: string }>;
  allVersions: Array<{
    id: string;
    version: string;
    status: ProcedureStatus;
    publishedAt: string | null;
    createdAt: string;
  }>;
}

interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface AssetSummary {
  id: string;
  code: string;
  name: string;
}

interface AssetTypeSummary {
  id: string;
  name: string;
}

interface LocationSummary {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<ProcedureStatus, string> = {
  DRAFT: 'Borrador',
  IN_REVIEW: 'En revisión',
  PUBLISHED: 'Publicado',
  SUPERSEDED: 'Reemplazado',
  DEPRECATED: 'Deprecado',
};

const STATUS_META: Record<ProcedureStatus, { bg: string; fg: string }> = {
  DRAFT: { bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
  IN_REVIEW: { bg: 'rgba(234, 179, 8, 0.14)', fg: '#a16207' },
  PUBLISHED: { bg: 'rgba(34, 197, 94, 0.14)', fg: '#15803d' },
  SUPERSEDED: { bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
  DEPRECATED: { bg: 'rgba(239, 68, 68, 0.12)', fg: '#b91c1c' },
};

const CATEGORY_META: Record<
  ProcedureCategory,
  { label: string; color: string; icon: typeof BookOpen }
> = {
  OPERATION: { label: 'Operación', color: '#2563EB', icon: HardHat },
  MAINTENANCE: { label: 'Mantenimiento', color: '#64748B', icon: BookOpen },
  EMERGENCY: { label: 'Emergencia', color: '#EF4444', icon: AlertTriangle },
  SAFETY: { label: 'Seguridad', color: '#EAB308', icon: ShieldCheck },
  QUALITY: { label: 'Calidad', color: '#A855F7', icon: Sparkles },
  ENVIRONMENTAL: { label: 'Ambiental', color: '#22C55E', icon: Leaf },
  OTHER: { label: 'Otro', color: '#475569', icon: FileText },
};

export default function ProcedureDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const { user } = useAuth();
  const role = (user as { role?: string } | null)?.role;
  const isAdminOrManager = role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'MANAGER';
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

  const [procedure, setProcedure] = useState<Procedure | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [assetTypes, setAssetTypes] = useState<AssetTypeSummary[]>([]);
  const [locations, setLocations] = useState<LocationSummary[]>([]);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const [newVersionOpen, setNewVersionOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState<null | 'approve' | 'reject'>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [deprecateOpen, setDeprecateOpen] = useState(false);
  const [deprecateReason, setDeprecateReason] = useState('');
  const [working, setWorking] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, u, a, t, l] = await Promise.all([
        apiClient.get<Procedure>(`/api/operations/procedures/${id}`),
        apiClient.get<UserSummary[]>('/api/users').catch(() => [] as UserSummary[]),
        apiClient
          .get<{ data: AssetSummary[] }>('/api/operations/assets?limit=200')
          .catch(() => ({ data: [] as AssetSummary[] })),
        apiClient
          .get<AssetTypeSummary[]>('/api/operations/asset-types')
          .catch(() => [] as AssetTypeSummary[]),
        apiClient
          .get<LocationSummary[]>('/api/operations/locations')
          .catch(() => [] as LocationSummary[]),
      ]);
      setProcedure(p);
      setUsers(u);
      setAssets(a.data ?? []);
      setAssetTypes(t);
      setLocations(l);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el procedimiento.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  /* Fetch the main file as a blob URL once we know the id, so the
     PDF/image preview embeds without leaking auth credentials in
     the iframe URL. */
  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    if (procedure) {
      apiClient
        .fetchBlob(`/api/operations/procedures/${id}/file`)
        .then((blob) => {
          if (!alive) return;
          url = URL.createObjectURL(blob);
          setFileUrl(url);
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, procedure?.id, procedure?.updatedAt]);

  const userById = (uid: string | null) => (uid ? (users.find((u) => u.id === uid) ?? null) : null);

  const callWorkflow = async (path: string, payload?: unknown) => {
    setWorking(true);
    try {
      await apiClient.post(`/api/operations/procedures/${id}/${path}`, payload ?? {});
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo ejecutar la acción.',
        type: 'error',
      });
    } finally {
      setWorking(false);
    }
  };

  const triggerMainDownload = async () => {
    try {
      const blob = await apiClient.fetchBlob(`/api/operations/procedures/${id}/file?download=1`);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = procedure?.fileName ?? 'procedimiento';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo descargar.',
        type: 'error',
      });
    }
  };

  const triggerAttachmentDownload = async (idx: number, fileName: string) => {
    try {
      const blob = await apiClient.fetchBlob(
        `/api/operations/procedures/${id}/attachments/${idx}?download=1`,
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo descargar.',
        type: 'error',
      });
    }
  };

  const handleAttachmentUpload = async (file: File) => {
    setWorking(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await apiClient.uploadFile(`/api/operations/procedures/${id}/attachments`, fd);
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo subir el adjunto.',
        type: 'error',
      });
    } finally {
      setWorking(false);
    }
  };

  const handleAttachmentDelete = async (idx: number) => {
    if (!window.confirm('¿Eliminar este adjunto?')) return;
    try {
      await apiClient.delete(`/api/operations/procedures/${id}/attachments/${idx}`);
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo eliminar.',
        type: 'error',
      });
    }
  };

  if (loading) {
    return <div className="p-6 text-[var(--text-secondary)]">Cargando procedimiento...</div>;
  }
  if (error || !procedure) {
    return (
      <div className="p-6">
        <div className="text-red-600">{error ?? 'Procedimiento no encontrado.'}</div>
        <Link
          href="/operaciones/procedimientos"
          className="mt-4 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
        >
          <ArrowLeft size={14} /> Volver a la biblioteca
        </Link>
      </div>
    );
  }

  const meta = STATUS_META[procedure.status];
  const catMeta = CATEGORY_META[procedure.category];
  const CatIcon = catMeta.icon;
  const isAuthor = procedure.authoredBy === user?.id;
  const isReviewer = procedure.reviewedBy != null;
  const isPdf = procedure.mimeType === 'application/pdf';
  const isImage = procedure.mimeType.startsWith('image/');

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <Link
        href="/operaciones/procedimientos"
        className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4"
        style={{
          fontFamily: 'var(--font-ibm-plex-mono), monospace',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        <ArrowLeft size={12} /> Operaciones / Procedimientos / {procedure.title}
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              style={{
                background: `${catMeta.color}22`,
                color: catMeta.color,
                fontWeight: 600,
              }}
            >
              <CatIcon size={11} /> {catMeta.label}
            </span>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
              style={{
                background: meta.bg,
                color: meta.fg,
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
              }}
            >
              {STATUS_LABELS[procedure.status]}
            </span>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
              style={{
                background: 'rgba(100, 116, 139, 0.14)',
                color: '#475569',
                fontFamily: 'var(--font-jetbrains-mono), monospace',
              }}
            >
              v{procedure.version}
            </span>
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
              fontSize: 26,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            {procedure.title}
          </h1>
          <p
            className="text-xs text-[var(--text-secondary)] mt-1"
            style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
          >
            {procedure.code}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {procedure.status === 'DRAFT' && (isAuthor || isAdminOrManager) && (
            <ActionBtn
              icon={Send}
              label="Enviar a revisión"
              color="#2563EB"
              onClick={() => callWorkflow('submit')}
              disabled={working}
            />
          )}
          {procedure.status === 'IN_REVIEW' && isAdminOrManager && !isReviewer && (
            <>
              <ActionBtn
                icon={CheckCircle2}
                label="Aprobar revisión"
                color="#22C55E"
                onClick={() => {
                  setReviewNotes('');
                  setReviewOpen('approve');
                }}
                disabled={working}
              />
              <ActionBtn
                icon={XCircle}
                label="Rechazar"
                color="#EF4444"
                onClick={() => {
                  setReviewNotes('');
                  setReviewOpen('reject');
                }}
                disabled={working}
              />
            </>
          )}
          {procedure.status === 'IN_REVIEW' && isAdminOrManager && isReviewer && (
            <ActionBtn
              icon={CheckCircle2}
              label="Publicar"
              color="#15803D"
              onClick={() => callWorkflow('publish')}
              disabled={working}
            />
          )}
          {procedure.status === 'PUBLISHED' && isAdminOrManager && (
            <ActionBtn
              icon={Plus}
              label="Crear nueva versión"
              color="#2563EB"
              onClick={() => setNewVersionOpen(true)}
              disabled={working}
            />
          )}
          {procedure.status === 'PUBLISHED' && isAdmin && (
            <ActionBtn
              icon={Archive}
              label="Deprecar"
              color="#EF4444"
              onClick={() => {
                setDeprecateReason('');
                setDeprecateOpen(true);
              }}
              disabled={working}
            />
          )}
        </div>
      </div>

      {/* OPS-028 — banner / chip / coverage card depending on the
          caller's relationship to the procedure. */}
      <ProcedureAcknowledgmentSection
        procedureId={procedure.id}
        procedureCode={procedure.code}
        procedureTitle={procedure.title}
        procedureVersion={procedure.version}
        requiresAcknowledgment={procedure.requiresAcknowledgment}
        isAdminOrManager={isAdminOrManager}
      />

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        {/* LEFT */}
        <div className="space-y-4">
          {procedure.description && (
            <Card title="Descripción" icon={FileText}>
              <p className="text-sm whitespace-pre-wrap text-[var(--text-primary)]">
                {procedure.description}
              </p>
            </Card>
          )}

          <Card
            title="Archivo principal"
            icon={FileText}
            actions={
              <button
                onClick={triggerMainDownload}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-full border border-gray-300 hover:bg-gray-50"
              >
                <Download size={12} /> Descargar
              </button>
            }
          >
            <p className="text-xs text-[var(--text-muted)] mb-2">
              {procedure.fileName} · {Math.round(procedure.fileSize / 1024)} KB
            </p>
            {fileUrl && isPdf && (
              <iframe
                src={fileUrl}
                title={procedure.title}
                style={{
                  width: '100%',
                  height: 600,
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                }}
              />
            )}
            {fileUrl && isImage && (
              <img
                src={fileUrl}
                alt={procedure.title}
                style={{
                  maxWidth: '100%',
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                }}
              />
            )}
            {!isPdf && !isImage && (
              <p className="text-sm text-[var(--text-muted)]">
                Vista previa no disponible para este formato. Usa el botón de descarga.
              </p>
            )}
          </Card>

          <Card
            title={`Adjuntos (${procedure.attachments.length}/10)`}
            icon={FileText}
            actions={
              procedure.status === 'DRAFT' && (isAuthor || isAdminOrManager) ? (
                <>
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleAttachmentUpload(f);
                      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
                    }}
                  />
                  <button
                    onClick={() => attachmentInputRef.current?.click()}
                    disabled={working || procedure.attachments.length >= 10}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-full border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Upload size={12} /> Cargar adjunto
                  </button>
                </>
              ) : null
            }
          >
            {procedure.attachments.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Sin adjuntos.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {procedure.attachments.map((a, idx) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg"
                    style={{
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={14} className="text-[var(--text-secondary)] flex-shrink-0" />
                      <div className="min-w-0">
                        <div
                          className="text-sm truncate"
                          style={{
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontWeight: 500,
                          }}
                        >
                          {a.fileName}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {Math.round(a.fileSize / 1024)} KB
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => triggerAttachmentDownload(idx, a.fileName)}
                        className="p-1.5 rounded hover:bg-gray-100 text-[var(--text-secondary)]"
                        title="Descargar"
                      >
                        <Download size={13} />
                      </button>
                      {procedure.status === 'DRAFT' && (isAuthor || isAdminOrManager) && (
                        <button
                          onClick={() => handleAttachmentDelete(idx)}
                          className="p-1.5 rounded hover:bg-red-50 text-red-600"
                          title="Eliminar"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Historial de revisiones" icon={History}>
            <ProcedureRevisionsTimeline
              procedureId={procedure.id}
              users={users}
              refreshKey={procedure.updatedAt as unknown as number}
            />
          </Card>
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
          <Card title="Información" icon={FileText}>
            <DescTerm label="Categoría">{catMeta.label}</DescTerm>
            <DescTerm label="Versión">v{procedure.version}</DescTerm>
            {procedure.estimatedReadingMinutes && (
              <DescTerm label="Lectura estimada">{procedure.estimatedReadingMinutes} min</DescTerm>
            )}
            {procedure.scope && <DescTerm label="Alcance">{procedure.scope}</DescTerm>}
            {procedure.keywords.length > 0 && (
              <div className="py-1.5 border-b border-[var(--border-color)] last:border-b-0">
                <div
                  className="text-xs uppercase tracking-wider text-[var(--text-secondary)] mb-1"
                  style={{
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    letterSpacing: '0.12em',
                  }}
                >
                  Palabras clave
                </div>
                <div className="flex flex-wrap gap-1">
                  {procedure.keywords.map((k) => (
                    <span
                      key={k}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                      style={{
                        background: 'rgba(37, 99, 235, 0.10)',
                        color: '#1d4ed8',
                      }}
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <DescTerm label="Requiere acuse">
              {procedure.requiresAcknowledgment ? 'Sí' : 'No'}
            </DescTerm>
            {procedure.requiresAcknowledgment && procedure.acknowledgmentDeadlineDays && (
              <DescTerm label="Plazo de acuse">
                {procedure.acknowledgmentDeadlineDays} días
              </DescTerm>
            )}
          </Card>

          <Card title="Aplicable a" icon={ShieldCheck}>
            <ChipList
              label="Activos"
              ids={procedure.applicableAssetIds}
              resolve={(id) => {
                const a = assets.find((x) => x.id === id);
                return a ? `${a.code} · ${a.name}` : id;
              }}
            />
            <ChipList
              label="Tipos de activo"
              ids={procedure.applicableAssetTypeIds}
              resolve={(id) => assetTypes.find((x) => x.id === id)?.name ?? id}
            />
            <ChipList
              label="Ubicaciones"
              ids={procedure.applicableLocationIds}
              resolve={(id) => locations.find((x) => x.id === id)?.name ?? id}
            />
            <ChipList label="Roles" ids={procedure.applicableRoles} resolve={(r) => r} />
            {procedure.applicableAssetIds.length === 0 &&
              procedure.applicableAssetTypeIds.length === 0 &&
              procedure.applicableLocationIds.length === 0 &&
              procedure.applicableRoles.length === 0 && (
                <p className="text-sm text-[var(--text-muted)]">Aplica a toda la empresa.</p>
              )}
          </Card>

          <Card title="Autoría" icon={Edit}>
            <DescTerm label="Autor">
              {formatUser(userById(procedure.authoredBy))} · {formatDateTime(procedure.createdAt)}
            </DescTerm>
            <DescTerm label="Revisor">
              {procedure.reviewedBy
                ? `${formatUser(userById(procedure.reviewedBy))} · ${formatDateTime(procedure.reviewedAt)}`
                : '—'}
            </DescTerm>
            <DescTerm label="Publicador">
              {procedure.publishedBy
                ? `${formatUser(userById(procedure.publishedBy))} · ${formatDateTime(procedure.publishedAt)}`
                : '—'}
            </DescTerm>
            {procedure.deprecatedBy && (
              <DescTerm label="Deprecado por">
                {formatUser(userById(procedure.deprecatedBy))} ·{' '}
                {formatDateTime(procedure.deprecatedAt)}
              </DescTerm>
            )}
          </Card>

          <Card title="Versiones del mismo código" icon={History}>
            <ul className="space-y-1">
              {procedure.allVersions.map((v) => {
                const isCurrent = v.id === procedure.id;
                return (
                  <li key={v.id}>
                    <Link
                      href={`/operaciones/procedimientos/${v.id}`}
                      className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md hover:bg-gray-50"
                      style={{
                        background: isCurrent ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-jetbrains-mono), monospace',
                          fontWeight: 500,
                          fontSize: 13,
                        }}
                      >
                        v{v.version}
                      </span>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                          style={{
                            background: STATUS_META[v.status].bg,
                            color: STATUS_META[v.status].fg,
                            fontWeight: 600,
                          }}
                        >
                          {STATUS_LABELS[v.status]}
                        </span>
                        {isCurrent && <span className="text-xs text-blue-600">Actual</span>}
                        {!isCurrent && (
                          <ChevronRight size={12} className="text-[var(--text-muted)]" />
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>

      {/* Review modal */}
      {reviewOpen && (
        <Modal
          title={reviewOpen === 'approve' ? 'Aprobar revisión' : 'Rechazar revisión'}
          onClose={() => setReviewOpen(null)}
        >
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            {reviewOpen === 'approve'
              ? 'Confirma la aprobación de la revisión. Tras este paso un publicador puede publicar el procedimiento.'
              : 'Indica el motivo del rechazo. El procedimiento volverá a borrador y se notificará al autor.'}
          </p>
          <textarea
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            rows={4}
            placeholder={
              reviewOpen === 'reject'
                ? 'Motivo del rechazo (mínimo 10 caracteres)'
                : 'Notas (opcional)'
            }
            className="cp-input"
          />
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => setReviewOpen(null)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-full"
            >
              Cancelar
            </button>
            <button
              onClick={async () => {
                await callWorkflow('review', {
                  approved: reviewOpen === 'approve',
                  notes: reviewNotes.trim() || undefined,
                });
                setReviewOpen(null);
              }}
              className="px-4 py-2 text-sm text-white rounded-full"
              style={{
                background: reviewOpen === 'approve' ? '#22C55E' : '#EF4444',
                fontWeight: 600,
              }}
            >
              {reviewOpen === 'approve' ? 'Aprobar' : 'Rechazar'}
            </button>
          </div>
        </Modal>
      )}

      {deprecateOpen && (
        <Modal title="Deprecar procedimiento" onClose={() => setDeprecateOpen(false)}>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            El procedimiento dejará de aparecer en búsquedas activas. Indica el motivo (mínimo 10
            caracteres).
          </p>
          <textarea
            value={deprecateReason}
            onChange={(e) => setDeprecateReason(e.target.value)}
            rows={4}
            className="cp-input"
          />
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => setDeprecateOpen(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-full"
            >
              Cancelar
            </button>
            <button
              onClick={async () => {
                if (deprecateReason.trim().length < 10) {
                  setToast({ message: 'Motivo demasiado corto.', type: 'error' });
                  return;
                }
                await callWorkflow('deprecate', { reason: deprecateReason.trim() });
                setDeprecateOpen(false);
              }}
              className="px-4 py-2 text-sm text-white rounded-full"
              style={{ background: '#EF4444', fontWeight: 600 }}
            >
              Deprecar
            </button>
          </div>
        </Modal>
      )}

      {newVersionOpen && (
        <ProcedureNewVersionModal
          sourceProcedureId={procedure.id}
          onClose={() => setNewVersionOpen(false)}
          onSaved={() => {
            setNewVersionOpen(false);
            setToast({ message: 'Nueva versión creada.', type: 'success' });
            load();
          }}
        />
      )}
    </div>
  );
}

/* ---------- Helpers ---------- */

function ActionBtn({
  icon: Icon,
  label,
  color,
  onClick,
  disabled,
}: {
  icon: typeof CheckCircle2;
  label: string;
  color: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm disabled:opacity-50"
      style={{
        background: `${color}1A`,
        color,
        fontFamily: 'var(--font-outfit), sans-serif',
        fontWeight: 600,
      }}
    >
      <Icon size={13} /> {label}
    </button>
  );
}

function Card({
  title,
  icon: Icon,
  actions,
  children,
}: {
  title: string;
  icon: typeof FileText;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
    >
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3
          className="flex items-center gap-1.5 text-sm"
          style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          <Icon size={14} /> {title}
        </h3>
        {actions}
      </div>
      <div>{children}</div>
    </div>
  );
}

function DescTerm({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-[var(--border-color)] last:border-b-0">
      <span
        className="text-xs uppercase tracking-wider text-[var(--text-secondary)] flex-shrink-0"
        style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace', letterSpacing: '0.12em' }}
      >
        {label}
      </span>
      <span
        className="text-sm text-right text-[var(--text-primary)]"
        style={{ wordBreak: 'break-word' }}
      >
        {children}
      </span>
    </div>
  );
}

function ChipList({
  label,
  ids,
  resolve,
}: {
  label: string;
  ids: string[];
  resolve: (id: string) => string;
}) {
  if (ids.length === 0) return null;
  return (
    <div className="py-1.5 border-b border-[var(--border-color)] last:border-b-0">
      <div
        className="text-xs uppercase tracking-wider text-[var(--text-secondary)] mb-1"
        style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace', letterSpacing: '0.12em' }}
      >
        {label}
      </div>
      <div className="flex flex-wrap gap-1">
        {ids.map((id) => (
          <span
            key={id}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
            style={{ background: 'rgba(100, 116, 139, 0.14)', color: '#475569' }}
          >
            {resolve(id)}
          </span>
        ))}
      </div>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}

function formatUser(u: UserSummary | null): string {
  if (!u) return '—';
  return `${u.firstName} ${u.lastName}`.trim() || u.email;
}
