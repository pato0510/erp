'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Settings } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { SidebarBrand } from './SidebarBrand';
import { SidebarFooter } from './SidebarFooter';

/* ACCESS-002 — the minimal sidebar a FINANZAS-restricted member gets on the SHARED routes
   (/configuracion, /notificaciones) and on the access-denied panel, where the dashboard
   layout would otherwise fall back to FinanceSidebar (whose nav and alert badge are Finanzas).
   Same tn-sidebar pieces as every module sidebar: brand, back to modules, the two shared
   destinations, and the AUTH-002-B footer (theme, account menu, change password, logout). */
const navItems = [
  { href: '/notificaciones', label: 'Notificaciones', icon: Bell },
  { href: '/configuracion', label: 'Configuración', icon: Settings },
];

export function RestrictedSidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  return (
    <aside className="tn-sidebar">
      <div className="tn-sidebar__head">
        <Link href="/modulos" className="tn-back-modulos">
          ← Volver a módulos
        </Link>
        <SidebarBrand name="EXCELSIA" />
      </div>

      <nav className="tn-sidebar__nav" aria-label="Secciones compartidas">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`tn-nav__item${isActive ? ' tn-nav__item--active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={15} aria-hidden="true" />
              <span style={{ flex: 1 }}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <SidebarFooter email={user.email} onLogout={logout} />
    </aside>
  );
}

export default RestrictedSidebar;
