'use client';

import { useState } from 'react';
import { ConfigField, ConfigGrid, ConfigModalShell } from './ConfigModalShell';

export type PermitCategory =
  | 'MUNICIPAL'
  | 'SANITARY'
  | 'ENVIRONMENTAL'
  | 'FIRE_DEPT'
  | 'LABOR'
  | 'ELECTRICAL'
  | 'OTHER';

export type PermitCriticality = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const PERMIT_CATEGORY_LABELS: Record<PermitCategory, string> = {
  MUNICIPAL: 'Municipal',
  SANITARY: 'Sanitario',
  ENVIRONMENTAL: 'Ambiental',
  FIRE_DEPT: 'Bomberos',
  LABOR: 'Laboral',
  ELECTRICAL: 'Eléctrico',
  OTHER: 'Otro',
};

export const PERMIT_CRITICALITY_LABELS: Record<PermitCriticality, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

export interface PermitTypeForForm {
  id: string;
  name: string;
  code: string;
  category: PermitCategory;
  issuingAuthority?: string | null;
  criticality: PermitCriticality;
  hasExpiration: boolean;
  defaultValidityDays?: number | null;
  blocksOperation: boolean;
  alertDaysBefore: number;
  criticalAlertDaysBefore: number;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  isActive: boolean;
}

export interface PermitTypeSubmit {
  name: string;
  code: string;
  category: PermitCategory;
  issuingAuthority?: string;
  criticality: PermitCriticality;
  hasExpiration: boolean;
  defaultValidityDays?: number;
  blocksOperation: boolean;
  alertDaysBefore: number;
  criticalAlertDaysBefore: number;
  description?: string;
  icon?: string;
  color?: string;
  isActive: boolean;
}

interface Props {
  mode: 'create' | 'edit';
  permitType: PermitTypeForForm | null;
  onClose: () => void;
  onSave: (dto: PermitTypeSubmit) => Promise<void> | void;
}

const DEFAULT_COLOR = '#475569';

