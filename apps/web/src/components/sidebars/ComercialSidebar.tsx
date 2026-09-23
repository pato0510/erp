'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Building2, KanbanSquare, LayoutDashboard, Users } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { SidebarFooter } from './SidebarFooter';
import { SidebarBrand } from './SidebarBrand';

/* COM-004b — Comercial (CRM) sidebar. Cloned from the RrhhSidebar shell; reuses
 * the shared .tn-sidebar tokens defined once in (dashboard)/layout.tsx and the
 * SidebarBrand component (zero new CSS). Config-driven: append entries to
 * navItems as later COM tickets ship (Cotizaciones, …). COM-007 adds Pipeline
 * (the flagship board), placed first. COM-021 adds Empresas (the clients' parent
 * companies) right after Cuentas. COM-019 adds Dashboard, placed FIRST. ALERT-001 adds
 * Alertas right after Dashboard with a live count badge (GET comercial/alerts?summary=true
 * on mount and on every pathname change; hidden at 0 — the FinanceSidebar badge pattern). */
const navItems = [
  { href: '/comercial/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: false },
  { href: '/comercial/alertas', label: 'Alertas', icon: Bell, exact: false },
  { href: '/comercial/pipeline', label: 'Pipeline', icon: KanbanSquare, exact: false },
  { href: '/comercial/cuentas', label: 'Cuentas', icon: Users, exact: false },
  { href: '/comercial/empresas', label: 'Empresas', icon: Building2, exact: false },
];

export function ComercialSidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [alertsCount, setAlertsCount] = useState(0);

  // ALERT-001 — summary counts only; a 403 (no Opportunity/Quote read) or a network blip
  // leaves the badge hidden, matching the other sidebars.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    apiClient
      .get<{ counts: { total: number } }>('/api/comercial/alerts?summary=true')
      .then((res) => {
        if (alive) setAlertsCount(res.counts.total);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [user, pathname]);

  if (!user) return null;

  return (
    <aside className="tn-sidebar">
      <div className="tn-sidebar__head">
        <Link href="/modulos" className="tn-back-modulos">
          ← Volver a módulos
        </Link>
        <SidebarBrand name="COMERCIAL" />
      </div>

      <nav className="tn-sidebar__nav">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`tn-nav__item${isActive ? ' tn-nav__item--active' : ''}`}
            >
              <Icon size={15} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.href === '/comercial/alertas' && alertsCount > 0 && (
                <span
                  className="tn-nav__badge !bg-amber-400 !text-amber-950"
                  aria-label={`${alertsCount} alertas`}
                >
                  {alertsCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <SidebarFooter email={user.email} onLogout={logout} />
    </aside>
  );
}

export default ComercialSidebar;
