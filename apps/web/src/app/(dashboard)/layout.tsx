'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import { DarkGradientBackground } from '../../components/DarkGradientBackground';
import { FinanceSidebar } from '../../components/sidebars/FinanceSidebar';
import { OperationsSidebar } from '../../components/sidebars/OperationsSidebar';
import { RrhhSidebar } from '../../components/sidebars/RrhhSidebar';
import { NotificationCenter } from '../../components/NotificationCenter';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      window.location.href = '/login';
    }
  }, [isLoading, user]);

  if (isLoading) {
    return (
      <>
        <DarkGradientBackground />
        <div
          style={{
            position: 'relative',
            zIndex: 2,
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
      </>
    );
  }

  if (!user) return null;

  const isOperations = pathname?.startsWith('/operaciones') ?? false;
  const isRrhh = pathname?.startsWith('/rrhh') ?? false;

  return (
    <>
      <DarkGradientBackground />
      <div className="tn-shell">
        {isRrhh ? <RrhhSidebar /> : isOperations ? <OperationsSidebar /> : <FinanceSidebar />}

        <main className="tn-main">
          {/* OPS-022 — notification bell anchored top-right of the
              main area. Sticky inside main so it stays visible while
              the user scrolls long pages. */}
          <div className="tn-topbar">
            <NotificationCenter />
          </div>
          <div style={{ padding: '12px 40px 32px' }}>{children}</div>
        </main>

        <style jsx global>{`
          .tn-shell {
            position: relative;
            z-index: 2;
            min-height: 100vh;
            display: flex;
            background: var(--bg-secondary);
          }
          .tn-main {
            flex: 1;
            overflow: auto;
            background: var(--bg-secondary);
            color: var(--text-primary);
            transition:
              background-color 150ms ease,
              color 150ms ease;
          }
          .tn-topbar {
            position: sticky;
            top: 0;
            z-index: 4;
            display: flex;
            justify-content: flex-end;
            padding: 14px 40px 0;
            background: linear-gradient(180deg, var(--bg-secondary) 70%, transparent 100%);
          }

          .tn-sidebar {
            position: relative;
            z-index: 3;
            width: 244px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            background: var(--sidebar-bg);
            color: var(--sidebar-text);
            border-right: 0.5px solid var(--sidebar-border);
            transition: color 150ms ease;
          }

          .tn-sidebar__head {
            position: relative;
            z-index: 1;
            padding: 24px 20px 20px;
            border-bottom: 1px solid var(--sidebar-border);
          }
          .tn-back-modulos {
            display: inline-block;
            margin-bottom: 12px;
            font-family: var(--font-jetbrains-mono), monospace;
            font-size: 10px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: rgba(255, 255, 255, 0.5);
            text-decoration: none;
            transition: color 120ms ease;
          }
          .tn-back-modulos:hover {
            color: rgba(255, 255, 255, 0.85);
          }
          .tn-sidebar__brand {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .tn-sidebar__brand-text {
            font-family: var(--font-jetbrains-mono), var(--font-mono), monospace;
            font-weight: 700;
            font-size: 12px;
            letter-spacing: 0.18em;
            color: #ffffff;
          }

          .tn-sidebar__nav {
            position: relative;
            z-index: 1;
            flex: 1;
            padding: 16px 0;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .tn-nav__item {
            position: relative;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 20px 10px 22px;
            font-family: var(--font-outfit), sans-serif;
            font-size: 14px;
            letter-spacing: -0.005em;
            color: var(--sidebar-text);
            background-color: transparent;
            text-decoration: none;
            border-left: 2px solid transparent;
            font-weight: 500;
            transform: scale(1);
            transform-origin: left center;
            transition: all 0.15s ease;
          }
          .tn-nav__item:hover {
            color: var(--sidebar-text-hover);
            background-color: var(--sidebar-active-bg);
            font-weight: 600;
            transform: scale(1.01);
          }
          .tn-nav__item--active,
          .tn-nav__item--active:hover {
            color: var(--sidebar-text-active);
            background-color: var(--sidebar-active-bg);
            border-left-color: var(--sidebar-active-border);
            font-weight: 600;
            transform: scale(1);
          }
          .tn-nav__badge {
            background: var(--sidebar-active-border);
            color: #0f1422;
            font-family: var(--font-jetbrains-mono), monospace;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 999px;
            min-width: 20px;
            text-align: center;
          }
          .tn-nav__divider {
            height: 1px;
            margin: 12px 20px 8px;
            background: var(--sidebar-border);
            opacity: 0.6;
          }

          .tn-sidebar__foot {
            position: relative;
            z-index: 1;
            padding: 14px 20px 18px;
            border-top: 1px solid var(--sidebar-border);
          }
          .tn-theme-toggle {
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            background: transparent;
            border: none;
            color: var(--sidebar-text);
            padding: 6px 0;
            margin-bottom: 12px;
            font-family: var(--font-jetbrains-mono), monospace;
            font-size: 10px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            cursor: pointer;
            transition: color 120ms ease;
          }
          .tn-theme-toggle:hover {
            color: var(--sidebar-text-hover);
          }
          .tn-sidebar__email {
            font-family: var(--font-jetbrains-mono), monospace;
            font-size: 11px;
            color: var(--sidebar-text);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            margin-bottom: 10px;
          }
          .tn-logout {
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            background: transparent;
            border: 1px solid var(--sidebar-border);
            color: var(--sidebar-text);
            padding: 8px 12px;
            border-radius: var(--radius-sm);
            font-family: var(--font-jetbrains-mono), monospace;
            font-size: 11px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            cursor: pointer;
            transition:
              color 120ms ease,
              border-color 120ms ease;
          }
          .tn-logout:hover {
            color: var(--sidebar-text-hover);
            border-color: rgba(255, 255, 255, 0.25);
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
              border-bottom: 0.5px solid var(--sidebar-border);
            }
            .tn-sidebar nav {
              display: none !important;
            }
          }
        `}</style>
      </div>
    </>
  );
}
