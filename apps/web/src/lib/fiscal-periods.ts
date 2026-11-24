import { civilDate, santiagoToday } from './dates';

export interface FiscalPeriod {
  id: string;
  name: string;
  year: number;
  month: number;
  status: 'OPEN' | 'IN_REVIEW' | 'CLOSED';
  startDate: string;
  endDate: string;
}

const monthLabel = new Intl.DateTimeFormat('es-CL', { month: 'long', timeZone: 'UTC' });

/** All company periods, including closed ones. The API owns the rules for writes. */
export function fiscalPeriodCatalog(source: readonly FiscalPeriod[], today = santiagoToday()) {
  const periods = [...source].sort((a, b) => b.year - a.year || b.month - a.month);
  const years = [...new Set(periods.map((period) => period.year))];
  // Fiscal dates are @db.Date: compare civil dates, without shifting UTC midnight to Chile.
  const currentPeriod = periods.find(
    (period) => civilDate(period.startDate) <= today && today <= civilDate(period.endDate),
  );
  const month = monthLabel.format(new Date(`${today}T12:00:00Z`));
  const todayPeriodLabel = `${month[0].toUpperCase()}${month.slice(1)} ${today.slice(0, 4)}`;

  return {
    periods,
    years,
    currentPeriod,
    defaultPeriod: currentPeriod ?? periods[0],
    todayPeriodLabel,
  };
}
