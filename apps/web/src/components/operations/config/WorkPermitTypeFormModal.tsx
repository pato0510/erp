'use client';

import { useState } from 'react';
import { ConfigField, ConfigGrid, ConfigModalShell } from './ConfigModalShell';

export type WorkPermitCategory =
  | 'HEIGHT_WORK'
  | 'HOT_WORK'
  | 'CONFINED_SPACE'
  | 'LOCKOUT_TAGOUT'
  | 'EXCAVATION'
  | 'LIFTING'
  | 'ELECTRICAL_WORK'
  | 'CHEMICAL_HANDLING'
  | 'OTHER';

export const WORK_PERMIT_CATEGORY_LABELS: Record<WorkPermitCategory, string> = {
  HEIGHT_WORK: 'Trabajo en altura',
  HOT_WORK: 'Trabajo en caliente',
  CONFINED_SPACE: 'Espacio confinado',
  LOCKOUT_TAGOUT: 'Bloqueo y tarjeteo (LOTO)',
  EXCAVATION: 'Excavación',
  LIFTING: 'Izaje de cargas',
  ELECTRICAL_WORK: 'Eléctrico',
  CHEMICAL_HANDLING: 'Manejo de químicos',
  OTHER: 'Otro',
};

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'MANAGER', label: 'Gerente' },
  { value: 'ACCOUNTANT', label: 'Contador' },
  { value: 'ANALYST', label: 'Analista' },
];

export interface WorkPermitTypeForForm {
  id: string;
  name: string;
  code: string;
  category: WorkPermitCategory;
  description?: string | null;
  maxDurationHours: number;
  requiredRoles: string[];
  requiresMedicalAptitude: boolean;
  requiresSpecificTraining: boolean;
  requiresGasMeasurement: boolean;
  requiresIsolation: boolean;
  defaultRisks: string[];
  defaultControls: string[];
  icon?: string | null;
  color?: string | null;
  isActive: boolean;
}

export interface WorkPermitTypeSubmit {
  name: string;
  code: string;
  category: WorkPermitCategory;
  description?: string;
  maxDurationHours: number;
  requiredRoles: string[];
  requiresMedicalAptitude: boolean;
  requiresSpecificTraining: boolean;
  requiresGasMeasurement: boolean;
  requiresIsolation: boolean;
  defaultRisks: string[];
  defaultControls: string[];
  icon?: string;
  color?: string;
  isActive: boolean;
}

interface Props {
  mode: 'create' | 'edit';
  workPermitType: WorkPermitTypeForForm | null;
  onClose: () => void;
  onSave: (dto: WorkPermitTypeSubmit) => Promise<void> | void;
}

const DEFAULT_COLOR = '#475569';

