'use client';

import Link from 'next/link';

/* MKT-007b — the shared cross-module "Origen del negocio" card. Rendered in the
 * ServiceOrder detail (Operaciones) and the Commitment detail (Finanzas). The backend
 * composes `origin` under the ability + the founder's conditional rule; this component
 * only reflects it:
 *   - origin === null            → renders NOTHING (artifact not opportunity-born, or the
 *                                  caller cannot read Opportunity). Conditional #1.
 *   - origin.campaign === null   → two rows (Cuenta · Oportunidad); NEVER an empty
 *                                  "Campaña: —". Conditional #2.
 *   - full chain                 → three rows (Campaña · Cuenta · Oportunidad).
 * Each row is a label → link to that artifact's page. */

export interface BusinessOrigin {
  opportunity: { id: string; name: string };
  account: { id: string; name: string };
  campaign: { id: string; name: string } | null;
}

export function OriginCard({ origin }: { origin: BusinessOrigin | null }) {
  if (!origin) return null;
  return (
    <div className="mb-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <p className="mb-3 text-sm font-medium text-[var(--text-primary)]">Origen del negocio</p>
      <div className="space-y-2">
        {origin.campaign && (
          <OriginRow
            label="Campaña"
            href={`/marketing/campanas/${origin.campaign.id}`}
            value={origin.campaign.name}
          />
        )}
        <OriginRow
          label="Cuenta"
          href={`/comercial/cuentas/${origin.account.id}`}
          value={origin.account.name}
        />
        <OriginRow
          label="Oportunidad"
          href={`/comercial/pipeline/${origin.opportunity.id}`}
          value={origin.opportunity.name}
        />
      </div>
      <p className="mt-3 text-xs italic text-[var(--text-secondary)]">
        Siempre refleja la atribución actual.
      </p>
    </div>
  );
}

function OriginRow({ label, href, value }: { label: string; href: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </span>
      <Link href={href} className="text-sm hover:underline" style={{ color: '#2563eb' }}>
        {value}
      </Link>
    </div>
  );
}

export default OriginCard;
