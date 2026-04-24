'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Hash,
  Pencil,
  Plus,
  Sparkles,
  Tag as TagIcon,
  Trash2,
  X,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { Toast } from '../../../../components/shared/Toast';

type RuleType = 'RUT' | 'KEYWORD' | 'DEFAULT';
type MovementTypeFilter = 'INCOME' | 'EXPENSE' | 'BOTH';
type CategoryType = 'INCOME' | 'EXPENSE';

interface CategoryRule {
  id: string;
  companyId: string;
  name: string;
  priority: number;
  ruleType: RuleType;
  matchValue: string | null;
  categoryId: string;
  movementType: MovementTypeFilter;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Category {
  id: string;
  name: string;
  type: CategoryType;
  color?: string | null;
  isActive: boolean;
}

interface TestResult {
  matchedRule: CategoryRule | null;
  categoryId: string | null;
  categoryName: string | null;
}

const MOVEMENT_LABEL: Record<MovementTypeFilter, string> = {
  INCOME: 'Ingresos',
  EXPENSE: 'Egresos',
  BOTH: 'Ambos',
};

type ModalState = null | { mode: 'create' } | { mode: 'edit'; rule: CategoryRule };

interface RuleDraft {
  name: string;
  ruleType: 'RUT' | 'KEYWORD';
  matchValue: string;
  movementType: MovementTypeFilter;
  categoryId: string;
  priority: number;
  isActive: boolean;
}

const DEFAULT_DRAFT: RuleDraft = {
  name: '',
  ruleType: 'RUT',
  matchValue: '',
  movementType: 'BOTH',
  categoryId: '',
  priority: 0,
  isActive: true,
};

export default function CategoryRulesPage() {
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const categoriesById = useMemo(() => {
    const m = new Map<string, Category>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rulesRes, incomeCats, expenseCats] = await Promise.all([
        apiClient.get<CategoryRule[]>('/api/category-rules'),
        apiClient.get<Category[]>('/api/categories?type=INCOME'),
        apiClient.get<Category[]>('/api/categories?type=EXPENSE'),
      ]);
      setRules(rulesRes);
      setCategories([...incomeCats, ...expenseCats]);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error cargando reglas',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleActive = async (rule: CategoryRule) => {
    try {
      await apiClient.patch(`/api/category-rules/${rule.id}`, { isActive: !rule.isActive });
      setToast({
        message: rule.isActive ? 'Regla desactivada' : 'Regla activada',
        type: 'success',
      });
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error al actualizar',
        type: 'error',
      });
    }
  };

  const handleDelete = async (rule: CategoryRule) => {
    if (!confirm(`¿Eliminar la regla "${rule.name}"?`)) return;
    try {
      await apiClient.delete(`/api/category-rules/${rule.id}`);
      setToast({ message: 'Regla eliminada', type: 'success' });
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error al eliminar',
        type: 'error',
      });
    }
  };

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-6">
        <Link
          href="/categorias"
          className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-2 transition"
        >
          <ArrowLeft size={12} /> Volver a Categorías
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl text-[var(--text-primary)] flex items-center gap-2">
              <Sparkles size={20} className="text-[var(--text-secondary)]" /> Reglas de
              categorización
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1" style={{ fontWeight: 300 }}>
              Define reglas para categorizar automáticamente los documentos del SII
            </p>
          </div>
          <button
            onClick={() => setModal({ mode: 'create' })}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full transition"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            <Plus size={16} /> Nueva regla
          </button>
        </div>
      </div>

      {/* Test panel */}
      <TestPanel onError={(m) => setToast({ message: m, type: 'error' })} />

      {/* Rules list */}
      <section className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-sm">
        <div className="px-5 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Reglas configuradas
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
              {rules.length}
            </span>
          </p>
        </div>
        {isLoading ? (
          <div className="divide-y divide-[var(--border-color)]">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-5 py-4 animate-pulse flex items-center gap-3">
                <div className="w-8 h-6 bg-gray-200 rounded" />
                <div className="h-4 bg-gray-200 rounded w-48" />
                <div className="flex-1" />
                <div className="h-4 bg-gray-200 rounded w-32" />
              </div>
            ))}
          </div>
        ) : rules.length === 0 ? (
          <div className="p-12 text-center">
            <Sparkles size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[var(--text-secondary)] font-medium">
              No hay reglas configuradas. Crea tu primera regla para categorizar automáticamente.
            </p>
            <button
              onClick={() => setModal({ mode: 'create' })}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full"
              style={{ background: '#1C1C1E' }}
            >
              <Plus size={14} /> Crear regla
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-color)]">
            {rules.map((r) => {
              const cat = categoriesById.get(r.categoryId);
              const ruleTypeBadge =
                r.ruleType === 'RUT'
                  ? { label: 'RUT', cls: 'bg-blue-100 text-blue-700' }
                  : r.ruleType === 'KEYWORD'
                    ? { label: 'Palabra clave', cls: 'bg-purple-100 text-purple-700' }
                    : { label: 'Por defecto', cls: 'bg-gray-100 text-gray-700' };
              return (
                <li
                  key={r.id}
                  className={`px-5 py-4 flex items-center gap-3 flex-wrap ${
                    r.isActive ? '' : 'opacity-60'
                  }`}
                >
                  <span className="inline-flex items-center justify-center min-w-[36px] h-6 px-2 rounded-md bg-gray-900 text-white text-xs font-medium">
                    <Hash size={10} className="mr-0.5" />
                    {r.priority}
                  </span>
                  <span
                    className={`inline-flex text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${ruleTypeBadge.cls}`}
                  >
                    {ruleTypeBadge.label}
                  </span>
                  <span className="text-sm text-[var(--text-primary)] font-medium">
                    {r.matchValue || '—'}
                  </span>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                  <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text-primary)]">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: cat?.color || '#94A3B8' }}
                    />
                    {cat?.name ?? <span className="italic text-gray-400">Categoría eliminada</span>}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full border border-[var(--border-color)] text-[var(--text-secondary)]">
                    {MOVEMENT_LABEL[r.movementType]}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">{r.name}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => toggleActive(r)}
                      className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--text-secondary)] transition"
                      title={r.isActive ? 'Desactivar' : 'Activar'}
                      aria-label={r.isActive ? 'Desactivar' : 'Activar'}
                    >
                      {r.isActive ? (
                        <span className="inline-flex items-center justify-center w-8 h-4 rounded-full bg-blue-600">
                          <span className="w-3 h-3 rounded-full bg-white translate-x-2" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-8 h-4 rounded-full bg-gray-300">
                          <span className="w-3 h-3 rounded-full bg-white -translate-x-2" />
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setModal({ mode: 'edit', rule: r })}
                      className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--text-secondary)] transition"
                      aria-label="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
                      className="p-1.5 rounded-md hover:bg-red-50 text-red-600 transition"
                      aria-label="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {modal && (
        <RuleModal
          mode={modal.mode}
          initial={modal.mode === 'edit' ? modal.rule : null}
          categories={categories}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            setToast({ message: 'Regla guardada', type: 'success' });
            load();
          }}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}
    </div>
  );
}