export function PermitTypeFormModal({ mode, permitType, onClose, onSave }: Props) {
  const [name, setName] = useState(permitType?.name ?? '');
  const [code, setCode] = useState(permitType?.code ?? '');
  const [category, setCategory] = useState<PermitCategory>(permitType?.category ?? 'MUNICIPAL');
  const [issuingAuthority, setIssuingAuthority] = useState(permitType?.issuingAuthority ?? '');
  const [criticality, setCriticality] = useState<PermitCriticality>(
    permitType?.criticality ?? 'MEDIUM',
  );
  const [hasExpiration, setHasExpiration] = useState(permitType?.hasExpiration ?? true);
  const [defaultValidityDays, setDefaultValidityDays] = useState<string>(
    permitType?.defaultValidityDays != null ? String(permitType.defaultValidityDays) : '365',
  );
  const [blocksOperation, setBlocksOperation] = useState(permitType?.blocksOperation ?? false);
  const [alertDaysBefore, setAlertDaysBefore] = useState<string>(
    String(permitType?.alertDaysBefore ?? 30),
  );
  const [criticalAlertDaysBefore, setCriticalAlertDaysBefore] = useState<string>(
    String(permitType?.criticalAlertDaysBefore ?? 7),
  );
  const [description, setDescription] = useState(permitType?.description ?? '');
  const [icon, setIcon] = useState(permitType?.icon ?? '');
  const [color, setColor] = useState(permitType?.color ?? DEFAULT_COLOR);
  const [isActive, setIsActive] = useState(permitType?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('El nombre es obligatorio.');
    if (!code.trim()) return setError('El código es obligatorio.');
    if (!/^[A-Z0-9_-]+$/.test(code.trim().toUpperCase())) {
      return setError('El código sólo admite letras mayúsculas, dígitos, guion y guion bajo.');
    }

    const validity =
      hasExpiration && defaultValidityDays.trim() ? Number(defaultValidityDays) : undefined;
    if (validity !== undefined && (Number.isNaN(validity) || validity < 1)) {
      return setError('Los días de vigencia deben ser un número entero positivo.');
    }
    const alertN = Number(alertDaysBefore);
    const critN = Number(criticalAlertDaysBefore);
    if (Number.isNaN(alertN) || alertN < 0) return setError('Días de aviso inválidos.');
    if (Number.isNaN(critN) || critN < 0) return setError('Días de alerta crítica inválidos.');

    setSubmitting(true);
    try {
      await onSave({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        category,
        issuingAuthority: issuingAuthority.trim() || undefined,
        criticality,
        hasExpiration,
        defaultValidityDays: validity,
        blocksOperation,
        alertDaysBefore: alertN,
        criticalAlertDaysBefore: critN,
        description: description.trim() || undefined,
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

  return (
    <ConfigModalShell
      title={mode === 'create' ? 'Nuevo tipo de permiso' : 'Editar tipo de permiso'}
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
            placeholder="Patente Municipal"
            className="cp-input"
          />
        </ConfigField>
        <ConfigField label="Código" required hint="Mayúsculas, sin espacios">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="PMUN"
            className="cp-input"
            style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
          />
        </ConfigField>
      </ConfigGrid>

      <ConfigGrid cols={2}>
        <ConfigField label="Categoría" required>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as PermitCategory)}
            className="cp-input"
          >
            {(Object.keys(PERMIT_CATEGORY_LABELS) as PermitCategory[]).map((c) => (
              <option key={c} value={c}>
                {PERMIT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </ConfigField>
        <ConfigField label="Criticidad" required>
          <select
            value={criticality}
            onChange={(e) => setCriticality(e.target.value as PermitCriticality)}
            className="cp-input"
          >
            {(Object.keys(PERMIT_CRITICALITY_LABELS) as PermitCriticality[]).map((c) => (
              <option key={c} value={c}>
                {PERMIT_CRITICALITY_LABELS[c]}
              </option>
            ))}
          </select>
        </ConfigField>
      </ConfigGrid>

      <ConfigField label="Autoridad emisora" hint="Ej: Municipalidad, SEREMI Salud, SEC">
        <input
          value={issuingAuthority}
          onChange={(e) => setIssuingAuthority(e.target.value)}
          placeholder="Municipalidad"
          className="cp-input"
        />
      </ConfigField>

      <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-[var(--border-color)] hover:bg-[var(--input-bg)]">
        <input
          type="checkbox"
          checked={hasExpiration}
          onChange={(e) => setHasExpiration(e.target.checked)}
          className="mt-0.5"
        />
        <div className="flex-1">
          <div
            className="text-sm text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            Tiene vigencia
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            Activa para permisos que vencen y deben renovarse periódicamente.
          </div>
        </div>
      </label>

      {hasExpiration && (
        <ConfigField label="Días de vigencia por defecto">
          <input
            type="number"
            min={1}
            value={defaultValidityDays}
            onChange={(e) => setDefaultValidityDays(e.target.value)}
            className="cp-input"
            style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
          />
        </ConfigField>
      )}

      <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-[var(--border-color)] hover:bg-[var(--input-bg)]">
        <input
          type="checkbox"
          checked={blocksOperation}
          onChange={(e) => setBlocksOperation(e.target.checked)}
          className="mt-0.5"
        />
        <div className="flex-1">
          <div
            className="text-sm text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            Bloquea operación si vence
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            Si está activo, los activos sin este permiso vigente pasarán a estado BLOQUEADO
            automáticamente.
          </div>
        </div>
      </label>

      <ConfigGrid cols={2}>
        <ConfigField label="Días de aviso antes de vencer">
          <input
            type="number"
            min={0}
            value={alertDaysBefore}
            onChange={(e) => setAlertDaysBefore(e.target.value)}
            className="cp-input"
            style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
          />
        </ConfigField>
        <ConfigField label="Días para alerta crítica">
          <input
            type="number"
            min={0}
            value={criticalAlertDaysBefore}
            onChange={(e) => setCriticalAlertDaysBefore(e.target.value)}
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

      <ConfigGrid cols={2}>
        <ConfigField label="Ícono" hint="Ejemplo: ShieldCheck, Building2">
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="ShieldCheck"
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

export default PermitTypeFormModal;
