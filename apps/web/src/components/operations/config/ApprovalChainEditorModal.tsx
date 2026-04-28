'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { apiClient } from '../../../lib/api';

export interface ChainStepRow {
  id?: string;
  stepOrder: number;
  name: string;
  description?: string | null;
  requiredRoles: string[];
  requiresSpecificUserId?: string | null;
  mustBeDifferentFromRequester: boolean;
  mustBeDifferentFromPreviousApprovers: boolean;
  isOptional: boolean;
}

interface Props {
  /* Exactly one of the following two is set; the caller picks. */
  workPermitTypeId?: string;
  permitTypeId?: string;
  targetLabel: string;
  initialSteps: ChainStepRow[];
  onClose: () => void;
  onSaved: () => void;
}

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

const ROLE_OPTIONS = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'MANAGER', label: 'Gerente' },
  { value: 'ACCOUNTANT', label: 'Contador' },
  { value: 'ANALYST', label: 'Analista' },
];

/* OPS-026 — modal for editing the multi-step approval chain of a
   single PermitType or WorkPermitType. Persists by diffing the
   submitted list against the initial server state: existing steps
   PATCH, new ones POST, removed ones DELETE. Reorder is handled in
   one /reorder call for symmetry. */
export function ApprovalChainEditorModal({
  workPermitTypeId,
  permitTypeId,
  targetLabel,
  initialSteps,
  onClose,
  onSaved,
}: Props) {
  const [steps, setSteps] = useState<ChainStepRow[]>(() =>
    initialSteps
      .map((s) => ({ ...s, requiredRoles: [...s.requiredRoles] }))
      .sort((a, b) => a.stepOrder - b.stepOrder),
  );
  const [users, setUsers] = useState<UserOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<UserOption[]>('/api/users')
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  const updateStep = (idx: number, patch: Partial<ChainStepRow>) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const toggleRole = (idx: number, role: string) => {
    setSteps((prev) =>
      prev.map((s, i) =>
        i === idx
          ? {
              ...s,
              requiredRoles: s.requiredRoles.includes(role)
                ? s.requiredRoles.filter((r) => r !== role)
                : [...s.requiredRoles, role],
            }
          : s,
      ),
    );
  };

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        stepOrder: prev.length + 1,
        name: '',
        requiredRoles: ['MANAGER'],
        mustBeDifferentFromRequester: true,
        mustBeDifferentFromPreviousApprovers: true,
        isOptional: false,
      },
    ]);
  };

  const removeStep = (idx: number) => {
    setSteps((prev) =>
      prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stepOrder: i + 1 })),
    );
  };

  const moveStep = (idx: number, direction: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const swap = idx + direction;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((s, i) => ({ ...s, stepOrder: i + 1 }));
    });
  };

  const submit = async () => {
    setError(null);
    if (steps.length === 0) {
      setError('Define al menos un paso o elimina la cadena desde el listado.');
      return;
    }
    for (const s of steps) {
      if (!s.name.trim()) {
        setError('Cada paso requiere un nombre.');
        return;
      }
      if (s.requiredRoles.length === 0 && !s.requiresSpecificUserId) {
        setError(`El paso "${s.name}" debe tener al menos un rol o un usuario específico.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const initialIds = new Set(initialSteps.map((s) => s.id).filter(Boolean) as string[]);
      const submittedIds = new Set(steps.map((s) => s.id).filter(Boolean) as string[]);

      /* DELETE removed steps. */
      for (const oldId of initialIds) {
        if (!submittedIds.has(oldId)) {
          await apiClient.delete(`/api/operations/approval-steps/${oldId}`);
        }
      }
      /* POST new ones, PATCH existing ones. */
      for (const s of steps) {
        const payload = {
          ...(workPermitTypeId ? { workPermitTypeId } : {}),
          ...(permitTypeId ? { permitTypeId } : {}),
          stepOrder: s.stepOrder,
          name: s.name.trim(),
          description: s.description?.trim() || undefined,
          requiredRoles: s.requiredRoles,
          requiresSpecificUserId: s.requiresSpecificUserId || undefined,
          mustBeDifferentFromRequester: s.mustBeDifferentFromRequester,
          mustBeDifferentFromPreviousApprovers: s.mustBeDifferentFromPreviousApprovers,
          isOptional: s.isOptional,
        };
        if (s.id) {
          await apiClient.patch(`/api/operations/approval-steps/${s.id}`, payload);
        } else {
          await apiClient.post('/api/operations/approval-steps', payload);
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la cadena.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-card)] z-10">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            Cadena de aprobación · {targetLabel}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {steps.map((s, idx) => (
            <div
              key={idx}
              className="p-3 rounded-lg"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-xs uppercase tracking-wider text-[var(--text-secondary)]"
                  style={{
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    letterSpacing: '0.12em',
                  }}
                >
                  Paso {s.stepOrder}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => moveStep(idx, -1)}
                    disabled={idx === 0}
                    className="px-2 py-0.5 rounded text-xs border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveStep(idx, 1)}
                    disabled={idx === steps.length - 1}
                    className="px-2 py-0.5 rounded text-xs border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeStep(idx)}
                    className="px-2 py-0.5 rounded text-xs text-red-600 hover:bg-red-50"
                    title="Eliminar paso"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <input
                value={s.name}
                onChange={(e) => updateStep(idx, { name: e.target.value })}
                placeholder="Ej: Autorización Supervisor"
                className="cp-input mb-2"
              />

              <div className="text-xs text-[var(--text-secondary)] mb-1">Roles autorizadores</div>
              <div className="flex flex-wrap gap-2 mb-2">
                {ROLE_OPTIONS.map((r) => (
                  <label
                    key={r.value}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs cursor-pointer"
                    style={{
                      background: s.requiredRoles.includes(r.value)
                        ? 'rgba(37, 99, 235, 0.12)'
                        : 'transparent',
                      color: s.requiredRoles.includes(r.value)
                        ? '#1d4ed8'
                        : 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={s.requiredRoles.includes(r.value)}
                      onChange={() => toggleRole(idx, r.value)}
                      className="hidden"
                    />
                    {r.label}
                  </label>
                ))}
              </div>

              <div className="text-xs text-[var(--text-secondary)] mb-1">
                Usuario específico (opcional)
              </div>
              <select
                value={s.requiresSpecificUserId ?? ''}
                onChange={(e) =>
                  updateStep(idx, { requiresSpecificUserId: e.target.value || null })
                }
                className="cp-input mb-2"
              >
                <option value="">— Sin usuario específico —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} · {u.email}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={s.mustBeDifferentFromRequester}
                    onChange={(e) =>
                      updateStep(idx, { mustBeDifferentFromRequester: e.target.checked })
                    }
                  />
                  Debe ser distinto del solicitante
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={s.mustBeDifferentFromPreviousApprovers}
                    onChange={(e) =>
                      updateStep(idx, {
                        mustBeDifferentFromPreviousApprovers: e.target.checked,
                      })
                    }
                  />
                  Debe ser distinto de aprobadores previos
                </label>
              </div>
            </div>
          ))}
          <button
            onClick={addStep}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-full border border-gray-300 hover:bg-gray-50"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            <Plus size={12} /> Agregar paso
          </button>
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
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
            style={{ background: '#2563EB', fontWeight: 600 }}
          >
            {submitting ? 'Guardando...' : 'Guardar cadena'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ApprovalChainEditorModal;
