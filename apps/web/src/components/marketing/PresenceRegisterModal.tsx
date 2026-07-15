'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';

/* MKT-009 — "Registrar datos del mes". A month picker + the three nullable metrics +
 * notes. UPSERT-UX: when the selected month already has a snapshot, the form PRE-FILLS
 * with its values BEFORE any save — this is what makes the backend's full-replace
 * semantics safe (you never blank a metric you didn't mean to). The backend's Spanish
 * 400 (e.g. the at-least-one-metric rule) is surfaced VERBATIM; we do NOT pre-validate
 * that rule client-side. */

export interface PresenceSnapshot {
  period: string; // ISO, UTC-anchored first-of-month
  webVisits: number | null;
  linkedinFollowers: number | null;
  googleProfileViews: number | null;
  notes: string | null;
}

const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

function currentMonth(): string {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function PresenceRegisterModal({
  snapshots,
  onClose,
  onSaved,
}: {
  snapshots: PresenceSnapshot[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [month, setMonth] = useState(currentMonth());
  const [web, setWeb] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [google, setGoogle] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Pre-fill from the existing snapshot for the selected month (empty if none exists).
  useEffect(() => {
    const s = snapshots.find((x) => x.period.slice(0, 7) === month) ?? null;
    setWeb(s?.webVisits != null ? String(s.webVisits) : '');
    setLinkedin(s?.linkedinFollowers != null ? String(s.linkedinFollowers) : '');
    setGoogle(s?.googleProfileViews != null ? String(s.googleProfileViews) : '');
    setNotes(s?.notes ?? '');
    setErr(null);
  }, [month, snapshots]);

  const save = async () => {
    setSaving(true);
    setErr(null);
    const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
    const body = {
      period: month,
      webVisits: num(web),
      linkedinFollowers: num(linkedin),
      googleProfileViews: num(google),
      notes: notes.trim() || undefined,
    };
    try {
      await apiClient.put('/api/marketing/presence', body);
      onSaved();
    } catch (e) {
      // Surface the backend's Spanish message verbatim (e.g. at-least-one-metric).
      setErr(e instanceof ApiError ? e.message : 'No se pudieron guardar los datos.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            Registrar datos del mes
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <Field label="Mes">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className={INPUT}
            />
          </Field>
          <Field label="Visitas al sitio web">
            <input
              type="number"
              min={0}
              step={1}
              value={web}
              onChange={(e) => setWeb(e.target.value)}
              className={INPUT}
              placeholder="Ej. 1240"
            />
          </Field>
          <Field label="Seguidores en LinkedIn">
            <input
              type="number"
              min={0}
              step={1}
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              className={INPUT}
              placeholder="Ej. 890"
            />
          </Field>
          <Field label="Vistas perfil de Google">
            <input
              type="number"
              min={0}
              step={1}
              value={google}
              onChange={(e) => setGoogle(e.target.value)}
              className={INPUT}
              placeholder="Ej. 312"
            />
          </Field>
          <Field label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={INPUT}
            />
          </Field>

          <p className="text-xs text-[var(--text-secondary)]">
            Carga manual mensual — sin conexión automática en V1.
          </p>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)]"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: '#2563eb' }}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </label>
      {children}
    </div>
  );
}

export default PresenceRegisterModal;
