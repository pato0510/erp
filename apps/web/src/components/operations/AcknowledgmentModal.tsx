'use client';

import { useState } from 'react';
import { CheckCircle2, ShieldCheck, X } from 'lucide-react';
import { apiClient } from '../../lib/api';

interface ProcedureSummary {
  id: string;
  code: string;
  title: string;
  version: string;
}

interface Props {
  procedure: ProcedureSummary;
  onClose: () => void;
  onAcknowledged: () => void;
}

/* OPS-028 — declaration-style acknowledgment modal. The user must
   tick the confirmation checkbox before the action button enables.
   The backend captures IP + user agent + signature hash; the
   footer surfaces that to the user so they understand what's
   being recorded. */
export function AcknowledgmentModal({ procedure, onClose, onAcknowledged }: Props) {
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!confirmed) {
      setError('Debes confirmar la declaración antes de continuar.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post(
        `/api/operations/acknowledgments/${procedure.id}/acknowledge`,
        notes.trim() ? { notes: notes.trim() } : {},
      );
      onAcknowledged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el acuse.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)]">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Acuse de lectura</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div
            className="p-3 rounded-lg"
            style={{
              background: 'rgba(37, 99, 235, 0.08)',
              border: '1px solid rgba(37, 99, 235, 0.2)',
            }}
          >
            <div
              className="text-xs uppercase tracking-wider text-[var(--text-secondary)] mb-1"
              style={{
                fontFamily: 'var(--font-ibm-plex-mono), monospace',
                letterSpacing: '0.18em',
              }}
            >
              {procedure.code} · v{procedure.version}
            </div>
            <div
              className="text-base text-[var(--text-primary)]"
              style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 600 }}
            >
              {procedure.title}
            </div>
          </div>

          <p
            className="text-sm leading-relaxed text-[var(--text-primary)] p-3 rounded-lg"
            style={{
              background: 'var(--input-bg)',
              border: '1px solid var(--border-color)',
              fontFamily: 'var(--font-outfit), sans-serif',
            }}
          >
            Declaro que he leído y entendido el procedimiento <strong>"{procedure.title}"</strong>{' '}
            versión <strong>{procedure.version}</strong>, y me comprometo a aplicarlo en mis
            labores.
          </p>

          <label className="block">
            <span className="block text-xs text-[var(--text-secondary)] mb-1">
              Comentarios o consultas (opcional)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="cp-input"
              placeholder="Si tienes alguna duda o sugerencia sobre el procedimiento..."
            />
          </label>

          <label className="flex items-start gap-2 cursor-pointer p-3 rounded-lg border border-[var(--border-color)] hover:bg-[var(--input-bg)]">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            <span
              className="text-sm text-[var(--text-primary)]"
              style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
            >
              Confirmo la declaración anterior.
            </span>
          </label>

          <div
            className="text-xs text-[var(--text-muted)] flex items-center gap-1.5"
            style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
          >
            <ShieldCheck size={12} />
            <span>
              Esta acción quedará registrada con tu identidad, fecha/hora, dirección IP y firma
              digital SHA-256.
            </span>
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
            disabled={submitting}
            className="px-4 py-2 text-sm border border-gray-300 rounded-full"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!confirmed || submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
            style={{
              background: '#22C55E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={14} />
            {submitting ? 'Registrando...' : 'Confirmar acuse'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AcknowledgmentModal;
