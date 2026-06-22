'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  ShieldAlert,
  UserCheck,
  UserX,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { KpiCard } from '../../../components/operations/dashboard/KpiCard';
import { DocumentStatusBadge } from '../../../components/operations/DocumentStatusBadge';
import type { DerivedDocumentStatus } from '../../../components/operations/DocumentStatusBadge';
import { apiClient } from '../../../lib/api';
import { formatCLP } from '../../../lib/formatters';

/* ---- API shapes -------------------------------------------------- */

interface AreaCount {
  area: string;
  count: number;
}

interface DashboardAlert {
  employeeId: string;
  nombre: string;
  tipoDocumento: string;
  fechaVencimiento: string;
  estado: string;
  diasRestantes: number;
}

interface CertAlert {
  employeeId: string;
  employeeName: string;
  name: string;
  type: string;
  expiryDate: string;
  status: string;
  diasRestantes: number;
}

interface DashboardData {
  headcount: number;
  masaSalarialBruto: number | string;
  masaSalarialLiquido: number | string;
  byArea: AreaCount[];
  alerts: DashboardAlert[];
  /* new fields from extended API */
  dotacionActiva?: number;
  disponiblesHoy?: number;
  noDisponiblesHoy?: number;
  certificacionesPorVencer?: number;
  certificacionesVencidas?: number;
  certAlertas?: CertAlert[];
}

interface Employee {
  id: string;
  nombre: string;
  cargo: string;
  area: string;
  estado: string;
}

/* ---- Helpers ----------------------------------------------------- */

function normaliseAlertStatus(estado: string): DerivedDocumentStatus {
  const map: Record<string, DerivedDocumentStatus> = {
    VENCIDO: 'VENCIDO',
    POR_VENCER: 'POR_VENCER',
    VIGENTE: 'VIGENTE',
  };
  return map[estado] ?? 'POR_VENCER';
}

function normaliseCertStatus(status: string): DerivedDocumentStatus {
  if (status === 'VENCIDA') return 'VENCIDO';
  if (status === 'POR_VENCER') return 'POR_VENCER';
  return 'VIGENTE';
}

const CERT_TYPE_LABELS: Record<string, string> = {
  PILOTO_DRONE: 'Piloto de Drone',
  SEGURIDAD: 'Seguridad',
  TECNICA: 'Técnica',
  CLIENTE: 'Cliente',
  FAENA: 'Faena',
  INDUCCION: 'Inducción',
};

function certTypeLabel(type: string): string {
  return CERT_TYPE_LABELS[type] ?? type;
}

function alertHint(dias: number): string {
  if (dias < 0) return `vencido hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`;
  if (dias === 0) return 'vence hoy';
  return `vence en ${dias} día${dias === 1 ? '' : 's'}`;
}

function alertSortKey(a: DashboardAlert): number {
  if (a.estado === 'VENCIDO') return a.diasRestantes - 100000;
  return a.diasRestantes;
}

function certAlertSortKey(a: CertAlert): number {
  if (a.status === 'VENCIDA') return a.diasRestantes - 100000;
  return a.diasRestantes;
}

