'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  FileText,
  ShieldOff,
  Wrench,
  Activity,
} from 'lucide-react';
import type { DashboardActivityEvent } from './types';

interface ActivityStreamItemProps {
  event: DashboardActivityEvent;
}

const typeMeta: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  document: { icon: FileText, color: '#1d4ed8', bg: 'rgba(37,99,235,0.12)' },
  alert: { icon: AlertCircle, color: '#b91c1c', bg: 'rgba(239,68,68,0.12)' },
  'asset-status': { icon: Wrench, color: '#a16207', bg: 'rgba(234,179,8,0.14)' },
  'work-permit': { icon: CheckCircle2, color: '#0d9488', bg: 'rgba(20,184,166,0.12)' },
  procedure: { icon: BookOpen, color: '#7c3aed', bg: 'rgba(124,58,237,0.12)' },
  exception: { icon: ShieldOff, color: '#c2410c', bg: 'rgba(234,88,12,0.14)' },
};

function formatRelative(when: string): string {
  const t = new Date(when).getTime();
  const diffMs = Date.now() - t;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'hace instantes';
  const min = Math.round(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const days = Math.round(hr / 24);
  if (days < 30) return `hace ${days} día${days === 1 ? '' : 's'}`;
  const months = Math.round(days / 30);
  return `hace ${months} mes${months === 1 ? '' : 'es'}`;
}

export function ActivityStreamItem({ event }: ActivityStreamItemProps) {
  const meta = typeMeta[event.type] ?? {
    icon: Activity,
    color: '#475569',
    bg: 'rgba(100,116,139,0.14)',
  };
  const Icon = meta.icon;
  const initials = event.user
    ? `${event.user.firstName?.[0] ?? ''}${event.user.lastName?.[0] ?? ''}`.toUpperCase() || 'SI'
    : 'SI';
  return (
    <Link
      href={event.linkPath}
      className="flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
    >
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: meta.bg, color: meta.color }}
      >
        <Icon size={14} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[var(--text-primary)] truncate">{event.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold"
            style={{
              backgroundColor: 'rgba(99,102,241,0.18)',
              color: '#4338ca',
            }}
          >
            {initials}
          </span>
          <span>{formatRelative(event.timestamp)}</span>
        </div>
      </div>
    </Link>
  );
}

export default ActivityStreamItem;
