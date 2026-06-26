'use client';

/* HR-015 — Tablero de disponibilidad. READ-ONLY team board consolidating
 * availability (HR-011/HR-012), the certification matriz (HR-014) and team alerts.
 * No actions here — each item links to the employee's ficha where the action
 * lives. Visible to RRHH-reading roles (MANAGER/ADMIN/SUPER_ADMIN); others 403.
 * No salary data. Tokens: accent #2563eb, Outfit headings. Dates UTC. */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, ChevronRight } from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/api';

const ACCENT = '#2563eb';

const AREA_LABELS: Record<string, string> = {
  OPERACIONES: 'Operaciones',
  ADMINISTRACION: 'Administración',
  COMERCIAL: 'Comercial',
  GERENCIA: 'Gerencia',
  FINANZAS: 'Finanzas',
  PREVENCION_RIESGOS: 'Prevención de Riesgos',
  MANTENIMIENTO: 'Mantenimiento',
  RRHH: 'RRHH',
};
const STATE_META: Record<string, { label: string; bg: string; fg: string }> = {
  DISPONIBLE: { label: 'Disponible', bg: 'rgba(34,197,94,0.12)', fg: '#15803d' },
  VACACIONES: { label: 'Vacaciones', bg: 'rgba(37,99,235,0.12)', fg: '#1d4ed8' },
  NO_DISPONIBLE: { label: 'No disponible', bg: 'rgba(234,179,8,0.16)', fg: '#a16207' },
};
/* Same colour language as ComplianceGauge / DocumentStatusBadge. */
const CELL_META: Record<string, { label: string; bg: string; fg: string }> = {
  VIGENTE: { label: 'Al día', bg: 'rgba(34,197,94,0.12)', fg: '#15803d' },
  POR_VENCER: { label: 'Por vencer', bg: 'rgba(234,179,8,0.14)', fg: '#a16207' },
  VENCIDA: { label: 'Vencida', bg: 'rgba(239,68,68,0.12)', fg: '#b91c1c' },
  FALTANTE: { label: 'Faltante', bg: 'rgba(239,68,68,0.12)', fg: '#b91c1c' },
};