/* Thin skeleton bar */
function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-[rgba(128,128,128,0.12)] ${className}`}
    />
  );
}

/* Section wrapper matching operaciones SectionCard */
function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* Empty hint */
function EmptyHint({ text }: { text: string }) {
  return (
    <p className="py-6 text-center text-xs text-[var(--text-secondary)]">{text}</p>
  );
}

/* ---- Page -------------------------------------------------------- */

export default function RrhhDashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingDash, setLoadingDash] = useState(true);
  const [loadingEmp, setLoadingEmp] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Fetch dashboard summary once */
  useEffect(() => {
    setLoadingDash(true);
    apiClient
      .get<DashboardData>('/api/rrhh/dashboard')
      .then((data) => setDashboard(data))
      .catch(() => setError('No se pudo cargar el dashboard de RRHH.'))
      .finally(() => setLoadingDash(false));
  }, []);

  /* Fetch employee list once (for recent workers section) */
  useEffect(() => {
    setLoadingEmp(true);
    apiClient
      .get<Employee[]>('/api/rrhh/employees')
      .then((data) => setEmployees(data))
      .catch(() => {/* non-fatal */})
      .finally(() => setLoadingEmp(false));
  }, []);

  /* Derived values */
  const bruto = dashboard ? Number(dashboard.masaSalarialBruto) : 0;
  const liquido = dashboard ? Number(dashboard.masaSalarialLiquido) : 0;
  const alertCount = dashboard?.alerts.length ?? 0;

  const sortedAlerts = dashboard
    ? [...dashboard.alerts].sort((a, b) => alertSortKey(a) - alertSortKey(b))
    : [];

  const maxAreaCount =
    dashboard && dashboard.byArea.length > 0
      ? Math.max(...dashboard.byArea.map((a) => a.count))
      : 1;

  const recentEmployees = employees.slice(0, 6);

  /* Cert alert derived */
  const certAlertas = dashboard?.certAlertas ?? [];
  const sortedCertAlerts = [...certAlertas].sort(
    (a, b) => certAlertSortKey(a) - certAlertSortKey(b),
  );
  const porVencer = dashboard?.certificacionesPorVencer ?? 0;
  const vencidas = dashboard?.certificacionesVencidas ?? 0;
  const certAlertTotal = porVencer + vencidas;
  const certAlertValueColor =
    vencidas > 0 ? '#b91c1c' : porVencer > 0 ? '#d97706' : undefined;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
        >
          Dashboard RRHH
        </h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
          Resumen general de recursos humanos
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* KPI grid — row 1: headcount + masa salarial */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {loadingDash ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))
        ) : dashboard ? (
          <>
            <KpiCard
              label="Trabajadores"
              value={String(dashboard.headcount)}
              subtitle="Activos en la empresa"
              icon={Users}
              href="/rrhh/trabajadores"
            />
            <KpiCard
              label="Masa salarial bruta"
              value={formatCLP(bruto)}
              subtitle="Suma sueldos brutos"
              icon={Banknote}
            />
            <KpiCard
              label="Masa salarial líquida"
              value={formatCLP(liquido)}
              subtitle="Suma sueldos líquidos"
              icon={Wallet}
            />
            <KpiCard
              label="Alertas de vencimiento"
              value={String(alertCount)}
              subtitle={alertCount > 0 ? 'Documentos por atender' : 'Sin alertas pendientes'}
              icon={AlertTriangle}
              valueColor={alertCount > 0 ? '#b91c1c' : undefined}
              href="/rrhh/documentos"
            />
          </>
        ) : null}
      </div>

      {/* KPI grid — row 2: dotación + disponibilidad + certificaciones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loadingDash ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))
        ) : dashboard ? (
          <>
            <KpiCard
              label="Dotación activa"
              value={String(dashboard.dotacionActiva ?? dashboard.headcount)}
              subtitle="Personal en dotación"
              icon={Users}
              href="/rrhh/trabajadores"
            />
            <KpiCard
              label="Disponibles hoy"
              value={String(dashboard.disponiblesHoy ?? 0)}
              subtitle="Pueden ser asignados"
              icon={UserCheck}
              valueColor="#16a34a"
            />
            <KpiCard
              label="No disponibles hoy"
              value={String(dashboard.noDisponiblesHoy ?? 0)}
              subtitle="Vacaciones, licencia u otro"
              icon={UserX}
            />
            <KpiCard
              label="Certificaciones por vencer"
              value={String(porVencer)}
              subtitle={
                vencidas > 0
                  ? `${vencidas} vencida${vencidas !== 1 ? 's' : ''} — requiere acción`
                  : porVencer > 0
                  ? 'Requieren renovación pronto'
                  : 'Sin alertas de certificaciones'
              }
              icon={ShieldAlert}
              valueColor={certAlertValueColor}
              href="/rrhh/certificaciones"
            />
          </>
        ) : null}
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT — cert alerts + doc alerts + workers */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Certificaciones por vencer / vencidas */}
          <SectionCard
            title="Certificaciones por vencer / vencidas"
            action={
              <Link
                href="/rrhh/certificaciones"
                className="text-xs text-[#2563eb] hover:underline"
              >
                Ver certificaciones →
              </Link>
            }
          >
            {loadingDash ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : sortedCertAlerts.length === 0 ? (
              <EmptyHint text="Sin certificaciones por vencer o vencidas. Todo al día." />
            ) : (
              <div className="flex flex-col divide-y divide-[var(--border-color)]">
                {sortedCertAlerts.map((alert) => (
                  <div
                    key={`${alert.employeeId}-${alert.name}-${alert.type}`}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {alert.employeeName}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] truncate">
                        {alert.name}{' '}
                        <span className="opacity-60">— {certTypeLabel(alert.type)}</span>
                      </p>
                    </div>
                    <DocumentStatusBadge
                      status={normaliseCertStatus(alert.status)}
                      hint={alertHint(alert.diasRestantes)}
                    />
                  </div>
                ))}
                {certAlertTotal > sortedCertAlerts.length && (
                  <p className="pt-3 text-center text-xs text-[var(--text-secondary)]">
                    Mostrando {sortedCertAlerts.length} de {certAlertTotal}.{' '}
                    <Link href="/rrhh/certificaciones" className="text-[#2563eb] hover:underline">
                      Ver todas
                    </Link>
                  </p>
                )}
              </div>
            )}
          </SectionCard>

          {/* Centro de alertas */}
          <SectionCard
            title="Centro de alertas"
            action={
              <Link
                href="/rrhh/documentos"
                className="text-xs text-[#2563eb] hover:underline"
              >
                Ver documentos →
              </Link>
            }
          >
            {loadingDash ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : sortedAlerts.length === 0 ? (
              <EmptyHint text="Sin alertas de vencimiento. Todos los documentos están al día." />
            ) : (
              <div className="flex flex-col divide-y divide-[var(--border-color)]">
                {sortedAlerts.map((alert) => (
                  <div
                    key={`${alert.employeeId}-${alert.tipoDocumento}`}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {alert.nombre}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] truncate">
                        {alert.tipoDocumento}
                      </p>
                    </div>
                    <DocumentStatusBadge
                      status={normaliseAlertStatus(alert.estado)}
                      hint={`(${alertHint(alert.diasRestantes)})`}
                    />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Trabajadores recientes */}
          <SectionCard
            title="Trabajadores"
            action={
              <Link
                href="/rrhh/trabajadores"
                className="text-xs text-[#2563eb] hover:underline"
              >
                Ver todos →
              </Link>
            }
          >
            {loadingEmp ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : recentEmployees.length === 0 ? (
              <EmptyHint text="No hay trabajadores registrados." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-color)] bg-[rgba(128,128,128,0.04)]">
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                        Nombre
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                        Cargo
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                        Área
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentEmployees.map((emp) => (
                      <tr
                        key={emp.id}
                        className="border-b border-[var(--border-color)] last:border-0 hover:bg-[rgba(128,128,128,0.04)] transition-colors"
                      >
                        <td className="px-3 py-2.5 font-medium text-[var(--text-primary)]">
                          <Link
                            href="/rrhh/trabajadores"
                            className="hover:text-[#2563eb] transition-colors"
                          >
                            {emp.nombre}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                          {emp.cargo}
                        </td>
                        <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                          {emp.area}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={[
                              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                              emp.estado === 'ACTIVO'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
                            ].join(' ')}
                          >
                            {emp.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {employees.length > 6 && (
                  <p className="mt-3 text-center text-xs text-[var(--text-secondary)]">
                    Mostrando 6 de {employees.length} trabajadores.{' '}
                    <Link href="/rrhh/trabajadores" className="text-[#2563eb] hover:underline">
                      Ver todos
                    </Link>
                  </p>
                )}
              </div>
            )}
          </SectionCard>
        </div>

        {/* RIGHT — trabajadores por área + quick links */}
        <div className="flex flex-col gap-6">
          <SectionCard
            title="Trabajadores por área"
            action={
              <Link
                href="/rrhh/trabajadores"
                className="text-xs text-[#2563eb] hover:underline"
              >
                Ver detalle →
              </Link>
            }
          >
            {loadingDash ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : !dashboard || dashboard.byArea.length === 0 ? (
              <EmptyHint text="Sin datos de áreas." />
            ) : (
              <div className="flex flex-col gap-3">
                {[...dashboard.byArea]
                  .sort((a, b) => b.count - a.count)
                  .map((area) => {
                    const pct = Math.round((area.count / maxAreaCount) * 100);
                    return (
                      <div key={area.area}>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                            {area.area}
                          </span>
                          <span className="text-xs font-semibold text-[var(--text-secondary)] shrink-0">
                            {area.count}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-[rgba(128,128,128,0.14)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              background: '#2563eb',
                              opacity: 0.75 + (pct / 100) * 0.25,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </SectionCard>

          {/* Quick links */}
          <SectionCard title="Accesos rápidos">
            <div className="flex flex-col gap-2">
              {[
                { label: 'Liquidaciones de sueldo', href: '/rrhh/liquidaciones' },
                { label: 'Vacaciones', href: '/rrhh/vacaciones' },
                { label: 'Licencias médicas', href: '/rrhh/licencias' },
                { label: 'Certificaciones', href: '/rrhh/certificaciones' },
                { label: 'Disponibilidad', href: '/rrhh/disponibilidad' },
                { label: 'Documentos', href: '/rrhh/documentos' },
                { label: 'Finiquitos', href: '/rrhh/finiquitos' },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center justify-between rounded-lg border border-[var(--border-color)] px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[rgba(37,99,235,0.06)] hover:border-[#2563eb] transition-colors"
                >
                  {link.label}
                  <span className="text-[var(--text-secondary)] text-xs">→</span>
                </Link>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
