'use client';

import { useState } from 'react';
import { ConfigField, ConfigGrid, ConfigModalShell } from './ConfigModalShell';

export interface LocationForForm {
  id: string;
  name: string;
  code?: string | null;
  parentLocationId?: string | null;
  address?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  isActive: boolean;
}

export interface LocationOption {
  id: string;
  name: string;
}

export interface LocationSubmit {
  name: string;
  code?: string;
  parentLocationId?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  isActive: boolean;
}

interface Props {
  mode: 'create' | 'edit';
  location: LocationForForm | null;
  parentCandidates: LocationOption[];
  onClose: () => void;
  onSave: (dto: LocationSubmit) => Promise<void> | void;
}

export function LocationFormModal({ mode, location, parentCandidates, onClose, onSave }: Props) {
  const [name, setName] = useState(location?.name ?? '');
  const [code, setCode] = useState(location?.code ?? '');
  const [parentLocationId, setParentLocationId] = useState(location?.parentLocationId ?? '');
  const [address, setAddress] = useState(location?.address ?? '');
  const [latitude, setLatitude] = useState<string>(
    location?.latitude != null ? String(location.latitude) : '',
  );
  const [longitude, setLongitude] = useState<string>(
    location?.longitude != null ? String(location.longitude) : '',
  );
  const [isActive, setIsActive] = useState(location?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('El nombre es obligatorio.');

    const lat = latitude.trim() ? Number(latitude) : undefined;
    const lng = longitude.trim() ? Number(longitude) : undefined;
    if (lat !== undefined && Number.isNaN(lat))
      return setError('La latitud debe ser un número válido.');
    if (lng !== undefined && Number.isNaN(lng))
      return setError('La longitud debe ser un número válido.');

    setSubmitting(true);
    try {
      await onSave({
        name: name.trim(),
        code: code.trim() || undefined,
        parentLocationId: parentLocationId || undefined,
        address: address.trim() || undefined,
        latitude: lat,
        longitude: lng,
        isActive,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ConfigModalShell
      title={mode === 'create' ? 'Nueva ubicación' : 'Editar ubicación'}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={error}
      width="md"
    >
      <ConfigGrid cols={2}>
        <ConfigField label="Nombre" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Faena Norte"
            className="cp-input"
          />
        </ConfigField>
        <ConfigField label="Código" hint="Identificador interno (opcional)">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="FN-01"
            className="cp-input"
            style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
          />
        </ConfigField>
      </ConfigGrid>
      <ConfigField
        label="Ubicación padre"
        hint="Opcional — para crear jerarquías (faena → planta → área)"
      >
        <select
          value={parentLocationId}
          onChange={(e) => setParentLocationId(e.target.value)}
          className="cp-input"
        >
          <option value="">— Sin padre —</option>
          {parentCandidates
            .filter((p) => p.id !== location?.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </ConfigField>
      <ConfigField label="Dirección">
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={2}
          className="cp-input"
        />
      </ConfigField>
      <ConfigGrid cols={2}>
        <ConfigField label="Latitud">
          <input
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            placeholder="-33.4569"
            className="cp-input"
            style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
          />
        </ConfigField>
        <ConfigField label="Longitud">
          <input
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            placeholder="-70.6483"
            className="cp-input"
            style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
          />
        </ConfigField>
      </ConfigGrid>
      {mode === 'edit' && (
        <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-[var(--border-color)] hover:bg-[var(--input-bg)]">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="mt-0.5"
          />
          <div
            className="text-sm text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            Activa
          </div>
        </label>
      )}
    </ConfigModalShell>
  );
}

export default LocationFormModal;
