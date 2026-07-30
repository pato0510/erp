'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { GraduationCap, HardHat, Search, Siren } from 'lucide-react';
import { apiClient, ApiError } from '../../../lib/api';

/* HSEC-010 — the HSEC dashboard: current-Chilean-month counts, DERIVED LIVE at read time by
 * the backend (zero rollups, zero cron — the CAL-013 gestión-dashboard precedent). Cards are
 * CLICKABLE and land on the pre-filtered lists via searchParams. Read-only page — no
 * mutations (the HSEC-006 ruling has nothing to bite here); a simple fetch on mount keeps
 * the counts current by construction. */

interface DashboardData {
  month: string; // 'YYYY-MM'
  incidents: {
    total: number;
    bySeverity: Record<'LEVE' | 'GRAVE' | 'FATAL', number>;
    byStatus: Record<'REPORTADO' | 'EN_INVESTIGACION' | 'CERRADO', number>;
  };
  trainings: { total: number };
  eppDeliveries: { total: number };
}

/** "YYYY-MM" → "Julio 2026" (es-CL month name, capitalized; UTC-pinned render). */
function monthLabel(month: string): string {
  const name = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('es-CL', {
    month: 'long',
    timeZone: 'UTC',
  });
  return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + month.slice(0, 4);
}

/** Month range params for the list deep-links: first..last day of the month. */
function monthRange(month: string): { desde: string; hasta: string } {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${month}-01`, hasta: `${month}-${String(lastDay).padStart(2, '0')}` };
}

export default function HsecDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(() => {
    apiClient
      .get<DashboardData>('/api/hsec/dashboard')
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar el dashboard.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) return <p className="pt-6 text-sm text-[var(--text-secondary)]">Cargando…</p>;
  if (error || !data) return <p className="pt-6 text-sm text-red-600">{error ?? 'Sin datos.'}</p>;

  const { desde, hasta } = monthRange(data.month);
  const range = `desde=${desde}&hasta=${hasta}`;
  const CARD =
    'block rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 transition hover:border-[#2563eb]';

  return (
    <div className="pt-2">
      <div className="mb-1 flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          HSEC
        </h1>
      </div>
      <p className="mb-5 pl-[18px] text-sm text-[var(--text-secondary)]">
        Resumen de {monthLabel(data.month)} — conteos en vivo, cada tarjeta abre la lista filtrada.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Incidentes del mes */}
        <Link href={`/hsec/incidentes?${range}`} className={CARD}>
          <div className="mb-1 flex items-center gap-2 text-[var(--text-secondary)]">
            <Siren size={15} />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Incidentes del mes
            </span>
          </div>
          <p className="text-3xl font-semibold text-[var(--text-primary)]">
            {data.incidents.total}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Leves {data.incidents.bySeverity.LEVE} · Graves {data.incidents.bySeverity.GRAVE} ·
            Fatales {data.incidents.bySeverity.FATAL}
          </p>
        </Link>

        {/* GRAVE / FATAL sub-cards */}
        <div className="grid grid-rows-2 gap-4">
          <Link href={`/hsec/incidentes?severidad=GRAVE&${range}`} className={CARD}>
            <span className="text-xs font-semibold uppercase tracking-wide text-[#b45309]">
              Graves del mes
            </span>
            <p className="text-2xl font-semibold text-[var(--text-primary)]">
              {data.incidents.bySeverity.GRAVE}
            </p>
          </Link>
          <Link href={`/hsec/incidentes?severidad=FATAL&${range}`} className={CARD}>
            <span className="text-xs font-semibold uppercase tracking-wide text-[#b91c1c]">
              Fatales del mes
            </span>
            <p className="text-2xl font-semibold text-[var(--text-primary)]">
              {data.incidents.bySeverity.FATAL}
            </p>
          </Link>
        </div>

        {/* En investigación (all-time status view — no month range, per the plan) */}
        <Link href="/hsec/incidentes?estado=EN_INVESTIGACION" className={CARD}>
          <div className="mb-1 flex items-center gap-2 text-[var(--text-secondary)]">
            <Search size={15} />
            <span className="text-xs font-semibold uppercase tracking-wide">En investigación</span>
          </div>
          <p className="text-3xl font-semibold text-[var(--text-primary)]">
            {data.incidents.byStatus.EN_INVESTIGACION}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Reportados {data.incidents.byStatus.REPORTADO} · Cerrados{' '}
            {data.incidents.byStatus.CERRADO}
          </p>
        </Link>

        {/* Capacitaciones del mes */}
        <Link href={`/hsec/capacitaciones?${range}`} className={CARD}>
          <div className="mb-1 flex items-center gap-2 text-[var(--text-secondary)]">
            <GraduationCap size={15} />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Capacitaciones del mes
            </span>
          </div>
          <p className="text-3xl font-semibold text-[var(--text-primary)]">
            {data.trainings.total}
          </p>
        </Link>

        {/* Entregas EPP del mes */}
        <Link href={`/hsec/epp?${range}`} className={CARD}>
          <div className="mb-1 flex items-center gap-2 text-[var(--text-secondary)]">
            <HardHat size={15} />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Entregas EPP del mes
            </span>
          </div>
          <p className="text-3xl font-semibold text-[var(--text-primary)]">
            {data.eppDeliveries.total}
          </p>
        </Link>
      </div>
    </div>
  );
}
