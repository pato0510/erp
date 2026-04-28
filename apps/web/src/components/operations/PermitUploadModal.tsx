'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Building2, MapPin, Upload, Wrench, X } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { canPreviewInline, getFileIcon } from '../../lib/file-icons';

interface PermitTypeOption {
  id: string;
  name: string;
  code: string;
  category: string;
  issuingAuthority?: string | null;
  hasExpiration: boolean;
  defaultValidityDays?: number | null;
  alertDaysBefore: number;
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  blocksOperation: boolean;
  isActive: boolean;
}

interface AssetOption {
  id: string;
  code: string;
  name: string;
}

interface LocationOption {
  id: string;
  code?: string | null;
  name: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx'];

const CATEGORY_LABELS: Record<string, string> = {
  MUNICIPAL: 'Municipal',
  SANITARY: 'Sanitario',
  ENVIRONMENTAL: 'Ambiental',
  FIRE_DEPT: 'Bomberos',
  LABOR: 'Laboral',
  ELECTRICAL: 'Eléctrico',
  OTHER: 'Otro',
};

const CRITICALITY_LABELS: Record<PermitTypeOption['criticality'], string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

interface Props {
  /* Pre-selected target — when supplied the selectors lock. Used from
     the asset detail page so users can't accidentally re-target. */
  defaultAssetId?: string;
  defaultLocationId?: string;
  onUploaded: () => void;
  onClose: () => void;
}

/* OPS-024 — multipart upload modal that creates a Permit row tied to
   either an asset or a location. The modal pre-fills issuing authority
   and auto-calculates expirationDate from the type's
   defaultValidityDays, mirroring the document upload UX. */
export function PermitUploadModal({
  defaultAssetId,
  defaultLocationId,
  onUploaded,
  onClose,
}: Props) {
  const [permitTypes, setPermitTypes] = useState<PermitTypeOption[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [catalogsLoaded, setCatalogsLoaded] = useState(false);

  const [permitTypeId, setPermitTypeId] = useState('');
  const [targetType, setTargetType] = useState<'asset' | 'location'>(
    defaultAssetId ? 'asset' : defaultLocationId ? 'location' : 'asset',
  );
  const [assetId, setAssetId] = useState(defaultAssetId ?? '');
  const [locationId, setLocationId] = useState(defaultLocationId ?? '');

  const [permitNumber, setPermitNumber] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [scope, setScope] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [expirationManuallyEdited, setExpirationManuallyEdited] = useState(false);
  const [notes, setNotes] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<false | 'draft' | 'review'>(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* Catalogs are fetched once on mount. Failures are non-fatal — the
     selectors render empty and the user retries. */
  useEffect(() => {
    let alive = true;
    Promise.all([
      apiClient.get<PermitTypeOption[]>('/api/operations/permit-types'),
      apiClient.get<{ data: AssetOption[] }>('/api/operations/assets?limit=100'),
      apiClient.get<LocationOption[]>('/api/operations/locations'),
    ])
      .then(([t, a, l]) => {
        if (!alive) return;
        setPermitTypes(t.filter((x) => x.isActive));
        setAssets(a.data);
        setLocations(l);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setCatalogsLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const selectedType = useMemo(
    () => permitTypes.find((p) => p.id === permitTypeId),
    [permitTypes, permitTypeId],
  );

  /* When type changes: pre-fill issuingAuthority + recalculate
     expirationDate. We don't overwrite a user's manual edits. */
  useEffect(() => {
    if (!selectedType) return;
    if (!issuingAuthority || issuingAuthority.trim() === '') {
      setIssuingAuthority(selectedType.issuingAuthority ?? '');
    }
  }, [selectedType?.id]);

  useEffect(() => {
    if (expirationManuallyEdited) return;
    if (!selectedType?.hasExpiration) {
      setExpirationDate('');
      return;
    }
    if (issueDate && selectedType.defaultValidityDays) {
      const d = new Date(issueDate);
      if (Number.isNaN(d.getTime())) return;
      d.setDate(d.getDate() + selectedType.defaultValidityDays);
      setExpirationDate(d.toISOString().slice(0, 10));
    }
  }, [issueDate, selectedType, expirationManuallyEdited]);

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
    if (!permitTypeId) return setError('Selecciona el tipo de permiso.');
    if (targetType === 'asset' && !assetId) return setError('Selecciona el activo.');
    if (targetType === 'location' && !locationId) return setError('Selecciona la ubicación.');
    if (!permitNumber.trim()) return setError('Ingresa el número de permiso.');
    if (!file) return setError('Adjunta el archivo del permiso.');

    setSubmitting(target);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('permitTypeId', permitTypeId);
      if (targetType === 'asset') fd.append('assetId', assetId);
      else fd.append('locationId', locationId);
      fd.append('permitNumber', permitNumber.trim());
      if (issuingAuthority.trim()) fd.append('issuingAuthority', issuingAuthority.trim());
      if (scope.trim()) fd.append('scope', scope.trim());
      if (issueDate) fd.append('issueDate', issueDate);
      if (expirationDate) fd.append('expirationDate', expirationDate);
      if (notes.trim()) fd.append('notes', notes.trim());
      fd.append('setStatus', target === 'review' ? 'PENDING_REVIEW' : 'DRAFT');
      await apiClient.uploadFile('/api/operations/permits', fd);
      onUploaded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el permiso.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-card)] z-10">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Cargar permiso</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Section 1 — Permit type */}
          <Section title="Tipo de permiso">
            <Field label="Tipo" required>
              <select
                value={permitTypeId}
                onChange={(e) => setPermitTypeId(e.target.value)}
                className="cp-input"
              >
                <option value="">{catalogsLoaded ? 'Selecciona un tipo...' : 'Cargando...'}</option>
                {permitTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} · {t.name}
                  </option>
                ))}
              </select>
            </Field>
            {selectedType && (
              <div
                className="rounded-lg p-3 space-y-1.5"
                style={{
                  background: 'rgba(37, 99, 235, 0.06)',
                  border: '1px solid rgba(37, 99, 235, 0.18)',
                }}
              >
                <p className="text-xs text-[var(--text-secondary)]">
                  Categoría:{' '}
                  <strong className="text-[var(--text-primary)]">
                    {CATEGORY_LABELS[selectedType.category] ?? selectedType.category}
                  </strong>
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Vigencia por defecto:{' '}
                  <strong className="text-[var(--text-primary)]">
                    {selectedType.hasExpiration && selectedType.defaultValidityDays
                      ? `${selectedType.defaultValidityDays} días`
                      : 'Sin vencimiento'}
                  </strong>
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Criticidad:{' '}
                  <strong className="text-[var(--text-primary)]">
                    {CRITICALITY_LABELS[selectedType.criticality]}
                  </strong>
                </p>
              </div>
            )}
          </Section>

          {/* Section 2 — Permit info */}
          <Section title="Información del permiso">
            <Field label="N° de permiso" required>
              <input
                type="text"
                value={permitNumber}
                onChange={(e) => setPermitNumber(e.target.value)}
                className="cp-input"
                maxLength={120}
                placeholder="Ej. 12345-2026"
              />
            </Field>
            <Field label="Autoridad emisora">
              <input
                type="text"
                value={issuingAuthority}
                onChange={(e) => setIssuingAuthority(e.target.value)}
                className="cp-input"
                maxLength={120}
                placeholder="Ej. Municipalidad de Antofagasta"
              />
            </Field>
            <Field label="Alcance (opcional)" hint="Ej. Comuna de Antofagasta, manejo de químicos">
              <input
                type="text"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="cp-input"
                maxLength={500}
              />
            </Field>
          </Section>

          {/* Section 3 — Target */}
          <Section title="Asociación">
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => setTargetType('asset')}
                disabled={!!defaultAssetId}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition disabled:cursor-not-allowed"
                style={{
                  background: targetType === 'asset' ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
                  color: targetType === 'asset' ? '#1d4ed8' : 'var(--text-secondary)',
                  border:
                    targetType === 'asset' ? '1px solid #2563eb' : '1px solid var(--border-color)',
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                }}
              >
                <Wrench size={13} /> Activo
              </button>
              <button
                type="button"
                onClick={() => setTargetType('location')}
                disabled={!!defaultLocationId}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition disabled:cursor-not-allowed"
                style={{
                  background: targetType === 'location' ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
                  color: targetType === 'location' ? '#1d4ed8' : 'var(--text-secondary)',
                  border:
                    targetType === 'location'
                      ? '1px solid #2563eb'
                      : '1px solid var(--border-color)',
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                }}
              >
                <MapPin size={13} /> Ubicación
              </button>
            </div>
            {targetType === 'asset' ? (
              <Field label="Activo" required>
                <select
                  value={assetId}
                  onChange={(e) => setAssetId(e.target.value)}
                  className="cp-input"
                  disabled={!!defaultAssetId}
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
            ) : (
              <Field label="Ubicación" required>
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="cp-input"
                  disabled={!!defaultLocationId}
                >
                  <option value="">
                    {catalogsLoaded ? 'Selecciona una ubicación...' : 'Cargando...'}
                  </option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code ? `${l.code} · ` : ''}
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </Section>

          {/* Section 4 — File */}
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
                    getFileIcon(file.type, { size: 32 })
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
                      style={{
                        fontFamily: 'var(--font-jetbrains-mono), monospace',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                      }}
                    >
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFile(null);
                    }}
                    className="ml-3 p-1 rounded hover:bg-gray-100 text-[var(--text-secondary)]"
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
                    }}
                  >
                    Arrastra el archivo o haz clic para seleccionar
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    PDF, JPG, PNG, WEBP, DOC, DOCX, XLS, XLSX · máx 10 MB
                  </p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = '';
                }}
                style={{ display: 'none' }}
              />
            </div>
          </Section>

          {/* Section 5 — Validity */}
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
                  selectedType?.hasExpiration &&
                  issueDate &&
                  selectedType.defaultValidityDays &&
                  !expirationManuallyEdited
                    ? `Calculada automáticamente (+${selectedType.defaultValidityDays} días).`
                    : !selectedType?.hasExpiration && selectedType
                      ? 'Este tipo de permiso no tiene vencimiento.'
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
                  disabled={selectedType ? !selectedType.hasExpiration : false}
                  className="cp-input"
                />
              </Field>
            </Grid>
          </Section>

          {/* Section 6 — Notes */}
          <Section title="Notas (opcional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Comentarios, observaciones..."
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
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
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

export default PermitUploadModal;
