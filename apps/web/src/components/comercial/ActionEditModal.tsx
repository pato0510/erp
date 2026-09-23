'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { santiagoDate } from '../../lib/dates';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, type ActivityType } from './activityLabels';

/* COM-026 — edit one manual commercial action (replaces COM-008's ActivityFormModal;
 * creating never goes through a modal anymore — ActionList's inline form does it).
 * PATCH /comercial/activities/:id with ONLY the fields that changed; status never
 * travels here (PATCH /:id/status is ActionList's checkbox). The date is a civil date
 * (type="date") prefilled with the Santiago day of activityDate and sent as YYYY-MM-DD
 * — the api pins it to that civil day in Santiago. Account scope also edits the
 * opportunity link («Solo la cuenta» = null, which unlinks). Escape closes, Tab cycles
 * inside, focus starts in the first field and returns to the opener on close. */

export interface ActionForEdit {
  id: string;
  type: string;
  subject: string;
  detail: string | null;
  activityDate: string;
  opportunityId: string | null;
}

export interface ActionOpportunityOption {
  id: string;
  label: string;
}

const INPUT =
  'w-full rounded-lg border border-line bg-input px-3 py-2 text-sm text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
const LABEL = 'mb-1 block text-xs font-medium text-fg-secondary';
const NO_OPPORTUNITY = '__none__';

export function ActionEditModal({
  action,
  scope,
  opportunities = [],
  onClose,
  onSaved,
}: {
  action: ActionForEdit;
  scope: 'opportunity' | 'account';
  opportunities?: ActionOpportunityOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const uid = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstRef = useRef<HTMLSelectElement | null>(null);
  const initialDate = santiagoDate(action.activityDate);
  const initialOpp = action.opportunityId ?? NO_OPPORTUNITY;

  const [type, setType] = useState<ActivityType>(action.type as ActivityType);
  const [subject, setSubject] = useState(action.subject);
  const [detail, setDetail] = useState(action.detail ?? '');
  const [date, setDate] = useState(initialDate);
  const [opp, setOpp] = useState(initialOpp);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Focus the first field on open; hand focus back to whatever opened us on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    firstRef.current?.focus();
    return () => {
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    const trimmed = subject.trim();
    if (!trimmed) {
      setErr('Escribe una descripción de la acción');
      return;
    }
    if (!date) {
      setErr('Elige la fecha de la acción');
      return;
    }
    const body: Record<string, unknown> = {};
    if (type !== action.type) body.type = type;
    if (trimmed !== action.subject) body.subject = trimmed;
    if (detail.trim() !== (action.detail ?? '').trim()) body.detail = detail.trim();
    if (date !== initialDate) body.activityDate = date;
    if (scope === 'account' && opp !== initialOpp)
      body.opportunityId = opp === NO_OPPORTUNITY ? null : opp;
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await apiClient.patch(`/api/comercial/activities/${action.id}`, body);
      onSaved();
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? e.status === 403
            ? 'No tienes permiso para hacer esto.'
            : e.message
          : 'No se pudo guardar la acción.',
      );
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-card-solid shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2
            id={`${uid}-title`}
            className="text-lg font-semibold text-fg"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            Editar acción
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md text-fg-secondary hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <form
          className="space-y-4 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${uid}-type`} className={LABEL}>
                Tipo
              </label>
              <select
                id={`${uid}-type`}
                ref={firstRef}
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
            </div>
            <div>
              <label htmlFor={`${uid}-date`} className={LABEL}>
                Fecha
              </label>
              <input
                id={`${uid}-date`}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={INPUT}
              />
            </div>
          </div>
          <div>
            <label htmlFor={`${uid}-subject`} className={LABEL}>
              Descripción
            </label>
            <input
              id={`${uid}-subject`}
              value={subject}
              maxLength={200}
              onChange={(e) => setSubject(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-detail`} className={LABEL}>
              Detalle (opcional)
            </label>
            <textarea
              id={`${uid}-detail`}
              value={detail}
              maxLength={4000}
              onChange={(e) => setDetail(e.target.value)}
              rows={4}
              className={INPUT}
            />
          </div>
          {scope === 'account' && (
            <div>
              <label htmlFor={`${uid}-opp`} className={LABEL}>
                Oportunidad
              </label>
              <select
                id={`${uid}-opp`}
                value={opp}
                onChange={(e) => setOpp(e.target.value)}
                className={INPUT}
              >
                {opportunities.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
                <option value={NO_OPPORTUNITY}>Solo la cuenta (sin oportunidad)</option>
              </select>
            </div>
          )}

          {err && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {err}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line px-4 py-2 text-sm text-fg-secondary hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ActionEditModal;
