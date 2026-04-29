'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Save, Trash2, Wallet } from 'lucide-react';
import { apiClient, ApiError } from '../../../lib/api';
import { formatCLP } from '../../../lib/formatters';
import {
  CommitmentTemplateFormModal,
  type CommitmentTemplateSubmit,
  type TemplateScope,
} from './CommitmentTemplateFormModal';

interface CommitmentTemplate {
  id: string;
  documentTypeId: string | null;
  permitTypeId: string | null;
  categoryId: string;
  description: string;
  estimatedAmount: string;
  currency: string;
  daysBeforeExpiration: number;
  isActive: boolean;
  category: { id: string; name: string; type: string; color: string | null } | null;
}

interface DocumentTypeOption {
  id: string;
  code: string;
  name: string;
}

interface PermitTypeOption {
  id: string;
  code: string;
  name: string;
}

interface CategoryOption {
  id: string;
  name: string;
  type: string;
}

interface AlertSettings {
  id: string;
  enableAutoCommitments: boolean;
  enableAutoBlocking: boolean;
  defaultDaysBefore: number;
  defaultCriticalDaysBefore: number;
  defaultBlockingDaysBefore: number;
  defaultEscalationDays: number;
  enableEmailNotifications: boolean;
}

type Toaster = (message: string, type: 'success' | 'error' | 'info') => void;

interface AutoCommitmentsTabProps {
  toaster: Toaster;
}

export function AutoCommitmentsTab({ toaster }: AutoCommitmentsTabProps) {
  const [templates, setTemplates] = useState<CommitmentTemplate[]>([]);
  const [docTypes, setDocTypes] = useState<DocumentTypeOption[]>([]);
  const [permitTypes, setPermitTypes] = useState<PermitTypeOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [modal, setModal] = useState<{
    scope: TemplateScope;
    initial: CommitmentTemplate | null;
  } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tpl, docs, perms, cats, sets] = await Promise.all([
        apiClient.get<CommitmentTemplate[]>('/api/operations/commitment-templates'),
        apiClient.get<DocumentTypeOption[]>('/api/operations/document-types'),
        apiClient.get<PermitTypeOption[]>('/api/operations/permit-types'),
        apiClient.get<CategoryOption[]>('/api/categories'),
        apiClient.get<AlertSettings>('/api/operations/alert-settings'),
      ]);
      setTemplates(tpl);
      setDocTypes(docs);
      setPermitTypes(perms);
      setCategories(cats.filter((c) => c.type === 'EXPENSE'));
      setSettings(sets);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'No se pudieron cargar los datos.';
      toaster(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [toaster]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const documentTemplates = useMemo(
    () => templates.filter((t) => t.documentTypeId !== null),
    [templates],
  );
  const permitTemplates = useMemo(
    () => templates.filter((t) => t.permitTypeId !== null),
    [templates],
  );

  const handleSettingsToggle = useCallback(
    async (next: boolean) => {
      if (!settings) return;
      setSavingSettings(true);
      try {
        const updated = await apiClient.patch<AlertSettings>('/api/operations/alert-settings', {
          enableAutoCommitments: next,
        });
        setSettings(updated);
        toaster(
          next ? 'Compromisos automáticos activados.' : 'Compromisos automáticos desactivados.',
          'success',
        );
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'No se pudo guardar la configuración.';
        toaster(msg, 'error');
      } finally {
        setSavingSettings(false);
      }
    },
    [settings, toaster],
  );

  const handleSubmitTemplate = useCallback(
    async (input: CommitmentTemplateSubmit) => {
      if (!modal) return;
      const editing = modal.initial?.id;
      try {
        if (editing) {
          /* Type fields can't change on edit (the modal disables the
             dropdown), so we send only the mutable surface. */
          const { documentTypeId: _d, permitTypeId: _p, ...rest } = input;
          void _d;
          void _p;
          await apiClient.patch(`/api/operations/commitment-templates/${editing}`, rest);
          toaster('Plantilla actualizada.', 'success');
        } else {
          await apiClient.post('/api/operations/commitment-templates', input);
          toaster('Plantilla creada.', 'success');
        }
        setModal(null);
        await fetchAll();
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'No se pudo guardar la plantilla.';
        throw new Error(msg);
      }
    },
    [modal, fetchAll, toaster],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('¿Eliminar esta plantilla? Los compromisos ya generados no se verán afectados.'))
        return;
      try {
        await apiClient.delete(`/api/operations/commitment-templates/${id}`);
        toaster('Plantilla eliminada.', 'success');
        await fetchAll();
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'No se pudo eliminar.';
        toaster(msg, 'error');
      }
    },
    [fetchAll, toaster],
  );

  if (loading) {
    return <div className="text-sm text-[var(--text-secondary)] py-12 text-center">Cargando…</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Section 1 — General settings */}
      <section className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Wallet size={14} /> Configuración general
        </h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Cuando está activado, el sistema crea automáticamente compromisos de caja en proyección al
          detectar documentos o permisos próximos a vencer, usando las plantillas definidas abajo.
        </p>
        <div className="mt-3 flex items-center justify-between gap-4">
          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={settings?.enableAutoCommitments ?? true}
              onChange={(e) => handleSettingsToggle(e.target.checked)}
              disabled={savingSettings}
              className="h-4 w-4 rounded border-[var(--border-color)]"
            />
            Crear compromisos automáticos al vencer documentos y permisos
          </label>
          {savingSettings && (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
              <Save size={12} className="animate-spin" /> Guardando…
            </span>
          )}
        </div>
      </section>

      {/* Section 2 — Document templates */}
      <TemplateSection
        title="Plantillas por tipo de documento"
        description="Define el costo típico de renovación de cada tipo de documento. El sistema usará estas plantillas para crear compromisos automáticos en el módulo de Caja."
        templates={documentTemplates}
        scope="document"
        typeOptions={docTypes}
        getTypeName={(t) => docTypes.find((d) => d.id === t.documentTypeId)?.name ?? '—'}
        onAdd={() => setModal({ scope: 'document', initial: null })}
        onEdit={(t) => setModal({ scope: 'document', initial: t })}
        onDelete={handleDelete}
      />

      {/* Section 3 — Permit templates */}
      <TemplateSection
        title="Plantillas por tipo de permiso"
        description="Mismas reglas para permisos externos: el sistema dispara la creación del compromiso cuando un permiso aprobado entra en su ventana de alerta."
        templates={permitTemplates}
        scope="permit"
        typeOptions={permitTypes}
        getTypeName={(t) => permitTypes.find((p) => p.id === t.permitTypeId)?.name ?? '—'}
        onAdd={() => setModal({ scope: 'permit', initial: null })}
        onEdit={(t) => setModal({ scope: 'permit', initial: t })}
        onDelete={handleDelete}
      />

      {modal && (
        <CommitmentTemplateFormModal
          scope={modal.scope}
          initial={
            modal.initial
              ? {
                  id: modal.initial.id,
                  documentTypeId: modal.initial.documentTypeId,
                  permitTypeId: modal.initial.permitTypeId,
                  categoryId: modal.initial.categoryId,
                  description: modal.initial.description,
                  estimatedAmount: modal.initial.estimatedAmount,
                  currency: modal.initial.currency,
                  daysBeforeExpiration: modal.initial.daysBeforeExpiration,
                  isActive: modal.initial.isActive,
                }
              : null
          }
          typeOptions={modal.scope === 'document' ? docTypes : permitTypes}
          categoryOptions={categories}
          onClose={() => setModal(null)}
          onSubmit={handleSubmitTemplate}
        />
      )}
    </div>
  );
}

