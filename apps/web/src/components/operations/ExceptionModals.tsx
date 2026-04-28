'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ShieldOff, X } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { formatDate, formatRelativeDate } from '../../lib/formatters';

/* OPS-023 — modals shared between the exceptions page and the asset
   detail banner. Each modal owns its own form state but the parent
   handles the actual API call and reload via onSubmit/onClose. */

const MAX_DAYS = 90;

export interface ExceptionAssetSummary {
  id: string;
  code: string;
  name: string;
}

interface BlockingDocRef {
  documentTypeId: string;
  documentTypeName: string;
  documentTypeCode: string;
  state: 'MISSING' | 'EXPIRED';
}

/* ---- Request modal ----------------------------------------------- */

export function ExceptionRequestModal({
  asset,
  blockingDocs,
  onClose,
  onSubmitted,
  onError,
}: {
  asset: ExceptionAssetSummary;
  /* When unspecified the modal still loads via /evaluate-blocking. We
     accept a precomputed list so callers (asset detail) avoid the
     extra round-trip. */
  blockingDocs?: BlockingDocRef[];
  onClose: () => void;
  onSubmitted: () => void;
  onError: (msg: string) => void;
}) {
  const [docs, setDocs] = useState<BlockingDocRef[]>(blockingDocs ?? []);
  const [reason, setReason] = useState('');
  const today = new Date();
  const defaultUntil = new Date(today.getTime() + 7 * 24 * 3600_000);
  const [validUntil, setValidUntil] = useState(defaultUntil.toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (blockingDocs) return;
    apiClient
      .post<{ blockingDocuments: BlockingDocRef[] }>(
        `/api/operations/assets/${asset.id}/evaluate-blocking`,
      )
      .then((res) => setDocs(res.blockingDocuments ?? []))
      .catch(() => undefined);
  }, [asset.id, blockingDocs]);

  const submit = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < 20) {
      onError('La justificación debe tener al menos 20 caracteres.');
      return;
    }
    if (!validUntil) {
      onError('Selecciona una fecha de vigencia.');
      return;
    }
    const target = new Date(validUntil);
    const cap = new Date(Date.now() + MAX_DAYS * 24 * 3600_000);
    if (target.getTime() > cap.getTime()) {
      onError(`La excepción no puede extenderse más de ${MAX_DAYS} días.`);
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/api/operations/exceptions', {
        assetId: asset.id,
        reason: trimmed,
        proposedValidUntil: new Date(validUntil + 'T23:59:59').toISOString(),
      });
      onSubmitted();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      title="Solicitar excepción temporal"
      onClose={onClose}
      icon={<ShieldOff size={16} />}
    >
      <div className="space-y-4">
        <div
          className="rounded-lg p-3 flex items-start gap-2"
          style={{
            background: 'rgba(239, 68, 68, 0.06)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
          }}
        >
          <AlertTriangle size={16} style={{ color: '#b91c1c', marginTop: 2 }} />
          <div>
            <p
              className="text-[var(--text-primary)]"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Documentos que motivan el bloqueo
            </p>
            {docs.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {docs.map((d) => (
                  <li
                    key={d.documentTypeId}
                    style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: 13 }}
                  >
                    <strong>{d.documentTypeCode}</strong> · {d.documentTypeName}{' '}
                    <span className="text-[var(--text-muted)]">
                      ({d.state === 'MISSING' ? 'falta' : 'vencido'})
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p
                className="text-[var(--text-secondary)] text-sm"
                style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
              >
                Sin información — se evaluará al enviar la solicitud.
              </p>
            )}
          </div>
        </div>

        <Field label="Justificación" required>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            minLength={20}
            maxLength={2000}
            placeholder="Explica por qué necesitas operar el activo a pesar de los documentos vencidos..."
            className="cp-input"
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Mínimo 20 caracteres. Esta solicitud será revisada por un administrador.
          </p>
        </Field>

        <Field label="Vigencia hasta" required>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            max={new Date(Date.now() + MAX_DAYS * 24 * 3600_000).toISOString().slice(0, 10)}
            className="cp-input"
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Máximo {MAX_DAYS} días desde hoy. Después de esta fecha el activo se re-evaluará y
            posiblemente vuelva a bloquearse automáticamente.
          </p>
        </Field>
      </div>

      <Footer
        onCancel={onClose}
        onConfirm={submit}
        confirmLabel={submitting ? 'Enviando...' : 'Enviar solicitud'}
        confirmDisabled={submitting}
        confirmTone="primary"
      />
    </ModalShell>
  );
}

/* ---- Approve modal ----------------------------------------------- */

