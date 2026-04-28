'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, RefreshCw, Upload, X } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { canPreviewInline, getFileIcon } from '../../lib/file-icons';

interface OldDocumentContext {
  id: string;
  fileName: string;
  version: number;
  assetId: string;
  assetCode: string;
  assetName: string;
  documentTypeId: string;
  documentTypeName: string;
  documentTypeCode: string;
  hasExpiration: boolean;
  defaultValidityDays?: number | null;
}

interface Props {
  oldDocument: OldDocumentContext;
  onSuperseded: (newVersion: number) => void;
  onClose: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx'];

/* OPS-016 — supersedes an APPROVED document with a new version. Asset and
   document type are inherited from the old row (the backend rejects any
   mismatch), so the form only collects file + new validity dates + optional
   notes. After success the parent receives the new version number for a
   confirmation toast. */
export function DocumentSupersessionModal({ oldDocument, onSuperseded, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [issueDate, setIssueDate] = useState(today);
  const [expirationDate, setExpirationDate] = useState('');
  const [expirationManuallyEdited, setExpirationManuallyEdited] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState<false | 'draft' | 'review'>(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* Auto-calc expiration unless the user manually overrode it. We re-run
     whenever the issueDate changes — the document type is fixed for the
     supersession flow so its validity-days never change here. */
  useEffect(() => {
    if (expirationManuallyEdited) return;
    if (oldDocument.hasExpiration && issueDate && oldDocument.defaultValidityDays) {
      const d = new Date(issueDate);
      if (Number.isNaN(d.getTime())) return;
      d.setDate(d.getDate() + oldDocument.defaultValidityDays);
      setExpirationDate(d.toISOString().slice(0, 10));
    } else if (!oldDocument.hasExpiration) {
      setExpirationDate('');
    }
  }, [
    issueDate,
    expirationManuallyEdited,
    oldDocument.hasExpiration,
    oldDocument.defaultValidityDays,
  ]);

  /* Image preview — only meaningful for image MIME types. We own the blob
     URL so revoke it on file change/unmount. */
  useEffect(() => {
    if (file && canPreviewInline(file.type) === 'image') {
      const url = URL.createObjectURL(file);
      setImagePreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setImagePreview(null);
    return () => undefined;
  }, [file]);

  const handleFile = (f: File | null) => {
    setError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setError('El archivo excede el límite de 10 MB.');
      return;
    }
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXT.includes(ext)) {
      setError('Formato no permitido. Usa PDF, JPG, PNG, WEBP, DOC, DOCX, XLS o XLSX.');
      return;
    }
    setFile(f);
  };

  const submit = async (target: 'draft' | 'review') => {
    setError(null);
    if (!file) return setError('Adjunta el archivo de la nueva versión.');

    setSubmitting(target);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (issueDate) fd.append('issueDate', issueDate);
      if (expirationDate) fd.append('expirationDate', expirationDate);
      if (notes.trim()) fd.append('notes', notes.trim());
      fd.append('setStatus', target === 'review' ? 'PENDING_REVIEW' : 'DRAFT');
      const res = await apiClient.uploadFile<{
        newDocument: { version: number };
      }>(`/api/operations/documents/${oldDocument.id}/supersede`, fd);
      onSuperseded(res.newDocument.version);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reemplazar la versión.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-card)] z-10">
          <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <RefreshCw size={16} /> Reemplazar documento
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Banner — explains the consequences of supersession */}
          <div
            className="rounded-lg p-3 flex items-start gap-2"
            style={{
              background: 'rgba(234, 179, 8, 0.08)',
              border: '1px solid rgba(234, 179, 8, 0.25)',
            }}
          >
            <AlertCircle size={16} style={{ color: '#a16207', flexShrink: 0, marginTop: 2 }} />
            <p className="text-sm text-[var(--text-primary)]" style={{ lineHeight: 1.45 }}>
              Estás reemplazando el documento <strong>{oldDocument.fileName}</strong> versión{' '}
              <strong>v{oldDocument.version}</strong> de <strong>{oldDocument.assetName}</strong>.
              La versión anterior quedará marcada como <strong>REEMPLAZADA</strong> pero seguirá
              disponible en el historial.
            </p>
          </div>

          {/* Locked context — asset + document type are inherited */}
          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg"
            style={{
              background: 'rgba(37, 99, 235, 0.04)',
              border: '1px dashed rgba(37, 99, 235, 0.2)',
            }}
          >
            <LockedField
              label="Activo"
              code={oldDocument.assetCode}
              value={oldDocument.assetName}
            />
            <LockedField
              label="Tipo de documento"
              code={oldDocument.documentTypeCode}
              value={oldDocument.documentTypeName}
            />
          </div>

