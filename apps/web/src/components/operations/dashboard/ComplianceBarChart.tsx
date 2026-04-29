'use client';

import type { DashboardComplianceCategoryRow } from './types';
import { thresholdColor } from './types';

interface ComplianceBarChartProps {
  rows: DashboardComplianceCategoryRow[];
}

export function ComplianceBarChart({ rows }: ComplianceBarChartProps) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => {
        const color = thresholdColor(row.compliancePercentage);
        const widthPct = Math.max(2, Math.min(100, row.compliancePercentage));
        return (
          <li key={row.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                {row.label}
              </span>
              <span className="font-mono text-sm font-semibold" style={{ color }}>
                {row.compliancePercentage}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(0,0,0,0.06)]">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${widthPct}%`, backgroundColor: color }}
              />
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] text-[var(--text-secondary)]">
              <span>{row.total} totales</span>
              {row.expired > 0 && <span className="text-red-700">{row.expired} vencidos</span>}
              {row.expiringSoon > 0 && (
                <span className="text-yellow-700">{row.expiringSoon} por vencer</span>
              )}
              {row.missing > 0 && <span className="text-orange-700">{row.missing} faltantes</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default ComplianceBarChart;