export function ExceptionApproveModal({
  exception,
  onClose,
  onSubmitted,
  onError,
}: {
  exception: {
    id: string;
    asset: ExceptionAssetSummary;
    requestedReason: string;
    requestedByUser?: { firstName?: string; lastName?: string; email: string } | null;
    requestedDocumentTypes?: Array<{ name: string; code: string }>;
    validUntil?: string | Date | null;
  };
  onClose: () => void;
  onSubmitted: () => void;
  onError: (msg: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultUntil = exception.validUntil
    ? new Date(exception.validUntil).toISOString().slice(0, 10)
    : new Date(Date.now() + 7 * 24 * 3600_000).toISOString().slice(0, 10);
  const [approvedReason, setApprovedReason] = useState('');
  const [validFrom, setValidFrom] = useState(today);
  const [validUntil, setValidUntil] = useState(defaultUntil);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!validUntil || !validFrom) {
      onError('Indica las fechas de vigencia.');
      return;
    }
    const from = new Date(validFrom + 'T00:00:00');
    const until = new Date(validUntil + 'T23:59:59');
    if (until <= from) {
      onError('La fecha de fin debe ser posterior a la de inicio.');
      return;
    }
    const cap = new Date(from.getTime() + MAX_DAYS * 24 * 3600_000);
    if (until > cap) {
      onError(`La vigencia no puede superar ${MAX_DAYS} días desde la fecha de inicio.`);
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`/api/operations/exceptions/${exception.id}/approve`, {
        approvedReason: approvedReason.trim() || undefined,
        validFrom: from.toISOString(),
        validUntil: until.toISOString(),
      });
      onSubmitted();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo aprobar la excepción.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title="Aprobar excepción" onClose={onClose} icon={<ShieldOff size={16} />}>
      <div className="space-y-4">
        <div
          className="rounded-lg p-3"
          style={{
            background: 'rgba(37, 99, 235, 0.06)',
            border: '1px solid rgba(37, 99, 235, 0.2)',
          }}
        >
          <Kv label="Activo" value={`${exception.asset.code} · ${exception.asset.name}`} />
          {exception.requestedByUser && (
            <Kv label="Solicitante" value={formatUser(exception.requestedByUser)} />
          )}
          <Kv label="Justificación" value={exception.requestedReason} multiline />
          {exception.requestedDocumentTypes && exception.requestedDocumentTypes.length > 0 && (
            <Kv
              label="Documentos"
              value={exception.requestedDocumentTypes.map((d) => d.code).join(', ')}
            />
          )}
        </div>

        <Field label="Razón de la aprobación (opcional)">
          <textarea
            value={approvedReason}
            onChange={(e) => setApprovedReason(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Notas internas o condiciones de la aprobación..."
            className="cp-input"
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Válida desde" required>
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              min={today}
              className="cp-input"
            />
          </Field>
          <Field label="Válida hasta" required>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              min={validFrom}
              max={new Date(new Date(validFrom).getTime() + MAX_DAYS * 24 * 3600_000)
                .toISOString()
                .slice(0, 10)}
              className="cp-input"
            />
          </Field>
        </div>

        <div
          className="rounded-lg p-3"
          style={{
            background: 'rgba(239, 68, 68, 0.06)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
          }}
        >
          <p
            className="text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: 13 }}
          >
            Una vez aprobada, el activo se desbloqueará durante este período. Cuando expire, el
            sistema re-evaluará y posiblemente lo vuelva a bloquear automáticamente.
          </p>
        </div>
      </div>

      <Footer
        onCancel={onClose}
        onConfirm={submit}
        confirmLabel={submitting ? 'Aprobando...' : 'Aprobar excepción'}
        confirmDisabled={submitting}
        confirmTone="success"
      />
    </ModalShell>
  );
}

/* ---- Reject modal ------------------------------------------------ */

export function ExceptionRejectModal({
  exceptionId,
  onClose,
  onSubmitted,
  onError,
}: {
  exceptionId: string;
  onClose: () => void;
  onSubmitted: () => void;
  onError: (msg: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (reason.trim().length < 10) {
      onError('Indica un motivo de rechazo (mínimo 10 caracteres).');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`/api/operations/exceptions/${exceptionId}/reject`, {
        rejectedReason: reason.trim(),
      });
      onSubmitted();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo rechazar la excepción.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <ModalShell title="Rechazar excepción" onClose={onClose} icon={<X size={16} />}>
      <Field label="Motivo del rechazo" required>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Explica por qué rechazas esta solicitud..."
          className="cp-input"
        />
        <p className="text-xs text-[var(--text-muted)] mt-1">
          {reason.trim().length}/10 caracteres mínimos.
        </p>
      </Field>
      <Footer
        onCancel={onClose}
        onConfirm={submit}
        confirmLabel={submitting ? 'Rechazando...' : 'Rechazar'}
        confirmDisabled={submitting}
        confirmTone="danger"
      />
    </ModalShell>
  );
}

/* ---- Revoke modal ------------------------------------------------ */

export function ExceptionRevokeModal({
  exceptionId,
  onClose,
  onSubmitted,
  onError,
}: {
  exceptionId: string;
  onClose: () => void;
  onSubmitted: (reblocked: boolean) => void;
  onError: (msg: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (reason.trim().length < 10) {
      onError('Indica un motivo de revocación (mínimo 10 caracteres).');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post<{ reblocked?: boolean }>(
        `/api/operations/exceptions/${exceptionId}/revoke`,
        { revokedReason: reason.trim() },
      );
      onSubmitted(!!res?.reblocked);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo revocar la excepción.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <ModalShell title="Revocar excepción" onClose={onClose} icon={<AlertTriangle size={16} />}>
      <div
        className="mb-3 rounded-lg p-3"
        style={{
          background: 'rgba(239, 68, 68, 0.06)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
        }}
      >
        <p className="text-sm text-[var(--text-secondary)]">
          Al revocar, el activo se re-evaluará y posiblemente se vuelva a bloquear inmediatamente.
        </p>
      </div>
      <Field label="Motivo de la revocación" required>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Explica por qué revocas esta excepción..."
          className="cp-input"
        />
      </Field>
      <Footer
        onCancel={onClose}
        onConfirm={submit}
        confirmLabel={submitting ? 'Revocando...' : 'Revocar'}
        confirmDisabled={submitting}
        confirmTone="warning"
      />
    </ModalShell>
  );
}

/* ---- Detail modal ------------------------------------------------ */

interface DetailExceptionRow {
  id: string;
  asset: ExceptionAssetSummary;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';
  requestedReason: string;
  requestedAt: string;
  requestedByUser: { email: string; firstName?: string; lastName?: string } | null;
  requestedDocumentTypes: Array<{ id: string; name: string; code: string }>;
  approvedReason: string | null;
  approvedAt: string | null;
  approvedByUser: { email: string; firstName?: string; lastName?: string } | null;
  rejectedReason: string | null;
  rejectedAt: string | null;
  rejectedByUser: { email: string; firstName?: string; lastName?: string } | null;
  revokedReason: string | null;
  revokedAt: string | null;
  revokedByUser: { email: string; firstName?: string; lastName?: string } | null;
  validFrom: string | null;
  validUntil: string | null;
}

const STATUS_META: Record<DetailExceptionRow['status'], { label: string; bg: string; fg: string }> =
  {
    PENDING: { label: 'Pendiente', bg: 'rgba(234, 179, 8, 0.14)', fg: '#a16207' },
    APPROVED: { label: 'Aprobada', bg: 'rgba(34, 197, 94, 0.12)', fg: '#15803d' },
    REJECTED: { label: 'Rechazada', bg: 'rgba(239, 68, 68, 0.12)', fg: '#b91c1c' },
    EXPIRED: { label: 'Expirada', bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
    REVOKED: { label: 'Revocada', bg: 'rgba(249, 115, 22, 0.14)', fg: '#c2410c' },
  };

export function ExceptionDetailModal({
  exceptionId,
  onClose,
}: {
  exceptionId: string;
  onClose: () => void;
}) {
  const [row, setRow] = useState<DetailExceptionRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    apiClient
      .get<DetailExceptionRow>(`/api/operations/exceptions/${exceptionId}`)
      .then((data) => {
        if (alive) setRow(data);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'No se pudo cargar la excepción.');
      });
    return () => {
      alive = false;
    };
  }, [exceptionId]);

  return (
    <ModalShell title="Detalle de excepción" onClose={onClose} icon={<ShieldOff size={16} />}>
      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
          {error}
        </div>
      )}
      {!row && !error && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-lg"
              style={{ height: 56, background: 'rgba(0,0,0,0.04)' }}
            />
          ))}
        </div>
      )}
      {row && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="cfg-chip"
              style={{
                background: STATUS_META[row.status].bg,
                color: STATUS_META[row.status].fg,
              }}
            >
              {STATUS_META[row.status].label}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              {row.asset.code} · {row.asset.name}
            </span>
          </div>

          <Section title="Solicitud">
            <Kv
              label="Solicitada por"
              value={row.requestedByUser ? formatUser(row.requestedByUser) : '—'}
            />
            <Kv
              label="Fecha"
              value={`${formatRelativeDate(row.requestedAt)} · ${formatDate(row.requestedAt)}`}
            />
            <Kv label="Justificación" value={row.requestedReason} multiline />
            {row.requestedDocumentTypes.length > 0 && (
              <Kv
                label="Documentos"
                value={row.requestedDocumentTypes.map((d) => `${d.code} · ${d.name}`).join(', ')}
                multiline
              />
            )}
          </Section>

          {row.status === 'APPROVED' || row.status === 'EXPIRED' || row.status === 'REVOKED' ? (
            <Section title="Aprobación">
              {row.approvedByUser && (
                <Kv label="Aprobada por" value={formatUser(row.approvedByUser)} />
              )}
              {row.approvedAt && <Kv label="Fecha" value={formatDate(row.approvedAt)} />}
              {row.approvedReason && <Kv label="Razón" value={row.approvedReason} multiline />}
              {row.validFrom && <Kv label="Vigente desde" value={formatDate(row.validFrom)} />}
              {row.validUntil && <Kv label="Vigente hasta" value={formatDate(row.validUntil)} />}
            </Section>
          ) : null}

          {row.status === 'REJECTED' && (
            <Section title="Rechazo">
              {row.rejectedByUser && (
                <Kv label="Rechazada por" value={formatUser(row.rejectedByUser)} />
              )}
              {row.rejectedAt && <Kv label="Fecha" value={formatDate(row.rejectedAt)} />}
              {row.rejectedReason && <Kv label="Razón" value={row.rejectedReason} multiline />}
            </Section>
          )}

          {row.status === 'REVOKED' && (
            <Section title="Revocación">
              {row.revokedByUser && (
                <Kv label="Revocada por" value={formatUser(row.revokedByUser)} />
              )}
              {row.revokedAt && <Kv label="Fecha" value={formatDate(row.revokedAt)} />}
              {row.revokedReason && <Kv label="Razón" value={row.revokedReason} multiline />}
            </Section>
          )}
        </div>
      )}
      <Footer onCancel={onClose} confirmLabel="Cerrar" onConfirm={onClose} confirmTone="primary" />
    </ModalShell>
  );
}