export function WorkPermitTypeFormModal({ mode, workPermitType, onClose, onSave }: Props) {
  const [name, setName] = useState(workPermitType?.name ?? '');
  const [code, setCode] = useState(workPermitType?.code ?? '');
  const [category, setCategory] = useState<WorkPermitCategory>(workPermitType?.category ?? 'OTHER');
  const [description, setDescription] = useState(workPermitType?.description ?? '');
  const [maxDurationHours, setMaxDurationHours] = useState<string>(
    String(workPermitType?.maxDurationHours ?? 8),
  );
  const [requiredRoles, setRequiredRoles] = useState<string[]>(
    workPermitType?.requiredRoles ?? ['MANAGER'],
  );
  const [requiresMedicalAptitude, setRequiresMedicalAptitude] = useState(
    workPermitType?.requiresMedicalAptitude ?? false,
  );
  const [requiresSpecificTraining, setRequiresSpecificTraining] = useState(
    workPermitType?.requiresSpecificTraining ?? false,
  );
  const [requiresGasMeasurement, setRequiresGasMeasurement] = useState(
    workPermitType?.requiresGasMeasurement ?? false,
  );
  const [requiresIsolation, setRequiresIsolation] = useState(
    workPermitType?.requiresIsolation ?? false,
  );
  const [defaultRisks, setDefaultRisks] = useState<string[]>(workPermitType?.defaultRisks ?? []);
  const [defaultControls, setDefaultControls] = useState<string[]>(
    workPermitType?.defaultControls ?? [],
  );
  const [icon, setIcon] = useState(workPermitType?.icon ?? '');
  const [color, setColor] = useState(workPermitType?.color ?? DEFAULT_COLOR);
  const [isActive, setIsActive] = useState(workPermitType?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('El nombre es obligatorio.');
    if (!code.trim()) return setError('El código es obligatorio.');
    if (!/^[A-Z0-9_-]+$/.test(code.trim().toUpperCase())) {
      return setError('El código sólo admite letras mayúsculas, dígitos, guion y guion bajo.');
    }
    const duration = Number(maxDurationHours);
    if (Number.isNaN(duration) || duration < 1 || duration > 72) {
      return setError('La duración máxima debe estar entre 1 y 72 horas.');
    }

    setSubmitting(true);
    try {
      await onSave({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        category,
        description: description.trim() || undefined,
        maxDurationHours: duration,
        requiredRoles,
        requiresMedicalAptitude,
        requiresSpecificTraining,
        requiresGasMeasurement,
        requiresIsolation,
        defaultRisks: defaultRisks.filter((r) => r.trim()),
        defaultControls: defaultControls.filter((c) => c.trim()),
        icon: icon.trim() || undefined,
        color: color || undefined,
        isActive,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleRole = (value: string) => {
    setRequiredRoles((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value],
    );
  };

  return (
    <ConfigModalShell
      title={
        mode === 'create' ? 'Nuevo tipo de permiso de trabajo' : 'Editar tipo de permiso de trabajo'
      }
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={error}
      width="lg"
    >
      <ConfigGrid cols={2}>
        <ConfigField label="Nombre" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Permiso de Trabajo en Altura"
            className="cp-input"
          />
        </ConfigField>
        <ConfigField label="Código" required hint="Mayúsculas, sin espacios">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="PT-ALT"
            className="cp-input"
            style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
          />
        </ConfigField>
      </ConfigGrid>

      <ConfigGrid cols={2}>
        <ConfigField label="Categoría" required>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as WorkPermitCategory)}
            className="cp-input"
          >
            {(Object.keys(WORK_PERMIT_CATEGORY_LABELS) as WorkPermitCategory[]).map((c) => (
              <option key={c} value={c}>
                {WORK_PERMIT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </ConfigField>
        <ConfigField label="Duración máxima (horas)">
          <input
            type="number"
            min={1}
            max={72}
            value={maxDurationHours}
            onChange={(e) => setMaxDurationHours(e.target.value)}
            className="cp-input"
            style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
          />
        </ConfigField>
      </ConfigGrid>

      <ConfigField label="Descripción">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="cp-input"
        />
      </ConfigField>

      <ConfigField label="Roles que pueden autorizar">
        <div className="flex flex-wrap gap-2">
          {ROLE_OPTIONS.map((r) => (
            <label
              key={r.value}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs cursor-pointer"
              style={{
                background: requiredRoles.includes(r.value)
                  ? 'rgba(37, 99, 235, 0.12)'
                  : 'var(--input-bg)',
                color: requiredRoles.includes(r.value) ? '#1d4ed8' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <input
                type="checkbox"
                checked={requiredRoles.includes(r.value)}
                onChange={() => toggleRole(r.value)}
                className="hidden"
              />
              {r.label}
            </label>
          ))}
        </div>
      </ConfigField>

      <div className="grid grid-cols-2 gap-2">
        <CheckboxField
          checked={requiresMedicalAptitude}
          onChange={setRequiresMedicalAptitude}
          label="Requiere aptitud médica"
        />
        <CheckboxField
          checked={requiresSpecificTraining}
          onChange={setRequiresSpecificTraining}
          label="Requiere capacitación específica"
        />
        <CheckboxField
          checked={requiresGasMeasurement}
          onChange={setRequiresGasMeasurement}
          label="Requiere medición de gases"
        />
        <CheckboxField
          checked={requiresIsolation}
          onChange={setRequiresIsolation}
          label="Requiere aislación (LOTO)"
        />
      </div>

      <EditableArrayField
        label="Riesgos por defecto"
        items={defaultRisks}
        onChange={setDefaultRisks}
        placeholder="Describe un riesgo común"
      />
      <EditableArrayField
        label="Medidas de control por defecto"
        items={defaultControls}
        onChange={setDefaultControls}
        placeholder="Describe una medida de control"
      />

      <ConfigGrid cols={2}>
        <ConfigField label="Ícono" hint="Ejemplo: ArrowUp, Flame, Lock">
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="ArrowUp"
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

function CheckboxField({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg border border-[var(--border-color)] hover:bg-[var(--input-bg)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span
        className="text-sm text-[var(--text-primary)]"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
      >
        {label}
      </span>
    </label>
  );
}

function EditableArrayField({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  return (
    <ConfigField label={label}>
      <div className="space-y-1.5">
        {items.map((value, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              value={value}
              onChange={(e) => {
                const next = [...items];
                next[idx] = e.target.value;
                onChange(next);
              }}
              placeholder={placeholder}
              className="cp-input"
            />
            <button
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              className="px-2 py-1 text-xs text-red-600 rounded-md hover:bg-red-50"
            >
              Quitar
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...items, ''])}
          className="text-xs text-blue-600 hover:underline"
        >
          + Agregar
        </button>
      </div>
    </ConfigField>
  );
}

export default WorkPermitTypeFormModal;
