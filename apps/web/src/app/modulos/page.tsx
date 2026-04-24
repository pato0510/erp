'use client';

import { useEffect, type CSSProperties, type ReactNode } from 'react';
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

const CALENDAR_CELLS: { x: number; y: number; delay: string | null }[] = [
  { x: 40, y: 80, delay: '0s' },
  { x: 80, y: 80, delay: null },
  { x: 120, y: 80, delay: '1s' },
  { x: 160, y: 80, delay: null },
  { x: 40, y: 120, delay: null },
  { x: 80, y: 120, delay: '2s' },
  { x: 120, y: 120, delay: null },
  { x: 160, y: 120, delay: '3s' },
  { x: 40, y: 160, delay: '1s' },
  { x: 80, y: 160, delay: null },
  { x: 120, y: 160, delay: null },
  { x: 160, y: 160, delay: '0s' },
];

const CalendarioSvg = () => (
  <svg
    viewBox="0 0 240 240"
    preserveAspectRatio="xMidYMid slice"
    className="mod-svg"
    style={{ opacity: 0.45 }}
  >
    <rect x="40" y="50" width="160" height="20" rx="2" fill="white" />
    {CALENDAR_CELLS.map((c, i) =>
      c.delay !== null ? (
        <rect
          key={i}
          x={c.x}
          y={c.y}
          width="35"
          height="35"
          rx="3"
          fill="white"
          className="cal-cell"
          style={{ animationDelay: c.delay }}
        />
      ) : (
        <rect key={i} x={c.x} y={c.y} width="35" height="35" rx="3" fill="white" opacity="0.3" />
      ),
    )}
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
    href: null,
    active: false,
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
    href: null,
    active: false,
    svg: <ComercialSvg />,
  },
  {
    key: 'calendario',
    name: 'Calendario',
    description: 'Calendario general de actividades y gestión organizacional',
    gradient: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
    href: null,
    active: false,
    svg: <CalendarioSvg />,
  },
  {
    key: 'rrhh',
    name: 'Recursos Humanos',
    description: 'Gestión del talento, nóminas, evaluaciones y desarrollo organizacional',
    gradient: 'linear-gradient(135deg, #14B8A6, #0F766E)',
    href: null,
    active: false,
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
      </div>

      <style jsx>{`
        .modulos-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 24px;
        }
        .module-card {
          position: relative;
          height: 240px;
          border-radius: var(--radius-lg);
          overflow: hidden;
          opacity: 0.65;
          cursor: not-allowed;
          transition:
            transform 0.3s ease,
            box-shadow 0.3s ease;
          isolation: isolate;
        }
        .module-card--active {
          opacity: 1;
          cursor: pointer;
        }
        .module-card--active:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
        }
        .module-card--active:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.35);
        }
        .module-card__svg {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .module-card__svg :global(.mod-svg) {
          width: 100%;
          height: 100%;
          transition: transform 0.6s ease;
          transform-origin: center;
        }
        .module-card--active:hover .module-card__svg :global(.mod-svg) {
          transform: scale(1.08);
        }
        .module-card__shade {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.75) 100%);
          pointer-events: none;
        }
        .module-card__badge {
          position: absolute;
          top: 12px;
          right: 12px;
          background: rgba(0, 0, 0, 0.6);
          color: #ffffff;
          font-family: var(--font-jetbrains-mono), monospace;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.08em;
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
          font-family: var(--font-outfit), sans-serif;
          font-weight: 600;
          font-size: 18px;
          letter-spacing: -0.01em;
          color: #ffffff;
        }
        .module-card__desc {
          margin-top: 6px;
          font-family: var(--font-outfit), sans-serif;
          font-weight: 400;
          font-size: 13px;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.92);
        }
        @media (max-width: 900px) {
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
        @keyframes calhighlight {
          0%,
          100% {
            opacity: 0.2;
          }
          50% {
            opacity: 0.8;
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
        :global(.fin-bar) {
          transform-box: fill-box;
          transform-origin: 50% 100%;
          animation: finbar 2s ease-in-out infinite;
        }
        :global(.fin-line) {
          animation: finline 3s ease-in-out infinite;
        }
        :global(.ops-gear-big) {
          transform-box: view-box;
          transform-origin: 80px 100px;
          animation: opsrot 8s linear infinite;
        }
        :global(.ops-gear-small) {
          transform-box: view-box;
          transform-origin: 170px 160px;
          animation: opsrotrev 6s linear infinite;
        }
        :global(.hsec-pulse) {
          transform-box: view-box;
          transform-origin: 120px 120px;
          animation: hsecpulse 3s ease-out infinite;
        }
        :global(.com-flow) {
          animation: comflow 4s ease-in-out infinite;
        }
        :global(.com-dot) {
          animation: comdot 2s ease-out infinite;
        }
        :global(.cal-cell) {
          animation: calhighlight 4s ease-in-out infinite;
        }
        :global(.rrhh-line) {
          animation: rrhhline 3s ease-in-out infinite;
        }
        :global(.rrhh-person) {
          animation: rrhhpulse 2.5s ease-in-out infinite;
        }
        :global(.rrhh-plus) {
          opacity: 0;
          animation: rrhhplus 3s ease-out infinite;
        }
      `}</style>
    </div>
  );
}
