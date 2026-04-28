'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { ConfigField, ConfigGrid, ConfigModalShell } from './ConfigModalShell';

export type AssetCategory = 'EQUIPMENT' | 'VEHICLE' | 'TOOL' | 'INFRASTRUCTURE';

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  EQUIPMENT: 'Equipo',
  VEHICLE: 'Vehículo',
  TOOL: 'Herramienta',
  INFRASTRUCTURE: 'Infraestructura',
};

export interface AssetTypeForForm {
  id: string;
  name: string;
  category: AssetCategory;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  isActive: boolean;
}

export interface AssetTypeSubmit {
  name: string;
  category: AssetCategory;
  description?: string;
  icon?: string;
  color?: string;
  isActive: boolean;
  /* Only honored when category=VEHICLE on create. The backend defaults to true
     so we only send the field when the user explicitly toggled it off, keeping
     the payload identical for non-vehicle categories. */
  applyVehiclePack?: boolean;
}

interface Props {
  mode: 'create' | 'edit';
  assetType: AssetTypeForForm | null;
  onClose: () => void;
  onSave: (dto: AssetTypeSubmit) => Promise<void> | void;
}

const DEFAULT_COLOR = '#2563EB';

export function AssetTypeFormModal({ mode, assetType, onClose, onSave }: Props) {
  const [name, setName] = useState(assetType?.name ?? '');
  const [category, setCategory] = useState<AssetCategory>(assetType?.category ?? 'EQUIPMENT');
  const [description, setDescription] = useState(assetType?.description ?? '');
  const [icon, setIcon] = useState(assetType?.icon ?? '');
  const [color, setColor] = useState(assetType?.color ?? DEFAULT_COLOR);
  const [isActive, setIsActive] = useState(assetType?.isActive ?? true);
  /* Only meaningful in create mode for VEHICLE category. The user can opt-out
     of the pack here; existing types reach the apply action via the row button
     in the configuration screen. */
  const [applyVehiclePack, setApplyVehiclePack] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('El nombre es obligatorio.');
    setSubmitting(true);
    try {
      await onSave({
        name: name.trim(),
        category,
        description: description.trim() || undefined,
        icon: icon.trim() || undefined,
        color: color || undefined,
        isActive,
        ...(mode === 'create' && category === 'VEHICLE' && !applyVehiclePack
          ? { applyVehiclePack: false }
          : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ConfigModalShell
      title={mode === 'create' ? 'Nuevo tipo de activo' : 'Editar tipo de activo'}
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
            placeholder="Generadores eléctricos"
            className="cp-input"
          />
        </ConfigField>
        <ConfigField
          label="Categoría"
          required
          hint={
            category === 'VEHICLE'
              ? 'Los tipos VEHÍCULO pueden ser usados en /operaciones/vehiculos para gestionar tu flota.'
              : undefined
          }
        >
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as AssetCategory)}
            className="cp-input"
          >
            {(Object.keys(ASSET_CATEGORY_LABELS) as AssetCategory[]).map((c) => (
              <option key={c} value={c}>
                {ASSET_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </ConfigField>
      </ConfigGrid>

      {mode === 'create' && category === 'VEHICLE' && (
        <div
          className="rounded-lg p-3 flex items-start gap-2"
          style={{
            background: 'rgba(37, 99, 235, 0.08)',
            border: '1px solid rgba(37, 99, 235, 0.2)',
          }}
        >
          <Info size={16} style={{ color: '#1d4ed8', flexShrink: 0, marginTop: 2 }} />
          <div className="flex-1">
            <p
              className="text-[var(--text-primary)] text-sm mb-2"
              style={{ fontFamily: 'var(--font-outfit), sans-serif', lineHeight: 1.45 }}
            >
              Al guardar, se asociarán automáticamente los 4 documentos obligatorios para vehículos
              en Chile (SOAP, Permiso de Circulación, Revisión Técnica, Padrón). Si los tipos de
              documento aún no existen, se crearán al confirmar.
            </p>
            <label
              className="inline-flex items-start gap-2 cursor-pointer text-sm"
              style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
            >
              <input
                type="checkbox"
                checked={applyVehiclePack}
                onChange={(e) => setApplyVehiclePack(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-[var(--text-primary)]">Aplicar pack documental Chile</span>
            </label>
          </div>
        </div>
      )}
      <ConfigField label="Descripción">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="cp-input"
        />
      </ConfigField>
      <ConfigGrid cols={2}>
        <ConfigField label="Ícono" hint="Ejemplo: Wrench, Truck, Hammer">
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="Wrench"
            className="cp-input"
            style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
          />
        </ConfigField>
        <ConfigField label="Color">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{
                width: 44,
                height: 38,
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                background: 'var(--input-bg)',
                cursor: 'pointer',
                padding: 0,
              }}
            />
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="cp-input"
              style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
            />
          </div>
        </ConfigField>
      </ConfigGrid>
      {mode === 'edit' && (
        <ToggleRow
          label="Activo"
          description="Los tipos inactivos no aparecen en los selectores al crear nuevos activos."
          checked={isActive}
          onChange={setIsActive}
        />
      )}
    </ConfigModalShell>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-[var(--border-color)] hover:bg-[var(--input-bg)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <div className="flex-1">
        <div
          className="text-sm text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
        >
          {label}
        </div>
        {description && (
          <div className="text-xs text-[var(--text-muted)] mt-0.5">{description}</div>
        )}
      </div>
    </label>
  );
}

export default AssetTypeFormModal;
