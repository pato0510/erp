'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';

interface Period {
  id: string;
  name: string;
  year: number;
  month: number;
  status: string;
}

interface PeriodSelectorProps {
  value: string;
  onChange: (periodId: string) => void;
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const [periods, setPeriods] = useState<Period[]>([]);

  useEffect(() => {
    apiClient
      .get<Period[]>('/api/fiscal-periods?year=2026')
      .then(setPeriods)
      .catch(() => undefined);
  }, []);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
      style={{ backgroundColor: '#ffffff', color: '#1c1c1e' }}
    >
      <option value="">Período actual</option>
      {periods.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.year === currentYear && p.month === currentMonth ? ' (actual)' : ''}
        </option>
      ))}
    </select>
  );
}
