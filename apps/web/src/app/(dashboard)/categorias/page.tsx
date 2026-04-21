'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Power, PowerOff, Tag, Trash2, X } from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { Toast } from '../../../components/shared/Toast';

type CategoryType = 'INCOME' | 'EXPENSE';

interface Category {
  id: string;
  name: string;
  type: CategoryType;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  isActive: boolean;
  parentId?: string | null;
  children?: Category[];
}

const COLOR_PRESETS = [
  '#2563EB',
  '#1E3A5F',
  '#64748B',
  '#16A34A',
  '#DC2626',
  '#D97706',
  '#7C3AED',
  '#0891B2',
];
const DEFAULT_COLOR = '#64748B';

type ModalState =
  | null
  | { mode: 'create'; type: CategoryType }
  | { mode: 'edit'; category: Category };

export default function CategoriasPage() {
  const [tab, setTab] = useState<CategoryType>('INCOME');
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      // Default API filter is isActive=true; pass explicit false to show all.
      // We want to show inactive too so the user can re-activate.
      const res = await apiClient.get<Category[]>(`/api/categories?type=${tab}&isActive=false`);
      const active = await apiClient.get<Category[]>(`/api/categories?type=${tab}&isActive=true`);
      // Merge unique
      const merged = [...active];
      res.forEach((c) => {
        if (!merged.find((m) => m.id === c.id)) merged.push(c);
      });
      merged.sort((a, b) => a.name.localeCompare(b.name));
      setCategories(merged);
    } catch {
      setToast({ message: 'Error cargando categorías', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (dto: {
    id?: string;
    name: string;
    type: CategoryType;
    color?: string;
    description?: string;
    parentId?: string | null;
  }) => {
    try {
      if (dto.id) {
        const { id, type: _type, ...body } = dto;
        void _type;
        await apiClient.patch(`/api/categories/${id}`, body);
        setToast({ message: 'Categoría actualizada', type: 'success' });
      } else {
        const { id: _id, ...body } = dto;
        void _id;
        await apiClient.post('/api/categories', body);
        setToast({ message: 'Categoría creada', type: 'success' });
      }
      setModal(null);
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error al guardar',
        type: 'error',
      });
    }
  };

  const handleToggle = async (c: Category) => {
    try {
      if (c.isActive) {
        await apiClient.delete(`/api/categories/${c.id}`);
        setToast({ message: 'Categoría desactivada', type: 'success' });
      } else {
        await apiClient.patch(`/api/categories/${c.id}`, { isActive: true });
        setToast({ message: 'Categoría reactivada', type: 'success' });
      }
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error',
        type: 'error',
      });
    }
  };

  const handleHardDelete = async (c: Category) => {
    if (
      !window.confirm(`¿Eliminar "${c.name}" permanentemente? Esta acción no se puede deshacer.`)
    ) {
      return;
    }
    try {
      await apiClient.delete(`/api/categories/${c.id}/permanent`);
      setToast({ message: 'Categoría eliminada', type: 'success' });
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error al eliminar',
        type: 'error',
      });
    }
  };

  // Only top-level categories are candidates for "parent" — the backend allows
  // parentId but we keep it one level deep in the UI.
  const parentCandidates = categories.filter((c) => !c.parentId && c.isActive);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl text-gray-900">Categorías</h1>
        <button
          onClick={() => setModal({ mode: 'create', type: tab })}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full transition"
          style={{
            background: '#1C1C1E',
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 500,
          }}
        >
          <Plus size={16} /> Nueva Categoría
        </button>
      </div>

      {/* Tabs */}
      <div className="inline-flex gap-1 bg-white border border-gray-200 rounded-lg p-1 mb-6">
        {(['INCOME', 'EXPENSE'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm rounded-md transition ${
              tab === t ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            {t === 'INCOME' ? 'Ingresos' : 'Egresos'}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-5 py-4 animate-pulse flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-gray-200" />
                <div className="h-4 bg-gray-200 rounded w-48" />
                <div className="flex-1" />
                <div className="h-4 bg-gray-200 rounded w-20" />
              </div>
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="p-12 text-center">
            <Tag size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-600 font-medium">
              Aún no tienes categorías. Crea tu primera categoría.
            </p>
            <button
              onClick={() => setModal({ mode: 'create', type: tab })}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full"
              style={{
                background: '#1C1C1E',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Plus size={16} /> Nueva Categoría
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {categories.map((c) => {
              const subCount = c.children?.length ?? 0;
              return (
                <div
                  key={c.id}
                  className={`px-5 py-3 flex items-center gap-3 ${!c.isActive ? 'opacity-50' : ''}`}
                >
                  <span
                    className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: c.color || DEFAULT_COLOR }}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className="truncate text-gray-900"
                      style={{
                        fontFamily: 'var(--font-outfit), sans-serif',
                        fontWeight: 500,
                        fontSize: 14,
                      }}
                    >
                      {c.name}
                    </p>
                    {c.description && (
                      <p
                        className="truncate text-gray-400"
                        style={{
                          fontFamily: 'var(--font-outfit), sans-serif',
                          fontWeight: 300,
                          fontSize: 12,
                        }}
                      >
                        {c.description}
                      </p>
                    )}
                  </div>
                  {subCount > 0 && (
                    <span className="label text-[10px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                      {subCount} sub
                    </span>
                  )}
                  <button
                    onClick={() => setModal({ mode: 'edit', category: c })}
                    className="p-2 rounded-md hover:bg-gray-100 text-gray-500"
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleToggle(c)}
                    className="p-2 rounded-md hover:bg-gray-100"
                    title={c.isActive ? 'Desactivar' : 'Activar'}
                    style={{ color: c.isActive ? '#64748B' : '#16A34A' }}
                  >
                    {c.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                  </button>
                  <button
                    onClick={() => handleHardDelete(c)}
                    className="p-2 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600 transition"
                    title="Eliminar permanentemente"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && (
        <CategoryModal
          modal={modal}
          parentCandidates={parentCandidates}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function CategoryModal({
  modal,
  parentCandidates,
  onClose,
  onSave,
}: {
  modal: Exclude<ModalState, null>;
  parentCandidates: Category[];
  onClose: () => void;
  onSave: (dto: {
    id?: string;
    name: string;
    type: CategoryType;
    color?: string;
    description?: string;
    parentId?: string | null;
  }) => void;
}) {
  const initial = modal.mode === 'edit' ? modal.category : null;
  const initialType = modal.mode === 'edit' ? modal.category.type : modal.type;

  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? COLOR_PRESETS[0]);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [parentId, setParentId] = useState<string>(initial?.parentId ?? '');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const trimmedParent = parentId.trim();
      await onSave({
        id: initial?.id,
        name: name.trim(),
        type: initialType,
        color,
        description: description.trim() || undefined,
        // Create: omit when empty. Edit: send null to unset a previously-set parent,
        // undefined when it was empty and stays empty (no-op on backend).
        parentId: trimmedParent ? trimmedParent : initial?.parentId ? null : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">
            {modal.mode === 'create' ? 'Nueva categoría' : 'Editar categoría'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <FormField label="Nombre" required>
            <TnInput value={name} onChange={setName} placeholder="Ventas por servicios" />
          </FormField>

          {modal.mode === 'create' && (
            <FormField label="Tipo">
              <div
                className="text-sm text-gray-600 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200"
                style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
              >
                {initialType === 'INCOME' ? 'Ingreso' : 'Egreso'}
              </div>
            </FormField>
          )}

          <FormField label="Color">
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full border-2 transition"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? '#1C1C1E' : 'transparent',
                  }}
                  aria-label={c}
                />
              ))}
            </div>
          </FormField>

          <FormField label="Descripción">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Opcional"
              className="tn-textarea"
            />
          </FormField>

          <FormField label="Categoría padre (opcional)">
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="tn-input"
            >
              <option value="">— Sin padre —</option>
              {parentCandidates
                .filter((c) => c.id !== initial?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </FormField>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || submitting}
            className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            {submitting ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      <style jsx global>{`
        .tn-input,
        .tn-textarea {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #e8eaed;
          border-radius: 8px;
          font-family: var(--font-outfit), sans-serif;
          font-size: 14px;
          color: #1c1c1e;
          background: #ffffff;
          outline: none;
          transition:
            border-color 120ms ease,
            box-shadow 120ms ease;
        }
        .tn-input:focus,
        .tn-textarea:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
      `}</style>
    </div>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block mb-1.5 text-gray-700"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500, fontSize: 13 }}
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function TnInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="tn-input"
    />
  );
}
