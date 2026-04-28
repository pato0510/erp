'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Search,
  Send,
  X,
} from 'lucide-react';
import { apiClient } from '../../../../../lib/api';
import { Toast } from '../../../../../components/shared/Toast';
import { useAuth } from '../../../../../hooks/useAuth';
import { DocumentPreviewModal } from '../../../../../components/operations/DocumentPreviewModal';
import {
  DocumentStatusBadge,
  type DerivedDocumentStatus,
} from '../../../../../components/operations/DocumentStatusBadge';
import { getFileIcon } from '../../../../../lib/file-icons';
import { formatDate, formatRelativeDate } from '../../../../../lib/formatters';

interface UserSummary {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface PendingDoc {
  id: string;
  assetId: string;
  documentTypeId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  issueDate?: string | null;
  expirationDate?: string | null;
  status: 'PENDING_REVIEW';
  version: number;
  uploadedBy: string;
  createdAt: string;
  derivedStatus: DerivedDocumentStatus;
  notes?: string | null;
  uploader: UserSummary | null;
  asset: {
    id: string;
    code: string;
    name: string;
    assetType?: { id: string; name: string; category: string } | null;
  };
  documentType: {
    id: string;
    name: string;
    code: string;
    category: string;
    criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    blocksOperation: boolean;
    color?: string | null;
  };
}

interface AssetOption {
  id: string;
  code: string;
  name: string;
}
interface DocumentTypeOption {
  id: string;
  name: string;
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const DOC_CATEGORY_LABELS: Record<string, string> = {
  LEGAL: 'Legal',
  SAFETY: 'Seguridad',
  OPERATIONAL: 'Operacional',
  FINANCIAL: 'Financiero',
  TECHNICAL: 'Técnico',
  ADMINISTRATIVE: 'Administrativo',
};

const PAGE_SIZE = 20;

export default function PendientesPage() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [assetId, setAssetId] = useState('');
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Paginated<PendingDoc> | null>(null);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [previewDoc, setPreviewDoc] = useState<PendingDoc | null>(null);
  const [confirmApprove, setConfirmApprove] = useState<PendingDoc | null>(null);
  const [rejectDoc, setRejectDoc] = useState<PendingDoc | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  /* Debounce search input → search to avoid hitting the API on every keystroke. */
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, assetId, documentTypeId]);

  const loadCatalogs = useCallback(async () => {
    try {
      const [a, dt] = await Promise.all([
        apiClient.get<{ data: AssetOption[] }>('/api/operations/assets?limit=100'),
        apiClient.get<DocumentTypeOption[]>('/api/operations/document-types'),
      ]);
      setAssets(a.data);
      setDocumentTypes(dt);
    } catch {
      /* Selectors stay empty; list still renders. */
    }
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (assetId) params.set('assetId', assetId);
      if (documentTypeId) params.set('documentTypeId', documentTypeId);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      const res = await apiClient.get<Paginated<PendingDoc>>(
        `/api/operations/documents/pending-review?${params.toString()}`,
      );
      setData(res);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error cargando la cola',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [search, assetId, documentTypeId, page]);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  useEffect(() => {
    load();
  }, [load]);

  const performApprove = async () => {
    if (!confirmApprove) return;
    try {
      await apiClient.post(`/api/operations/documents/${confirmApprove.id}/approve`);
      setToast({ message: 'Documento aprobado', type: 'success' });
      setConfirmApprove(null);
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo aprobar el documento.',
        type: 'error',
      });
      setConfirmApprove(null);
    }
  };

  const performReject = async () => {
    if (!rejectDoc) return;
    if (rejectReason.trim().length < 10) {
      setToast({
        message: 'El motivo debe tener al menos 10 caracteres.',
        type: 'error',
      });
      return;
    }
    try {
      await apiClient.post(`/api/operations/documents/${rejectDoc.id}/reject`, {
        reason: rejectReason.trim(),
      });
      setToast({ message: 'Documento rechazado', type: 'success' });
      setRejectDoc(null);
      setRejectReason('');
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo rechazar el documento.',
        type: 'error',
      });
    }
  };

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setAssetId('');
    setDocumentTypeId('');
  };
  const hasFilters = !!(search || assetId || documentTypeId);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-6">
        <div className="ops-breadcrumb">
          <Link href="/operaciones" className="ops-breadcrumb__link">
            Operaciones
          </Link>
          {' / '}
          <Link href="/operaciones/documentos" className="ops-breadcrumb__link">
            Documentos
          </Link>
          {' / '}
          <span style={{ color: 'var(--text-primary)' }}>Pendientes de revisión</span>
        </div>
        <Link
          href="/operaciones/documentos"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-3"
          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
        >
          <ArrowLeft size={14} /> Volver a documentos
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1
              className="text-[var(--text-primary)]"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
                fontSize: 28,
                letterSpacing: '-0.01em',
                margin: 0,
              }}
            >
              Pendientes de revisión
            </h1>
            <p
              className="mt-1"
              style={{
                fontFamily: 'var(--font-ibm-plex-mono), monospace',
                fontSize: 11,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--text-secondary)',
              }}
            >
              Documentos esperando aprobación
            </p>
          </div>
          {data && data.total > 0 && (
            <span
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full"
              style={{
                background: 'rgba(37, 99, 235, 0.1)',
                color: '#1d4ed8',
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {data.total} pendiente{data.total === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="text"
            placeholder="Buscar por archivo, activo, tipo..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="cp-input pl-9"
          />
        </div>
        <select
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          className="cp-input"
          style={{ width: 'auto', minWidth: 180 }}
        >
          <option value="">Todos los activos</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} · {a.name}
            </option>
          ))}
        </select>
        <select
          value={documentTypeId}
          onChange={(e) => setDocumentTypeId(e.target.value)}
          className="cp-input"
          style={{ width: 'auto', minWidth: 180 }}
        >
          <option value="">Todos los tipos</option>
          {documentTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={resetFilters}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-gray-100 rounded-lg"
            title="Limpiar filtros"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            <X size={14} /> Limpiar
          </button>
        )}
      </div>

      {/* List */}
      {isLoading && !data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse"
              style={{
                height: 180,
                background: 'rgba(0,0,0,0.04)',
                borderRadius: 12,
              }}
            />
          ))}
        </div>
      ) : !data || data.data.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.data.map((d) => (
              <PendingCard
                key={d.id}
                doc={d}
                isOwnUpload={d.uploadedBy === userId}
                onPreview={() => setPreviewDoc(d)}
                onApprove={() => setConfirmApprove(d)}
                onReject={() => {
                  setRejectReason('');
                  setRejectDoc(d);
                }}
              />
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-[var(--text-secondary)]">
                Página {data.page} de {data.totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="p-2 rounded border border-gray-300 disabled:opacity-30 hover:bg-[var(--bg-card)] transition"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-2 rounded border border-gray-300 disabled:opacity-30 hover:bg-[var(--bg-card)] transition"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {previewDoc && (
        <DocumentPreviewModal
          documentId={previewDoc.id}
          fileName={previewDoc.fileName}
          mimeType={previewDoc.mimeType}
          documentTypeName={previewDoc.documentType.name}
          assetCode={previewDoc.asset.code}
          assetName={previewDoc.asset.name}
          derivedStatus={previewDoc.derivedStatus}
          version={previewDoc.version}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {confirmApprove && (
        <ConfirmModal
          title="Aprobar documento"
          confirmLabel="Aprobar"
          tone="success"
          onCancel={() => setConfirmApprove(null)}
          onConfirm={performApprove}
        >
          <p className="text-sm text-[var(--text-secondary)]">
            ¿Confirmas aprobar el documento{' '}
            <strong className="text-[var(--text-primary)]">
              {confirmApprove.documentType.name}
            </strong>{' '}
            de{' '}
            <strong style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
              {confirmApprove.asset.code}
            </strong>
            ? Pasará a contar como vigente y será visible para todos.
          </p>
        </ConfirmModal>
      )}

      {rejectDoc && (
        <ConfirmModal
          title="Rechazar documento"
          confirmLabel="Confirmar rechazo"
          tone="danger"
          onCancel={() => setRejectDoc(null)}
          onConfirm={performReject}
        >
          <div className="mb-3 flex items-center gap-2">
            {getFileIcon(rejectDoc.mimeType)}
            <div>
              <div
                className="text-[var(--text-primary)]"
                style={{
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                  fontSize: 14,
                }}
              >
                {rejectDoc.documentType.name}
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
                  {rejectDoc.asset.code}
                </span>{' '}
                · {rejectDoc.asset.name}
              </div>
            </div>
          </div>
          <label
            className="block mb-1.5 text-[var(--text-secondary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500, fontSize: 13 }}
          >
            Motivo del rechazo <span className="text-red-500">*</span>
          </label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            minLength={10}
            maxLength={2000}
            placeholder="Explica por qué rechazas este documento (mínimo 10 caracteres)..."
            className="cp-input"
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">
            El uploader verá este motivo y podrá corregir y reenviar.
          </p>
        </ConfirmModal>
      )}

      <style jsx global>{`
        .ops-breadcrumb {
          font-family: var(--font-ibm-plex-mono), var(--font-jetbrains-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.5);
          margin-bottom: 14px;
        }
        html.dark .ops-breadcrumb {
          color: rgba(255, 255, 255, 0.5);
        }
        .ops-breadcrumb__link {
          color: inherit;
          text-decoration: none;
        }
        .ops-breadcrumb__link:hover {
          color: var(--text-primary);
        }
        .cp-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-family: var(--font-outfit), sans-serif;
          font-size: 14px;
          color: var(--text-primary);
          background: var(--input-bg);
          outline: none;
          transition:
            border-color 120ms ease,
            box-shadow 120ms ease;
        }
        .cp-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
      `}</style>
    </div>
  );
}

/* --------------------------------------------------------------------- */

function PendingCard({
  doc,
  isOwnUpload,
  onPreview,
  onApprove,
  onReject,
}: {
  doc: PendingDoc;
  isOwnUpload: boolean;
  onPreview: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const sizeKb = (doc.fileSize / 1024).toFixed(1);
  const uploaderLabel = doc.uploader ? doc.uploader.email : 'Usuario desconocido';
  return (
    <div
      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl"
      style={{ padding: 16 }}
    >
      <div className="flex items-start gap-3 mb-3">
        {getFileIcon(doc.mimeType, { size: 24 })}
        <div className="flex-1 min-w-0">
          <div
            className="truncate text-[var(--text-primary)]"
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
              fontSize: 14,
            }}
            title={doc.fileName}
          >
            {doc.fileName}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            {sizeKb} KB · v{doc.version}
          </div>
        </div>
        <DocumentStatusBadge status={doc.derivedStatus} />
      </div>

      <div className="space-y-1.5 mb-3">
        <KvRow
          label="Activo"
          value={
            <>
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                {doc.asset.code}
              </span>{' '}
              <span style={{ fontFamily: 'var(--font-outfit), sans-serif' }}>{doc.asset.name}</span>
            </>
          }
        />
        <KvRow
          label="Tipo"
          value={
            <>
              {doc.documentType.name}{' '}
              <span className="text-xs text-[var(--text-muted)]">
                · {DOC_CATEGORY_LABELS[doc.documentType.category] ?? doc.documentType.category}
              </span>
            </>
          }
        />
        <KvRow label="Cargado por" value={uploaderLabel} />
        <KvRow label="Cargado" value={formatRelativeDate(doc.createdAt)} />
        {doc.issueDate && (
          <KvRow
            label="Vigencia"
            value={
              <>
                {formatDate(doc.issueDate)}
                {doc.expirationDate && <> → {formatDate(doc.expirationDate)}</>}
              </>
            }
          />
        )}
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-[var(--border-color)]">
        <button
          onClick={onPreview}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 500,
            color: 'var(--text-primary)',
          }}
        >
          <Eye size={14} /> Vista previa
        </button>
        <div className="flex-1" />
        <button
          onClick={onReject}
          disabled={isOwnUpload}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          title={
            isOwnUpload ? 'No puedes aprobar/rechazar tu propio documento' : 'Rechazar con motivo'
          }
        >
          <X size={14} /> Rechazar
        </button>
        <button
          onClick={onApprove}
          disabled={isOwnUpload}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-white rounded-full disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: '#16a34a',
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 500,
          }}
          title={
            isOwnUpload ? 'No puedes aprobar/rechazar tu propio documento' : 'Aprobar documento'
          }
        >
          <Send size={14} /> Aprobar
        </button>
      </div>
    </div>
  );
}

function KvRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span
        className="text-[var(--text-secondary)]"
        style={{
          fontFamily: 'var(--font-ibm-plex-mono), monospace',
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          flexShrink: 0,
          width: 90,
        }}
      >
        {label}
      </span>
      <span className="flex-1 text-[var(--text-primary)] truncate">{value}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl"
      style={{ padding: 48, textAlign: 'center' }}
    >
      <CheckCircle2 size={40} style={{ margin: '0 auto 12px', color: '#16a34a' }} />
      <p
        className="text-[var(--text-primary)]"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 600, fontSize: 16 }}
      >
        No hay documentos pendientes de revisión
      </p>
      <p className="text-sm text-[var(--text-secondary)] mt-1">
        Todos los documentos están al día.
      </p>
      <Link
        href="/operaciones/documentos"
        className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-sm border border-gray-300 rounded-full hover:bg-gray-50"
        style={{
          fontFamily: 'var(--font-outfit), sans-serif',
          fontWeight: 500,
          color: 'var(--text-primary)',
        }}
      >
        <FileText size={14} /> Volver a documentos
      </Link>
    </div>
  );
}

function ConfirmModal({
  title,
  confirmLabel,
  tone,
  onCancel,
  onConfirm,
  children,
}: {
  title: string;
  confirmLabel: string;
  tone: 'success' | 'danger';
  onCancel: () => void;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  const bg = tone === 'success' ? '#16a34a' : '#DC2626';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-[var(--border-color)]">
          <h3
            className="text-[var(--text-primary)]"
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
              fontSize: 16,
            }}
          >
            {title}
          </h3>
        </div>
        <div className="px-5 py-4">{children}</div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)]">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm text-white rounded-full"
            style={{
              background: bg,
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
