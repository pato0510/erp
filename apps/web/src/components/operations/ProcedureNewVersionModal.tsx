'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';
import { ProcedureFormModal, type ProcedureInitialValues } from './ProcedureFormModal';

interface SourceProcedure {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  category:
    | 'OPERATION'
    | 'MAINTENANCE'
    | 'EMERGENCY'
    | 'SAFETY'
    | 'QUALITY'
    | 'ENVIRONMENTAL'
    | 'OTHER';
  version: string;
  keywords: string[];
  scope?: string | null;
  estimatedReadingMinutes?: number | null;
  requiresAcknowledgment: boolean;
  acknowledgmentDeadlineDays?: number | null;
  applicableAssetIds: string[];
  applicableAssetTypeIds: string[];
  applicableLocationIds: string[];
  applicableRoles: string[];
}

interface Props {
  sourceProcedureId: string;
  onClose: () => void;
  onSaved: () => void;
}

/* OPS-027 — bridges the ProcedureFormModal to the new-version flow.
   Pre-loads the source procedure, suggests the next semantic
   version, and locks the code. */
export function ProcedureNewVersionModal({ sourceProcedureId, onClose, onSaved }: Props) {
  const [source, setSource] = useState<SourceProcedure | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiClient
      .get<SourceProcedure>(`/api/operations/procedures/${sourceProcedureId}`)
      .then((p) => {
        if (alive) setSource(p);
      })
      .catch((err) => {
        if (alive) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el procedimiento.');
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [sourceProcedureId]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-[var(--bg-card)] rounded-xl shadow-xl p-6 text-sm">
          Cargando procedimiento origen...
        </div>
      </div>
    );
  }
  if (error || !source) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-[var(--bg-card)] rounded-xl shadow-xl p-6 text-sm">
          <p className="text-red-600 mb-3">{error ?? 'Error desconocido.'}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-full"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const initialValues: ProcedureInitialValues = {
    code: source.code,
    title: source.title,
    description: source.description,
    category: source.category,
    version: bumpVersion(source.version),
    changelog: '',
    keywords: source.keywords,
    scope: source.scope,
    estimatedReadingMinutes: source.estimatedReadingMinutes,
    requiresAcknowledgment: source.requiresAcknowledgment,
    acknowledgmentDeadlineDays: source.acknowledgmentDeadlineDays,
    applicableAssetIds: source.applicableAssetIds,
    applicableAssetTypeIds: source.applicableAssetTypeIds,
    applicableLocationIds: source.applicableLocationIds,
    applicableRoles: source.applicableRoles,
  };

  return (
    <ProcedureFormModal
      mode="new-version"
      sourceProcedureId={sourceProcedureId}
      initialValues={initialValues}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

/* Naïve semantic-ish version bumper. "1.0" → "2.0", "2.1" → "2.2",
   anything non-numeric falls back to appending ".1". */
function bumpVersion(current: string): string {
  const parts = current.split('.');
  if (parts.length === 0) return `${current}.1`;
  if (parts.length === 1) {
    const n = Number(parts[0]);
    if (Number.isFinite(n)) return String(n + 1);
    return `${current}.1`;
  }
  /* Bump the last segment if numeric, else add a new minor. */
  const last = parts[parts.length - 1];
  const lastN = Number(last);
  if (Number.isFinite(lastN)) {
    parts[parts.length - 1] = String(lastN + 1);
    return parts.join('.');
  }
  return `${current}.1`;
}

export default ProcedureNewVersionModal;
