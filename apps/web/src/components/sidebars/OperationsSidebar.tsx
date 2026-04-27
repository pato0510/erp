'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  FileText,
  LayoutDashboard,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  Truck,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../lib/theme';
import { SidebarBrand } from './SidebarBrand';

const navItems = [
  { href: '/operaciones', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/operaciones/equipos', label: 'Equipos', icon: Wrench },
  { href: '/operaciones/vehiculos', label: 'Vehículos', icon: Truck },
  { href: '/operaciones/documentos', label: 'Documentos', icon: FileText },
  { href: '/operaciones/permisos', label: 'Permisos', icon: ShieldCheck },
  { href: '/operaciones/procedimientos', label: 'Procedimientos', icon: BookOpen },
  { href: '/operaciones/alertas', label: 'Alertas', icon: Bell },
  { href: '/operaciones/calendario', label: 'Calendario', icon: Calendar },
  { href: '/operaciones/reportes', label: 'Reportes', icon: BarChart3 },
];

export function OperationsSidebar() {
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
        <SidebarBrand name="OPERACIONES" />
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

export default OperationsSidebar;
