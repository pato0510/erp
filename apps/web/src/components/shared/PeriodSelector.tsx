'use client';

import Link from 'next/link';
import { useId } from 'react';
import type { FiscalPeriods } from '../../hooks/useFiscalPeriods';

interface PeriodSelectorProps {
  catalog: FiscalPeriods;
  value: string;
  onChange: (periodId: string) => void;
  id?: string;
  className?: string;
  allowAll?: boolean;
  disabled?: boolean;
}

export function FiscalPeriodNotice({ catalog, id }: { catalog: FiscalPeriods; id?: string }) {
  if (catalog.isLoading)
    return (
      <p id={id} role="status" className="text-sm text-fg-secondary">
        Cargando períodos…
      </p>
    );
  if (catalog.error)
    return (
      <p id={id} role="alert" className="text-sm text-fg-secondary">
        No se pudieron cargar los períodos: {catalog.error}.{' '}
        <button type="button" onClick={catalog.refresh} className="underline">
          Reintentar
        </button>
      </p>
    );
  if (catalog.currentPeriod) return null;
  return (
    <p id={id} role="status" className="text-sm text-fg-secondary">
      {catalog.periods.length === 0 && 'No hay períodos fiscales para esta empresa. '}
      No existe el período {catalog.todayPeriodLabel}. Un administrador puede generarlo en{' '}
      <Link href="/configuracion#periodos" className="underline">
        Configuración → Períodos fiscales
      </Link>
      .
    </p>
  );
}

export function PeriodSelector({
  catalog,
  value,
  onChange,
  id,
  className,
  allowAll = false,
  disabled = false,
}: PeriodSelectorProps) {
  const noticeId = useId();
  return (
    <div className="min-w-0 space-y-2">
      <select
        id={id}
        aria-label="Período fiscal"
        aria-describedby={
          catalog.isLoading || catalog.error || !catalog.currentPeriod ? noticeId : undefined
        }
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || catalog.isLoading || !!catalog.error || catalog.periods.length === 0}
        className={className ?? 'border border-line rounded-lg px-3 py-2 text-sm'}
        style={
          className === undefined
            ? { backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }
            : undefined
        }
      >
        {catalog.periods.length === 0 ? (
          <option value="">
            {catalog.isLoading ? 'Cargando períodos…' : 'Sin períodos disponibles'}
          </option>
        ) : allowAll ? (
          <option value="">Todos los períodos</option>
        ) : null}
        {catalog.years.map((year) => (
          <optgroup key={year} label={String(year)}>
            {catalog.periods
              .filter((period) => period.year === year)
              .map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                  {period.id === catalog.currentPeriod?.id ? ' (actual)' : ''}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <FiscalPeriodNotice catalog={catalog} id={noticeId} />
    </div>
  );
}
