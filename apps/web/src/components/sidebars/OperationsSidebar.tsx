'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  Calendar,
  ClipboardCheck,
  FileText,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Moon,
  Settings,
  ShieldCheck,
  ShieldOff,
  Sun,
  Truck,
  Users,
  Wrench,
} from 'lucide-react';
import { apiClient } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../lib/theme';
import { SidebarBrand } from './SidebarBrand';

const navItems = [
  { href: '/operaciones', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/operaciones/equipos', label: 'Equipos', icon: Wrench },
  { href: '/operaciones/vehiculos', label: 'Vehículos', icon: Truck },
  { href: '/operaciones/documentos', label: 'Documentos', icon: FileText },
  { href: '/operaciones/excepciones', label: 'Excepciones', icon: ShieldOff },
  { href: '/operaciones/permisos', label: 'Permisos', icon: ShieldCheck },
  { href: '/operaciones/aprobaciones', label: 'Aprobaciones', icon: ClipboardCheck },
  { href: '/operaciones/procedimientos', label: 'Procedimientos', icon: BookOpen },
  { href: '/operaciones/mis-lecturas', label: 'Mis lecturas', icon: BookMarked },
  { href: '/operaciones/alertas', label: 'Alertas', icon: Bell },
  { href: '/operaciones/calendario', label: 'Calendario', icon: Calendar },
  { href: '/operaciones/reportes', label: 'Reportes', icon: BarChart3 },
];

const adminItems = [{ href: '/operaciones/configuracion', label: 'Configuración', icon: Settings }];

const PENDING_REVIEW_POLL_MS = 60_000;

export function OperationsSidebar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  /* OPS-019 — only count ACTIVE+CRITICAL/BLOCKING alerts in the badge so
     low-severity warnings don't drown the signal. */
  const [criticalAlertsCount, setCriticalAlertsCount] = useState(0);
  /* OPS-023 — pending exception requests; badge nudges admins to act. */
  const [pendingExceptionsCount, setPendingExceptionsCount] = useState(0);
  /* OPS-026 — approval queue items waiting on the current user. */
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  /* OPS-027 — procedures awaiting reviewer attention. */
  const [proceduresInReviewCount, setProceduresInReviewCount] = useState(0);
  /* OPS-028 — current user's pending readings. */
  const [myPendingReadingsCount, setMyPendingReadingsCount] = useState(0);

  /* Poll the pending-review count on mount and every minute. The endpoint is
     gated to ADMIN/MANAGER (CASL `approve` action) — for any other role the
     fetch silently fails and the badge stays at 0, matching the spec where
     non-reviewers don't need to see the queue. */
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const fetchCounts = () => {
      apiClient
        .get<{ count: number }>('/api/operations/documents/pending-review/count')
        .then((res) => {
          if (alive) setPendingReviewCount(res.count);
        })
        .catch(() => {
          /* CASL 403 or network blip — leave the badge as-is. */
        });
      apiClient
        .get<{ count: number }>('/api/operations/alerts/instances/active-count')
        .then((res) => {
          if (alive) setCriticalAlertsCount(res.count);
        })
        .catch(() => {
          /* Same forgiving behavior — VIEWER reads via CASL `read` so
             this should always succeed for authenticated users. */
        });
      apiClient
        .get<{ count: number }>('/api/operations/exceptions/pending-count')
        .then((res) => {
          if (alive) setPendingExceptionsCount(res.count);
        })
        .catch(() => undefined);
      apiClient
        .get<{ mine: number; pendingCompany: number; approvedTodayByUser: number }>(
          '/api/operations/permit-approvals/pending-counts',
        )
        .then((res) => {
          if (alive) setPendingApprovalsCount(res.mine);
        })
        .catch(() => undefined);
      apiClient
        .get<{ published: number; inReview: number; draft: number; withAck: number }>(
          '/api/operations/procedures/kpi',
        )
        .then((res) => {
          if (alive) setProceduresInReviewCount(res.inReview);
        })
        .catch(() => undefined);
      apiClient
        .get<{ count: number }>('/api/operations/acknowledgments/my-pending-count')
        .then((res) => {
          if (alive) setMyPendingReadingsCount(res.count);
        })
        .catch(() => undefined);
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, PENDING_REVIEW_POLL_MS);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [user]);

  if (!user) return null;

  return (
    <aside className="tn-sidebar">
      <div className="tn-sidebar__head">
        <Link href="/modulos" className="tn-back-modulos">
          ← Volver a módulos
        </Link>
        <SidebarBrand name="OPERACIONES" />
      </div>

      <nav className="tn-sidebar__nav">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;
          /* Pending-review badge lives on the Documentos item — capped at "99+"
             so it never breaks the row layout. The Alertas item gets its own
             badge from OPS-019 with the critical alert count. The Excepciones
             item (OPS-023) shows pending requests so admins act on them. */
          const isDocumentos = item.href === '/operaciones/documentos';
          const isAlertas = item.href === '/operaciones/alertas';
          const isExcepciones = item.href === '/operaciones/excepciones';
          const isAprobaciones = item.href === '/operaciones/aprobaciones';
          const isProcedimientos = item.href === '/operaciones/procedimientos';
          const isMisLecturas = item.href === '/operaciones/mis-lecturas';
          const rawCount = isDocumentos
            ? pendingReviewCount
            : isAlertas
              ? criticalAlertsCount
              : isExcepciones
                ? pendingExceptionsCount
                : isAprobaciones
                  ? pendingApprovalsCount
                  : isProcedimientos
                    ? proceduresInReviewCount
                    : isMisLecturas
                      ? myPendingReadingsCount
                      : 0;
          const showBadge =
            (isDocumentos ||
              isAlertas ||
              isExcepciones ||
              isAprobaciones ||
              isProcedimientos ||
              isMisLecturas) &&
            rawCount > 0;
          const badgeText = rawCount > 99 ? '99+' : String(rawCount);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`tn-nav__item${isActive ? ' tn-nav__item--active' : ''}`}
            >
              <Icon size={15} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {showBadge && <span className="tn-nav__badge">{badgeText}</span>}
            </Link>
          );
        })}

        <div className="tn-nav__divider" aria-hidden />

        {/* OPS-028 — Cobertura acuses is a manager-level admin tool;
            we hide it from VIEWER/ANALYST/ACCOUNTANT to declutter
            their sidebar. Configuración stays admin-only as before. */}
        {(() => {
          const role = (user as { role?: string } | null)?.role;
          const isAdminOrManager = role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'MANAGER';
          const items = [
            ...(isAdminOrManager
              ? [
                  {
                    href: '/operaciones/cobertura-acuses',
                    label: 'Cobertura acuses',
                    icon: Users,
                  },
                  /* OPS-032 — domain events audit trail. Technical
                     section, only visible to ADMIN/MANAGER. */
                  {
                    href: '/operaciones/eventos',
                    label: 'Eventos de dominio',
                    icon: GitBranch,
                  },
                ]
              : []),
            ...adminItems,
          ];
          return items.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`tn-nav__item${isActive ? ' tn-nav__item--active' : ''}`}
              >
                <Icon size={15} />
                <span style={{ flex: 1 }}>{item.label}</span>
              </Link>
            );
          });
        })()}
      </nav>

      <div className="tn-sidebar__foot">
        <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          className="tn-theme-toggle"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        </button>
        <div className="tn-sidebar__email" title={user.email}>
          {user.email}
        </div>
        <button onClick={logout} className="tn-logout">
          <LogOut size={14} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

export default OperationsSidebar;
