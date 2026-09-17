'use client';

/* ALERT-001 — Comercial alerts panel (CRM-6): what needs attention, DERIVED LIVE by the
 * API on every read (GET comercial/alerts). A PANEL, NOT A NOTIFIER — nothing is stored,
 * scheduled or dismissed. Three sections in the dashboard/table patterns: quotes sent and
 * unanswered for 7+ days, open opportunities without movement for 14+ days, open
 * opportunities whose expected close date has passed (Chilean date). Read-only; rendered
 * for anyone with opportunity.read (the API enforces read on Opportunity AND Quote). */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/api';
import { formatDate } from '../../../../lib/formatters';
import { useComercialPermissions } from '../../../../hooks/useCanWrite';
import { StageBadge } from '../../../../components/comercial/stageLabels';

interface AlertsData {
  counts: {
    quotesUnanswered: number;
    staleOpportunities: number;
    overdueClose: number;
    total: number;
  };
  quotesUnanswered: {
    quoteId: string;
    quoteNumber: string | null;
    opportunityId: string;
    opportunityName: string;
    accountId: string;
    accountName: string;
    sentAt: string;
    days: number;
  }[];
  staleOpportunities: {
    opportunityId: string;
    name: string;
    accountId: string;
    accountName: string;
    stage: string;
    ownerId: string | null;
    lastMovementAt: string;
    days: number;
  }[];
  overdueClose: {
    opportunityId: string;
    name: string;
    accountId: string;
    accountName: string;
    stage: string;
    ownerId: string | null;
    expectedCloseDate: string;
    daysOverdue: number;
  }[];
}

const TH =
  'label px-4 py-3 text-left text-[11px] uppercase tracking-wider text-[var(--text-secondary)]';
const TD = 'px-4 py-3 text-[var(--text-secondary)]';
const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

export default function ComercialAlertasPage() {
  const perms = useComercialPermissions();
  const canRead = perms?.opportunity.read ?? false;
  const [data, setData] = useState<AlertsData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await apiClient.get<AlertsData>('/api/comercial/alerts');
      setData(res);
      setState('ok');
    } catch (e) {
      setState(e instanceof ApiError && e.status === 403 ? 'forbidden' : 'error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const Header = (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Alertas
        </h1>
        {data && state === 'ok' && (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ background: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
            aria-label={`${data.counts.total} alertas`}
          >
            {data.counts.total}
          </span>
        )}
      </div>
      {state !== 'forbidden' && (
        <button
          type="button"
          onClick={load}
          disabled={state === 'loading'}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60"
        >
          <RefreshCw size={14} className={state === 'loading' ? 'animate-spin' : undefined} />{' '}
          Actualizar
        </button>
      )}
    </div>
  );

  if ((perms && !canRead) || state === 'forbidden') {
    return (
      <div className="pt-2">
        {Header}
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            No tienes permiso para ver las alertas comerciales.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-2">
      {Header}

      {state === 'error' && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          No se pudieron cargar las alertas.
        </div>
      )}

      <Section
        title="Cotizaciones sin respuesta (7+ días)"
        count={data?.counts.quotesUnanswered}
        loading={state === 'loading'}
        headers={['Cotización', 'Oportunidad', 'Cuenta', 'Enviada', 'Días']}
        empty={!data || data.quotesUnanswered.length === 0}
      >
        {data?.quotesUnanswered.map((q) => (
          <tr key={q.quoteId}>
            <td className="px-4 py-3 font-mono text-[12px] text-[var(--text-primary)]">
              {q.quoteNumber ?? '—'}
            </td>
            <td className="px-4 py-3 font-medium">
              <Link
                href={`/comercial/pipeline/${q.opportunityId}`}
                className="hover:underline"
                style={{ color: 'var(--color-accent)' }}
              >
                {q.opportunityName}
              </Link>
            </td>
            <td className={TD}>
              <Link href={`/comercial/cuentas/${q.accountId}`} className="hover:underline">
                {q.accountName}
              </Link>
            </td>
            <td className={TD}>{formatDate(q.sentAt)}</td>
            <td className={TD}>{days(q.days)}</td>
          </tr>
        ))}
      </Section>

      <Section
        title="Oportunidades sin movimiento (14+ días)"
        count={data?.counts.staleOpportunities}
        loading={state === 'loading'}
        headers={['Oportunidad', 'Cuenta', 'Etapa', 'Responsable', 'Último movimiento', 'Días']}
        empty={!data || data.staleOpportunities.length === 0}
      >
        {data?.staleOpportunities.map((o) => (
          <tr key={o.opportunityId}>
            <td className="px-4 py-3 font-medium">
              <Link
                href={`/comercial/pipeline/${o.opportunityId}`}
                className="hover:underline"
                style={{ color: 'var(--color-accent)' }}
              >
                {o.name}
              </Link>
            </td>
            <td className={TD}>
              <Link href={`/comercial/cuentas/${o.accountId}`} className="hover:underline">
                {o.accountName}
              </Link>
            </td>
            <td className="px-4 py-3">
              <StageBadge stage={o.stage} />
            </td>
            <td className={TD}>
              {o.ownerId ? (
                <span className="font-mono text-[11px]" title={o.ownerId}>
                  {o.ownerId.slice(0, 8)}
                </span>
              ) : (
                '—'
              )}
            </td>
            <td className={TD}>{formatDate(o.lastMovementAt)}</td>
            <td className={TD}>{days(o.days)}</td>
          </tr>
        ))}
      </Section>

      <Section
        title="Cierre esperado vencido"
        count={data?.counts.overdueClose}
        loading={state === 'loading'}
        headers={['Oportunidad', 'Cuenta', 'Etapa', 'Responsable', 'Cierre esperado', 'Atraso']}
        empty={!data || data.overdueClose.length === 0}
      >
        {data?.overdueClose.map((o) => (
          <tr key={o.opportunityId}>
            <td className="px-4 py-3 font-medium">
              <Link
                href={`/comercial/pipeline/${o.opportunityId}`}
                className="hover:underline"
                style={{ color: 'var(--color-accent)' }}
              >
                {o.name}
              </Link>
            </td>
            <td className={TD}>
              <Link href={`/comercial/cuentas/${o.accountId}`} className="hover:underline">
                {o.accountName}
              </Link>
            </td>
            <td className="px-4 py-3">
              <StageBadge stage={o.stage} />
            </td>
            <td className={TD}>
              {o.ownerId ? (
                <span className="font-mono text-[11px]" title={o.ownerId}>
                  {o.ownerId.slice(0, 8)}
                </span>
              ) : (
                '—'
              )}
            </td>
            <td className={TD}>{formatDate(o.expectedCloseDate)}</td>
            <td className={TD}>{days(o.daysOverdue)}</td>
          </tr>
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  count,
  loading,
  headers,
  empty,
  children,
}: {
  title: string;
  count?: number;
  loading: boolean;
  headers: string[];
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]"
      aria-label={title}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3">
        <h2
          className="text-sm font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          {title}
        </h2>
        {!loading && count !== undefined && (
          <span className="text-xs text-[var(--text-secondary)]">{count}</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-subtle">
            <tr>
              {headers.map((h) => (
                <th key={h} scope="col" className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {headers.map((h) => (
                    <td key={h} className="px-4 py-3">
                      <div className="h-4 w-24 rounded bg-subtle-hover" />
                    </td>
                  ))}
                </tr>
              ))
            ) : empty ? (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-4 py-6 text-sm text-[var(--text-secondary)]"
                >
                  Sin alertas.
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
