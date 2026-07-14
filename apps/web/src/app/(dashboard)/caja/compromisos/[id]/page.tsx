'use client';

/* MKT-007b — Commitment detail. Read-only view whose main purpose is the shared
 * "Origen del negocio" card (rendered only when the commitment is opportunity-born and
 * the caller may read Opportunity). Tokens/Spanish as always; nothing else in Finanzas
 * is restyled. */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { apiClient, ApiError } from '../../../../../lib/api';
import { formatCLP, formatDate } from '../../../../../lib/formatters';
import { CommitmentStatusBadge } from '../../../../../components/cashflow/CommitmentStatusBadge';
import { OriginCard, BusinessOrigin } from '../../../../../components/shared/OriginCard';

interface Commitment {
  id: string;
  description: string;
  amount: string;
  dueDate: string;
  type: string;
  status: string;
  counterparty?: { name: string } | null;
  category?: { name: string } | null;
  origin: BusinessOrigin | null;
}

const TYPE_LABELS: Record<string, string> = { INCOME: 'Ingreso', EXPENSE: 'Egreso' };

export default function CommitmentDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const [c, setC] = useState<Commitment | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'notfound'>('loading');

  const load = useCallback(() => {
    apiClient
      .get<Commitment>(`/api/cashflow/commitments/${id}`)
      .then((data) => {
        setC(data);
        setState('ok');
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setState('forbidden');
        else setState('notfound');
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (state === 'loading')
    return <div className="pt-6 text-sm text-[var(--text-secondary)]">Cargando compromiso…</div>;
  if (state === 'forbidden')
    return (
      <div className="pt-6">
        <p className="text-sm text-[var(--text-secondary)]">
          No tienes permiso para ver este compromiso.
        </p>
        <Back />
      </div>
    );
  if (state === 'notfound' || !c)
    return (
      <div className="pt-6">
        <p className="text-sm text-[var(--text-secondary)]">Compromiso no encontrado.</p>
        <Back />
      </div>
    );

  return (
    <div>
      <Link
        href="/caja"
        className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={13} /> Caja
      </Link>

      {/* Header */}
      <div className="mb-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1
              className="text-[var(--text-primary)]"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
                fontSize: 24,
                letterSpacing: '-0.01em',
              }}
            >
              {c.description}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
              <CommitmentStatusBadge status={c.status} />
              <span>·</span>
              <span>{TYPE_LABELS[c.type] ?? c.type}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold text-[var(--text-primary)]">
              {formatCLP(c.amount)}
            </p>
            <p className="text-xs text-[var(--text-secondary)]">Vence {formatDate(c.dueDate)}</p>
          </div>
        </div>
      </div>

      {/* MKT-007b — Origen del negocio (renders only when opportunity-born) */}
      <OriginCard origin={c.origin} />

      {/* Meta */}
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KV label="Vencimiento" value={formatDate(c.dueDate)} />
          <KV label="Tipo" value={TYPE_LABELS[c.type] ?? c.type} />
          <KV
            label="Contraparte / categoría"
            value={c.counterparty?.name ?? c.category?.name ?? '—'}
          />
        </div>
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </p>
      <p className="text-sm text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function Back() {
  return (
    <Link href="/caja" className="mt-2 inline-block text-sm" style={{ color: '#2563eb' }}>
      ← Volver a Caja
    </Link>
  );
}
