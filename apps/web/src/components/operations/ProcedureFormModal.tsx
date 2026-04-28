'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Upload, X } from 'lucide-react';
import { apiClient } from '../../lib/api';

type ProcedureCategory =
  | 'OPERATION'
  | 'MAINTENANCE'
  | 'EMERGENCY'
  | 'SAFETY'
  | 'QUALITY'
  | 'ENVIRONMENTAL'
  | 'OTHER';

const CATEGORY_LABELS: Record<ProcedureCategory, string> = {
  OPERATION: 'Operación',
  MAINTENANCE: 'Mantenimiento',
  EMERGENCY: 'Emergencia',
  SAFETY: 'Seguridad',
  QUALITY: 'Calidad',
  ENVIRONMENTAL: 'Ambiental',
  OTHER: 'Otro',
};

const ROLE_OPTIONS = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'MANAGER', label: 'Gerente' },
  { value: 'ACCOUNTANT', label: 'Contador' },
  { value: 'ANALYST', label: 'Analista' },
  { value: 'VIEWER', label: 'Visualizador' },
];

const MAX_MAIN_FILE = 25 * 1024 * 1024;

interface AssetOption {
  id: string;
  code: string;
  name: string;
}
interface AssetTypeOption {
  id: string;
  name: string;
}
interface LocationOption {
  id: string;
  name: string;
}

export interface ProcedureInitialValues {
  code?: string;
  title?: string;
  description?: string | null;
  category?: ProcedureCategory;
  version?: string;
  changelog?: string;
  keywords?: string[];
  scope?: string | null;
  estimatedReadingMinutes?: number | null;
  requiresAcknowledgment?: boolean;
  acknowledgmentDeadlineDays?: number | null;
  applicableAssetIds?: string[];
  applicableAssetTypeIds?: string[];
  applicableLocationIds?: string[];
  applicableRoles?: string[];
}

interface Props {
  mode: 'create' | 'new-version';
  /* For edit mode we'd add an `existingId` here, but the spec is
     create + new-version. */
  initialValues?: ProcedureInitialValues;
  /* For new-version: locks code + suggests next version. */
  sourceProcedureId?: string;
  onClose: () => void;
  onSaved: () => void;
}

/* OPS-027 — six-section form for authoring a procedure. The same
   modal is reused for "Nueva versión" via the new-version mode,
   which locks the code and forces the changelog field. */
