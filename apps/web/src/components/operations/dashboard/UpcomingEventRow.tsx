'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { FileText, ShieldCheck, Wrench, BookMarked } from 'lucide-react';

export type UpcomingEventKind = 'document' | 'permit' | 'work-permit' | 'acknowledgment';

interface UpcomingEventRowProps {
  kind: UpcomingEventKind;
  title: string;
  subtitle?: string;
  daysRemaining: number | null;
  href: string;
}

const KIND_META: Record<UpcomingEventKind, { icon: LucideIcon; chip: string; chipBg: string }> = {
  document: { icon: FileText, chip: '#1d4ed8', chipBg: 'rgba(37,99,235,0.12)' },
  permit: { icon: ShieldCheck, chip: '#0f766e', chipBg: 'rgba(15,118,110,0.12)' },
  'work-permit': { icon: Wrench, chip: '#a16207', chipBg: 'rgba(202,138,4,0.14)' },
  acknowledgment: { icon: BookMarked, chip: '#7c3aed', chipBg: 'rgba(124,58,237,0.14)' },
};

const KIND_LABEL: Record<UpcomingEventKind, string> = {
  document: 'DOC',
  permit: 'PERMISO',
  'work-permit': 'PT',
  acknowledgment: 'ACUSE',
};

function badgeStyleForDays(days: number | null): { bg: string; fg: string; label: string } {
  if (days === null) return { bg: 'rgba(100,116,139,0.18)', fg: '#475569', label: '—' };
  if (days <= 0) return { bg: 'rgba(239,68,68,0.18)', fg: '#b91c1c', label: 'hoy' };
  if (days <= 7) return { bg: 'rgba(249,115,22,0.18)', fg: '#c2410c', label: `${days}d` };
  if (days <= 30) return { bg: 'rgba(234,179,8,0.18)', fg: '#a16207', label: `${days}d` };
  return { bg: 'rgba(34,197,94,0.18)', fg: '#15803d', label: `${days}d` };
}

export function UpcomingEventRow({
  kind,
  title,
  subtitle,
  daysRemaining,
  href,
}: UpcomingEventRowProps) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const badge = badgeStyleForDays(daysRemaining);
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: meta.chipBg, color: meta.chip }}
      >
        <Icon size={14} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide"
            style={{ backgroundColor: meta.chipBg, color: meta.chip }}
          >
            {KIND_LABEL[kind]}
          </span>
          <span className="truncate text-sm text-[var(--text-primary)]">{title}</span>
        </div>
        {subtitle && (
          <div className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{subtitle}</div>
        )}
      </div>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{ backgroundColor: badge.bg, color: badge.fg }}
      >
        {badge.label}
      </span>
    </Link>
  );
}

export default UpcomingEventRow;
