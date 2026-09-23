'use client';

import { useMembers } from '../../../../../hooks/useMembers';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Trash2, Upload } from 'lucide-react';
import { apiClient, ApiError } from '../../../../../lib/api';
import { useAuth } from '../../../../../hooks/useAuth';
import { useComercialPermissions } from '../../../../../hooks/useCanWrite';

/* COM-017 — files attached to a deal ("Documentos"): quotes produced outside Excelsia,
 * meeting minutes, other documents. Mirrors opportunity-notes.tsx: self-loading, same
 * state machine, mutate → refetch (the POST body is never used as state). Ability-driven:
 * gates on the `opportunityDocument` flags from /comercial/permissions
 * (useComercialPermissions). Eliminar on own documents (delete), or on any when
 * `manageAny` (CASL `manage`, ADMIN/SUPER_ADMIN) — never a role string; the backend
 * enforces both. useAuth supplies ONLY the current user id. Upload is multipart through
 * apiClient.uploadFile and download streams through apiClient.fetchBlob → object URL →
 * anchor click (both the RRHH documents mechanism). Classnames mirror the notes block. */

interface OpportunityDocument {
  id: string;
  opportunityId: string;
  kind: 'COTIZACION' | 'ACTA_REUNION' | 'OTRO';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdBy: string;
  createdAt: string;
}

const KIND_LABELS: Record<OpportunityDocument['kind'], string> = {
  COTIZACION: 'Cotización',
  ACTA_REUNION: 'Acta de reunión',
  OTRO: 'Otro',
};
const KIND_OPTIONS = Object.keys(KIND_LABELS) as OpportunityDocument['kind'][];
/* Same allowlist the service enforces (pdf/docx/xlsx/png/jpeg): extensions FIRST so the
   picker still shows .docx/.xlsx on systems with no MIME mapping for them (Windows
   without Office), then the MIME types. */
const ACCEPT = [
  '.pdf',
  '.docx',
  '.xlsx',
  '.png',
  '.jpg',
  '.jpeg',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
].join(',');
const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/* Prefer the backend's Spanish message; multer's size cap answers 413 in English. */
function errMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 413) return 'El archivo excede el límite de 20 MB.';
    const data = (e.data ?? {}) as { message?: string | string[] };
    const raw = Array.isArray(data.message) ? data.message.join(' ') : data.message;
    return raw || e.message || fallback;
  }
  return fallback;
}

