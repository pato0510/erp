'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ConfigField, ConfigGrid, ConfigModalShell } from './ConfigModalShell';
import type { AssetCategory } from './AssetTypeFormModal';

export interface AssetSubtypeForForm {
  id: string;
  assetTypeId: string;
  name: string;
  specifications?: Record<string, unknown> | null;
  isActive: boolean;
}

export interface AssetTypeOption {
  id: string;
  name: string;
  category: AssetCategory;
}

export interface AssetSubtypeSubmit {
  assetTypeId: string;
  name: string;
  specifications: Record<string, string>;
  isActive: boolean;
}

interface Props {
  mode: 'create' | 'edit';
  subtype: AssetSubtypeForForm | null;
  assetTypes: AssetTypeOption[];
  defaultAssetTypeId?: string;
  onClose: () => void;
  onSave: (dto: AssetSubtypeSubmit) => Promise<void> | void;
}

export function AssetSubtypeFormModal({
  mode,
  subtype,
  assetTypes,
  defaultAssetTypeId,
  onClose,
  onSave,
}: Props) {
  const [assetTypeId, setAssetTypeId] = useState(
    subtype?.assetTypeId ?? defaultAssetTypeId ?? assetTypes[0]?.id ?? '',
  );
  const [name, setName] = useState(subtype?.name ?? '');
  const [isActive, setIsActive] = useState(subtype?.isActive ?? true);
  const [specs, setSpecs] = useState<Array<{ key: string; value: string }>>(() => {
    const existing = subtype?.specifications;
    if (existing && typeof existing === 'object') {
      const entries = Object.entries(existing).map(([k, v]) => ({
        key: k,
        value: typeof v === 'string' ? v : JSON.stringify(v),
      }));
      return entries.length > 0 ? entries : [{ key: '', value: '' }];
    }
    return [{ key: '', value: '' }];
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSpecChange = (idx: number, field: 'key' | 'value', val: string) =>
    setSpecs((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: val } : row)));
  const addSpecRow = () => setSpecs((prev) => [...prev, { key: '', value: '' }]);
  const removeSpecRow = (idx: number) => setSpecs((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    setError(null);
    if (!assetTypeId) return setError('Selecciona un tipo de activo.');
    if (!name.trim()) return setError('El nombre es obligatorio.');

    const specifications: Record<string, string> = {};
    for (const { key, value } of specs) {
      const k = key.trim();
      if (!k) continue;
      specifications[k] = value.trim();
    }

    setSubmitting(true);
    try {
      await onSave({
        assetTypeId,
        name: name.trim(),
        specifications,
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
      title={mode === 'create' ? 'Nuevo subtipo' : 'Editar subtipo'}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={error}
      width="md"
    >
      <ConfigGrid cols={2}>
        <ConfigField label="Tipo de activo" required>
          <select
            value={assetTypeId}
            onChange={(e) => setAssetTypeId(e.target.value)}
            className="cp-input"
          >
            <option value="">Selecciona un tipo...</option>
            {assetTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </ConfigField>
        <ConfigField label="Nombre" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Generador 100kVA"
            className="cp-input"
          />
        </ConfigField>
      </ConfigGrid>

      <div>
        <label
          className="block mb-1.5 text-[var(--text-secondary)]"
          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500, fontSize: 13 }}
        >
          Especificaciones
        </label>
        <div className="space-y-2">
          {specs.map((row, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <input
                value={row.key}
                onChange={(e) => handleSpecChange(idx, 'key', e.target.value)}
                placeholder="Potencia (kW)"
                className="cp-input flex-1"
              />
              <input
                value={row.value}
                onChange={(e) => handleSpecChange(idx, 'value', e.target.value)}
                placeholder="100"
                className="cp-input flex-1"
              />
              <button
                type="button"
                onClick={() => removeSpecRow(idx)}
                className="p-2 rounded hover:bg-gray-100 text-[var(--text-secondary)] flex-shrink-0"
                aria-label="Quitar"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addSpecRow}
            className="inline-flex items-center gap-1 text-sm text-[var(--color-accent)] hover:underline"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            <Plus size={13} /> Agregar especificación
          </button>
        </div>
      </div>

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
            Activo
          </div>
        </label>
      )}
    </ConfigModalShell>
  );
}

export default AssetSubtypeFormModal;
