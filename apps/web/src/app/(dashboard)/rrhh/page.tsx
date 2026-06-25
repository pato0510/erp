'use client';

/* HR-006 — RRHH dashboard. Read-only aggregations over data that already exists
 * (employees, employee_compensation, employee_documents). Reuses KpiCard.
 *
 * masa salarial gating mirrors the rest of RRHH: the backend exposes it on a
 * SEPARATE guarded endpoint (read EmployeeCompensation), so the card renders
 * only when that fetch returns 200 — MANAGER/ADMIN/SUPER_ADMIN and ACCOUNTANT
 * see it; VIEWER/ANALYST get 403 and no card. The backend decides; the UI
 * renders what it gets. KpiCard is reused as a pure UI component (no Operations
 * API coupling); every fetch targets /api/rrhh/*. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronRight, Clock, FileWarning, Users, Wallet } from 'lucide-react';
import { apiClient, ApiError } from '../../../lib/api';
import { formatCLP } from '../../../lib/formatters';
import { KpiCard } from '../../../components/operations/dashboard/KpiCard';

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
const STATUS_LABELS: Record<string, string> = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  DESVINCULADO: 'Desvinculado',
};

function formatDateOnly(date: string): string {
  return new Date(date).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

interface Overview {
  dotacion: {
    activos: number;
    total: number;
    porArea: { area: string; count: number }[];
    porEstado: { status: string; count: number }[];
  };
  documentos: {
    vencidos: number;
    porVencer: number;
    alDia: number;
    pendientesRevision: number;
    alertWindowDays: number;
  };
  alertasVencimiento: {
    documentId: string;
    employeeId: string;
    employeeName: string;
    documentTypeName: string;
    expiryDate: string;
    daysUntil: number;
    state: 'VENCIDO' | 'POR_VENCER';
  }[];
  recientes: {
    id: string;
    fullName: string;
    area: string;
    status: string;
    jobPosition: { id: string; name: string } | null;
  }[];
  contratos: { available: boolean; proximasRenovaciones: unknown[] };
  generatedAt: string;
}

interface Payroll {
  grossMonthly: number;
  employeesWithCompensation: number;
  employeesActive: number;
  employeesTotal: number;
  currency: string;
  netMonthly: number | null;
}

export default function RrhhDashboardPage() {
  const [ovState, setOvState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [payState, setPayState] = useState<'loading' | 'ok' | 'hidden'>('loading');
  const [payroll, setPayroll] = useState<Payroll | null>(null);

  useEffect(() => {
    apiClient
      .get<Overview>('/api/rrhh/dashboard/overview')
      .then((d) => {
        setOverview(d);
        setOvState('ok');
      })
      .catch((e) => {
        const status = e instanceof ApiError ? e.status : 0;
        setOvState(status === 403 ? 'forbidden' : 'error');
      });
    // payroll is a separately-guarded aggregate; 403 just hides the card
    apiClient
      .get<Payroll>('/api/rrhh/dashboard/payroll')
      .then((d) => {
        setPayroll(d);
        setPayState('ok');
      })
      .catch(() => setPayState('hidden'));
  }, []);

  return (
    <div className="pt-2">
      <div className="flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: ACCENT }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Recursos Humanos
        </h1>
      </div>

      {ovState === 'loading' && (
        <p className="mt-6 text-sm text-[var(--text-secondary)]">Cargando panel…</p>
      )}

      {/* ACCOUNTANT: no Employee read (overview 403) but may see the salary aggregate. */}
      {ovState === 'forbidden' && payState === 'ok' && payroll && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MasaSalarialCard payroll={payroll} />
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Tu rol solo tiene acceso al agregado de remuneraciones de la empresa.
          </p>
        </div>
      )}

      {ovState === 'forbidden' && payState !== 'ok' && (
        <p className="mt-6 text-sm text-[var(--text-secondary)]">
          No tienes permiso para ver el panel de Recursos Humanos.
        </p>
      )}

      {ovState === 'error' && (
        <p className="mt-6 text-sm text-red-600">No se pudo cargar el panel de RRHH.</p>
      )}

      {ovState === 'ok' && overview && (
        <div className="mt-6 space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Dotación activa"
              value={String(overview.dotacion.activos)}
              subtitle={`de ${overview.dotacion.total} trabajadores`}
              icon={Users}
              valueColor={ACCENT}
              href="/rrhh/trabajadores"
            />
            <KpiCard
              label="Documentos vencidos"
              value={String(overview.documentos.vencidos)}
              subtitle="requieren renovación"
              icon={FileWarning}
              valueColor={overview.documentos.vencidos > 0 ? '#b91c1c' : undefined}
            />
            <KpiCard
              label={`Por vencer (${overview.documentos.alertWindowDays}d)`}
              value={String(overview.documentos.porVencer)}
              subtitle="próximos a expirar"
              icon={CalendarClock}
              valueColor={overview.documentos.porVencer > 0 ? '#a16207' : undefined}
            />
            {payState === 'ok' && payroll ? (
              <MasaSalarialCard payroll={payroll} />
            ) : (
              <KpiCard
                label="Documentos pendientes"
                value={String(overview.documentos.pendientesRevision)}
                subtitle="en revisión"
                icon={Clock}
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Dotación por área */}
            <Card title="Dotación por área">
              {overview.dotacion.porArea.length === 0 ? (
                <Empty>No hay trabajadores activos.</Empty>
              ) : (
                <ul className="space-y-2">
                  {overview.dotacion.porArea.map((a) => {
                    const pct =
                      overview.dotacion.activos > 0
                        ? Math.round((a.count / overview.dotacion.activos) * 100)
                        : 0;
                    return (
                      <li key={a.area}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-[var(--text-primary)]">
                            {AREA_LABELS[a.area] ?? a.area}
                          </span>
                          <span className="text-[var(--text-secondary)]">{a.count}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-primary)]">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: ACCENT }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {/* Expiry-alert center */}
            <Card title="Centro de vencimientos">
              {overview.alertasVencimiento.length === 0 ? (
                <Empty>Sin documentos próximos a vencer.</Empty>
              ) : (
                <ul className="divide-y divide-[var(--border-color)]">
                  {overview.alertasVencimiento.map((a) => (
                    <li key={a.documentId}>
                      <Link
                        href={`/rrhh/trabajadores/${a.employeeId}`}
                        className="flex items-center justify-between gap-2 py-2 hover:opacity-80"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm text-[var(--text-primary)]">
                            {a.employeeName}
                          </div>
                          <div className="truncate text-xs text-[var(--text-secondary)]">
                            {a.documentTypeName} · {formatDateOnly(a.expiryDate)}
                          </div>
                        </div>
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={
                            a.state === 'VENCIDO'
                              ? { background: 'rgba(239,68,68,0.12)', color: '#b91c1c' }
                              : { background: 'rgba(234,179,8,0.14)', color: '#a16207' }
                          }
                        >
                          {a.state === 'VENCIDO'
                            ? `Vencido hace ${Math.abs(a.daysUntil)}d`
                            : `En ${a.daysUntil}d`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Trabajadores recientes */}
          <Card
            title="Trabajadores recientes"
            action={{ href: '/rrhh/trabajadores', label: 'Ver todos' }}
          >
            {overview.recientes.length === 0 ? (
              <Empty>Aún no hay trabajadores registrados.</Empty>
            ) : (
              <ul className="divide-y divide-[var(--border-color)]">
                {overview.recientes.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/rrhh/trabajadores/${e.id}`}
                      className="flex items-center justify-between gap-2 py-2.5 hover:opacity-80"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm text-[var(--text-primary)]">
                          {e.fullName}
                        </div>
                        <div className="truncate text-xs text-[var(--text-secondary)]">
                          {e.jobPosition?.name ?? 'Sin cargo'} · {AREA_LABELS[e.area] ?? e.area} ·{' '}
                          {STATUS_LABELS[e.status] ?? e.status}
                        </div>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-[var(--text-secondary)]" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Honest placeholders — datasets not built yet (no fabricated numbers) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Placeholder
              title="Próximas renovaciones de contrato"
              note="Disponible con Contratos (HR-007)."
            />
            <Placeholder title="Vacaciones y permisos" note="Disponible próximamente." />
            <Placeholder title="Certificaciones y habilitaciones" note="Disponible próximamente." />
          </div>
        </div>
      )}
    </div>
  );
}

function MasaSalarialCard({ payroll }: { payroll: Payroll }) {
  return (
    <KpiCard
      label="Masa salarial (bruta/mes)"
      value={formatCLP(payroll.grossMonthly)}
      subtitle={`${payroll.employeesWithCompensation} con remuneración registrada`}
      icon={Wallet}
      valueColor={ACCENT}
    />
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3
          className="text-sm font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          {title}
        </h3>
        {action && (
          <Link href={action.href} className="text-xs font-medium" style={{ color: ACCENT }}>
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--text-secondary)]">{children}</p>;
}

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <h3
        className="text-sm font-semibold text-[var(--text-primary)]"
        style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
      >
        {title}
      </h3>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{note}</p>
      <span className="mt-2 inline-block rounded-full bg-[var(--bg-primary)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
        Disponible próximamente
      </span>
    </div>
  );
}
