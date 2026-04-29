'use client';

import Link from 'next/link';
import {
  BookMarked,
  ChevronRight,
  ClipboardCheck,
  ShieldOff,
  Wrench,
  Calendar,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DashboardMyTasks } from './types';

interface MyTasksWidgetProps {
  data: DashboardMyTasks;
}

interface TaskRow {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  label: string;
  count: number;
  href: string;
  hint?: string;
}

export function MyTasksWidget({ data }: MyTasksWidgetProps) {
  const rows: TaskRow[] = [
    {
      icon: BookMarked,
      iconColor: '#7c3aed',
      iconBg: 'rgba(124,58,237,0.14)',
      label: 'Acuses pendientes',
      count: data.myPendingAcknowledgments,
      href: '/operaciones/mis-lecturas',
    },
    {
      icon: ClipboardCheck,
      iconColor: '#0f766e',
      iconBg: 'rgba(15,118,110,0.14)',
      label: 'Aprobaciones esperando',
      count: data.myPendingApprovals,
      href: '/operaciones/aprobaciones',
    },
    {
      icon: Wrench,
      iconColor: '#1d4ed8',
      iconBg: 'rgba(29,78,216,0.14)',
      label: 'Activos a tu cargo',
      count: data.myAssignedAssets.total,
      href: '/operaciones/equipos',
      hint:
        data.myAssignedAssets.withIssues > 0
          ? `${data.myAssignedAssets.withIssues} con problemas${
              data.myAssignedAssets.blocked > 0
                ? ` · ${data.myAssignedAssets.blocked} bloqueados`
                : ''
            }`
          : undefined,
    },
    {
      icon: ShieldOff,
      iconColor: '#a16207',
      iconBg: 'rgba(234,179,8,0.16)',
      label: 'PT en ejecución (yo supervisor)',
      count: data.myActiveWorkPermits,
      href: '/operaciones/permisos',
    },
    {
      icon: Calendar,
      iconColor: '#c2410c',
      iconBg: 'rgba(234,88,12,0.14)',
      label: 'PT próximos 7 días',
      count: data.myUpcomingPermits,
      href: '/operaciones/permisos',
    },
  ];
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((r) => {
        const Icon = r.icon;
        const empty = r.count === 0;
        return (
          <li key={r.label}>
            <Link
              href={r.href}
              className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
              style={{ opacity: empty ? 0.65 : 1 }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                style={{ backgroundColor: r.iconBg, color: r.iconColor }}
              >
                <Icon size={14} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--text-primary)] truncate">{r.label}</div>
                {r.hint && (
                  <div className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                    {r.hint}
                  </div>
                )}
              </div>
              <span className="font-mono text-base font-semibold text-[var(--text-primary)]">
                {r.count}
              </span>
              <ChevronRight
                size={14}
                className="text-[var(--text-secondary)] transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default MyTasksWidget;
