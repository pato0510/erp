import { BadRequestException } from '@nestjs/common';

const santiagoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function santiagoDateOf(instant: Date): string {
  return santiagoDateFormatter.format(instant);
}

export function todayInSantiago(): string {
  return santiagoDateOf(new Date());
}

/** A civil day stays that day in both Santiago and UTC (11:00 CLT / 12:00 CLST).
 * ISO instants, including the legacy datetime-local path, retain their meaning. */
export function parseSantiagoActionDate(value: string): Date {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T15:00:00.000Z` : value);
  if (Number.isNaN(date.getTime()) || (dateOnly && date.toISOString().slice(0, 10) !== value)) {
    throw new BadRequestException('Fecha de acción inválida; indica una fecha real.');
  }
  return date;
}
