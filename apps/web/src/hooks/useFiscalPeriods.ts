'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../lib/api';
import { santiagoToday } from '../lib/dates';
import { FiscalPeriod, fiscalPeriodCatalog } from '../lib/fiscal-periods';

const EMPTY_PERIODS: FiscalPeriod[] = [];

/** One unfiltered company catalog per screen; never create periods while reading. */
export function useFiscalPeriods() {
  const companyId = apiClient.getCompanyId();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    companyId: string | null;
    periods: FiscalPeriod[];
    isLoading: boolean;
    error: string | null;
  }>({ companyId: null, periods: EMPTY_PERIODS, isLoading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ companyId, periods: EMPTY_PERIODS, isLoading: true, error: null });
    apiClient
      .get<FiscalPeriod[]>('/api/fiscal-periods')
      .then((periods) => {
        if (!cancelled) setState({ companyId, periods, isLoading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setState({
            companyId,
            periods: EMPTY_PERIODS,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Error cargando períodos',
          });
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, revision]);

  const sameCompany = state.companyId === companyId;
  const source = sameCompany ? state.periods : EMPTY_PERIODS;
  const today = santiagoToday();
  const catalog = useMemo(() => fiscalPeriodCatalog(source, today), [source, today]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  return {
    ...catalog,
    companyId,
    isLoading: !sameCompany || state.isLoading,
    error: sameCompany ? state.error : null,
    refresh,
  };
}

export type FiscalPeriods = ReturnType<typeof useFiscalPeriods>;

/** Undefined means the shared default; an explicit empty string means "all periods". */
export function useFiscalPeriodSelection(catalog: FiscalPeriods, initialPeriodId?: string) {
  const { companyId, periods, defaultPeriod } = catalog;
  const [selection, setSelection] = useState({ companyId, id: initialPeriodId });
  const selectedId = selection.companyId === companyId ? selection.id : undefined;
  const periodId =
    catalog.isLoading || catalog.error || periods.length === 0
      ? ''
      : selectedId === ''
        ? ''
        : (periods.find((period) => period.id === selectedId)?.id ?? defaultPeriod?.id ?? '');
  const setPeriodId = useCallback((id: string) => setSelection({ companyId, id }), [companyId]);
  return { periodId, setPeriodId };
}

/** A year can only be selected when the company has at least one period in it. */
export function useFiscalYearSelection(
  catalog: FiscalPeriods,
  fallback = catalog.defaultPeriod?.year,
) {
  const { companyId, years } = catalog;
  const [selection, setSelection] = useState<{ companyId: string | null; year?: number }>({
    companyId,
  });
  const selectedYear = selection.companyId === companyId ? selection.year : undefined;
  const year =
    selectedYear !== undefined && years.includes(selectedYear) ? selectedYear : (fallback ?? 0);
  const setYear = useCallback((year: number) => setSelection({ companyId, year }), [companyId]);
  return { year, setYear };
}
