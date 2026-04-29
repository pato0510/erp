'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export type TemplateScope = 'document' | 'permit';

export interface CommitmentTemplateForForm {
  id?: string;
  documentTypeId?: string | null;
  permitTypeId?: string | null;
  categoryId?: string | null;
  description?: string;
  estimatedAmount?: number | string;
  currency?: string;
  daysBeforeExpiration?: number;
  isActive?: boolean;
}

export interface CommitmentTemplateSubmit {
  documentTypeId?: string;
  permitTypeId?: string;
  categoryId: string;
  description: string;
  estimatedAmount: number;
  currency: string;
  daysBeforeExpiration: number;
  isActive: boolean;
}

interface CategoryOption {
  id: string;
  name: string;
  type: string;
}

interface TypeOption {
  id: string;
  code: string;
  name: string;
}

interface CommitmentTemplateFormModalProps {
  scope: TemplateScope;
  initial?: CommitmentTemplateForForm | null;
  /* The available document/permit type catalog for the dropdown.
     The parent fetches once and passes both lists in. */
  typeOptions: TypeOption[];
  /* Finance categories filtered to type=EXPENSE. */
  categoryOptions: CategoryOption[];
  onClose: () => void;
  onSubmit: (input: CommitmentTemplateSubmit) => Promise<void>;
}

export function CommitmentTemplateFormModal({
  scope,
  initial,
  typeOptions,
  categoryOptions,
  onClose,
  onSubmit,
}: CommitmentTemplateFormModalProps) {
  const editing = !!initial?.id;
  const [typeId, setTypeId] = useState<string>(
    (scope === 'document' ? initial?.documentTypeId : initial?.permitTypeId) ?? '',
  );
  const [categoryId, setCategoryId] = useState<string>(initial?.categoryId ?? '');
  const [description, setDescription] = useState<string>(initial?.description ?? '');
  const [amount, setAmount] = useState<string>(
    initial?.estimatedAmount !== undefined ? String(initial.estimatedAmount) : '',
  );
  const [days, setDays] = useState<number>(initial?.daysBeforeExpiration ?? 30);
  const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!typeId)
      return setError(
        scope === 'document'
          ? 'Selecciona un tipo de documento.'
          : 'Selecciona un tipo de permiso.',
      );
    if (!categoryId) return setError('Selecciona una categoría financiera.');
    if (!description.trim()) return setError('Ingresa una descripción.');
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return setError('El monto debe ser un número positivo.');
    }
    if (!Number.isFinite(days) || days < 0) {
      return setError('Los días antes de vencer deben ser >= 0.');
    }
    setSubmitting(true);
    try {
      await onSubmit({
        ...(scope === 'document' ? { documentTypeId: typeId } : { permitTypeId: typeId }),
        categoryId,
        description: description.trim(),
        estimatedAmount: numericAmount,
        currency: 'CLP',
        daysBeforeExpiration: days,
        isActive,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la plantilla.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSave}
        className="bg-[var(--bg-card)] w-full max-w-lg rounded-xl border border-[var(--border-color)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {editing ? 'Editar plantilla' : 'Nueva plantilla de compromiso'}
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {scope === 'document'
                ? 'Costo típico de renovación para un tipo de documento.'
                : 'Costo típico de renovación para un tipo de permiso externo.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1 text-[var(--text-secondary)] hover:bg-[var(--hover-bg,rgba(0,0,0,0.04))]"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-5 py-4 flex flex-col gap-3">
          <Field label={scope === 'document' ? 'Tipo de documento' : 'Tipo de permiso'}>
            <select
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              disabled={editing}
              className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)] disabled:opacity-60"
            >
              <option value="">Selecciona…</option>
              {typeOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.code} — {opt.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Categoría financiera">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
            >
              <option value="">Selecciona…</option>
              {categoryOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
              Solo se muestran categorías de tipo EXPENSE.
            </p>
          </Field>
          <Field label="Descripción">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Renovación anual SOAP"
              className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Costo estimado (CLP)">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50000"
                min={0}
                className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
              />
            </Field>
            <Field label="Días antes de vencer">
              <input
                type="number"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                min={0}
                className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border-color)]"
            />
            Plantilla activa
          </label>

          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--border-color)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </label>
      {children}
    </div>
  );
}

export default CommitmentTemplateFormModal;
