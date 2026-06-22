'use client';

import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../lib/theme';
import { Starfield } from '../../components/Starfield';

type ModuleDef = {
  key: string;
  name: string;
  description: string;
  gradient: string;
  href: string | null;
  active: boolean;
  svg: ReactNode;
};

const FIN_BARS = [
  { x: 30, y: 180, h: 60, d: '0s' },
  { x: 60, y: 160, h: 80, d: '0.3s' },
  { x: 90, y: 140, h: 100, d: '0.6s' },
  { x: 120, y: 120, h: 120, d: '0.9s' },
  { x: 150, y: 100, h: 140, d: '1.2s' },
  { x: 180, y: 80, h: 160, d: '1.5s' },
];

const FinanzasSvg = () => (
  <svg
    viewBox="0 0 240 240"
    preserveAspectRatio="xMidYMid slice"
    className="mod-svg"
    style={{ opacity: 0.45 }}
  >
    {FIN_BARS.map((b) => (
      <rect
        key={b.x}
        x={b.x}
        y={b.y}
        width="20"
        height={b.h}
        rx="2"
        fill="white"
        className="fin-bar"
        style={{ animationDelay: b.d }}
      />
    ))}
    <path
      d="M 20 160 Q 60 140, 100 120 T 180 60"
      stroke="white"
      strokeWidth="3"
      strokeLinecap="round"
      fill="none"
      strokeDasharray="200"
      className="fin-line"
    />
  </svg>
);

const OperacionesSvg = () => (
  <svg
    viewBox="0 0 240 240"
    preserveAspectRatio="xMidYMid slice"
    className="mod-svg"
    style={{ opacity: 0.45 }}
  >
    <g className="ops-gear-big">
      <circle cx="80" cy="100" r="40" fill="none" stroke="white" strokeWidth="3" />
      <circle cx="80" cy="100" r="14" fill="white" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <rect
          key={deg}
          x="76"
          y="50"
          width="8"
          height="20"
          rx="2"
          fill="white"
          transform={`rotate(${deg} 80 100)`}
        />
      ))}
    </g>
    <g className="ops-gear-small">
      <circle cx="170" cy="160" r="28" fill="none" stroke="white" strokeWidth="2.5" />
      <circle cx="170" cy="160" r="10" fill="white" />
      {[0, 90, 180, 270].map((deg) => (
        <rect
          key={deg}
          x="167"
          y="125"
          width="6"
          height="14"
          rx="2"
          fill="white"
          transform={`rotate(${deg} 170 160)`}
        />
      ))}
    </g>
  </svg>
);

const HsecSvg = () => (
  <svg
    viewBox="0 0 240 240"
    preserveAspectRatio="xMidYMid slice"
    className="mod-svg"
    style={{ opacity: 0.5 }}
  >
    {[0, 1, 2].map((i) => (
      <circle
        key={i}
        cx="120"
        cy="120"
        r="20"
        fill="none"
        stroke="white"
        strokeWidth="2"
        className="hsec-pulse"
        style={{ animationDelay: `${i}s` }}
      />
    ))}
    <g>
      <path
        d="M 0 -28 L -22 -16 L -22 8 Q -22 22 0 30 Q 22 22 22 8 L 22 -16 Z"
        transform="translate(120 120)"
        fill="white"
        opacity="0.85"
      />
      <path
        d="M -8 0 L -3 6 L 8 -8"
        transform="translate(120 120)"
        stroke="#10B981"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
);

const ComercialSvg = () => (
  <svg
    viewBox="0 0 240 240"
    preserveAspectRatio="xMidYMid slice"
    className="mod-svg"
    style={{ opacity: 0.5 }}
  >
    <g stroke="white" strokeWidth="2" fill="none" opacity="0.4">
      <line x1="40" y1="80" x2="100" y2="120" />
      <line x1="100" y1="120" x2="160" y2="80" />
      <line x1="100" y1="120" x2="160" y2="160" />
      <line x1="160" y1="80" x2="200" y2="120" />
      <line x1="160" y1="160" x2="200" y2="120" />
    </g>
    <circle cx="40" cy="80" r="8" fill="white" className="com-flow" />
    <circle cx="40" cy="80" r="3" fill="white" opacity="0.5" className="com-dot" />
    <circle cx="100" cy="120" r="10" fill="white" opacity="0.9" />
    <circle cx="160" cy="80" r="8" fill="white" opacity="0.7" />
    <circle cx="160" cy="160" r="8" fill="white" opacity="0.7" />
    <circle cx="200" cy="120" r="9" fill="white" opacity="0.8" />
  </svg>
);

