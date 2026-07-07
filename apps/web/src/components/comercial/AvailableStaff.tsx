'use client';

import { useState } from 'react';
import { UserCheck, Users } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';

/* COM-012 — "Personal disponible": the PII-safe availability projection on screen. Asks
   the Comercial endpoint (which consumes ONLY RRHH's reason-free forServiceDisponibles)
   "who is available on date X?" and lists AVAILABLE staff (fullName + cargo). Never
   shows non-available people or any (health-adjacent) reason — the backend guarantees
   that. Rendered by the page ONLY when availability.read is true (RRHH §1.2 audience:
   MANAGER/ADMIN/SUPER_ADMIN); ACCOUNTANT never sees this section. A raced 403 is relayed
   cleanly. */

interface Staff {
  employeeId: string;
  fullName: string;
  cargo: string | null;
}

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function AvailableStaff() {
  const [date, setDate] = useState(todayStr());
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'forbidden' | 'error'>('idle');

  const consultar = async () => {
    setState('loading');
    try {
      const rows = await apiClient.get<Staff[]>(
        `/api/comercial/available-staff${date ? `?date=${date}` : ''}`,
      );
      setStaff(rows);
      setState('ok');
    } catch (e) {
      setState(e instanceof ApiError && e.status === 403 ? 'forbidden' : 'error');
    }
  };

  return (
    <div className="mt-4">
      <h2
        className="mb-3 text-sm font-semibold text-[var(--text-primary)]"
        style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
      >
        Personal disponible
      </h2>

      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Fecha
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </div>
          <button
            onClick={consultar}
            disabled={state === 'loading'}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: '#2563eb' }}
          >
            <Users size={15} /> {state === 'loading' ? 'Consultando…' : 'Consultar'}
          </button>
        </div>

        <div className="mt-4">
          {state === 'idle' && (
            <p className="text-sm text-[var(--text-secondary)]">
              Elegí una fecha y consultá quién está disponible.
            </p>
          )}
          {state === 'forbidden' && (
            <p className="text-sm text-[var(--text-secondary)]">
              No tienes permiso para ver la disponibilidad de personal.
            </p>
          )}
          {state === 'error' && (
            <p className="text-sm text-red-600">No se pudo consultar la disponibilidad.</p>
          )}
          {state === 'ok' && staff && (
            <>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                {staff.length === 1
                  ? '1 persona disponible'
                  : `${staff.length} personas disponibles`}
              </p>
              {staff.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  Sin personal disponible para esa fecha.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border-color)] rounded-lg border border-[var(--border-color)]">
                  {staff.map((s) => (
                    <li key={s.employeeId} className="flex items-center gap-3 px-3 py-2">
                      <UserCheck size={15} style={{ color: '#15803d' }} />
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {s.fullName}
                      </span>
                      <span className="ml-auto text-xs text-[var(--text-secondary)]">
                        {s.cargo ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AvailableStaff;
