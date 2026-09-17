'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  CalendarDays,
  CheckSquare,
  Layers,
  ListChecks,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { apiClient } from '../../lib/api';
import { useActividadesPermissions } from '../../hooks/useActividadesPermissions';
import { TODOS_CHANGED_EVENT } from '../actividades/TodoRowCells';
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
  { href: '/actividades/todos', label: 'To-dos', icon: CheckSquare, exact: false },
  { href: '/actividades/alertas', label: 'Alertas', icon: AlertTriangle, exact: false },
];

export function ActividadesSidebar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const permissions = useActividadesPermissions();
  const canRead = permissions?.todo.read ?? false;
  const companyId = apiClient.getCompanyId();
  const userId = user?.id;
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    setAlertCount(0);
    if (!canRead || !companyId || !userId) return;
    let active = true;
    let request = 0;
    const refresh = () => {
      const current = ++request;
      apiClient
        .get<{ counts: { total: number } }>('/api/todos/alerts?summary=true')
        .then(({ counts }) => {
          if (active && current === request) setAlertCount(counts.total);
        })
        .catch(() => {
          if (active && current === request) setAlertCount(0);
        });
    };
    refresh();
    window.addEventListener(TODOS_CHANGED_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(TODOS_CHANGED_EVENT, refresh);
    };
  }, [canRead, companyId, userId, pathname]);

  if (!user) return null;

  return (
    <aside className="tn-sidebar">
      <div className="tn-sidebar__head">
        <Link href="/modulos" className="tn-back-modulos">
          ← Volver a módulos
        </Link>
        <SidebarBrand name="Gestión organizacional" />
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
              <Icon size={15} aria-hidden="true" />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.href === '/actividades/alertas' && alertCount > 0 && (
                <span
                  className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium tabular-nums text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                  aria-label={`${alertCount} alertas`}
                >
                  {alertCount}
                </span>
              )}
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
