'use client';

import { useState } from 'react';
import { ConfigField, ConfigGrid, ConfigModalShell } from './ConfigModalShell';

export type DocumentCategory =
  | 'LEGAL'
  | 'SAFETY'
  | 'OPERATIONAL'
  | 'FINANCIAL'
  | 'TECHNICAL'
  | 'ADMINISTRATIVE';

export type DocumentCriticality = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  LEGAL: 'Legal',
  SAFETY: 'Seguridad',
  OPERATIONAL: 'Operacional',
  FINANCIAL: 'Financiero',
  TECHNICAL: 'Técnico',
  ADMINISTRATIVE: 'Administrativo',
};

export const DOCUMENT_CRITICALITY_LABELS: Record<DocumentCriticality, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

export interface DocumentTypeForForm {
  id: string;
  name: string;
  code: string;
  category: DocumentCategory;
  criticality: DocumentCriticality;
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

export interface DocumentTypeSubmit {
  name: string;
  code: string;
  category: DocumentCategory;
  criticality: DocumentCriticality;
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
  documentType: DocumentTypeForForm | null;
  onClose: () => void;
  onSave: (dto: DocumentTypeSubmit) => Promise<void> | void;
}

const DEFAULT_COLOR = '#475569';

export function DocumentTypeFormModal({ mode, documentType, onClose, onSave }: Props) {
  const [name, setName] = useState(documentType?.name ?? '');
  const [code, setCode] = useState(documentType?.code ?? '');
  const [category, setCategory] = useState<DocumentCategory>(documentType?.category ?? 'LEGAL');
  const [criticality, setCriticality] = useState<DocumentCriticality>(
    documentType?.criticality ?? 'MEDIUM',
  );
  const [hasExpiration, setHasExpiration] = useState(documentType?.hasExpiration ?? false);
  const [defaultValidityDays, setDefaultValidityDays] = useState<string>(
    documentType?.defaultValidityDays != null ? String(documentType.defaultValidityDays) : '365',
  );
  const [blocksOperation, setBlocksOperation] = useState(documentType?.blocksOperation ?? false);
  const [alertDaysBefore, setAlertDaysBefore] = useState<string>(
    String(documentType?.alertDaysBefore ?? 30),
  );
  const [criticalAlertDaysBefore, setCriticalAlertDaysBefore] = useState<string>(
    String(documentType?.criticalAlertDaysBefore ?? 7),
  );
  const [description, setDescription] = useState(documentType?.description ?? '');
  const [icon, setIcon] = useState(documentType?.icon ?? '');
  const [color, setColor] = useState(documentType?.color ?? DEFAULT_COLOR);
  const [isActive, setIsActive] = useState(documentType?.isActive ?? true);
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
      title={mode === 'create' ? 'Nuevo tipo de documento' : 'Editar tipo de documento'}
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
            placeholder="Permiso de Circulación"
            className="cp-input"
          />
        </ConfigField>
        <ConfigField label="Código" required hint="Mayúsculas, sin espacios">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="PERMCIRC"
            className="cp-input"
            style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
          />
        </ConfigField>
      </ConfigGrid>

      <ConfigGrid cols={2}>
        <ConfigField label="Categoría" required>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as DocumentCategory)}
            className="cp-input"
          >
            {(Object.keys(DOCUMENT_CATEGORY_LABELS) as DocumentCategory[]).map((c) => (
              <option key={c} value={c}>
                {DOCUMENT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </ConfigField>
        <ConfigField label="Criticidad" required>
          <select
            value={criticality}
            onChange={(e) => setCriticality(e.target.value as DocumentCriticality)}
            className="cp-input"
          >
            {(Object.keys(DOCUMENT_CRITICALITY_LABELS) as DocumentCriticality[]).map((c) => (
              <option key={c} value={c}>
                {DOCUMENT_CRITICALITY_LABELS[c]}
              </option>
            ))}
          </select>
        </ConfigField>
      </ConfigGrid>

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
            Activa para documentos que vencen y deben renovarse periódicamente.
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
            Si está activo, los activos con este documento vencido pasarán a estado BLOQUEADO
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
        <ConfigField label="Ícono" hint="Ejemplo: FileText, Shield">
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="FileText"
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

export default DocumentTypeFormModal;
