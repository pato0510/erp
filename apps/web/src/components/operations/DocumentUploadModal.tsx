'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, Upload, X } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { canPreviewInline, getFileIcon } from '../../lib/file-icons';

interface AssetOption {
  id: string;
  code: string;
  name: string;
}

interface DocumentTypeOption {
  id: string;
  name: string;
  code: string;
  category: string;
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  blocksOperation: boolean;
  hasExpiration: boolean;
  defaultValidityDays?: number | null;
  alertDaysBefore: number;
}

const CRITICALITY_LABELS: Record<DocumentTypeOption['criticality'], string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

const DOC_CATEGORY_LABELS: Record<string, string> = {
  LEGAL: 'Legal',
  SAFETY: 'Seguridad',
  OPERATIONAL: 'Operacional',
  FINANCIAL: 'Financiero',
  TECHNICAL: 'Técnico',
  ADMINISTRATIVE: 'Administrativo',
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx'];

interface Props {
  /* Pre-selected (and locks the selector) when supplied. */
  assetId?: string;
  documentTypeId?: string;
  /* Called after a successful upload — caller should refresh its data. */
  onUploaded: () => void;
  onClose: () => void;
}

export function DocumentUploadModal({ assetId, documentTypeId, onUploaded, onClose }: Props) {
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]);
  const [catalogsLoaded, setCatalogsLoaded] = useState(false);

  const [selectedAssetId, setSelectedAssetId] = useState(assetId ?? '');
  const [selectedDocumentTypeId, setSelectedDocumentTypeId] = useState(documentTypeId ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [issueDate, setIssueDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  /* True once the user has overridden the auto-calculated expirationDate.
     Once true, subsequent issueDate changes won't clobber their manual edit. */
  const [expirationManuallyEdited, setExpirationManuallyEdited] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState<false | 'draft' | 'review'>(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* Catalogs are needed unless both selectors come pre-locked from props.
     We still fetch them — the form might want to display the pre-selected
     entity's full name. */
  useEffect(() => {
    let alive = true;
    Promise.all([
      apiClient.get<{ data: AssetOption[] }>('/api/operations/assets?limit=100'),
      apiClient.get<DocumentTypeOption[]>('/api/operations/document-types'),
    ])
      .then(([a, dt]) => {
        if (!alive) return;
        setAssets(a.data);
        setDocumentTypes(dt);
      })
      .catch(() => {
        /* Catalogs failing isn't fatal — the user will just see fewer
           selector options. */
      })
      .finally(() => {
        if (alive) setCatalogsLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const selectedDocumentType = useMemo(
    () => documentTypes.find((d) => d.id === selectedDocumentTypeId),
    [documentTypes, selectedDocumentTypeId],
  );

  /* Auto-calc expiration when the user hasn't manually overridden it. We only
     run when documentType.hasExpiration is true and we have an issueDate +
     defaultValidityDays — otherwise the field stays empty. */
  useEffect(() => {
    if (expirationManuallyEdited) return;
    if (
      selectedDocumentType?.hasExpiration &&
      issueDate &&
      selectedDocumentType.defaultValidityDays
    ) {
      const d = new Date(issueDate);
      if (Number.isNaN(d.getTime())) return;
      d.setDate(d.getDate() + selectedDocumentType.defaultValidityDays);
      setExpirationDate(d.toISOString().slice(0, 10));
    } else if (!selectedDocumentType?.hasExpiration) {
      setExpirationDate('');
    }
  }, [issueDate, selectedDocumentType, expirationManuallyEdited]);

  /* Image preview — only meaningful for image MIME types. We own the blob
     URL, so we revoke it on file change/unmount to avoid leaks. */
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
    if (!selectedAssetId) return setError('Selecciona un activo.');
    if (!selectedDocumentTypeId) return setError('Selecciona un tipo de documento.');
    if (!file) return setError('Adjunta el archivo del documento.');

    setSubmitting(target);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('assetId', selectedAssetId);
      fd.append('documentTypeId', selectedDocumentTypeId);
      if (issueDate) fd.append('issueDate', issueDate);
      if (expirationDate) fd.append('expirationDate', expirationDate);
      if (notes.trim()) fd.append('notes', notes.trim());
      fd.append('setStatus', target === 'review' ? 'PENDING_REVIEW' : 'DRAFT');
      await apiClient.uploadFile('/api/operations/documents', fd);
      onUploaded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el documento.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-card)] z-10">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Cargar documento</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Section 1 — Asset */}
          <Section title="Activo">
            <Field label="Activo" required>
              <select
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
                disabled={!!assetId || !catalogsLoaded}
                className="cp-input"
              >
                <option value="">
                  {catalogsLoaded ? 'Selecciona un activo...' : 'Cargando...'}
                </option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </Field>
          </Section>

          {/* Section 2 — Document type */}
          <Section title="Tipo de documento">
            <Field label="Tipo" required>
              <select
                value={selectedDocumentTypeId}
                onChange={(e) => {
                  setSelectedDocumentTypeId(e.target.value);
                  /* When the user changes type, reset the manual override flag
                     so auto-calc runs again with the new validity. */
                  setExpirationManuallyEdited(false);
                }}
                disabled={!!documentTypeId || !catalogsLoaded}
                className="cp-input"
              >
                <option value="">{catalogsLoaded ? 'Selecciona un tipo...' : 'Cargando...'}</option>
                {documentTypes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {DOC_CATEGORY_LABELS[d.category] ? ` · ${DOC_CATEGORY_LABELS[d.category]}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            {selectedDocumentType && <DocumentTypeInfo type={selectedDocumentType} />}
          </Section>

          {/* Section 3 — File */}
          <Section title="Archivo">
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
                    Arrastra tu archivo aquí o haz clic para seleccionar
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

          {/* Section 4 — Validity */}
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
                  selectedDocumentType?.hasExpiration &&
                  issueDate &&
                  selectedDocumentType.defaultValidityDays &&
                  !expirationManuallyEdited
                    ? `Calculada automáticamente (+${selectedDocumentType.defaultValidityDays} días). Editar manualmente.`
                    : !selectedDocumentType?.hasExpiration && selectedDocumentType
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
                  disabled={selectedDocumentType ? !selectedDocumentType.hasExpiration : false}
                  className="cp-input"
                />
              </Field>
            </Grid>
          </Section>

          {/* Section 5 — Notes */}
          <Section title="Notas (opcional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Comentarios, número de folio, observaciones..."
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
            className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            {submitting === 'review' ? 'Guardando...' : 'Guardar y enviar a revisión'}
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

function DocumentTypeInfo({ type }: { type: DocumentTypeOption }) {
  return (
    <div
      className="rounded-lg p-3 mt-2 space-y-1.5"
      style={{
        background: 'rgba(37, 99, 235, 0.06)',
        border: '1px solid rgba(37, 99, 235, 0.18)',
      }}
    >
      <p
        className="text-xs text-[var(--text-secondary)]"
        style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
      >
        Vigencia por defecto:{' '}
        {type.hasExpiration && type.defaultValidityDays ? (
          <strong className="text-[var(--text-primary)]">{type.defaultValidityDays} días</strong>
        ) : (
          <strong className="text-[var(--text-primary)]">Sin vencimiento</strong>
        )}
      </p>
      <p
        className="text-xs text-[var(--text-secondary)]"
        style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
      >
        Criticidad:{' '}
        <strong className="text-[var(--text-primary)]">
          {CRITICALITY_LABELS[type.criticality]}
        </strong>
      </p>
      {type.blocksOperation && (
        <p
          className="inline-flex items-center gap-1.5 text-xs"
          style={{
            color: '#b91c1c',
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 500,
          }}
        >
          <AlertTriangle size={12} /> Este documento bloquea operación si vence.
        </p>
      )}
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

/* Best-effort MIME guess from filename — used when the browser hands us an
   octet-stream for office docs so the icon picker still chooses correctly. */
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

export default DocumentUploadModal;
