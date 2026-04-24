'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../lib/theme';
import { ExcelsiaLogo } from '../../components/shared/ExcelsiaLogo';

type ModuleDef = {
  key: string;
  name: string;
  description: string;
  gradient: string;
  href: string | null;
  active: boolean;
};

const MODULES: ModuleDef[] = [
  {
    key: 'finanzas',
    name: 'Finanzas',
    description: 'Gestión financiera, tributario, conciliación bancaria y reportes ejecutivos',
    gradient: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)',
    href: '/dashboard',
    active: true,
  },
  {
    key: 'operaciones',
    name: 'Operaciones',
    description: 'Control de activos, documentos, permisos y procedimientos operacionales',
    gradient: 'linear-gradient(135deg, #FF6B35 0%, #F7931E 100%)',
    href: null,
    active: false,
  },
  {
    key: 'hsec',
    name: 'HSEC',
    description: 'Salud, seguridad, medio ambiente y comunidades',
    gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    href: null,
    active: false,
  },
  {
    key: 'comercial',
    name: 'Comercial',
    description: 'Pipeline de ventas, CRM, cotizaciones y gestión de clientes',
    gradient: 'linear-gradient(135deg, #EC4899 0%, #BE185D 100%)',
    href: null,
    active: false,
  },
  {
    key: 'calendario',
    name: 'Calendario',
    description: 'Calendario general de actividades y gestión organizacional',
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
    href: null,
    active: false,
  },
  {
    key: 'bi',
    name: 'Business Intelligence',
    description: 'Dashboards avanzados, analítica predictiva e informes ejecutivos',
    gradient: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
    href: null,
    active: false,
  },
];

export default function ModulosPage() {
  const { user, isLoading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      window.location.href = '/login';
    }
  }, [isLoading, user]);

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
          color: 'var(--text-muted)',
        }}
      >
        › Cargando...
      </div>
    );
  }

  if (!user) return null;

  const handleSelect = (mod: ModuleDef) => {
    if (!mod.active || !mod.href) return;
    router.push(mod.href);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'background-color 150ms ease, color 150ms ease',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 40px',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-primary)',
        }}
      >
        <ExcelsiaLogo size={22} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              padding: '6px 8px',
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'color 120ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </button>
          <span
            title={user.email}
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 11,
              color: 'var(--text-secondary)',
              maxWidth: 220,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user.email}
          </span>
          <button
            type="button"
            onClick={logout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
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
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.borderColor = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.borderColor = 'var(--border-color)';
            }}
          >
            <LogOut size={14} />
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Body */}
      <div
        style={{
          flex: 1,
          padding: '56px 40px 80px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: '100%', maxWidth: 1200 }}>
          <h1
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
              fontSize: 28,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
              marginBottom: 8,
            }}
          >
            Selecciona un módulo
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 400,
              fontSize: 14,
              color: 'var(--text-secondary)',
              marginBottom: 36,
            }}
          >
            Accede a las herramientas integradas de Excelsia ERP
          </p>

          <div className="modulos-grid">
            {MODULES.map((mod) => {
              const isActive = mod.active;
              return (
                <div
                  key={mod.key}
                  className={`module-card${isActive ? ' module-card--active' : ''}`}
                  onClick={() => handleSelect(mod)}
                  role={isActive ? 'button' : undefined}
                  tabIndex={isActive ? 0 : -1}
                  onKeyDown={(e) => {
                    if (!isActive) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelect(mod);
                    }
                  }}
                  aria-disabled={!isActive}
                >
                  <div className="module-card__image" style={{ background: mod.gradient }} />
                  {!isActive && <div className="module-card__badge">PRÓXIMAMENTE</div>}
                  <div className="module-card__content">
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <h3
                        style={{
                          fontFamily: 'var(--font-outfit), sans-serif',
                          fontWeight: 600,
                          fontSize: 18,
                          letterSpacing: '-0.01em',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {mod.name}
                      </h3>
                      {isActive && (
                        <span className="module-card__arrow" aria-hidden="true">
                          <ArrowRight size={16} />
                        </span>
                      )}
                    </div>
                    <p
                      style={{
                        marginTop: 8,
                        fontFamily: 'var(--font-outfit), sans-serif',
                        fontWeight: 400,
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {mod.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style jsx>{`
        .modulos-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 24px;
        }
        .module-card {
          position: relative;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          overflow: hidden;
          transition:
            transform 180ms ease,
            box-shadow 180ms ease,
            border-color 180ms ease,
            opacity 180ms ease;
          opacity: 0.6;
          cursor: not-allowed;
          display: flex;
          flex-direction: column;
        }
        .module-card--active {
          opacity: 1;
          cursor: pointer;
        }
        .module-card--active:hover {
          transform: scale(1.015);
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
          border-color: var(--color-accent);
        }
        .module-card--active:focus-visible {
          outline: none;
          border-color: var(--color-accent);
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18);
        }
        .module-card__image {
          height: 120px;
          width: 100%;
        }
        .module-card__badge {
          position: absolute;
          top: 12px;
          right: 12px;
          background: rgba(0, 0, 0, 0.55);
          color: #ffffff;
          font-family: var(--font-jetbrains-mono), monospace;
          font-size: 9px;
          letter-spacing: 0.16em;
          font-weight: 600;
          padding: 4px 8px;
          border-radius: 999px;
          backdrop-filter: blur(4px);
        }
        .module-card__content {
          padding: 18px 20px 22px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .module-card__arrow {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          background: var(--color-accent-dim);
          color: var(--color-accent);
          transition:
            background-color 180ms ease,
            transform 180ms ease;
        }
        .module-card--active:hover .module-card__arrow {
          background: var(--color-accent);
          color: #ffffff;
          transform: translateX(2px);
        }
        @media (max-width: 900px) {
          .modulos-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
