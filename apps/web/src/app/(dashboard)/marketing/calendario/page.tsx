'use client';

/* MKT-004 — Campaign calendar. Month navigation (prev / next / hoy) + the SHARED
 * domain-agnostic MonthView, fed by a client-side adapter that expands each campaign
 * (from the month feed) into per-day chips, clamped to the visible month in UTC
 * (HR-004b) so month edges never drift. Chip color = campaignLabels.statusStyle
 * (single source of truth); chip click → the campaign detail. Read gate mirrors the
 * campañas page (ACCOUNTANT read-only OK; VIEWER/ANALYST → denied state). Tokens:
 * accent #2563eb, Outfit headings, glassmorphism. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/api';
import { MonthView, CalendarMonthEvent } from '../../../../components/calendar/MonthView';
import { statusStyle, STATUS_LABELS } from '../../../../components/marketing/campaignLabels';

interface CalendarCampaign {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
}

interface CampaignChip extends CalendarMonthEvent {
  campaignId: string;
  name: string;
  status: string;
}

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const DAY_MS = 86_400_000;

/* Expand each campaign into one chip per day within the visible month. The clamp math
   is done in UTC (matching the UTC-anchored @db.Date columns + the feed's month bounds);
   each in-range calendar day is then emitted as a LOCAL-midnight date so the MonthView's
   local day-bucketing lands it on the correct cell (no timezone off-by-one). */
function expandToChips(
  campaigns: CalendarCampaign[],
  year: number,
  monthIndex: number,
): CampaignChip[] {
  const monthStartUTC = Date.UTC(year, monthIndex, 1);
  const monthEndUTC = Date.UTC(year, monthIndex + 1, 0);
  const chips: CampaignChip[] = [];
  for (const c of campaigns) {
    if (!c.startDate) continue; // unplaceable (defensive — the feed already excludes these)
    const sd = new Date(c.startDate);
    const startUTC = Date.UTC(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate());
    let endUTC = startUTC;
    if (c.endDate) {
      const ed = new Date(c.endDate);
      endUTC = Date.UTC(ed.getUTCFullYear(), ed.getUTCMonth(), ed.getUTCDate());
    }
    const from = Math.max(startUTC, monthStartUTC);
    // Open-ended (no endDate) → the start day only; ranged → clamp to month end.
    const to = c.endDate ? Math.min(endUTC, monthEndUTC) : startUTC;
    for (let t = from; t <= to; t += DAY_MS) {
      const d = new Date(t);
      const Y = d.getUTCFullYear();
      const M = d.getUTCMonth();
      const D = d.getUTCDate();
      chips.push({
        id: `${c.id}:${Y}-${M + 1}-${D}`,
        date: new Date(Y, M, D).toISOString(), // local midnight for the same calendar day
        campaignId: c.id,
        name: c.name,
        status: c.status,
      });
    }
  }
  return chips;
}

const LEGEND_STATUSES = ['BORRADOR', 'ACTIVA', 'PAUSADA', 'FINALIZADA'] as const;

export default function MarketingCalendarioPage() {
  const router = useRouter();
  const [focusedDate, setFocusedDate] = useState(() => new Date());
  const [campaigns, setCampaigns] = useState<CalendarCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const year = focusedDate.getFullYear();
  const monthIndex = focusedDate.getMonth();
  const monthParam = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

  const fetchMonth = useCallback(() => {
    setLoading(true);
    apiClient
      .get<CalendarCampaign[]>(`/api/marketing/campaigns/calendar?month=${monthParam}`)
      .then((data) => {
        setCampaigns(data);
        setError(null);
        setForbidden(false);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setForbidden(true);
        else setError('No se pudo cargar el calendario.');
      })
      .finally(() => setLoading(false));
  }, [monthParam]);

  useEffect(() => {
    fetchMonth();
  }, [fetchMonth]);

  const chips = useMemo(
    () => expandToChips(campaigns, year, monthIndex),
    [campaigns, year, monthIndex],
  );

  const Header = (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Calendario
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFocusedDate(new Date(year, monthIndex - 1, 1))}
          aria-label="Mes anterior"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-[150px] text-center text-sm font-medium capitalize text-[var(--text-primary)]">
          {MONTH_NAMES[monthIndex]} {year}
        </span>
        <button
          onClick={() => setFocusedDate(new Date(year, monthIndex + 1, 1))}
          aria-label="Mes siguiente"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ChevronRight size={16} />
        </button>
        <button
          onClick={() => setFocusedDate(new Date())}
          className="ml-1 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          Hoy
        </button>
      </div>
    </div>
  );

  if (forbidden) {
    return (
      <div className="pt-2">
        {Header}
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            No tienes permiso para ver el módulo Marketing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-2">
      {Header}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <MonthView<CampaignChip>
        focusedDate={focusedDate}
        events={chips}
        getChipStyle={(e) => {
          const s = statusStyle(e.status);
          return { bg: s.background as string, color: s.color as string };
        }}
        getChipLabel={(e) => e.name}
        onSelectEvent={(e) => router.push(`/marketing/campanas/${e.campaignId}`)}
      />

      {!loading && chips.length === 0 && (
        <p className="mt-3 text-center text-sm text-[var(--text-secondary)]">
          No hay campañas programadas en {MONTH_NAMES[monthIndex]} {year}.
        </p>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-secondary)]">
        <span className="font-semibold uppercase tracking-wide">Leyenda:</span>
        {LEGEND_STATUSES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: statusStyle(s).color as string }}
            />
            {STATUS_LABELS[s]}
          </span>
        ))}
        <span className="italic">Las campañas canceladas no se muestran.</span>
      </div>
    </div>
  );
}
