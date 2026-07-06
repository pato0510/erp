'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { LOST_REASONS, LOST_REASON_LABELS, type LostReason } from './stageLabels';

/* COM-007 — the "marcar Perdida" modal. Collects the LostReason (required) and an
   optional detail — required ONLY when the reason is OTRO. The modal enforces that
   rule client-side, but the backend 400 is the final word (COM-005 rejects PERDIDA
   without a reason, and OTRO without detail). CANCELLING reverts the optimistic move
   in the caller — nothing persists. */
export function LostReasonModal({
  opportunityName,
  onCancel,
  onConfirm,
}: {
  opportunityName: string;
  onCancel: () => void;
  onConfirm: (lostReason: LostReason, lostReasonDetail?: string) => Promise<void> | void;
}) {
  const [reason, setReason] = useState<LostReason>('PRECIO');
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (reason === 'OTRO' && !detail.trim()) {
      setErr('Con motivo “Otro” debes detallar el motivo.');
      return;
    }
    setErr(null);
    setSubmitting(true);
    try {
      await onConfirm(reason, detail.trim() || undefined);
    } finally {
      // The caller closes the modal on success; on failure it reverts + surfaces the
      // backend message via its own toast, so just re-enable the button here.
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            Marcar como perdida
          </h2>
          <button
            onClick={onCancel}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-sm text-[var(--text-secondary)]">{opportunityName}</p>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Motivo
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as LostReason)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {LOST_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Detalle {reason === 'OTRO' ? '(obligatorio)' : '(opcional)'}
            </label>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
              placeholder={
                reason === 'OTRO' ? 'Describe el motivo…' : 'Contexto adicional (opcional)'
              }
            />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-5 py-4">
          <button
            onClick={onCancel}
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)]"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: '#b91c1c' }}
          >
            {submitting ? 'Guardando…' : 'Marcar perdida'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LostReasonModal;
