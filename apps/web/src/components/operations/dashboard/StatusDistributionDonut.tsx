'use client';

import { useRouter } from 'next/navigation';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { DashboardAssetDistribution } from './types';

interface StatusDistributionDonutProps {
  data: DashboardAssetDistribution;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  OPERATIONAL: { label: 'Operativo', color: '#16a34a' },
  WITH_OBSERVATIONS: { label: 'Con observaciones', color: '#a16207' },
  IN_MAINTENANCE: { label: 'En mantenimiento', color: '#1d4ed8' },
  BLOCKED_DOCUMENTAL: { label: 'Bloqueado', color: '#b91c1c' },
  OUT_OF_SERVICE: { label: 'Fuera de servicio', color: '#475569' },
  DECOMMISSIONED: { label: 'Dado de baja', color: '#1f2937' },
};

export function StatusDistributionDonut({ data }: StatusDistributionDonutProps) {
  const router = useRouter();
  const segments = data.segments.filter((s) => s.count > 0);
  const total = data.total;

  if (total === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-[var(--text-secondary)]">
        Sin activos registrados.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr,1fr] items-center gap-4">
      <div className="relative h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={segments}
              dataKey="count"
              nameKey="status"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={75}
              paddingAngle={3}
              onClick={(data) => {
                /* recharts gives us a PieSectorDataItem; the original
                   row sits on .payload. Cast loosely — the chart
                   library's types don't preserve our generic. */
                const status = (data as { payload?: { status?: string } } | null)?.payload?.status;
                if (status) router.push(`/operaciones/equipos?status=${status}`);
              }}
              style={{ cursor: 'pointer' }}
            >
              {segments.map((s) => (
                <Cell key={s.status} fill={STATUS_META[s.status]?.color ?? '#94a3b8'} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: unknown, _name, payload) => [
                `${v} (${(payload?.payload as { percentage?: number })?.percentage ?? 0}%)`,
                STATUS_META[(payload?.payload as { status?: string })?.status ?? '']?.label ??
                  'Estado',
              ]}
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-[var(--text-primary)]">{total}</span>
          <span className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
            activos
          </span>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5">
        {data.segments.map((s) => (
          <li
            key={s.status}
            className="flex items-center gap-2 text-xs"
            style={{ opacity: s.count === 0 ? 0.45 : 1 }}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_META[s.status]?.color ?? '#94a3b8' }}
            />
            <span className="flex-1 truncate text-[var(--text-secondary)]">
              {STATUS_META[s.status]?.label ?? s.status}
            </span>
            <span className="font-mono text-[var(--text-primary)]">{s.count}</span>
            <span className="w-10 text-right font-mono text-[var(--text-secondary)]">
              {s.percentage}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default StatusDistributionDonut;
