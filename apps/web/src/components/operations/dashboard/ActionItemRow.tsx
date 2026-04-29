'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';

interface ActionItemRowProps {
  icon: LucideIcon;
  /* Severity colors the dot + accent. 'red' is the catastrophic
     'someone needs to act now', 'orange' is the 'this week' warning. */
  tone: 'red' | 'orange';
  title: string;
  detail?: string;
  href: string;
}

const toneStyles: Record<ActionItemRowProps['tone'], { dot: string; ring: string }> = {
  red: { dot: '#dc2626', ring: 'rgba(220,38,38,0.18)' },
  orange: { dot: '#ea580c', ring: 'rgba(234,88,12,0.18)' },
};

export function ActionItemRow({ icon: Icon, tone, title, detail, href }: ActionItemRowProps) {
  const style = toneStyles[tone];
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--hover-bg,rgba(0,0,0,0.04))]"
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg"
        style={{ backgroundColor: style.ring, color: style.dot }}
      >
        <Icon size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--text-primary)] truncate">{title}</div>
        {detail && (
          <div className="mt-0.5 text-xs text-[var(--text-secondary)] truncate">{detail}</div>
        )}
      </div>
      <ChevronRight
        size={16}
        className="text-[var(--text-secondary)] transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

export default ActionItemRow;
