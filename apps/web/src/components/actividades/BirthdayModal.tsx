'use client';

import { Cake, X } from 'lucide-react';
import type { BirthdayEntry } from './activityTypes';

/* CAL-006 — a minimal READ-ONLY birthday card. Birthdays are DERIVED from RRHH (decision d),
   not editable — so this modal has ZERO actions for EVERY role, MANAGER included. It shows the
   name and "Cumpleaños · DD de <mes>" and nothing else: no year, no age, no link to the
   employee (the payload structurally cannot carry them). */

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function BirthdayModal({
  birthday,
  onClose,
}: {
  birthday: BirthdayEntry;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-start justify-between border-b border-[var(--border-color)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: 'rgba(219,39,119,0.14)', color: '#db2777' }}
            >
              <Cake size={16} />
            </span>
            <h2
              className="text-lg font-semibold text-[var(--text-primary)]"
              style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
            >
              {birthday.fullName}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-5 text-sm text-[var(--text-secondary)]">
          Cumpleaños · {birthday.day} de {MONTH_NAMES[birthday.month - 1]}
        </div>
      </div>
    </div>
  );
}

export default BirthdayModal;