/* ---- Shared bits ------------------------------------------------- */

function ModalShell({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-card)] z-10">
          <h3
            className="text-[var(--text-primary)] flex items-center gap-2"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 600, fontSize: 16 }}
          >
            {icon}
            {title}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
      <style jsx global>{`
        .cp-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-family: var(--font-outfit), sans-serif;
          font-size: 14px;
          color: var(--text-primary);
          background: var(--input-bg);
          outline: none;
        }
        .cp-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
        .cfg-chip {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 999px;
          font-family: var(--font-jetbrains-mono), monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
      `}</style>
    </div>
  );
}

function Footer({
  onCancel,
  onConfirm,
  confirmLabel,
  confirmDisabled,
  confirmTone,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmDisabled?: boolean;
  confirmTone: 'primary' | 'success' | 'warning' | 'danger';
}) {
  const tones: Record<typeof confirmTone, string> = {
    primary: '#1C1C1E',
    success: '#15803d',
    warning: '#D97706',
    danger: '#DC2626',
  };
  return (
    <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-[var(--border-color)]">
      <button
        onClick={onCancel}
        className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
      >
        Cancelar
      </button>
      <button
        onClick={onConfirm}
        disabled={confirmDisabled}
        className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
        style={{
          background: tones[confirmTone],
          fontFamily: 'var(--font-outfit), sans-serif',
          fontWeight: 500,
        }}
      >
        {confirmLabel}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4
        className="text-[var(--text-secondary)] mb-1"
        style={{
          fontFamily: 'var(--font-ibm-plex-mono), monospace',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </h4>
      <div
        className="rounded-lg p-3"
        style={{ border: '1px solid var(--border-color)', background: 'var(--input-bg)' }}
      >
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block mb-1.5 text-[var(--text-secondary)]"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500, fontSize: 13 }}
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Kv({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className={multiline ? 'py-1.5' : 'py-1 flex items-start justify-between gap-3'}>
      <span
        className="text-[var(--text-secondary)]"
        style={{
          fontFamily: 'var(--font-ibm-plex-mono), monospace',
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          marginRight: 6,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-outfit), sans-serif',
          fontSize: 13,
          color: 'var(--text-primary)',
          textAlign: multiline ? 'left' : 'right',
          display: multiline ? 'block' : 'inline',
          marginTop: multiline ? 4 : 0,
          whiteSpace: 'pre-wrap',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function formatUser(u: { firstName?: string; lastName?: string; email: string }): string {
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return fullName || u.email;
}