function formatDateOnly(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
function todayInput(): string {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

interface AvailabilityRow {
  employeeId: string;
  fullName: string;
  cargo: string | null;
  area: string;
  state: keyof typeof STATE_META;
  reason: string | null;
  until: string | null;
}
interface Availability {
  date: string;
  summary: { total: number; disponibles: number; noDisponibles: number; vacaciones: number };
  employees: AvailabilityRow[];
}
interface MatrizRow {
  employeeId: string;
  fullName: string;
  cargo: string | null;
  area: string;
  compliancePercentage: number;
  cells: { certTypeName: string; status: keyof typeof CELL_META }[];
}
interface Matriz {
  columns: string[];
  rows: MatrizRow[];
}
interface Alertas {
  alertWindowDays: number;
  certifications: {
    certificationId: string;
    employeeId: string;
    employeeName: string;
    certTypeName: string;
    expiryDate: string;
    daysUntil: number;
    state: 'POR_VENCER' | 'VENCIDA';
  }[];
  contracts: {
    contractId: string;
    employeeId: string;
    employeeName: string;
    contractType: string;
    endDate: string;
    daysUntil: number;
    state: 'POR_VENCER' | 'VENCIDO';
  }[];
}

export default function DisponibilidadPage() {
  const [date, setDate] = useState(todayInput());
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [matriz, setMatriz] = useState<Matriz | null>(null);
  const [alertas, setAlertas] = useState<Alertas | null>(null);

  const loadAvailability = useCallback(async (d: string) => {
    const a = await apiClient.get<Availability>(`/api/rrhh/disponibilidad?date=${d}`);
    setAvailability(a);
  }, []);

  const loadAll = useCallback(async () => {
    setState('loading');
    try {
      const [a, m, al] = await Promise.all([
        apiClient.get<Availability>(`/api/rrhh/disponibilidad?date=${date}`),
        apiClient.get<Matriz>('/api/rrhh/disponibilidad/matriz'),
        apiClient.get<Alertas>('/api/rrhh/disponibilidad/alertas'),
      ]);
      setAvailability(a);
      setMatriz(m);
      setAlertas(al);
      setState('ok');
    } catch (e) {
      setState(e instanceof ApiError && e.status === 403 ? 'forbidden' : 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onDateChange = async (d: string) => {
    setDate(d);
    try {
      await loadAvailability(d);
    } catch {
      /* keep the rest of the board; availability stays as-is on error */
    }
  };

  return (
    <div className="pt-2">
      <div className="mb-4 flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: ACCENT }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Disponibilidad del equipo
        </h1>
      </div>

      {state === 'loading' && (
        <p className="text-sm text-[var(--text-secondary)]">Cargando tablero…</p>
      )}
      {state === 'forbidden' && (
        <p className="text-sm text-[var(--text-secondary)]">
          No tienes permiso para ver el tablero de disponibilidad.
        </p>
      )}
      {state === 'error' && <p className="text-sm text-red-600">No se pudo cargar el tablero.</p>}

      {state === 'ok' && availability && matriz && alertas && (
        <div className="space-y-6">
          {/* Availability for the selected date */}
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2
                className="text-sm font-semibold text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
              >
                Disponibilidad
              </h2>
              <div className="flex items-center gap-2">
                <label className="text-xs text-[var(--text-secondary)]">Fecha</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => onDateChange(e.target.value)}
                  className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <Stat label="Disponibles" value={availability.summary.disponibles} color="#15803d" />
              <Stat label="Vacaciones" value={availability.summary.vacaciones} color="#1d4ed8" />
              <Stat
                label="No disponibles"
                value={availability.summary.noDisponibles}
                color="#a16207"
              />
              <Stat label="Total" value={availability.summary.total} />
            </div>
            {availability.employees.length === 0 ? (
              <Empty>No hay trabajadores activos.</Empty>
            ) : (
              <div className="divide-y divide-[var(--border-color)]">
                {availability.employees.map((r) => (
                  <Link
                    key={r.employeeId}
                    href={`/rrhh/trabajadores/${r.employeeId}`}
                    className="flex items-center justify-between gap-2 py-2.5 hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm text-[var(--text-primary)]">
                        {r.fullName}
                      </div>
                      <div className="truncate text-xs text-[var(--text-secondary)]">
                        {r.cargo ?? 'Sin cargo'} · {AREA_LABELS[r.area] ?? r.area}
                        {r.reason ? ` · ${r.reason}` : ''}
                        {r.until ? ` (hasta ${formatDateOnly(r.until)})` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StateChip state={r.state} />
                      <ChevronRight size={16} className="shrink-0 text-[var(--text-secondary)]" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Certification matriz */}
          <Card>
            <h2
              className="mb-3 text-sm font-semibold text-[var(--text-primary)]"
              style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
            >
              Matriz de certificaciones (requeridas por cargo)
            </h2>
            {matriz.columns.length === 0 ? (
              <Empty>Ningún cargo define certificaciones requeridas.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-color)] text-left text-xs text-[var(--text-secondary)]">
                      <th className="py-2 pr-3 font-medium">Trabajador</th>
                      {matriz.columns.map((c) => (
                        <th key={c} className="px-2 py-2 font-medium">
                          {c}
                        </th>
                      ))}
                      <th className="px-2 py-2 font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]">
                    {matriz.rows.map((row) => {
                      const byName = Object.fromEntries(
                        row.cells.map((c) => [c.certTypeName, c.status]),
                      );
                      return (
                        <tr key={row.employeeId}>
                          <td className="py-2 pr-3">
                            <Link
                              href={`/rrhh/trabajadores/${row.employeeId}`}
                              className="text-[var(--text-primary)] hover:opacity-80"
                            >
                              {row.fullName}
                            </Link>
                            <div className="text-[10px] text-[var(--text-secondary)]">
                              {row.cargo ?? 'Sin cargo'}
                            </div>
                          </td>
                          {matriz.columns.map((c) => {
                            const st = byName[c];
                            return (
                              <td key={c} className="px-2 py-2">
                                {st ? (
                                  <span
                                    className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                                    style={{
                                      background: (CELL_META[st] ?? CELL_META.FALTANTE).bg,
                                      color: (CELL_META[st] ?? CELL_META.FALTANTE).fg,
                                    }}
                                  >
                                    {(CELL_META[st] ?? CELL_META.FALTANTE).label}
                                  </span>
                                ) : (
                                  <span className="text-[var(--text-secondary)]">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-2 py-2 text-[var(--text-secondary)]">
                            {row.compliancePercentage}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Consolidated alerts */}
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle size={16} className="text-[var(--text-secondary)]" />
              <h2
                className="text-sm font-semibold text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
              >
                Alertas del equipo ({alertas.alertWindowDays} días)
              </h2>
            </div>
            {alertas.certifications.length === 0 && alertas.contracts.length === 0 ? (
              <Empty>Sin certificaciones ni contratos próximos a vencer.</Empty>
            ) : (
              <div className="space-y-1.5">
                {alertas.certifications.map((a) => (
                  <AlertRow
                    key={a.certificationId}
                    employeeId={a.employeeId}
                    title={`${a.employeeName} — ${a.certTypeName}`}
                    sub={`Certificación · vence ${formatDateOnly(a.expiryDate)}`}
                    state={a.state}
                    days={a.daysUntil}
                  />
                ))}
                {alertas.contracts.map((a) => (
                  <AlertRow
                    key={a.contractId}
                    employeeId={a.employeeId}
                    title={`${a.employeeName} — contrato ${a.contractType}`}
                    sub={`Contrato · vence ${formatDateOnly(a.endDate)}`}
                    state={a.state === 'VENCIDO' ? 'VENCIDA' : 'POR_VENCER'}
                    days={a.daysUntil}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      {children}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--text-secondary)]">{children}</p>;
}
function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-center">
      <div className="text-lg font-semibold" style={{ color: color ?? 'var(--text-primary)' }}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </div>
    </div>
  );
}
function StateChip({ state }: { state: string }) {
  const m = STATE_META[state] ?? STATE_META.DISPONIBLE;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}
function AlertRow({
  employeeId,
  title,
  sub,
  state,
  days,
}: {
  employeeId: string;
  title: string;
  sub: string;
  state: keyof typeof CELL_META;
  days: number;
}) {
  const m = CELL_META[state] ?? CELL_META.POR_VENCER;
  return (
    <Link
      href={`/rrhh/trabajadores/${employeeId}`}
      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 hover:opacity-80"
    >
      <div className="flex items-center gap-2">
        <CalendarClock size={14} className="text-[var(--text-secondary)]" />
        <div className="min-w-0">
          <div className="truncate text-sm text-[var(--text-primary)]">{title}</div>
          <div className="truncate text-xs text-[var(--text-secondary)]">{sub}</div>
        </div>
      </div>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={{ background: m.bg, color: m.fg }}
      >
        {days < 0 ? `${m.label} (hace ${Math.abs(days)}d)` : `${m.label} (en ${days}d)`}
      </span>
    </Link>
  );
}
