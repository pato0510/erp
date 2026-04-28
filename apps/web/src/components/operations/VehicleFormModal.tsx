'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, Upload, X } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { ASSET_STATUS_LABELS, type AssetStatus } from './AssetStatusBadge';
import type { AssetForFormParent, AssetTypeOption, LocationOption } from './AssetFormModal';

export type FuelType = 'GASOLINE' | 'DIESEL' | 'ELECTRIC' | 'HYBRID' | 'LPG' | 'OTHER';

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  GASOLINE: 'Bencina',
  DIESEL: 'Diésel',
  ELECTRIC: 'Eléctrico',
  HYBRID: 'Híbrido',
  LPG: 'Gas (GLP)',
  OTHER: 'Otro',
};

export interface VehicleForForm {
  id: string;
  assetId: string;
  licensePlate: string;
  vin?: string | null;
  year?: number | null;
  currentKilometers: number;
  fuelType: FuelType;
  registrationDate?: string | null;
  color?: string | null;
  asset: {
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
    tags?: string[] | null;
    assignedToUserId?: string | null;
  };
  hasPhoto?: boolean;
}

export interface VehicleFormSubmit {
  /* Asset fields */
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
  tags: string[];
  assignedToUserId?: string;
  /* Vehicle fields */
  licensePlate: string;
  vin?: string;
  year?: number;
  currentKilometers?: number;
  fuelType: FuelType;
  registrationDate?: string;
  color?: string;
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

const MAX_YEAR = new Date().getUTCFullYear() + 1;

interface Props {
  mode: 'create' | 'edit';
  vehicle: VehicleForForm | null;
  /* Already pre-filtered to category=VEHICLE by the caller. */
  vehicleAssetTypes: AssetTypeOption[];
  locations: LocationOption[];
  parentCandidates: AssetForFormParent[];
  onClose: () => void;
  onSave: (dto: VehicleFormSubmit) => Promise<void> | void;
}

export function VehicleFormModal({
  mode,
  vehicle,
  vehicleAssetTypes,
  locations,
  parentCandidates,
  onClose,
  onSave,
}: Props) {
  /* Vehicle-specific state */
  const [licensePlate, setLicensePlate] = useState(vehicle?.licensePlate ?? '');
  const [vin, setVin] = useState(vehicle?.vin ?? '');
  const [year, setYear] = useState<string>(vehicle?.year != null ? String(vehicle.year) : '');
  const [color, setColor] = useState(vehicle?.color ?? '');
  const [fuelType, setFuelType] = useState<FuelType>(vehicle?.fuelType ?? 'DIESEL');
  const [currentKilometers, setCurrentKilometers] = useState<string>(
    vehicle?.currentKilometers != null ? String(vehicle.currentKilometers) : '',
  );
  const [registrationDate, setRegistrationDate] = useState<string>(
    vehicle?.registrationDate ? vehicle.registrationDate.slice(0, 10) : '',
  );

  /* Asset state */
  const [code, setCode] = useState(vehicle?.asset.code ?? '');
  const [name, setName] = useState(vehicle?.asset.name ?? '');
  const [description, setDescription] = useState(vehicle?.asset.description ?? '');
  const [assetTypeId, setAssetTypeId] = useState(vehicle?.asset.assetTypeId ?? '');
  const [assetSubtypeId, setAssetSubtypeId] = useState(vehicle?.asset.assetSubtypeId ?? '');
  const [locationId, setLocationId] = useState(vehicle?.asset.locationId ?? '');
  const [parentAssetId, setParentAssetId] = useState(vehicle?.asset.parentAssetId ?? '');
  const [assignedToUserId, setAssignedToUserId] = useState(vehicle?.asset.assignedToUserId ?? '');
  const [serialNumber, setSerialNumber] = useState(vehicle?.asset.serialNumber ?? '');
  const [manufacturer, setManufacturer] = useState(vehicle?.asset.manufacturer ?? '');
  const [model, setModel] = useState(vehicle?.asset.model ?? '');
  const [acquisitionDate, setAcquisitionDate] = useState<string>(
    vehicle?.asset.acquisitionDate ? vehicle.asset.acquisitionDate.slice(0, 10) : '',
  );
  const [acquisitionCost, setAcquisitionCost] = useState<string>(
    vehicle?.asset.acquisitionCost != null ? String(vehicle.asset.acquisitionCost) : '',
  );
  const [status, setStatus] = useState<AssetStatus>(vehicle?.asset.status ?? 'OPERATIONAL');
  const [statusReason, setStatusReason] = useState(vehicle?.asset.statusReason ?? '');
  const [tags, setTags] = useState<string[]>(vehicle?.asset.tags ?? []);
  const [tagInput, setTagInput] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Photo (edit only — needs the assetId). */
  const photoCacheKeyRef = useRef(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadPhoto = useCallback(async () => {
    if (mode !== 'edit' || !vehicle?.assetId || !vehicle.hasPhoto) {
      setPhotoUrl(null);
      return;
    }
    try {
      setPhotoLoading(true);
      const blob = await apiClient.fetchBlob(
        `/api/operations/assets/${vehicle.assetId}/photo?cb=${photoCacheKeyRef.current}`,
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
  }, [mode, vehicle?.assetId, vehicle?.hasPhoto]);

  useEffect(() => {
    loadPhoto();
    return () => {
      setPhotoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [loadPhoto]);

  const selectedType = vehicleAssetTypes.find((t) => t.id === assetTypeId);
  const subtypes = selectedType?.subtypes ?? [];

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
    if (!licensePlate.trim()) return setError('La patente es obligatoria.');
    if (!code.trim()) return setError('El código es obligatorio.');
    if (!name.trim()) return setError('El nombre es obligatorio.');
    if (!assetTypeId) return setError('Selecciona un tipo de vehículo.');

    /* Year validation runs client-side as a friendly first pass; the API also
       enforces it. */
    let yearNum: number | undefined;
    if (year.trim()) {
      yearNum = Number(year);
      if (!Number.isFinite(yearNum) || !Number.isInteger(yearNum)) {
        return setError('El año debe ser un número entero.');
      }
      if (yearNum < 1900 || yearNum > MAX_YEAR) {
        return setError(`El año debe estar entre 1900 y ${MAX_YEAR}.`);
      }
    }

    let kmNum: number | undefined;
    if (currentKilometers.trim()) {
      kmNum = Number(currentKilometers.replace(/\./g, '').replace(/,/g, ''));
      if (!Number.isFinite(kmNum) || kmNum < 0 || !Number.isInteger(kmNum)) {
        return setError('El kilometraje debe ser un número entero ≥ 0.');
      }
    }

    if (vin.trim() && vin.trim().length > 17) {
      return setError('El VIN no puede tener más de 17 caracteres.');
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
        /* Asset fields */
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
        tags,
        assignedToUserId: assignedToUserId.trim() || undefined,
        /* Vehicle fields */
        licensePlate: licensePlate.trim().toUpperCase(),
        vin: vin.trim() ? vin.trim().toUpperCase() : undefined,
        year: yearNum,
        currentKilometers: kmNum,
        fuelType,
        registrationDate: registrationDate || undefined,
        color: color.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhotoFile = async (file: File) => {
    if (!vehicle?.assetId) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('La imagen excede el límite de 2 MB.');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    try {
      await apiClient.uploadFile(`/api/operations/assets/${vehicle.assetId}/photo`, fd);
      photoCacheKeyRef.current += 1;
      vehicle.hasPhoto = true;
      loadPhoto();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la imagen.');
    }
  };

  const handlePhotoDelete = async () => {
    if (!vehicle?.assetId) return;
    try {
      await apiClient.delete(`/api/operations/assets/${vehicle.assetId}/photo`);
      vehicle.hasPhoto = false;
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
            {mode === 'create' ? 'Nuevo vehículo' : 'Editar vehículo'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Section 1 — Vehicle info (FIRST per spec) */}
          <Section title="Información del vehículo">
            <Grid cols={2}>
              <Field label="Patente" required>
                <input
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
                  placeholder="AA-BB-12"
                  className="cp-input"
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}
                />
              </Field>
              <Field label="VIN / N° de chasis" hint="17 caracteres máximo">
                <input
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  placeholder="JTDBT123456789012"
                  maxLength={17}
                  className="cp-input"
                  style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                />
              </Field>
            </Grid>
            <Grid cols={2}>
              <Field label="Año">
                <input
                  type="number"
                  min={1900}
                  max={MAX_YEAR}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2022"
                  className="cp-input"
                />
              </Field>
              <Field label="Color">
                <input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="Blanco perla"
                  className="cp-input"
                />
              </Field>
            </Grid>
            <Grid cols={2}>
              <Field label="Tipo de combustible" required>
                <select
                  value={fuelType}
                  onChange={(e) => setFuelType(e.target.value as FuelType)}
                  className="cp-input"
                >
                  {(Object.keys(FUEL_TYPE_LABELS) as FuelType[]).map((f) => (
                    <option key={f} value={f}>
                      {FUEL_TYPE_LABELS[f]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Kilometraje actual">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={currentKilometers}
                  onChange={(e) => setCurrentKilometers(e.target.value)}
                  placeholder="45000"
                  className="cp-input"
                />
              </Field>
            </Grid>
            <Field label="Fecha primera inscripción">
              <input
                type="date"
                value={registrationDate}
                onChange={(e) => setRegistrationDate(e.target.value)}
                className="cp-input"
              />
            </Field>
          </Section>

          {/* Section 2 — Basic asset info */}
          <Section title="Información básica">
            <Grid cols={2}>
              <Field label="Código" required>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="VEH-001"
                  className="cp-input"
                  style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                />
              </Field>
              <Field label="Nombre" required hint="Ejemplo: Camioneta Marketing, Camión Mina #3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Camioneta Marketing"
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
                  <option value="">Selecciona un tipo de vehículo...</option>
                  {vehicleAssetTypes.map((t) => (
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

          {/* Section 3 — Identification */}
          <Section title="Identificación adicional">
            <Grid cols={2}>
              <Field label="N° de serie">
                <input
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  className="cp-input"
                />
              </Field>
              <Field label="Fabricante" hint="Ejemplo: Toyota, Ford, Hyundai">
                <input
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  placeholder="Toyota"
                  className="cp-input"
                />
              </Field>
              <Field label="Modelo" hint="Ejemplo: Hilux, Ranger, H100">
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Hilux"
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
                  placeholder="15000000"
                  className="cp-input"
                />
              </Field>
            </Grid>
          </Section>

          {/* Section 4 — Location & hierarchy */}
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
                    .filter((p) => p.id !== vehicle?.assetId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                </select>
              </Field>
            </Grid>
          </Section>

          {/* Section 5 — Status */}
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
                placeholder="Opcional — explica por qué el vehículo está en este estado"
              />
            </Field>
          </Section>

          {/* Section 6 — Tags */}
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
          {mode === 'edit' && vehicle && (
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
                      alt={vehicle.licensePlate}
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
            {submitting ? 'Guardando...' : 'Guardar vehículo'}
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

export default VehicleFormModal;
