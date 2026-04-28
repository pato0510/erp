'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { ASSET_STATUS_LABELS, AssetStatusBadge, type AssetStatus } from './AssetStatusBadge';

const STATUS_OPTIONS: AssetStatus[] = [
  'OPERATIONAL',
  'WITH_OBSERVATIONS',
  'NON_OPERATIONAL',
  'IN_MAINTENANCE',
  'BLOCKED_DOCUMENTAL',
  'BLOCKED_PERMIT',
  'OUT_OF_SERVICE',
  'DECOMMISSIONED',
];

interface Props {
  currentStatus: AssetStatus;
  onClose: () => void;
  onSave: (status: AssetStatus, statusReason: string | undefined) => Promise<void> | void;
}

export function StatusChangeModal({ currentStatus, onClose, onSave }: Props) {
  const [status, setStatus] = useState<AssetStatus>(currentStatus);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonRequired = status !== 'OPERATIONAL' && status !== currentStatus;
  const noChange = status === currentStatus;

  const submit = async () => {
    setError(null);
    if (noChange) return setError('Selecciona un estado distinto al actual.');
    if (reasonRequired && !reason.trim()) {
      return setError('Debes indicar la razón del cambio para este estado.');
    }
    setSubmitting(true);
    try {
      await onSave(status, reason.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)]">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            Cambiar estado del activo
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label
              className="block mb-1.5 text-[var(--text-secondary)]"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                fontSize: 13,
              }}
            >
              Estado actual
            </label>
            <AssetStatusBadge status={currentStatus} />
          </div>

          <div>
            <label
              className="block mb-1.5 text-[var(--text-secondary)]"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                fontSize: 13,
              }}
            >
              Nuevo estado <span className="text-red-500">*</span>
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as AssetStatus)}
              className="cp-input"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {ASSET_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className="block mb-1.5 text-[var(--text-secondary)]"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                fontSize: 13,
              }}
            >
              Razón del cambio
              {reasonRequired && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="cp-input"
              placeholder={
                reasonRequired
                  ? 'Explica por qué el activo cambia a este estado'
                  : 'Opcional — agrega contexto si lo deseas'
              }
            />
            {reasonRequired && (
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Obligatorio cuando el activo deja de estar operativo.
              </p>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting || noChange}
            className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            {submitting ? 'Guardando...' : 'Guardar cambio'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StatusChangeModal;
