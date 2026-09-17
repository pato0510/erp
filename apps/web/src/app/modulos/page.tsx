'use client';

import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ClipboardList, LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
// UI-003 — the brand isotype (designer SVG) replaces the inline gradient mark.
import { ExcelsiaLogo } from '../../components/shared/ExcelsiaLogo';
import { useTheme } from '../../lib/theme';
import { Starfield } from '../../components/Starfield';
// HUB-004 — the footer with the centred clock · latency · connection block.
import { HubFooter } from '../../components/hub/HubFooter';

type ModuleDef = {
  key: string;
  /* HUB-001 — the exact token key in tokens.css (--hub-<hubKey>-from/-to/-border/-ink/-glow). */
  hubKey: 'finanzas' | 'operaciones' | 'hsec' | 'comercial' | 'marketing' | 'rrhh' | 'gestion';
  name: string;
  description: string;
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

const CalendarioSvg = () => (
  <ClipboardList
    className="mod-svg"
    color="white"
    strokeWidth={1}
    style={{ opacity: 0.45 }}
    aria-hidden="true"
  />
);

const MarketingSvg = () => (
  <svg
    viewBox="0 0 240 240"
    preserveAspectRatio="xMidYMid slice"
    className="mod-svg"
    style={{ opacity: 0.5 }}
  >
    {/* megaphone: mouthpiece + widening cone */}
    <rect x="55" y="112" width="16" height="26" rx="3" fill="white" opacity="0.85" />
    <path d="M71 108 L128 84 L128 166 L71 142 Z" fill="white" opacity="0.9" />
    {/* broadcast waves */}
    <g stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.55">
      <path d="M140 98 Q158 125 140 152" />
      <path d="M158 84 Q186 125 158 166" />
    </g>
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
    hubKey: 'finanzas',
    name: 'Finanzas',
    description: 'Gestión financiera, tributario, conciliación bancaria y reportes ejecutivos',
    href: '/dashboard',
    active: true,
    svg: <FinanzasSvg />,
  },
  {
    key: 'operaciones',
    hubKey: 'operaciones',
    name: 'Operaciones',
    description: 'Control de activos, documentos, permisos y procedimientos operacionales',
    href: '/operaciones',
    active: true,
    svg: <OperacionesSvg />,
  },
  {
    // HSEC-011 (2026-08-03) — un-gated: HSEC is live (incidentes + afectados + adjuntos +
    // notificación GRAVE/FATAL, capacitaciones + planilla, EPP con catálogo chileno +
    // entregas + acuse, dashboard mensual). Was gated ("Próximamente") through HSEC-001..010
    // (COM-015/MKT-010/CAL-007 pattern).
    key: 'hsec',
    hubKey: 'hsec',
    name: 'HSEC',
    description: 'Salud, seguridad, medio ambiente y comunidades',
    href: '/hsec',
    active: true,
    svg: <HsecSvg />,
  },
  {
    key: 'comercial',
    hubKey: 'comercial',
    name: 'Comercial',
    description: 'Pipeline de ventas, CRM, cotizaciones y gestión de clientes',
    href: '/comercial', // COM-015 — un-gated: Comercial is live (CRM, quotes, Operaciones/Finanzas wiring)
    active: true,
    svg: <ComercialSvg />,
  },
  {
    // MKT-010 — un-gated: Marketing V1 is live (campaigns, expenses, calendar,
    // attribution/ROI, presence). COM-015 analog: active flips to true, href unchanged.
    key: 'marketing',
    hubKey: 'marketing',
    name: 'Marketing',
    description: 'Campañas, gastos de marketing y presencia digital',
    href: '/marketing',
    active: true,
    svg: <MarketingSvg />,
  },
  {
    key: 'rrhh',
    hubKey: 'rrhh',
    name: 'Recursos Humanos',
    description: 'Gestión del talento, nóminas, evaluaciones y desarrollo organizacional',
    href: '/rrhh',
    active: true,
    svg: <RrhhSvg />,
  },
  {
    // CAL-007 — un-gated: Calendario de Actividades is live (three views, chips by area,
    // birthdays feed). Was gated ("Próximamente") through CAL-001..006 (COM-015/MKT-010 pattern).
    key: 'calendario-actividades',
    hubKey: 'gestion',
    name: 'Gestión organizacional',
    description: 'To-dos, calendario, áreas y alertas del equipo',
    href: '/actividades',
    active: true,
    svg: <CalendarioSvg />,
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
          {/* UI-003 — isotype at the guide's 32 px minimum; the horizontal wordmark needs
              ≥ 240 px (≈ 61 px tall) and does not fit a 60 px topbar. The surface is dark
              in both themes → inverse (steel blue). Decorative: the label follows. */}
          <ExcelsiaLogo variant="isotype" tone="inverse" height={32} alt="" />
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
              {MODULES.map((mod, index) => {
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
                    style={
                      {
                        // HUB-001 — per-card variables so ONE stylesheet rule serves all cards.
                        '--card-from': `var(--hub-${mod.hubKey}-from)`,
                        '--card-to': `var(--hub-${mod.hubKey}-to)`,
                        '--card-border': `var(--hub-${mod.hubKey}-border)`,
                        '--card-ink': `var(--hub-${mod.hubKey}-ink)`,
                        '--card-glow': `var(--hub-${mod.hubKey}-glow)`,
                        '--i': index,
                      } as CSSProperties
                    }
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

      {/* Bottom bar — HUB-004: left/right unchanged, centred indicators in between. */}
      <HubFooter left="EXCELSIA ERP · V1.0" right="AGS SOLUTIONS SPA" />

      <style jsx global>{`
        /* The cards own the entrance; the inherited page fade would outlast them. */
        .modulos-page-wrapper.mod-root {
          opacity: 1;
          animation: none;
        }
        .mod-root {
          --ink: #eef1f7;
          --ink-dim: rgba(238, 241, 247, 0.62);
          --ink-faint: rgba(238, 241, 247, 0.36);
          --accent: oklch(0.82 0.12 220);

          position: fixed;
          inset: 0;
          color: var(--ink);
          font-family: var(--font-space-grotesk), var(--font-outfit), sans-serif;
          /* HUB-001 — exact hub background with the top illumination; ONE rule for both
             themes (the hub is dark in both). The Starfield canvas stays as a separate
             layer (z-index 1) above this backdrop. */
          background-color: var(--hub-bg);
          background-image: radial-gradient(
            ellipse at 50% 0%,
            var(--hub-bg-light) 0%,
            transparent 65%
          );
          overflow-y: auto;
          overflow-x: hidden;
        }
        .mod-vignette {
          position: fixed;
          inset: 0;
          z-index: 2;
          pointer-events: none;
          background: radial-gradient(circle at 50% 50%, transparent 30%, rgba(0, 0, 0, 0.55) 95%);
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
          color: var(--hub-text-secondary); /* HUB-001 */
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
          /* HUB-004 — 1fr auto 1fr keeps the centre block centred on the page whatever
             the side texts measure; the bar keeps its container and positioning. */
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          column-gap: 16px;
          row-gap: 10px;
        }
        .mod-bottombar__side {
          justify-self: start;
          white-space: nowrap;
        }
        .mod-bottombar__side--right {
          justify-self: end;
        }
        .mod-bottombar__center {
          justify-self: center;
        }
        /* HUB-004 — indicators: same mono voice as the bar; tabular digits + fixed width
           so the ticking clock never shifts its neighbours. */
        .mod-indicators {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          color: var(--hub-text-secondary);
          text-transform: none;
          letter-spacing: 0.12em;
        }
        .mod-ind {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-variant-numeric: tabular-nums;
        }
        .mod-ind--clock {
          min-width: 8ch;
          justify-content: center;
        }
        .mod-ind--latency {
          min-width: 7ch;
          justify-content: center;
        }
        .mod-ind__sep {
          opacity: 0.5;
        }
        .mod-ind__dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          flex: none;
        }
        /* Status colours — spec §4. --hub-status-correcto / --hub-status-atencion do not
           exist in tokens.css yet (Codex owns that file this wave), so the raw values live
           here, in the allowlisted hub page. */
        .mod-ind__dot--online {
          background: #86efac;
        }
        .mod-ind__dot--failure {
          background: #fcd34d;
        }
        .mod-ind__dot--idle {
          background: var(--hub-text-secondary);
          opacity: 0.5;
        }
        @keyframes mod-ind-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.45;
          }
        }
        .mod-ind__dot--pulse {
          animation: mod-ind-pulse 2s ease-in-out infinite;
        }
        .mod-topbar__left {
          display: flex;
          align-items: center;
          gap: 12px;
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
          /* HUB-001 — exact palette per card via the inline --card-* variables; resting
             border in the module's border colour, finish = shadow + 1px highlight. */
          background: linear-gradient(150deg, var(--card-from), var(--card-to));
          border-color: var(--card-border);
          transition: border-color 180ms ease-out;
          animation: module-card-enter 240ms ease-out calc(var(--i) * 25ms) backwards;
          isolation: isolate;
          box-shadow: var(--hub-shadow), var(--hub-highlight);
        }
        /* HUB-001 — radial light at the top of the card (border colour at 20%), under the scene. */
        .module-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 0%, var(--card-glow) 0%, transparent 60%);
          pointer-events: none;
          z-index: 0;
        }
        /* An inset border preserves the existing card and content dimensions. */
        .module-card::after {
          content: '';
          position: absolute;
          inset: 0;
          border: 1px solid;
          border-color: inherit;
          border-radius: inherit;
          pointer-events: none;
          z-index: 3;
        }
        .module-card--active {
          opacity: 1;
          cursor: pointer;
        }
        /* HUB-001 — active state is the border turning to the module's ink; the UI-002
           lift (translateY) is REMOVED: no transform, scale, rotate or tilt. */
        .module-card--active:hover,
        .module-card--active:focus-visible {
          border-color: var(--card-ink);
        }
        .module-card--active:focus-visible {
          outline: 2px solid var(--card-ink);
          outline-offset: 3px;
        }
        .module-card__svg {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .module-card__svg .mod-svg {
          width: 100%;
          height: 100%;
          transform-origin: center;
        }
        /* HUB-001 — the veil behind title/description (exact --hub-veil). */
        .module-card__shade {
          position: absolute;
          inset: 0;
          background: var(--hub-veil);
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
          z-index: 2;
        }
        .module-card__content {
          position: absolute;
          left: 20px;
          right: 20px;
          bottom: 18px;
          z-index: 2;
          color: var(--hub-title);
        }
        .module-card__title {
          font-family: var(--font-space-grotesk), var(--font-outfit), sans-serif;
          font-weight: 600;
          font-size: 18px;
          letter-spacing: -0.01em;
          color: var(--hub-title);
          margin: 0;
        }
        .module-card__desc {
          margin: 6px 0 0;
          font-family: var(--font-space-grotesk), var(--font-outfit), sans-serif;
          font-weight: 400;
          font-size: 13px;
          line-height: 1.5;
          color: var(--hub-desc);
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
          /* HUB-004 — the centre block wraps to its own row before it can overlap an end. */
          .mod-bottombar {
            grid-template-columns: 1fr 1fr;
          }
          .mod-bottombar__center {
            grid-column: 1 / -1;
            grid-row: 2;
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
        .cal-cell {
          animation: calhighlight 4s ease-in-out infinite;
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

        @media (prefers-reduced-motion: reduce) {
          .module-card,
          .module-card * {
            animation: none;
            transition: none;
          }
          .mod-ind__dot--pulse {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
