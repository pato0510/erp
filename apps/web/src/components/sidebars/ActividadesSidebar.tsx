'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, Layers, ListChecks, LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../lib/theme';
import { SidebarBrand } from './SidebarBrand';

/* CAL-001 — Calendario de Actividades sidebar. Cloned from the MarketingSidebar shell;
 * reuses the shared .tn-sidebar tokens defined once in (dashboard)/layout.tsx and the
 * SidebarBrand component (zero new CSS). Config-driven: the two CAL-001 sections are
 * placeholders that later tickets flesh out (CAL-005 Calendario, CAL-002 Áreas). */
const navItems = [
  { href: '/actividades/calendario', label: 'Calendario', icon: CalendarDays, exact: false },
  { href: '/actividades/gestion', label: 'Gestión', icon: ListChecks, exact: false },
  { href: '/actividades/areas', label: 'Áreas', icon: Layers, exact: false },
];

export function ActividadesSidebar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();

  if (!user) return null;

  return (
    <aside className="tn-sidebar">
      <div className="tn-sidebar__head">
        <Link href="/modulos" className="tn-back-modulos">
          ← Volver a módulos
        </Link>
        <SidebarBrand name="ACTIVIDADES" />
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

export default ActividadesSidebar;
