'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, CalendarCheck, LayoutDashboard, SlidersHorizontal, Users } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { SidebarFooter } from './SidebarFooter';
import { SidebarBrand } from './SidebarBrand';

/* HR-001 — RRHH sidebar. Cloned from the FinanceSidebar shell (NOT imported
 * from OperationsSidebar, which hard-codes /api/operations/*). Reuses the
 * shared .tn-sidebar tokens defined in (dashboard)/layout.tsx and the
 * SidebarBrand component. Nav items beyond the landing Dashboard are added by
 * later RRHH tickets. */
const navItems = [
  { href: '/rrhh', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/rrhh/trabajadores', label: 'Trabajadores', icon: Users, exact: false },
  { href: '/rrhh/disponibilidad', label: 'Disponibilidad', icon: CalendarCheck, exact: false },
  { href: '/rrhh/cargos', label: 'Cargos', icon: Briefcase, exact: false },
  { href: '/rrhh/parametros', label: 'Parámetros', icon: SlidersHorizontal, exact: false },
];

export function RrhhSidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  return (
    <aside className="tn-sidebar">
      <div className="tn-sidebar__head">
        <Link href="/modulos" className="tn-back-modulos">
          ← Volver a módulos
        </Link>
        <SidebarBrand name="RRHH" />
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
            </Link>
          );
        })}
      </nav>

      <SidebarFooter email={user.email} onLogout={logout} />
    </aside>
  );
}

export default RrhhSidebar;