// ───────────────────────── Test panel ─────────────────────────

function TestPanel({ onError }: { onError: (m: string) => void }) {
  const [rut, setRut] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [movementType, setMovementType] = useState<CategoryType>('INCOME');
  const [result, setResult] = useState<TestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const test = async () => {
    if (!rut.trim() || !razonSocial.trim()) {
      onError('Ingresa RUT y razón social para probar.');
      return;
    }
    setIsTesting(true);
    try {
      const res = await apiClient.post<TestResult>('/api/category-rules/test', {
        rut: rut.trim(),
        razonSocial: razonSocial.trim(),
        movementType,
      });
      setResult(res);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al probar regla');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <section className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-sm mb-6">
      <header className="px-5 py-4 border-b border-[var(--border-color)] flex items-center gap-3">
        <div className="p-2 rounded-lg bg-purple-50">
          <Sparkles size={18} className="text-purple-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Probar reglas</p>
          <p className="text-xs text-[var(--text-secondary)]" style={{ fontWeight: 300 }}>
            Verifica qué regla se aplicaría a una contraparte
          </p>
        </div>
      </header>
      <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1 font-medium">RUT</label>
          <input
            value={rut}
            onChange={(e) => setRut(e.target.value)}
            placeholder="76.123.456-7"
            className="w-full px-3 py-2 text-sm border border-[var(--border-color)] rounded-lg"
            style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1 font-medium">
            Razón social
          </label>
          <input
            value={razonSocial}
            onChange={(e) => setRazonSocial(e.target.value)}
            placeholder="AGUAS HORIZONTE SPA"
            className="w-full px-3 py-2 text-sm border border-[var(--border-color)] rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1 font-medium">
            Tipo
          </label>
          <select
            value={movementType}
            onChange={(e) => setMovementType(e.target.value as CategoryType)}
            className="w-full px-3 py-2 text-sm border border-[var(--border-color)] rounded-lg"
          >
            <option value="INCOME">Ingreso</option>
            <option value="EXPENSE">Egreso</option>
          </select>
        </div>
        <button
          onClick={test}
          disabled={isTesting}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {isTesting ? 'Probando...' : 'Probar'}
        </button>
      </div>
      {result && (
        <div className="px-5 pb-5">
          {result.matchedRule ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
              <CheckCircle size={16} className="text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-900">
                  Regla aplicada: {result.matchedRule.name}
                </p>
                <p className="text-xs text-green-700 mt-0.5">
                  Categoría: {result.categoryName ?? '—'} · Prioridad {result.matchedRule.priority}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
              <TagIcon size={16} className="text-yellow-700 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-900">
                  Sin coincidencia → categoría por defecto
                </p>
                <p className="text-xs text-yellow-700 mt-0.5">
                  El movimiento se asignará a &quot;
                  {movementType === 'INCOME' ? 'Ingresos por Ventas' : 'Productos no categorizados'}
                  &quot;.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ───────────────────────── Modal ─────────────────────────

function RuleModal({
  mode,
  initial,
  categories,
  onClose,
  onSaved,
  onError,
}: {
  mode: 'create' | 'edit';
  initial: CategoryRule | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<RuleDraft>(() => {
    if (initial) {
      return {
        name: initial.name,
        ruleType: initial.ruleType === 'KEYWORD' ? 'KEYWORD' : 'RUT',
        matchValue: initial.matchValue ?? '',
        movementType: initial.movementType,
        categoryId: initial.categoryId,
        priority: initial.priority,
        isActive: initial.isActive,
      };
    }
    return DEFAULT_DRAFT;
  });
  const [isSaving, setIsSaving] = useState(false);

  // Category options must match the rule's movementType — INCOME and BOTH
  // pull from INCOME categories, EXPENSE from EXPENSE; for BOTH we union
  // both so the user can choose either side.
  const categoryOptions = useMemo(() => {
    if (draft.movementType === 'INCOME') {
      return categories.filter((c) => c.type === 'INCOME' && c.isActive);
    }
    if (draft.movementType === 'EXPENSE') {
      return categories.filter((c) => c.type === 'EXPENSE' && c.isActive);
    }
    return categories.filter((c) => c.isActive);
  }, [categories, draft.movementType]);

  const handleSave = async () => {
    if (!draft.name.trim()) {
      onError('El nombre es obligatorio.');
      return;
    }
    if (!draft.matchValue.trim()) {
      onError(
        draft.ruleType === 'RUT'
          ? 'Ingresa el RUT a coincidir.'
          : 'Ingresa la palabra clave a buscar.',
      );
      return;
    }
    if (!draft.categoryId) {
      onError('Selecciona una categoría.');
      return;
    }

    setIsSaving(true);
    try {
      const body = {
        name: draft.name.trim(),
        ruleType: draft.ruleType,
        matchValue: draft.matchValue.trim(),
        categoryId: draft.categoryId,
        movementType: draft.movementType,
        priority: Number(draft.priority) || 0,
        isActive: draft.isActive,
      };
      if (mode === 'edit' && initial) {
        await apiClient.patch(`/api/category-rules/${initial.id}`, body);
      } else {
        await apiClient.post('/api/category-rules', body);
      }
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al guardar regla');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-lg max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">
            {mode === 'edit' ? 'Editar regla' : 'Nueva regla'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <Field label="Nombre de la regla">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Ej: Aguas Horizonte → Cliente"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
              maxLength={200}
            />
          </Field>

          <Field label="Tipo de regla">
            <div className="flex gap-2">
              {(['RUT', 'KEYWORD'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDraft({ ...draft, ruleType: t })}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg border transition ${
                    draft.ruleType === t
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {t === 'RUT' ? 'Por RUT' : 'Por palabra clave'}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label={
              draft.ruleType === 'RUT' ? 'RUT de la contraparte' : 'Palabra clave en razón social'
            }
            help={
              draft.ruleType === 'RUT'
                ? 'Formato: XX.XXX.XXX-X'
                : 'Ejemplo: ARRIENDO, SERVICIOS, etc.'
            }
          >
            <input
              value={draft.matchValue}
              onChange={(e) => setDraft({ ...draft, matchValue: e.target.value })}
              placeholder={draft.ruleType === 'RUT' ? '76.123.456-7' : 'ARRIENDO'}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
              style={
                draft.ruleType === 'RUT'
                  ? { fontFamily: 'var(--font-jetbrains-mono), monospace' }
                  : undefined
              }
              maxLength={200}
            />
          </Field>

          <Field label="Tipo de movimiento">
            <div className="flex gap-2">
              {(['INCOME', 'EXPENSE', 'BOTH'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      movementType: t,
                      // Reset category when scope changes — old selection may
                      // belong to the wrong type.
                      categoryId: '',
                    })
                  }
                  className={`flex-1 px-3 py-2 text-sm rounded-lg border transition ${
                    draft.movementType === t
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {MOVEMENT_LABEL[t]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Categoría">
            <select
              value={draft.categoryId}
              onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
            >
              <option value="">Selecciona una categoría</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type === 'INCOME' ? 'Ingreso' : 'Egreso'})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Prioridad" help="Número mayor = se aplica primero">
            <input
              type="number"
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
            />
            Activa
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {isSaving ? 'Guardando...' : 'Guardar regla'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1.5 font-medium">{label}</label>
      {children}
      {help && <p className="mt-1 text-[11px] text-gray-400">{help}</p>}
    </div>
  );
}
