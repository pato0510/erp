'use client';

/* MKT-007/007b — the campaign "Retorno" (ROI) section. Reads the backend-derived
 * `attribution` ({ accountsCount, wonCount, wonNetAmount, wonDeals }) embedded in the
 * campaign detail, plus the existing derived `spent`. Everything is computed live
 * server-side (Comercial's exposed reader); this component only formats. No write
 * affordances by nature. Amounts use the platform CLP formatter. */
import Link from 'next/link';
import { formatCLP } from '../../lib/formatters';

interface WonDeal {
  opportunityId: string;
  name: string;
  netAmount: string;
}

interface Attribution {
  accountsCount: number;
  wonCount: number;
  wonNetAmount: string;
  wonDeals: WonDeal[];
}

export function CampaignRetorno({
  attribution,
  spent,
}: {
  attribution: Attribution;
  spent: string | number;
}) {
  const spentNum = Number(spent);
  const netNum = Number(attribution.wonNetAmount);
  // ROI = retorno neto / gasto. "N.N×" when spent > 0, "—" when spent is 0.
  const roiLabel = spentNum > 0 ? `${(netNum / spentNum).toFixed(1)}×` : '—';

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--text-primary)]">Retorno</p>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
          style={{ background: 'rgba(37,99,235,0.12)', color: '#1d4ed8' }}
          title="Retorno neto / gasto"
        >
          ROI {roiLabel}
        </span>
      </div>

      {attribution.accountsCount === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Sin cuentas atribuidas. La atribución se define desde la ficha de la cuenta en Comercial,
          en el campo <span className="font-medium">&quot;Campaña de origen&quot;</span>.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Cuentas generadas" value={String(attribution.accountsCount)} />
            <Stat label="Negocios ganados" value={String(attribution.wonCount)} />
            <Stat label="Retorno neto" value={formatCLP(attribution.wonNetAmount)} />
            <Stat label="Gasto" value={formatCLP(spentNum)} />
          </div>

          {/* MKT-007b — the won-deals mirror: each currently-GANADA deal + its net, linked. */}
          {attribution.wonDeals.length > 0 && (
            <div className="mt-4 border-t border-[var(--border-color)] pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                Negocios ganados
              </p>
              <ul className="space-y-1">
                {attribution.wonDeals.map((d) => (
                  <li
                    key={d.opportunityId}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <Link
                      href={`/comercial/pipeline/${d.opportunityId}`}
                      className="hover:underline"
                      style={{ color: '#2563eb' }}
                    >
                      {d.name}
                    </Link>
                    <span className="font-medium text-[var(--text-primary)]">
                      {formatCLP(d.netAmount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </p>
      <p className="text-lg font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

export default CampaignRetorno;