          {/* File */}
          <Section title="Archivo de la nueva versión">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer"
              style={{
                border: '2px dashed',
                borderColor: dragOver ? '#2563eb' : 'var(--border-color)',
                borderRadius: 12,
                padding: 20,
                textAlign: 'center',
                background: dragOver ? 'rgba(37, 99, 235, 0.04)' : 'var(--input-bg)',
                transition: 'all 150ms ease',
              }}
            >
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt={file.name}
                      style={{
                        width: 56,
                        height: 56,
                        objectFit: 'cover',
                        borderRadius: 6,
                        border: '1px solid var(--border-color)',
                      }}
                    />
                  ) : (
                    getFileIcon(file.type || guessMimeFromName(file.name), { size: 32 })
                  )}
                  <div style={{ textAlign: 'left' }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-outfit), sans-serif',
                        fontWeight: 600,
                        fontSize: 14,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {file.name}
                    </div>
                    <div
                      className="text-[var(--text-muted)] mt-0.5"
                      style={{
                        fontFamily: 'var(--font-jetbrains-mono), monospace',
                        fontSize: 11,
                      }}
                    >
                      {(file.size / 1024).toFixed(1)} KB · {file.type || 'tipo desconocido'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFile(null);
                    }}
                    className="ml-3 p-1 rounded hover:bg-gray-100 text-[var(--text-secondary)]"
                    aria-label="Quitar archivo"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <Upload size={28} style={{ margin: '0 auto 8px', color: '#94a3b8' }} />
                  <p
                    style={{
                      fontFamily: 'var(--font-outfit), sans-serif',
                      fontWeight: 500,
                      fontSize: 14,
                      color: 'var(--text-primary)',
                    }}
                  >
                    Arrastra el nuevo archivo aquí o haz clic para seleccionar
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    PDF, JPG, PNG, WEBP, DOC, DOCX, XLS, XLSX · máx 10 MB
                  </p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = '';
                }}
                style={{ display: 'none' }}
              />
            </div>
          </Section>

          {/* Validity */}
          <Section title="Vigencia">
            <Grid cols={2}>
              <Field label="Fecha de emisión">
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="cp-input"
                />
              </Field>
              <Field
                label="Fecha de vencimiento"
                hint={
                  oldDocument.hasExpiration &&
                  issueDate &&
                  oldDocument.defaultValidityDays &&
                  !expirationManuallyEdited
                    ? `Calculada automáticamente (+${oldDocument.defaultValidityDays} días). Editar manualmente.`
                    : !oldDocument.hasExpiration
                      ? 'Este tipo de documento no tiene vencimiento.'
                      : undefined
                }
              >
                <input
                  type="date"
                  value={expirationDate}
                  onChange={(e) => {
                    setExpirationDate(e.target.value);
                    setExpirationManuallyEdited(true);
                  }}
                  disabled={!oldDocument.hasExpiration}
                  className="cp-input"
                />
              </Field>
            </Grid>
          </Section>

          {/* Notes — explicitly empty by default per spec, so users don't
              accidentally carry over context that no longer applies. */}
          <Section title="Notas (opcional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Comentarios sobre la nueva versión..."
              className="cp-input"
            />
          </Section>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200 flex items-start gap-2">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)] sticky bottom-0 bg-[var(--bg-card)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            Cancelar
          </button>
          <button
            onClick={() => submit('draft')}
            disabled={submitting !== false}
            className="px-4 py-2 text-sm rounded-full border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}
          >
            {submitting === 'draft' ? 'Guardando...' : 'Guardar como borrador'}
          </button>
          <button
            onClick={() => submit('review')}
            disabled={submitting !== false}
            className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50 inline-flex items-center gap-1.5"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            <RefreshCw size={14} />
            {submitting === 'review' ? 'Reemplazando...' : 'Reemplazar versión'}
          </button>
        </div>
      </div>

      <style jsx global>{`
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
        .cp-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

/* --------------------------------------------------------------------- */

function LockedField({ label, code, value }: { label: string; code: string; value: string }) {
  return (
    <div>
      <div
        className="text-[var(--text-secondary)] mb-1"
        style={{
          fontFamily: 'var(--font-ibm-plex-mono), monospace',
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-secondary)',
        }}
      >
        {code}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-outfit), sans-serif',
          fontWeight: 500,
          fontSize: 14,
          color: 'var(--text-primary)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4
        className="text-[var(--text-secondary)] mb-2"
        style={{
          fontFamily: 'var(--font-ibm-plex-mono), monospace',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </h4>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Grid({ cols, children }: { cols: 1 | 2; children: React.ReactNode }) {
  return <div className={`grid grid-cols-1 md:grid-cols-${cols} gap-3`}>{children}</div>;
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block mb-1.5 text-[var(--text-secondary)]"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500, fontSize: 13 }}
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-[var(--text-muted)] mt-1">{hint}</p>}
    </div>
  );
}

function guessMimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  if (ext === 'doc') return 'application/msword';
  if (ext === 'docx')
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'xls') return 'application/vnd.ms-excel';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return 'application/octet-stream';
}

export default DocumentSupersessionModal;