// Megaphone broadcasting rising engagement bars + animated signal arcs.
const MKT_BARS = [
  { x: 150, y: 175, h: 25, d: '0s' },
  { x: 168, y: 160, h: 40, d: '0.3s' },
  { x: 186, y: 140, h: 60, d: '0.6s' },
];

const MarketingSvg = () => (
  <svg
    viewBox="0 0 240 240"
    preserveAspectRatio="xMidYMid slice"
    className="mod-svg"
    style={{ opacity: 0.5 }}
  >
    {/* Megaphone body */}
    <g>
      <path
        d="M 40 105 L 95 80 L 95 140 L 40 115 Z"
        fill="white"
        opacity="0.9"
      />
      <rect x="30" y="103" width="12" height="14" rx="2" fill="white" opacity="0.9" />
      <path
        d="M 95 80 Q 130 90, 130 110 Q 130 130, 95 140 Z"
        fill="white"
        opacity="0.55"
      />
      {/* Handle */}
      <rect x="64" y="140" width="9" height="34" rx="3" fill="white" opacity="0.8" />
    </g>
    {/* Broadcast signal arcs */}
    {[0, 1, 2].map((i) => (
      <path
        key={i}
        d={`M 138 ${96 - i * 4} Q ${150 + i * 12} 110, 138 ${124 + i * 4}`}
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="mkt-wave"
        style={{ animationDelay: `${i * 0.4}s` }}
      />
    ))}
    {/* Rising engagement bars */}
    {MKT_BARS.map((b) => (
      <rect
        key={b.x}
        x={b.x}
        y={b.y}
        width="12"
        height={b.h}
        rx="2"
        fill="white"
        opacity="0.85"
        className="mkt-bar"
        style={{ animationDelay: b.d }}
      />
    ))}
  </svg>
);

const RRHH_LINES = [
  { x1: 120, y1: 80, x2: 75, y2: 130, d: '0s' },
  { x1: 120, y1: 80, x2: 165, y2: 130, d: '0.5s' },
  { x1: 75, y1: 130, x2: 50, y2: 190, d: '1s' },
  { x1: 75, y1: 130, x2: 120, y2: 190, d: '1.3s' },
  { x1: 165, y1: 130, x2: 120, y2: 190, d: '1.6s' },
  { x1: 165, y1: 130, x2: 190, y2: 190, d: '1.9s' },
];

const RRHH_PEOPLE = [
  {
    x: 120,
    y: 75,
    r: 9,
    body: 'M -14 18 Q -14 8 0 8 Q 14 8 14 18 L 14 22 L -14 22 Z',
    d: '0s',
    op: 0.95,
  },
  {
    x: 75,
    y: 130,
    r: 8,
    body: 'M -12 16 Q -12 7 0 7 Q 12 7 12 16 L 12 20 L -12 20 Z',
    d: '0.5s',
    op: 0.85,
  },
  {
    x: 165,
    y: 130,
    r: 8,
    body: 'M -12 16 Q -12 7 0 7 Q 12 7 12 16 L 12 20 L -12 20 Z',
    d: '0.7s',
    op: 0.85,
  },
  {
    x: 50,
    y: 190,
    r: 7,
    body: 'M -10 14 Q -10 6 0 6 Q 10 6 10 14 L 10 18 L -10 18 Z',
    d: '1s',
    op: 0.75,
  },
  {
    x: 120,
    y: 190,
    r: 7,
    body: 'M -10 14 Q -10 6 0 6 Q 10 6 10 14 L 10 18 L -10 18 Z',
    d: '1.2s',
    op: 0.75,
  },
  {
    x: 190,
    y: 190,
    r: 7,
    body: 'M -10 14 Q -10 6 0 6 Q 10 6 10 14 L 10 18 L -10 18 Z',
    d: '1.4s',
    op: 0.75,
  },
];

const RRHH_PLUSES = [
  { x: 98, y: 105, size: 14, d: '0s' },
  { x: 142, y: 105, size: 14, d: '1s' },
  { x: 120, y: 160, size: 12, d: '2s' },
];