export default function OpportunityDocuments({ opportunityId }: { opportunityId: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [documents, setDocuments] = useState<OpportunityDocument[]>([]);
  const { nameOf } = useMembers('all');
  const [kind, setKind] = useState<OpportunityDocument['kind'] | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const perms = useComercialPermissions();
  const canCreate = perms?.opportunityDocument.create ?? false;
  const canDelete = perms?.opportunityDocument.delete ?? false;
  const manageAny = perms?.opportunityDocument.manageAny ?? false;

  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const load = useCallback(async () => {
    setState('loading');
    try {
      const rows = await apiClient.get<OpportunityDocument[]>(
        `/api/comercial/opportunity-documents?opportunityId=${opportunityId}`,
      );
      setDocuments(rows);
      setState('ok');
    } catch (e) {
      setState(e instanceof ApiError && e.status === 403 ? 'forbidden' : 'error');
    }
  }, [opportunityId]);

  useEffect(() => {
    load();
  }, [load]);

  const canSubmit = canCreate && kind !== '' && file !== null && !uploading;

  const upload = async () => {
    if (!canSubmit || !file) return;
    setUploading(true);
    setUploadError(null);
    const fd = new FormData();
    fd.append('opportunityId', opportunityId);
    fd.append('kind', kind);
    fd.append('file', file);
    try {
      await apiClient.uploadFile('/api/comercial/opportunity-documents', fd, 'POST');
      setFile(null);
      setKind('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load();
    } catch (e) {
      setUploadError(errMessage(e, 'No se pudo subir el documento.'));
    } finally {
      setUploading(false);
    }
  };

  const download = async (d: OpportunityDocument) => {
    if (downloadingId) return;
    setDownloadingId(d.id);
    try {
      const blob = await apiClient.fetchBlob(
        `/api/comercial/opportunity-documents/${d.id}/download`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = d.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.alert('No se pudo descargar el archivo.');
    } finally {
      setDownloadingId(null);
    }
  };

  const remove = async (d: OpportunityDocument) => {
    if (!window.confirm(`¿Eliminar el documento "${d.fileName}"?`)) return;
    try {
      await apiClient.delete(`/api/comercial/opportunity-documents/${d.id}`);
      await load();
    } catch (e) {
      window.alert(errMessage(e, 'No se pudo eliminar el documento.'));
    }
  };

  const Uploader = canCreate ? (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[160px] flex-1">
          <label
            htmlFor={`opportunity-document-kind-${opportunityId}`}
            className="mb-1 block text-xs text-[var(--text-secondary)]"
          >
            Tipo
          </label>
          <select
            id={`opportunity-document-kind-${opportunityId}`}
            value={kind}
            onChange={(e) => setKind(e.target.value as OpportunityDocument['kind'] | '')}
            disabled={uploading}
            className={INPUT}
          >
            <option value="">Selecciona un tipo…</option>
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px] flex-[2]">
          <label
            htmlFor={`opportunity-document-file-${opportunityId}`}
            className="mb-1 block text-xs text-[var(--text-secondary)]"
          >
            Archivo (PDF, DOCX, XLSX, PNG o JPG, máx. 20 MB)
          </label>
          <input
            id={`opportunity-document-file-${opportunityId}`}
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={uploading}
            className={INPUT}
          />
        </div>
        <button
          type="button"
          onClick={upload}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ background: 'var(--color-accent)' }}
        >
          <Upload size={15} /> {uploading ? 'Subiendo…' : 'Subir documento'}
        </button>
      </div>
      {uploadError && (
        <p role="alert" className="text-sm text-red-600">
          {uploadError}
        </p>
      )}
    </div>
  ) : null;

  if (state === 'loading') return <Card>Cargando documentos…</Card>;
  if (state === 'forbidden')
    return (
      <Card>
        <p className="text-sm text-[var(--text-secondary)]">
          No tienes permiso para ver los documentos.
        </p>
      </Card>
    );
  if (state === 'error')
    return (
      <Card>
        <p className="text-sm text-red-600">No se pudieron cargar los documentos.</p>
      </Card>
    );

  return (
    <div className="space-y-4">
      {Uploader}

      {documents.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">
            Aún no hay documentos en esta oportunidad.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {documents.map((d) => {
            const isOwn = currentUserId !== null && d.createdBy === currentUserId;
            const showDelete = canDelete && (isOwn || manageAny);
            const who = nameOf(d.createdBy) ?? 'Usuario desconocido';
            return (
              <div
                key={d.id}
                className="flex gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            background: 'var(--color-accent-dim)',
                            color: 'var(--color-accent)',
                          }}
                        >
                          {KIND_LABELS[d.kind] ?? d.kind}
                        </span>
                      </div>
                      {/* The file name IS the download action. */}
                      <button
                        type="button"
                        onClick={() => download(d)}
                        disabled={downloadingId === d.id}
                        className="mt-0.5 inline-flex max-w-full items-center gap-1 text-left text-sm font-medium hover:underline disabled:opacity-60"
                        style={{ color: 'var(--color-accent)' }}
                        title="Descargar"
                      >
                        <Download size={13} className="shrink-0" />
                        <span className="truncate">{d.fileName}</span>
                      </button>
                    </div>
                    {/* Actions: Eliminar on own documents, or any with manageAny. */}
                    {showDelete && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => remove(d)}
                          className="rounded-md border border-[var(--border-color)] p-1 text-red-600 hover:bg-red-50"
                          title="Eliminar"
                          aria-label="Eliminar documento"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-secondary)]">
                    <span>{formatSize(d.sizeBytes)}</span>
                    <span>·</span>
                    <span>{formatDateTime(d.createdAt)}</span>
                    <span>·</span>
                    <span>por {who}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 text-sm text-[var(--text-secondary)]">
      {children}
    </div>
  );
}
