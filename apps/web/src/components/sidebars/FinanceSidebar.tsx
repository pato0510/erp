'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
  Bell,
  CheckSquare,
  FileBarChart,
  GitMerge,
  Landmark,
  LayoutDashboard,
  LogOut,
  Moon,
  Receipt,
  Settings,
  Sun,
  Tag,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { apiClient } from '../../lib/api';
import { useTheme } from '../../lib/theme';
import { SidebarBrand } from './SidebarBrand';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/movimientos', label: 'Movimientos', icon: ArrowLeftRight },
  { href: '/caja', label: 'Caja', icon: Wallet },
  { href: '/banco', label: 'Banco', icon: Landmark },
  { href: '/tributario', label: 'Tributario', icon: Receipt },
  { href: '/conciliacion', label: 'Conciliación', icon: GitMerge },
  { href: '/cierre', label: 'Cierre', icon: CheckSquare },
  { href: '/alertas', label: 'Alertas', icon: Bell },
  { href: '/reportes', label: 'Reportes', icon: FileBarChart },
  { href: '/categorias', label: 'Categorías', icon: Tag },
  { href: '/contrapartes', label: 'Contrapartes', icon: Users },
  { href: '/configuracion', label: 'Configuración', icon: Settings },
];

export function FinanceSidebar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const [criticalCount, setCriticalCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    apiClient.get<{ critical: number }>('/api/alerts/thresholds').catch(() => undefined);
    apiClient
      .get<{ id: string; severity: string }[]>('/api/alerts')
      .then((alerts) => {
        setCriticalCount(alerts.filter((a) => a.severity === 'CRITICAL').length);
      })
      .catch(() => undefined);
  }, [user]);

  if (!user) return null;

  return (
    <aside className="tn-sidebar">
      <div className="tn-sidebar__head">
        <Link href="/modulos" className="tn-back-modulos">
          ← Volver a módulos
        </Link>
        <SidebarBrand name="FINANZAS" />
      </div>

      <nav className="tn-sidebar__nav">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;
          const showBadge = item.href === '/alertas' && criticalCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`tn-nav__item${isActive ? ' tn-nav__item--active' : ''}`}
            >
              <Icon size={15} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {showBadge && <span className="tn-nav__badge">{criticalCount}</span>}
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

export default FinanceSidebar;