const RrhhSvg = () => (
  <svg
    viewBox="0 0 240 240"
    preserveAspectRatio="xMidYMid slice"
    className="mod-svg"
    style={{ opacity: 0.5 }}
  >
    {RRHH_LINES.map((l, i) => (
      <line
        key={i}
        x1={l.x1}
        y1={l.y1}
        x2={l.x2}
        y2={l.y2}
        stroke="white"
        strokeWidth="2"
        fill="none"
        opacity="0.5"
        className="rrhh-line"
        style={{ animationDelay: l.d }}
      />
    ))}
    {RRHH_PEOPLE.map((p, i) => (
      <g
        key={i}
        opacity={p.op}
        className="rrhh-person"
        style={{
          transformBox: 'view-box' as CSSProperties['transformBox'],
          transformOrigin: `${p.x}px ${p.y}px`,
          animationDelay: p.d,
        }}
      >
        <g transform={`translate(${p.x} ${p.y})`}>
          <circle r={p.r} fill="white" />
          <path d={p.body} fill="white" />
        </g>
      </g>
    ))}
    {RRHH_PLUSES.map((p, i) => (
      <text
        key={i}
        x={p.x}
        y={p.y}
        fontSize={p.size}
        fontWeight="500"
        textAnchor="middle"
        fill="white"
        className="rrhh-plus"
        style={{ animationDelay: p.d }}
      >
        +
      </text>
    ))}
  </svg>
);

