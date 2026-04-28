'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Upload, X } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { ASSET_STATUS_LABELS, type AssetStatus } from './AssetStatusBadge';

export interface AssetSubtypeOption {
  id: string;
  name: string;
}

export interface AssetTypeOption {
  id: string;
  name: string;
  category: 'EQUIPMENT' | 'VEHICLE' | 'TOOL' | 'INFRASTRUCTURE';
  subtypes?: AssetSubtypeOption[];
}

export interface LocationOption {
  id: string;
  name: string;
  code?: string | null;
}

export interface AssetForFormParent {
  id: string;
  code: string;
  name: string;
}

export interface AssetForForm {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  assetTypeId: string;
  assetSubtypeId?: string | null;
  locationId?: string | null;
  parentAssetId?: string | null;
  serialNumber?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  acquisitionDate?: string | null;
  acquisitionCost?: string | number | null;
  status: AssetStatus;
  statusReason?: string | null;
  dynamicAttributes?: Record<string, unknown> | null;
  tags?: string[] | null;
  assignedToUserId?: string | null;
  hasPhoto?: boolean;
}

export interface AssetFormSubmit {
  code: string;
  name: string;
  description?: string;
  assetTypeId: string;
  assetSubtypeId?: string;
  locationId?: string;
  parentAssetId?: string;
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  acquisitionDate?: string;
  acquisitionCost?: number;
  status: AssetStatus;
  statusReason?: string;
  dynamicAttributes: Record<string, string>;
  tags: string[];
  assignedToUserId?: string;
}

const STATUS_OPTIONS: AssetStatus[] = [
  'OPERATIONAL',
  'WITH_OBSERVATIONS',
  'NON_OPERATIONAL',
  'IN_MAINTENANCE',
  'BLOCKED_DOCUMENTAL',
  'BLOCKED_PERMIT',
  'OUT_OF_SERVICE',
  'DECOMMISSIONED',
];

interface Props {
  mode: 'create' | 'edit';
  asset: AssetForForm | null;
  assetTypes: AssetTypeOption[];
  locations: LocationOption[];
  parentCandidates: AssetForFormParent[];
  onClose: () => void;
  onSave: (dto: AssetFormSubmit) => Promise<void> | void;
}

