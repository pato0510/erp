'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string;
  subtitle?: string;
  icon?: LucideIcon;
  /* Hex string (or any CSS color). When provided, both the value and
     the icon take this color. Lets the page choose threshold colors
     from a single source. */
  valueColor?: string;
  /* When set, the entire card becomes a navigation link. */
  href?: string;
}

export function KpiCard({ label, value, subtitle, icon: Icon, valueColor, href }: KpiCardProps) {
  const inner = (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5 h-full transition-transform hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          {label}
        </span>
        {Icon && (
          <Icon size={18} style={{ color: valueColor ?? 'var(--text-secondary)' }} aria-hidden />
        )}
      </div>
      <div
        className="mt-2 text-3xl font-semibold leading-none"
        style={{ color: valueColor ?? 'var(--text-primary)' }}
      >
        {value}
      </div>
      {subtitle && <div className="mt-2 text-xs text-[var(--text-secondary)]">{subtitle}</div>}
    </div>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="block focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-xl"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

export default KpiCard;
