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
import { ExcelsiaLogo } from '../../components/shared/ExcelsiaLogo';

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
  const { user, isLoading, logout } = useAuth();
  const pathname = usePathname();
  const [criticalCount, setCriticalCount] = useState(0);

  useEffect(() => {
    if (!isLoading && !user) {
      window.location.href = '/login';
    }
  }, [isLoading, user]);

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
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          fontSize: 13,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
        }}
      >
        › Cargando...
      </div>
    );
  }

  if (!user) return null;

  return (
    <div
      style={{ minHeight: '100vh', display: 'flex', background: '#fafafa' }}
      className="tn-shell"
    >
      {/* Sidebar */}
      <aside
        className="tn-sidebar"
        style={{
          position: 'relative',
          width: 244,
          background: 'var(--color-dark)',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--color-border-dark)',
          overflow: 'hidden',
        }}
      >
        {/* Geometric background */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 244 900"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.6 }}
        >
          <g stroke="#2C2C2E" strokeWidth="1" fill="none">
            <circle cx="220" cy="80" r="130" />
            <circle cx="30" cy="720" r="180" />
            <line x1="0" y1="420" x2="244" y2="420" />
          </g>
        </svg>

        {/* Logo */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            padding: '24px 20px 20px',
            borderBottom: '1px solid var(--color-border-dark)',
          }}
        >
          <ExcelsiaLogo size={22} />
        </div>

        {/* Nav */}
        <nav
          style={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            padding: '16px 0',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
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
                className={`tn-nav__item${isActive ? ' tn-nav__item--active' : ''}`}
              >
                <Icon size={15} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {showBadge && (
                  <span
                    style={{
                      background: 'var(--color-accent)',
                      color: 'var(--color-dark)',
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 999,
                      minWidth: 20,
                      textAlign: 'center',
                    }}
                  >
                    {criticalCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            padding: '14px 20px 18px',
            borderTop: '1px solid var(--color-border-dark)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 11,
              color: '#8E8E93',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginBottom: 10,
            }}
            title={user.email}
          >
            {user.email}
          </div>
          <button
            onClick={logout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              background: 'transparent',
              border: '1px solid var(--color-border-dark)',
              color: '#8E8E93',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 11,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'color 120ms ease, border-color 120ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.borderColor = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#8E8E93';
              e.currentTarget.style.borderColor = 'var(--color-border-dark)';
            }}
          >
            <LogOut size={14} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          overflow: 'auto',
          background: '#F8F9FA',
        }}
      >
        <div style={{ padding: '32px 40px' }}>{children}</div>
      </main>

      <style jsx>{`
        :global(.tn-nav__item) {
          position: relative;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 20px 10px 22px;
          font-family: var(--font-outfit), sans-serif;
          font-size: 14px;
          letter-spacing: -0.005em;
          color: #8e8e93;
          background-color: transparent;
          text-decoration: none;
          border-left: 2px solid transparent;
          font-weight: 500;
          transform: scale(1);
          transform-origin: left center;
          transition: all 0.15s ease;
        }
        :global(.tn-nav__item:hover) {
          color: #ffffff;
          background-color: rgba(255, 255, 255, 0.06);
          font-weight: 600;
          transform: scale(1.01);
        }
        :global(.tn-nav__item--active),
        :global(.tn-nav__item--active:hover) {
          color: var(--color-accent);
          background-color: rgba(37, 99, 235, 0.1);
          border-left-color: var(--color-accent);
          font-weight: 600;
          transform: scale(1);
        }

        @media (max-width: 768px) {
          .tn-shell {
            flex-direction: column;
          }
          .tn-sidebar {
            width: 100% !important;
            flex-direction: row;
            align-items: center;
            height: 56px;
            border-right: none !important;
            border-bottom: 1px solid var(--color-border-dark);
          }
          .tn-sidebar nav {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
