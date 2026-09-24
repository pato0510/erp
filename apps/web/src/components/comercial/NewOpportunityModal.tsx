'use client';

import { useMembers } from '../../hooks/useMembers';

import { useState } from 'react';
import { X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import {
  ACTIVE_STAGES,
  PROBABILITY_OPTIONS,
  STAGE_LABELS,
  stageRequires,
  type OpportunityStage,
} from './stageLabels';

/* COM-007 — create an opportunity from the pipeline board. Mirrors the
   AccountFormModal overlay shell. accountId is required.
   COM-027 — «Etapa inicial»: one of the five active stages (default Prospecto; the api
   creates there). The fields the chosen stage requires (static mirror of COM-023,
   stageRequires) are marked required; the api validates and its 400 shows inside the
   modal. Probability is a select: «Por defecto de la etapa» sends nothing (the api
   applies the stage's configured default) or 0, 10 … 100. */

export interface AccountOption {
  id: string;
  name: string;
}

const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

export function NewOpportunityModal({
  accounts,
  onClose,
  onCreated,
}: {
  accounts: AccountOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { members, isLoading: membersLoading } = useMembers('active');
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [stage, setStage] = useState<OpportunityStage>('PROSPECTO');
  const [probability, setProbability] = useState(''); // '' = the stage's default
  const [ownerId, setOwnerId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const req = stageRequires(stage);

  const save = async () => {
    if (!name.trim()) {
      setErr('El nombre es obligatorio.');
      return;
    }
    if (!accountId) {
      setErr('Debes seleccionar una cuenta.');
      return;
    }
    setSaving(true);
    setErr(null);
    const body: Record<string, unknown> = { name: name.trim(), accountId, stage };
    if (estimatedValue.trim() !== '') body.estimatedValue = Number(estimatedValue);
    if (expectedCloseDate) body.expectedCloseDate = expectedCloseDate;
    if (probability !== '') body.probability = Number(probability);
    if (ownerId) body.ownerId = ownerId;
    if (notes.trim()) body.notes = notes.trim();
    try {
      await apiClient.post('/api/comercial/opportunities', body);
      onCreated();
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? e.status === 403
            ? 'No tienes permiso para crear oportunidades.'
            : e.message
          : 'No se pudo crear la oportunidad.',
      );
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-card-solid shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            Nueva oportunidad
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <Field label="Nombre">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
              placeholder="Ej. Servicio de aseo faena norte"
            />
          </Field>
          <Field label="Cuenta">
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className={INPUT}
            >
              <option value="">Seleccionar cuenta…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Etapa inicial" htmlFor="new-opp-stage">
            <select
              id="new-opp-stage"
              value={stage}
              onChange={(e) => setStage(e.target.value as OpportunityStage)}
              className={INPUT}
            >
              {ACTIVE_STAGES.map((st) => (
                <option key={st} value={st}>
                  {STAGE_LABELS[st]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Valor estimado (CLP)" htmlFor="new-opp-value" required={req.value}>
              <input
                id="new-opp-value"
                type="number"
                min={0}
                step={1}
                aria-required={req.value || undefined}
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
                className={INPUT}
                placeholder="Ej. 4500000"
              />
            </Field>
            <Field label="Cierre estimado" htmlFor="new-opp-close" required={req.date}>
              <input
                id="new-opp-close"
                aria-required={req.date || undefined}
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Probabilidad" htmlFor="new-opp-probability">
              <select
                id="new-opp-probability"
                value={probability}
                onChange={(e) => setProbability(e.target.value)}
                className={INPUT}
              >
                <option value="">Por defecto de la etapa</option>
                {PROBABILITY_OPTIONS.map((p) => (
                  <option key={p} value={String(p)}>
                    {p}%
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Responsable">
              <select
                aria-label="Responsable"
                aria-busy={membersLoading}
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className={INPUT}
              >
                <option value="">Sin asignar</option>
                {members.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.displayName}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={INPUT}
            />
          </Field>

          {(req.value || req.date) && (
            <p className="text-xs text-[var(--text-secondary)]">
              * Obligatorio para crear en {STAGE_LABELS[stage]}.
            </p>
          )}
          {err && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {err}
            </p>
          )}
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
            style={{ background: 'var(--color-accent)' }}
          >
            {saving ? 'Creando…' : 'Crear oportunidad'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]"
      >
        {label}
        {required && (
          <>
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> (obligatorio)</span>
          </>
        )}
      </label>
      {children}
    </div>
  );
}

export default NewOpportunityModal;
