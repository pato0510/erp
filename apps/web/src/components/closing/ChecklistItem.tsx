'use client';

import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

export type ChecklistStatus = 'OK' | 'WARNING' | 'BLOCKED';

export interface ChecklistItemData {
  key: string;
  label: string;
  status: ChecklistStatus;
  detail: string;
  count: number;
}

const STATUS_MAP: Record<
  ChecklistStatus,
  { icon: React.ElementType; iconColor: string; cardCls: string; label: string; labelCls: string }
> = {
  OK: {
    icon: CheckCircle2,
    iconColor: 'text-green-600',
    cardCls: 'border-green-200 bg-green-50',
    label: 'OK',
    labelCls: 'bg-green-100 text-green-700',
  },
  WARNING: {
    icon: AlertTriangle,
    iconColor: 'text-yellow-500',
    cardCls: 'border-yellow-200 bg-yellow-50',
    label: 'Atención',
    labelCls: 'bg-yellow-100 text-yellow-700',
  },
  BLOCKED: {
    icon: XCircle,
    iconColor: 'text-red-500',
    cardCls: 'border-red-200 bg-red-50',
    label: 'Bloqueado',
    labelCls: 'bg-red-100 text-red-700',
  },
};

export function ChecklistItem({ item }: { item: ChecklistItemData }) {
  const entry = STATUS_MAP[item.status];
  const Icon = entry.icon;
  return (
    <div className={`flex items-start gap-3 p-4 border rounded-xl ${entry.cardCls}`}>
      <Icon size={22} className={`${entry.iconColor} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-gray-900">{item.label}</p>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${entry.labelCls}`}>
            {entry.label}
          </span>
          {item.count > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
              {item.count}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-600 mt-1">{item.detail}</p>
      </div>
    </div>
  );
}