function TemplateSection({
  title,
  description,
  templates,
  scope,
  typeOptions,
  getTypeName,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string;
  description: string;
  templates: CommitmentTemplate[];
  scope: TemplateScope;
  typeOptions: Array<{ id: string }>;
  getTypeName: (t: CommitmentTemplate) => string;
  onAdd: () => void;
  onEdit: (t: CommitmentTemplate) => void;
  onDelete: (id: string) => void;
}) {
  const exhausted = typeOptions.length > 0 && templates.length >= typeOptions.length;
  return (
    <section className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-sm">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{description}</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={exhausted}
          title={exhausted ? 'Ya hay una plantilla por cada tipo disponible.' : undefined}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus size={12} />
          Nueva plantilla
        </button>
      </header>

      {templates.length === 0 ? (
        <p className="text-xs italic text-[var(--text-secondary)]">
          Aún no hay plantillas configuradas. Agrega una para activar la generación automática.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[var(--text-secondary)]">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide">
                  {scope === 'document' ? 'Tipo de documento' : 'Tipo de permiso'}
                </th>
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide">
                  Descripción
                </th>
                <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wide">
                  Costo estimado
                </th>
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide">
                  Categoría
                </th>
                <th className="px-2 py-1.5 text-center font-semibold uppercase tracking-wide">
                  Días antes
                </th>
                <th className="px-2 py-1.5 text-center font-semibold uppercase tracking-wide">
                  Estado
                </th>
                <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wide">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-[var(--hover-bg,rgba(0,0,0,0.02))]">
                  <td className="px-2 py-1.5 text-[var(--text-primary)]">{getTypeName(t)}</td>
                  <td className="px-2 py-1.5 text-[var(--text-primary)]">{t.description}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-[var(--text-primary)]">
                    {formatCLP(t.estimatedAmount)}
                  </td>
                  <td className="px-2 py-1.5 text-[var(--text-primary)]">
                    {t.category?.name ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 text-center text-[var(--text-primary)]">
                    {t.daysBeforeExpiration}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        backgroundColor: t.isActive
                          ? 'rgba(34,197,94,0.14)'
                          : 'rgba(100,116,139,0.14)',
                        color: t.isActive ? '#15803d' : '#475569',
                      }}
                    >
                      {t.isActive ? 'Activa' : 'Pausada'}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(t)}
                        className="rounded-md p-1 text-[var(--text-secondary)] hover:bg-[var(--hover-bg,rgba(0,0,0,0.05))]"
                        aria-label="Editar"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(t.id)}
                        className="rounded-md p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        aria-label="Eliminar"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default AutoCommitmentsTab;
