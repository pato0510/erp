'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, type ActivityType } from './activityLabels';

/* COM-008 — register / edit a manual activity. Two scopes:
   - 'account': accountId is fixed; an OPTIONAL opportunity select (scoped to that
     account's opportunities) links the entry to a deal.
   - 'opportunity': opportunityId is fixed and the account is DERIVED by the backend —
     no account/opportunity pickers (never asked twice).
   activityDate is a datetime-local defaulting to now. */

export interface ActivityForForm {
  id: string;
  type: string;
  subject: string;
  detail: string | null;
  activityDate: string;
  opportunityId: string | null;
}
export interface OpportunityOption {
  id: string;
  name: string;
}

const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

export function ActivityFormModal({
  scope,
  accountId,
  opportunityId,
  opportunities = [],
  editing,
  onClose,
  onSaved,
}: {
  scope: 'account' | 'opportunity';
  accountId?: string;
  opportunityId?: string;
  opportunities?: OpportunityOption[];
  editing?: ActivityForForm | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<ActivityType>((editing?.type as ActivityType) ?? 'LLAMADA');
  const [subject, setSubject] = useState(editing?.subject ?? '');
  const [detail, setDetail] = useState(editing?.detail ?? '');
  const [activityDate, setActivityDate] = useState(
    editing?.activityDate
      ? toLocalInputValue(new Date(editing.activityDate))
      : toLocalInputValue(new Date()),
  );
  const [linkedOpp, setLinkedOpp] = useState(editing?.opportunityId ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!subject.trim()) {
      setErr('El asunto es obligatorio.');
      return;
    }
    setSaving(true);
    setErr(null);
    const isoDate = new Date(activityDate).toISOString();
    try {
      if (editing) {
        const body: Record<string, unknown> = {
          type,
          subject: subject.trim(),
          detail: detail.trim() || undefined,
          activityDate: isoDate,
        };
        // Only the account-scope modal can change the opportunity link (incl. unlink).
        if (scope === 'account') body.opportunityId = linkedOpp || null;
        await apiClient.patch(`/api/comercial/activities/${editing.id}`, body);
      } else {
        const body: Record<string, unknown> = {
          type,
          subject: subject.trim(),
          detail: detail.trim() || undefined,
          activityDate: isoDate,
        };
        if (scope === 'opportunity') body.opportunityId = opportunityId;
        else {
          body.accountId = accountId;
          if (linkedOpp) body.opportunityId = linkedOpp;
        }
        await apiClient.post('/api/comercial/activities', body);
      }
      onSaved();
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? e.status === 403
            ? 'No tienes permiso para esta acción.'
            : e.message
          : 'No se pudo guardar la actividad.',
      );
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
            {editing ? 'Editar actividad' : 'Registrar actividad'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tipo">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ActivityType)}
                className={INPUT}
              >
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACTIVITY_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha">
              <input
                type="datetime-local"
                value={activityDate}
                onChange={(e) => setActivityDate(e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>
          <Field label="Asunto">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={INPUT}
              placeholder="Ej. Llamada con jefe de operaciones"
            />
          </Field>
          <Field label="Detalle">
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={4}
              className={INPUT}
              placeholder="Notas de la interacción (opcional)"
            />
          </Field>
          {scope === 'account' && (
            <Field label="Oportunidad vinculada (opcional)">
              <select
                value={linkedOpp}
                onChange={(e) => setLinkedOpp(e.target.value)}
                className={INPUT}
              >
                <option value="">Sin vincular</option>
                {opportunities.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

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
            {saving ? 'Guardando…' : editing ? 'Guardar' : 'Registrar'}
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

export default ActivityFormModal;