export function ProcedureFormModal({
  mode,
  initialValues,
  sourceProcedureId,
  onClose,
  onSaved,
}: Props) {
  const [code, setCode] = useState(initialValues?.code ?? '');
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [category, setCategory] = useState<ProcedureCategory>(
    initialValues?.category ?? 'OPERATION',
  );
  const [version, setVersion] = useState(initialValues?.version ?? '1.0');
  const [changelog, setChangelog] = useState(initialValues?.changelog ?? '');
  const [keywords, setKeywords] = useState<string[]>(initialValues?.keywords ?? []);
  const [scope, setScope] = useState(initialValues?.scope ?? '');
  const [estReading, setEstReading] = useState<string>(
    initialValues?.estimatedReadingMinutes != null
      ? String(initialValues.estimatedReadingMinutes)
      : '',
  );
  const [requiresAck, setRequiresAck] = useState(initialValues?.requiresAcknowledgment ?? false);
  const [ackDays, setAckDays] = useState<string>(
    initialValues?.acknowledgmentDeadlineDays != null
      ? String(initialValues.acknowledgmentDeadlineDays)
      : '',
  );
  const [applicableAssetIds, setApplicableAssetIds] = useState<string[]>(
    initialValues?.applicableAssetIds ?? [],
  );
  const [applicableAssetTypeIds, setApplicableAssetTypeIds] = useState<string[]>(
    initialValues?.applicableAssetTypeIds ?? [],
  );
  const [applicableLocationIds, setApplicableLocationIds] = useState<string[]>(
    initialValues?.applicableLocationIds ?? [],
  );
  const [applicableRoles, setApplicableRoles] = useState<string[]>(
    initialValues?.applicableRoles ?? [],
  );

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [assetTypes, setAssetTypes] = useState<AssetTypeOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [submitting, setSubmitting] = useState<false | 'draft' | 'review'>(false);
  const [error, setError] = useState<string | null>(null);

  /* Catalogs for autocomplete pickers. */
  useEffect(() => {
    let alive = true;
    Promise.all([
      apiClient
        .get<{ data: AssetOption[] }>('/api/operations/assets?limit=100')
        .catch(() => ({ data: [] as AssetOption[] })),
      apiClient
        .get<AssetTypeOption[]>('/api/operations/asset-types')
        .catch(() => [] as AssetTypeOption[]),
      apiClient.get<LocationOption[]>('/api/operations/locations').catch(() => []),
    ]).then(([a, t, l]) => {
      if (!alive) return;
      setAssets(a.data ?? []);
      setAssetTypes(t);
      setLocations(l);
    });
    return () => {
      alive = false;
    };
  }, []);

  const codeLocked = mode === 'new-version';

  const handleFile = (f: File | null) => {
    setFileError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > MAX_MAIN_FILE) {
      setFileError('El archivo excede el límite de 25 MB.');
      return;
    }
    setFile(f);
  };

  const addKeyword = () => {
    const trimmed = keywordInput.trim();
    if (!trimmed) return;
    if (keywords.includes(trimmed)) return;
    setKeywords([...keywords, trimmed]);
    setKeywordInput('');
  };

  const validate = (): string | null => {
    if (!code.trim()) return 'Código es obligatorio.';
    if (!title.trim() || title.trim().length < 3) return 'Título es obligatorio.';
    if (!file) return 'Carga el archivo principal.';
    if (mode === 'new-version' && changelog.trim().length < 20) {
      return 'El changelog debe tener al menos 20 caracteres.';
    }
    if (requiresAck && !ackDays) {
      return 'Si requiere acuse, define el plazo en días.';
    }
    return null;
  };

  const submit = async (target: 'draft' | 'review') => {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    if (!file) return;
    setSubmitting(target);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('code', code.trim().toUpperCase());
      fd.append('title', title.trim());
      if (description.trim()) fd.append('description', description.trim());
      fd.append('category', category);
      fd.append('version', version.trim());
      if (changelog.trim()) fd.append('changelog', changelog.trim());
      for (const k of keywords) fd.append('keywords', k);
      if (scope.trim()) fd.append('scope', scope.trim());
      if (estReading) fd.append('estimatedReadingMinutes', estReading);
      fd.append('requiresAcknowledgment', requiresAck ? 'true' : 'false');
      if (requiresAck && ackDays) fd.append('acknowledgmentDeadlineDays', ackDays);
      for (const id of applicableAssetIds) fd.append('applicableAssetIds', id);
      for (const id of applicableAssetTypeIds) fd.append('applicableAssetTypeIds', id);
      for (const id of applicableLocationIds) fd.append('applicableLocationIds', id);
      for (const r of applicableRoles) fd.append('applicableRoles', r);
      if (target === 'review') fd.append('submitImmediately', 'true');

      if (mode === 'new-version' && sourceProcedureId) {
        await apiClient.uploadFile(
          `/api/operations/procedures/${sourceProcedureId}/new-version`,
          fd,
        );
      } else {
        await apiClient.uploadFile('/api/operations/procedures', fd);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-card)] z-10">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {mode === 'new-version' ? 'Nueva versión de procedimiento' : 'Nuevo procedimiento'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <Section title="1. Información básica">
            <Grid cols={2}>
              <Field label="Código" required hint="Mayúsculas, sin espacios">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="P-OP-001"
                  className="cp-input"
                  disabled={codeLocked}
                  style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                />
              </Field>
              <Field label="Versión" required>
                <input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="1.0"
                  className="cp-input"
                  style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                />
              </Field>
            </Grid>
            <Field label="Título" required>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Procedimiento de operación segura"
                className="cp-input"
              />
            </Field>
            <Field label="Descripción">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="cp-input"
              />
            </Field>
            <Field label="Categoría" required>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProcedureCategory)}
                className="cp-input"
              >
                {(Object.keys(CATEGORY_LABELS) as ProcedureCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </Field>
          </Section>

          <Section title="2. Archivo principal">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
            />
            <div
              className="rounded-lg p-4 cursor-pointer text-center"
              style={{
                background: 'var(--input-bg)',
                border: '1px dashed var(--border-color)',
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={20} className="mx-auto mb-2 text-[var(--text-secondary)]" />
              {file ? (
                <p
                  className="text-sm"
                  style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
                >
                  {file.name}{' '}
                  <span className="text-xs text-[var(--text-muted)]">
                    ({Math.round(file.size / 1024)} KB)
                  </span>
                </p>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">
                  Click para seleccionar PDF, DOCX, XLSX o imagen (máx 25 MB)
                </p>
              )}
            </div>
            {fileError && <p className="text-xs text-red-600 mt-1">{fileError}</p>}
          </Section>

          <Section title="3. Metadata">
            <Field label="Palabras clave">
              <div className="flex flex-wrap gap-1 mb-1">
                {keywords.map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                    style={{
                      background: 'rgba(37, 99, 235, 0.10)',
                      color: '#1d4ed8',
                    }}
                  >
                    {k}
                    <button
                      onClick={() => setKeywords(keywords.filter((x) => x !== k))}
                      className="hover:text-red-600"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addKeyword();
                    }
                  }}
                  placeholder="Agrega una palabra y Enter"
                  className="cp-input"
                />
                <button
                  onClick={addKeyword}
                  className="px-3 py-1.5 text-xs rounded-full border border-gray-300 hover:bg-gray-50"
                  type="button"
                >
                  <Plus size={12} />
                </button>
              </div>
            </Field>
            <Field label="Alcance">
              <textarea
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                rows={2}
                className="cp-input"
                placeholder="Aplicable a operadores nivel 1 en jornada diurna"
              />
            </Field>
            <Grid cols={2}>
              <Field label="Tiempo estimado de lectura (min)">
                <input
                  type="number"
                  min={1}
                  value={estReading}
                  onChange={(e) => setEstReading(e.target.value)}
                  className="cp-input"
                />
              </Field>
              <Field label="Plazo de acuse (días)">
                <input
                  type="number"
                  min={1}
                  value={ackDays}
                  disabled={!requiresAck}
                  onChange={(e) => setAckDays(e.target.value)}
                  className="cp-input"
                />
              </Field>
            </Grid>
            <label className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg border border-[var(--border-color)] hover:bg-[var(--input-bg)]">
              <input
                type="checkbox"
                checked={requiresAck}
                onChange={(e) => setRequiresAck(e.target.checked)}
              />
              Requiere acuse de lectura por el personal aplicable
            </label>
          </Section>

          <Section title="4. Aplicabilidad">
            <Field label="Activos específicos">
              <MultiSelect
                value={applicableAssetIds}
                onChange={setApplicableAssetIds}
                options={assets.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))}
                placeholder="— Selecciona activos —"
              />
            </Field>
            <Field label="Tipos de activo">
              <MultiSelect
                value={applicableAssetTypeIds}
                onChange={setApplicableAssetTypeIds}
                options={assetTypes.map((t) => ({ value: t.id, label: t.name }))}
                placeholder="— Selecciona tipos —"
              />
            </Field>
            <Field label="Ubicaciones">
              <MultiSelect
                value={applicableLocationIds}
                onChange={setApplicableLocationIds}
                options={locations.map((l) => ({ value: l.id, label: l.name }))}
                placeholder="— Selecciona ubicaciones —"
              />
            </Field>
            <Field label="Roles que deben acuse">
              <MultiSelect
                value={applicableRoles}
                onChange={setApplicableRoles}
                options={ROLE_OPTIONS}
                placeholder="— Selecciona roles —"
              />
            </Field>
          </Section>

          <Section
            title={
              mode === 'new-version' ? '5. Changelog (requerido)' : '5. Notas internas / changelog'
            }
          >
            <textarea
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              rows={3}
              className="cp-input"
              placeholder={
                mode === 'new-version'
                  ? 'Describe los cambios respecto a la versión anterior (mínimo 20 caracteres)'
                  : 'Notas internas de esta primera versión (opcional)'
              }
            />
          </Section>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)] sticky bottom-0 bg-[var(--bg-card)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-full"
            disabled={submitting !== false}
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
              background: '#2563EB',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
            }}
          >
            {submitting === 'review' ? 'Enviando...' : 'Guardar y enviar a revisión'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4
        className="text-xs uppercase tracking-wider text-[var(--text-secondary)] mb-2"
        style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace', letterSpacing: '0.12em' }}
      >
        {title}
      </h4>
      <div className="space-y-2">{children}</div>
    </section>
  );
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
    <label className="block">
      <span
        className="block text-xs text-[var(--text-secondary)] mb-1"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
      >
        {label} {required && <span className="text-red-500">*</span>}
        {hint && <span className="ml-1 text-[var(--text-muted)]">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Grid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 12 }}
    >
      {children}
    </div>
  );
}

interface MultiSelectProps {
  value: string[];
  onChange: (next: string[]) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

/* Lightweight multi-select with chip removal — avoids pulling in a
   heavyweight library for a single screen. */
function MultiSelect({ value, onChange, options, placeholder }: MultiSelectProps) {
  const remaining = useMemo(
    () => options.filter((o) => !value.includes(o.value)),
    [options, value],
  );
  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1">
        {value.map((v) => {
          const opt = options.find((o) => o.value === v);
          return (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
              style={{
                background: 'rgba(37, 99, 235, 0.10)',
                color: '#1d4ed8',
              }}
            >
              {opt?.label ?? v}
              <button
                onClick={() => onChange(value.filter((x) => x !== v))}
                className="hover:text-red-600"
                type="button"
              >
                <X size={10} />
              </button>
            </span>
          );
        })}
      </div>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) onChange([...value, e.target.value]);
        }}
        className="cp-input"
      >
        <option value="">{placeholder}</option>
        {remaining.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default ProcedureFormModal;
