'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { apiClient } from '../../lib/api';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Tag,
  Users,
  Settings,
  LogOut,
  Bell,
  FileBarChart,
  Landmark,
  Receipt,
  GitMerge,
  CheckSquare,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/movimientos', label: 'Movimientos', icon: ArrowLeftRight },
  { href: '/caja', label: 'Caja', icon: Wallet },
  { href: '/banco', label: 'Banco', icon: Landmark },
  { href: '/tributario', label: 'Tributario', icon: Receipt },
  { href: '/conciliacion', label: 'Conciliación', icon: GitMerge },
  { href: '/cierre', label: 'Cierre', icon: CheckSquare },
  { href: '/alertas', label: 'Alertas', icon: Bell },
  { href: '/reportes', label: 'Reportes', icon: FileBarChart },
  { href: '/categories', label: 'Categorías', icon: Tag },
  { href: '/counterparties', label: 'Contrapartes', icon: Users },
  { href: '/settings', label: 'Configuración', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, companies, isLoading, logout } = useAuth();
  const pathname = usePathname();
  const [criticalCount, setCriticalCount] = useState(0);

  useEffect(() => {
    if (!isLoading && !user) {
      window.location.href = '/login';
    }
  }, [isLoading, user]);

  // Fetch alert count once user is loaded
  useEffect(() => {
    if (user) {
      apiClient.get<{ critical: number }>('/api/alerts/thresholds').catch(() => undefined);
      apiClient
        .get<{ id: string; severity: string }[]>('/api/alerts')
        .then((alerts) => {
          setCriticalCount(alerts.filter((a) => a.severity === 'CRITICAL').length);
        })
        .catch(() => undefined);
    }
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-lg">Cargando...</div>
      </div>
    );
  }

  if (!user) return null;

  const currentCompany = companies[0];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-5 border-b border-gray-800">
          <h1 className="text-lg font-bold">Excelsia ERP</h1>
          {currentCompany && (
            <p className="text-gray-400 text-sm mt-1 truncate">{currentCompany.companyName}</p>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            const Icon = item.icon;
            const showBadge = item.href === '/alertas' && criticalCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon size={18} />
                <span className="flex-1">{item.label}</span>
                {showBadge && (
                  <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {criticalCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-800">
          <div className="px-3 py-2 text-sm text-gray-400 truncate">
            {user.firstName} {user.lastName}
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition w-full"
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
