'use client';

import Link from 'next/link';
import { AlertTriangle, FileWarning, Bell } from 'lucide-react';
import type { DashboardAssetRiskRow } from './types';

interface AssetRiskCardProps {
  row: DashboardAssetRiskRow;
  /* The highest score on the page — used to scale the red bar so the
     visual stays meaningful even when scores happen to be low across
     the board. */
  maxScore: number;
}

export function AssetRiskCard({ row, maxScore }: AssetRiskCardProps) {
  const widthPct = maxScore === 0 ? 0 : Math.round((row.score / maxScore) * 100);
  const chips: Array<{ icon: typeof AlertTriangle; label: string; color: string }> = [];
  if (row.issues.criticalAlerts > 0) {
    chips.push({
      icon: AlertTriangle,
      label: `${row.issues.criticalAlerts} crítica${row.issues.criticalAlerts === 1 ? '' : 's'}`,
      color: '#b91c1c',
    });
  }
  if (row.issues.missingDocs + row.issues.expiredDocs > 0) {
    chips.push({
      icon: FileWarning,
      label: `${row.issues.missingDocs + row.issues.expiredDocs} doc${
        row.issues.missingDocs + row.issues.expiredDocs === 1 ? '' : 's'
      }`,
      color: '#c2410c',
    });
  }
  if (row.issues.activeAlerts > 0 && row.issues.criticalAlerts === 0) {
    chips.push({
      icon: Bell,
      label: `${row.issues.activeAlerts} alerta${row.issues.activeAlerts === 1 ? '' : 's'}`,
      color: '#a16207',
    });
  }
  if (row.issues.expiring > 0) {
    chips.push({
      icon: FileWarning,
      label: `${row.issues.expiring} por vencer`,
      color: '#1d4ed8',
    });
  }

  return (
    <Link
      href={`/operaciones/equipos/${row.asset.id}`}
      className="block rounded-lg border border-[var(--border-color)] px-3 py-2.5 transition-colors hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold uppercase"
          style={{
            backgroundColor: row.asset.type?.color ?? '#1f2937',
            color: '#ffffff',
          }}
        >
          {row.asset.code.slice(0, 2)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate">
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {row.asset.code}
              </span>
              <span className="ml-2 text-xs text-[var(--text-secondary)] truncate">
                {row.asset.name}
              </span>
            </div>
            <span className="text-xs font-mono text-[var(--text-secondary)]">{row.score}</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(8, widthPct)}%`,
                backgroundColor:
                  row.issues.criticalAlerts > 0
                    ? '#dc2626'
                    : row.issues.expiredDocs > 0
                      ? '#ea580c'
                      : '#a16207',
              }}
            />
          </div>
          {chips.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {chips.map((c, i) => {
                const ChipIcon = c.icon;
                return (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
                    style={{
                      backgroundColor: `${c.color}1f`,
                      color: c.color,
                    }}
                  >
                    <ChipIcon size={10} />
                    {c.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export default AssetRiskCard;