const MODULES: ModuleDef[] = [
  {
    key: 'finanzas',
    name: 'Finanzas',
    description: 'Gestión financiera, tributario, conciliación bancaria y reportes ejecutivos',
    gradient: 'linear-gradient(135deg, #1E3A5F, #2563EB)',
    href: '/dashboard',
    active: true,
    svg: <FinanzasSvg />,
  },
  {
    key: 'operaciones',
    name: 'Operaciones',
    description: 'Control de activos, documentos, permisos y procedimientos operacionales',
    gradient: 'linear-gradient(135deg, #FF6B35, #F7931E)',
    href: '/operaciones',
    active: true,
    svg: <OperacionesSvg />,
  },
  {
    key: 'hsec',
    name: 'HSEC',
    description: 'Salud, seguridad, medio ambiente y comunidades',
    gradient: 'linear-gradient(135deg, #10B981, #059669)',
    href: null,
    active: false,
    svg: <HsecSvg />,
  },
  {
    key: 'comercial',
    name: 'Comercial',
    description: 'Pipeline de ventas, CRM, cotizaciones y gestión de clientes',
    gradient: 'linear-gradient(135deg, #EC4899, #BE185D)',
    href: '/comercial',
    active: true,
    svg: <ComercialSvg />,
  },
  {
    key: 'marketing',
    name: 'Marketing',
    description: 'Campañas, contenidos, redes sociales y métricas de marketing',
    gradient: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
    href: '/marketing',
    active: true,
    svg: <MarketingSvg />,
  },
  {
    key: 'rrhh',
    name: 'Recursos Humanos',
    description: 'Gestión del talento, nóminas, evaluaciones y desarrollo organizacional',
    gradient: 'linear-gradient(135deg, #14B8A6, #0F766E)',
    href: '/rrhh',
    active: true,
    svg: <RrhhSvg />,
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

  useEffect(() => {
    document.documentElement.classList.add('starfield-page');
    return () => {
      document.documentElement.classList.remove('starfield-page');
    };
  }, []);

  const handleSelect = (mod: ModuleDef) => {
    if (!mod.active || !mod.href) return;
    router.push(mod.href);
  };

  const isReady = !isLoading && !!user;

  return (
    <div className="modulos-page-wrapper mod-root">
      <Starfield zIndex={1} />
      <div className="mod-vignette" aria-hidden="true" />

      {/* Top bar — renders immediately; user-specific controls appear when auth resolves */}
      <header className="mod-topbar">
        <div className="mod-topbar__left">
          <svg
            width="20"
            height="20"
            viewBox="0 0 40 40"
            fill="none"
            aria-hidden="true"
            className="mod-topbar__mark"
          >
            <defs>
              <linearGradient id="mod-tri-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="oklch(0.88 0.10 220)" />
                <stop offset="100%" stopColor="oklch(0.55 0.14 235)" />
              </linearGradient>
            </defs>
            <path
              d="M20 4 L36 32 L4 32 Z"
              stroke="url(#mod-tri-grad)"
              strokeWidth="1.4"
              fill="none"
              strokeLinejoin="round"
            />
            <path d="M20 14 L28 28 L12 28 Z" fill="url(#mod-tri-grad)" opacity="0.85" />
          </svg>
          <span>EXCELSIA · MÓDULOS</span>
        </div>
        <div className="mod-topbar__right">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            className="mod-icon-btn"
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          {user && (
            <>
              <span className="mod-user" title={user.email}>
                {user.email}
              </span>
              <button
                type="button"
                onClick={logout}
                className="mod-logout"
                aria-label="Cerrar sesión"
              >
                <span>salir</span>
                <LogOut size={12} />
              </button>
            </>
          )}
        </div>
      </header>

      {/* Body — gated on auth, fades in via .modulos-content critical CSS */}
      {isReady && (
        <main className="mod-stage">
          <div className="mod-container">
            <h1 className="mod-title">Selecciona un módulo</h1>
            <div className="mod-subtitle-wrap">
              <span className="mod-pulse" aria-hidden="true" />
              <p className="mod-subtitle">Accede a las herramientas integradas de Excelsia ERP</p>
            </div>

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
                    style={{ background: mod.gradient }}
                  >
                    <div className="module-card__svg">{mod.svg}</div>
                    <div className="module-card__shade" aria-hidden="true" />
                    {!isActive && <div className="module-card__badge">PRÓXIMAMENTE</div>}
                    {isActive && (
                      <span className="module-card__arrow" aria-hidden="true">
                        <ArrowRight size={14} strokeWidth={2.5} />
                      </span>
                    )}
                    <div className="module-card__content">
                      <h3 className="module-card__title">{mod.name}</h3>
                      <p className="module-card__desc">{mod.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      )}

      {/* Bottom bar */}
      <div className="mod-bottombar" aria-hidden="true">
        <span>EXCELSIA ERP · V1.0</span>
        <span>AGS SOLUTIONS SPA</span>
      </div>

      <style jsx global>{`
        .mod-root {
          --ink: #eef1f7;
          --ink-dim: rgba(238, 241, 247, 0.62);
          --ink-faint: rgba(238, 241, 247, 0.36);
          --accent: oklch(0.82 0.12 220);

          position: fixed;
          inset: 0;
          color: var(--ink);
          font-family: var(--font-space-grotesk), var(--font-outfit), sans-serif;
          background-color: #000;
          background-image:
            radial-gradient(ellipse at 50% 40%, rgba(20, 30, 55, 0.35) 0%, transparent 55%),
            radial-gradient(ellipse at 80% 80%, rgba(40, 20, 60, 0.3) 0%, transparent 60%);
          overflow-y: auto;
          overflow-x: hidden;
        }
        html:not(.dark) .mod-root {
          background-color: #1d3358;
          background-image:
            radial-gradient(ellipse at 50% 30%, rgba(110, 170, 230, 0.45) 0%, transparent 60%),
            radial-gradient(ellipse at 20% 90%, rgba(70, 130, 200, 0.35) 0%, transparent 60%),
            linear-gradient(180deg, #2a4f82 0%, #1a3158 50%, #142544 100%);
        }
        .mod-vignette {
          position: fixed;
          inset: 0;
          z-index: 2;
          pointer-events: none;
          background: radial-gradient(circle at 50% 50%, transparent 30%, rgba(0, 0, 0, 0.55) 95%);
        }
        html:not(.dark) .mod-vignette {
          background: radial-gradient(
            circle at 50% 50%,
            transparent 35%,
            rgba(8, 18, 38, 0.45) 95%
          );
        }
        .mod-topbar,
        .mod-bottombar {
          position: fixed;
          left: 0;
          right: 0;
          padding: 30px 40px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: var(--ink-faint);
          font-family: var(--font-ibm-plex-mono), var(--font-jetbrains-mono), monospace;
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          z-index: 5;
        }
        .mod-topbar {
          top: 0;
          font-size: 11px;
          min-height: 60px;
        }
        .mod-bottombar {
          bottom: 0;
          font-size: 10px;
        }
        .mod-topbar__left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .mod-topbar__mark {
          filter: drop-shadow(0 0 8px rgba(120, 170, 230, 0.3));
        }
        .mod-topbar__right {
          display: flex;
          align-items: center;
          gap: 18px;
        }
        .mod-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          background: transparent;
          border: 1px solid rgba(238, 241, 247, 0.18);
          color: var(--ink-faint);
          border-radius: 4px;
          cursor: pointer;
          transition:
            color 150ms ease,
            border-color 150ms ease,
            background-color 150ms ease;
        }
        .mod-icon-btn:hover {
          color: var(--ink);
          border-color: rgba(238, 241, 247, 0.45);
          background: rgba(255, 255, 255, 0.05);
        }
        .mod-user {
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink-dim);
          max-width: 240px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .mod-logout {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: 1px solid rgba(238, 241, 247, 0.22);
          color: var(--ink-dim);
          padding: 7px 12px;
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 10px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 4px;
          transition:
            color 150ms ease,
            border-color 150ms ease,
            background-color 150ms ease;
        }
        .mod-logout:hover {
          color: var(--ink);
          border-color: rgba(238, 241, 247, 0.5);
          background: rgba(255, 255, 255, 0.05);
        }
        .mod-stage {
          position: relative;
          z-index: 3;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 130px 40px 110px;
        }
        .mod-container {
          width: 100%;
          max-width: 1200px;
        }
        @keyframes mod-rise {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .mod-title {
          font-family: var(--font-space-grotesk), sans-serif;
          font-weight: 400;
          font-size: 28px;
          letter-spacing: -0.005em;
          color: var(--ink);
          text-align: center;
          text-shadow:
            0 2px 18px rgba(0, 0, 0, 0.9),
            0 0 30px rgba(0, 0, 0, 0.5);
          margin: 0;
          animation: mod-rise 0.9s ease both;
        }
        .mod-subtitle-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-top: 12px;
          margin-bottom: 56px;
          animation: mod-rise 1s ease both;
        }
        @keyframes mod-pulse-dot {
          0%,
          100% {
            opacity: 0.45;
            box-shadow: 0 0 0 0 rgba(120, 200, 255, 0.55);
          }
          50% {
            opacity: 1;
            box-shadow: 0 0 14px 2px rgba(120, 200, 255, 0.55);
          }
        }
        .mod-pulse {
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: var(--accent);
          animation: mod-pulse-dot 2.4s ease-in-out infinite;
          flex: none;
        }
        .mod-subtitle {
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(238, 241, 247, 0.6);
          margin: 0;
        }

        .modulos-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 24px;
        }
        .module-card {
          position: relative;
          height: 240px;
          border-radius: 10px;
          overflow: hidden;
          opacity: 0.72;
          cursor: not-allowed;
          transition:
            transform 0.3s ease,
            box-shadow 0.3s ease,
            opacity 0.3s ease;
          isolation: isolate;
          box-shadow:
            0 12px 36px rgba(0, 0, 0, 0.55),
            0 0 0 1px rgba(255, 255, 255, 0.04);
        }
        .module-card--active {
          opacity: 1;
          cursor: pointer;
        }
        .module-card--active:hover {
          transform: translateY(-4px);
          box-shadow:
            0 20px 48px rgba(0, 0, 0, 0.7),
            0 0 0 1px rgba(255, 255, 255, 0.08);
        }
        .module-card--active:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 2px rgba(120, 200, 255, 0.55),
            0 12px 36px rgba(0, 0, 0, 0.55);
        }
        .module-card__svg {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .module-card__svg .mod-svg {
          width: 100%;
          height: 100%;
          transition: transform 0.6s ease;
          transform-origin: center;
        }
        .module-card--active:hover .module-card__svg .mod-svg {
          transform: scale(1.08);
        }
        .module-card__shade {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.78) 100%);
          pointer-events: none;
        }
        .module-card__badge {
          position: absolute;
          top: 12px;
          right: 12px;
          background: rgba(0, 0, 0, 0.6);
          color: #ffffff;
          font-family: var(--font-ibm-plex-mono), var(--font-jetbrains-mono), monospace;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.18em;
          padding: 4px 10px;
          border-radius: 20px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 2;
        }
        .module-card__arrow {
          position: absolute;
          top: 12px;
          right: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.15);
          color: #ffffff;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          transition:
            background-color 0.3s ease,
            transform 0.3s ease;
          z-index: 2;
        }
        .module-card--active:hover .module-card__arrow {
          background: rgba(255, 255, 255, 0.25);
          transform: translateX(4px);
        }
        .module-card__content {
          position: absolute;
          left: 20px;
          right: 20px;
          bottom: 18px;
          z-index: 2;
          color: #ffffff;
        }
        .module-card__title {
          font-family: var(--font-space-grotesk), var(--font-outfit), sans-serif;
          font-weight: 600;
          font-size: 18px;
          letter-spacing: -0.01em;
          color: #ffffff;
          margin: 0;
        }
        .module-card__desc {
          margin: 6px 0 0;
          font-family: var(--font-space-grotesk), var(--font-outfit), sans-serif;
          font-weight: 400;
          font-size: 13px;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.92);
        }

        @media (max-width: 900px) {
          .modulos-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          .mod-topbar,
          .mod-bottombar {
            padding: 20px 22px;
          }
          .mod-topbar__right {
            gap: 10px;
          }
          .mod-user {
            display: none;
          }
          .mod-stage {
            padding: 110px 18px 90px;
          }
          .mod-title {
            font-size: 22px;
          }
          .modulos-grid {
            grid-template-columns: 1fr;
          }
        }

        /* ─── Animation primitives (shared) ─── */
        @keyframes finbar {
          0%,
          100% {
            transform: scaleY(1);
          }
          50% {
            transform: scaleY(1.3);
          }
        }
        @keyframes finline {
          0% {
            stroke-dashoffset: 200;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
        @keyframes opsrot {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes opsrotrev {
          from {
            transform: rotate(360deg);
          }
          to {
            transform: rotate(0deg);
          }
        }
        @keyframes hsecpulse {
          0% {
            transform: scale(1);
            opacity: 0.8;
          }
          100% {
            transform: scale(2.5);
            opacity: 0;
          }
        }
        @keyframes comflow {
          0%,
          100% {
            transform: translateX(0);
          }
          50% {
            transform: translateX(20px);
          }
        }
        @keyframes comdot {
          0% {
            r: 3;
            opacity: 1;
          }
          100% {
            r: 8;
            opacity: 0;
          }
        }
        @keyframes mktwave {
          0%,
          100% {
            opacity: 0.25;
          }
          50% {
            opacity: 0.9;
          }
        }
        @keyframes mktbar {
          0%,
          100% {
            transform: scaleY(1);
          }
          50% {
            transform: scaleY(1.4);
          }
        }
        @keyframes rrhhpulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.12);
          }
        }
        @keyframes rrhhline {
          0%,
          100% {
            opacity: 0.25;
          }
          50% {
            opacity: 0.7;
          }
        }
        @keyframes rrhhplus {
          0% {
            transform: translateY(0);
            opacity: 0;
          }
          30% {
            opacity: 0.6;
          }
          70% {
            opacity: 0.6;
          }
          100% {
            transform: translateY(-30px);
            opacity: 0;
          }
        }

        /* ─── Per-module animation hooks ─── */
        .fin-bar {
          transform-box: fill-box;
          transform-origin: 50% 100%;
          animation: finbar 2s ease-in-out infinite;
        }
        .fin-line {
          animation: finline 3s ease-in-out infinite;
        }
        .ops-gear-big {
          transform-box: view-box;
          transform-origin: 80px 100px;
          animation: opsrot 8s linear infinite;
        }
        .ops-gear-small {
          transform-box: view-box;
          transform-origin: 170px 160px;
          animation: opsrotrev 6s linear infinite;
        }
        .hsec-pulse {
          transform-box: view-box;
          transform-origin: 120px 120px;
          animation: hsecpulse 3s ease-out infinite;
        }
        .com-flow {
          animation: comflow 4s ease-in-out infinite;
        }
        .com-dot {
          animation: comdot 2s ease-out infinite;
        }
        .mkt-wave {
          animation: mktwave 2.4s ease-in-out infinite;
        }
        .mkt-bar {
          transform-box: fill-box;
          transform-origin: 50% 100%;
          animation: mktbar 2.6s ease-in-out infinite;
        }
        .rrhh-line {
          animation: rrhhline 3s ease-in-out infinite;
        }
        .rrhh-person {
          animation: rrhhpulse 2.5s ease-in-out infinite;
        }
        .rrhh-plus {
          opacity: 0;
          animation: rrhhplus 3s ease-out infinite;
        }
      `}</style>
    </div>
  );
}
