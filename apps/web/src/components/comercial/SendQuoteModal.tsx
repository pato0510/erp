'use client';

import { useState } from 'react';
import { Send, X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';

/* COM-011 — the "Enviar" mini-modal, shown ONLY when a draft has no validUntil yet, so
   the user isn't bounced away to hunt for the field. It sets validUntil then sends in
   two backend calls; any 4xx is relayed. (When validUntil already exists the parent
   just confirms + sends directly, no modal.) Sending makes the quote immutable. */
export function SendQuoteModal({
  quoteId,
  quoteNumber,
  onCancel,
  onSent,
}: {
  quoteId: string;
  quoteNumber: string;
  onCancel: () => void;
  onSent: () => void;
}) {
  const [validUntil, setValidUntil] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const today = (() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();

  const submit = async () => {
    if (!validUntil) {
      setErr('Indica hasta cuándo es válida la cotización.');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await apiClient.patch(`/api/comercial/quotes/${quoteId}`, { validUntil });
      await apiClient.patch(`/api/comercial/quotes/${quoteId}/status`, { status: 'ENVIADA' });
      onSent();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo enviar la cotización.');
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
            Enviar {quoteNumber}
          </h2>
          <button
            onClick={onCancel}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Indica hasta cuándo es válida. Una vez enviada, la cotización queda inmutable.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Válida hasta
            </label>
            <input
              type="date"
              min={today}
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
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
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: '#2563eb' }}
          >
            <Send size={14} /> {submitting ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SendQuoteModal;