export function AssetFormModal({
  mode,
  asset,
  assetTypes,
  locations,
  parentCandidates,
  onClose,
  onSave,
}: Props) {
  const [code, setCode] = useState(asset?.code ?? '');
  const [name, setName] = useState(asset?.name ?? '');
  const [description, setDescription] = useState(asset?.description ?? '');
  const [assetTypeId, setAssetTypeId] = useState(asset?.assetTypeId ?? '');
  const [assetSubtypeId, setAssetSubtypeId] = useState(asset?.assetSubtypeId ?? '');
  const [locationId, setLocationId] = useState(asset?.locationId ?? '');
  const [parentAssetId, setParentAssetId] = useState(asset?.parentAssetId ?? '');
  const [assignedToUserId, setAssignedToUserId] = useState(asset?.assignedToUserId ?? '');
  const [serialNumber, setSerialNumber] = useState(asset?.serialNumber ?? '');
  const [manufacturer, setManufacturer] = useState(asset?.manufacturer ?? '');
  const [model, setModel] = useState(asset?.model ?? '');
  const [acquisitionDate, setAcquisitionDate] = useState<string>(
    asset?.acquisitionDate ? asset.acquisitionDate.slice(0, 10) : '',
  );
  const [acquisitionCost, setAcquisitionCost] = useState<string>(
    asset?.acquisitionCost != null ? String(asset.acquisitionCost) : '',
  );
  const [status, setStatus] = useState<AssetStatus>(asset?.status ?? 'OPERATIONAL');
  const [statusReason, setStatusReason] = useState(asset?.statusReason ?? '');
  const [dynamicAttrs, setDynamicAttrs] = useState<Array<{ key: string; value: string }>>(() => {
    const existing = asset?.dynamicAttributes;
    if (existing && typeof existing === 'object') {
      const entries = Object.entries(existing).map(([k, v]) => ({
        key: k,
        value: typeof v === 'string' ? v : JSON.stringify(v),
      }));
      return entries.length > 0 ? entries : [{ key: '', value: '' }];
    }
    return [{ key: '', value: '' }];
  });
  const [tags, setTags] = useState<string[]>(asset?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Photo state — only meaningful in edit mode (we need an assetId). */
  const photoCacheKeyRef = useRef(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadPhoto = useCallback(async () => {
    if (mode !== 'edit' || !asset?.id || !asset.hasPhoto) {
      setPhotoUrl(null);
      return;
    }
    try {
      setPhotoLoading(true);
      const blob = await apiClient.fetchBlob(
        `/api/operations/assets/${asset.id}/photo?cb=${photoCacheKeyRef.current}`,
      );
      const url = URL.createObjectURL(blob);
      setPhotoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      setPhotoUrl(null);
    } finally {
      setPhotoLoading(false);
    }
  }, [mode, asset?.id, asset?.hasPhoto]);

  useEffect(() => {
    loadPhoto();
    return () => {
      setPhotoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [loadPhoto]);

  const selectedType = assetTypes.find((t) => t.id === assetTypeId);
  const subtypes = selectedType?.subtypes ?? [];

  const handleAttrChange = (idx: number, field: 'key' | 'value', val: string) => {
    setDynamicAttrs((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: val } : row)));
  };
  const addAttrRow = () => setDynamicAttrs((prev) => [...prev, { key: '', value: '' }]);
  const removeAttrRow = (idx: number) =>
    setDynamicAttrs((prev) => prev.filter((_, i) => i !== idx));

  const commitTagInput = () => {
    const next = tagInput.trim().replace(/,$/, '').trim();
    if (!next) return;
    if (tags.includes(next)) {
      setTagInput('');
      return;
    }
    setTags([...tags, next]);
    setTagInput('');
  };
  const handleTagKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitTagInput();
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  };

  const submit = async () => {
    setError(null);
    if (!code.trim()) return setError('El código es obligatorio.');
    if (!name.trim()) return setError('El nombre es obligatorio.');
    if (!assetTypeId) return setError('Selecciona un tipo de activo.');

    const dynamicAttributes: Record<string, string> = {};
    for (const { key, value } of dynamicAttrs) {
      const k = key.trim();
      if (!k) continue;
      dynamicAttributes[k] = value.trim();
    }

    const cleanAcqCost = acquisitionCost.trim()
      ? Number(acquisitionCost.replace(/[^\d.-]/g, ''))
      : undefined;
    if (cleanAcqCost !== undefined && Number.isNaN(cleanAcqCost)) {
      return setError('El costo de adquisición debe ser un número.');
    }

    setSubmitting(true);
    try {
      await onSave({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || undefined,
        assetTypeId,
        assetSubtypeId: assetSubtypeId || undefined,
        locationId: locationId || undefined,
        parentAssetId: parentAssetId || undefined,
        serialNumber: serialNumber.trim() || undefined,
        manufacturer: manufacturer.trim() || undefined,
        model: model.trim() || undefined,
        acquisitionDate: acquisitionDate || undefined,
        acquisitionCost: cleanAcqCost,
        status,
        statusReason: statusReason.trim() || undefined,
        dynamicAttributes,
        tags,
        assignedToUserId: assignedToUserId.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhotoFile = async (file: File) => {
    if (!asset?.id) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('La imagen excede el límite de 2 MB.');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    try {
      await apiClient.uploadFile(`/api/operations/assets/${asset.id}/photo`, fd);
      photoCacheKeyRef.current += 1;
      asset.hasPhoto = true;
      loadPhoto();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la imagen.');
    }
  };

  const handlePhotoDelete = async () => {
    if (!asset?.id) return;
    try {
      await apiClient.delete(`/api/operations/assets/${asset.id}/photo`);
      asset.hasPhoto = false;
      setPhotoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la imagen.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-card)] z-10">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {mode === 'create' ? 'Nuevo equipo' : 'Editar equipo'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Section 1: Basic info */}
          <Section title="Información básica">
            <Grid cols={2}>
              <Field label="Código" required>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="EQ-001"
                  className="cp-input"
                  style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                />
              </Field>
              <Field label="Nombre" required>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Generador 100kVA"
                  className="cp-input"
                />
              </Field>
            </Grid>
            <Field label="Descripción">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="cp-input"
              />
            </Field>
            <Grid cols={2}>
              <Field label="Tipo de activo" required>
                <select
                  value={assetTypeId}
                  onChange={(e) => {
                    setAssetTypeId(e.target.value);
                    setAssetSubtypeId('');
                  }}
                  className="cp-input"
                >
                  <option value="">Selecciona un tipo...</option>
                  {assetTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Subtipo">
                <select
                  value={assetSubtypeId}
                  onChange={(e) => setAssetSubtypeId(e.target.value)}
                  className="cp-input"
                  disabled={!selectedType || subtypes.length === 0}
                >
                  <option value="">
                    {subtypes.length === 0 ? '— Sin subtipos —' : 'Sin subtipo'}
                  </option>
                  {subtypes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </Grid>
            <Field label="Asignado a (User ID)">
              <input
                value={assignedToUserId}
                onChange={(e) => setAssignedToUserId(e.target.value)}
                placeholder="UUID del responsable (opcional)"
                className="cp-input"
                style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12 }}
              />
            </Field>
          </Section>

          {/* Section 2: Identification */}
          <Section title="Identificación">
            <Grid cols={2}>
              <Field label="N° de serie">
                <input
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  className="cp-input"
                />
              </Field>
              <Field label="Fabricante">
                <input
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  className="cp-input"
                />
              </Field>
              <Field label="Modelo">
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="cp-input"
                />
              </Field>
              <Field label="Fecha de adquisición">
                <input
                  type="date"
                  value={acquisitionDate}
                  onChange={(e) => setAcquisitionDate(e.target.value)}
                  className="cp-input"
                />
              </Field>
              <Field label="Costo de adquisición (CLP)">
                <input
                  value={acquisitionCost}
                  onChange={(e) => setAcquisitionCost(e.target.value)}
                  placeholder="1500000"
                  className="cp-input"
                />
              </Field>
            </Grid>
          </Section>

          {/* Section 3: Location & hierarchy */}
          <Section title="Ubicación y jerarquía">
            <Grid cols={2}>
              <Field label="Ubicación">
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="cp-input"
                >
                  <option value="">Sin ubicación</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Activo padre">
                <select
                  value={parentAssetId}
                  onChange={(e) => setParentAssetId(e.target.value)}
                  className="cp-input"
                >
                  <option value="">Sin padre</option>
                  {parentCandidates
                    .filter((p) => p.id !== asset?.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                </select>
              </Field>
            </Grid>
          </Section>

          {/* Section 4: Status */}
          <Section title="Estado">
            <Grid cols={2}>
              <Field label="Estado">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as AssetStatus)}
                  className="cp-input"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {ASSET_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </Field>
            </Grid>
            <Field label="Razón del estado">
              <textarea
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                rows={2}
                className="cp-input"
                placeholder="Opcional — explica por qué el activo está en este estado"
              />
            </Field>
          </Section>

          {/* Section 5: Dynamic attributes */}
          <Section title="Atributos dinámicos">
            <div className="space-y-2">
              {dynamicAttrs.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <input
                    value={row.key}
                    onChange={(e) => handleAttrChange(idx, 'key', e.target.value)}
                    placeholder="Potencia (kW)"
                    className="cp-input flex-1"
                  />
                  <input
                    value={row.value}
                    onChange={(e) => handleAttrChange(idx, 'value', e.target.value)}
                    placeholder="100"
                    className="cp-input flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => removeAttrRow(idx)}
                    className="p-2 rounded hover:bg-gray-100 text-[var(--text-secondary)] flex-shrink-0"
                    aria-label="Quitar atributo"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addAttrRow}
                className="inline-flex items-center gap-1 text-sm text-[var(--color-accent)] hover:underline"
                style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
              >
                <Plus size={13} /> Agregar atributo
              </button>
            </div>
          </Section>

          {/* Section 6: Tags */}
          <Section title="Tags">
            <div className="flex flex-wrap gap-2 items-center p-2 border border-[var(--border-color)] rounded-lg bg-[var(--input-bg)]">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs"
                  style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    className="hover:text-blue-900"
                    aria-label={`Quitar ${t}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKey}
                onBlur={commitTagInput}
                placeholder={tags.length === 0 ? 'Agregar tag (Enter o coma)...' : ''}
                className="flex-1 min-w-[160px] outline-none bg-transparent text-sm"
                style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
              />
            </div>
          </Section>

          {/* Photo (edit only) */}
          {mode === 'edit' && asset && (
            <Section title="Foto">
              <div className="flex items-start gap-4">
                <div
                  className="w-[200px] h-[200px] rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'var(--input-bg)',
                    border: '1px dashed var(--border-color)',
                  }}
                >
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={asset.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span className="text-xs text-[var(--text-muted)]">
                      {photoLoading ? 'Cargando...' : 'Sin foto'}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
                  >
                    <Upload size={14} /> Subir foto
                  </button>
                  {photoUrl && (
                    <button
                      type="button"
                      onClick={handlePhotoDelete}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                      style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
                    >
                      <Trash2 size={14} /> Eliminar foto
                    </button>
                  )}
                  <p className="text-xs text-[var(--text-muted)]">JPG, PNG o WEBP · Máx 2 MB</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handlePhotoFile(f);
                      e.target.value = '';
                    }}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>
            </Section>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
              {error}
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
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            {submitting ? 'Guardando...' : 'Guardar equipo'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4
        className="text-[var(--text-secondary)] mb-3"
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
  children,
}: {
  label: string;
  required?: boolean;
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
    </div>
  );
}

export default AssetFormModal;
