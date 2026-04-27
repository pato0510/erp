'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Moon, Sun } from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { Starfield } from '../../../components/Starfield';
import { useTheme } from '../../../lib/theme';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [info, setInfo] = useState('');
  const { theme, toggleTheme } = useTheme();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginForm) => {
    setError('');
    setInfo('');
    setIsLoading(true);
    try {
      await apiClient.post('/api/auth/login', data);
      const me = await apiClient.get<{ companies: { companyId: string }[] }>('/api/auth/me');
      if (me.companies.length > 0) {
        apiClient.setCompanyId(me.companies[0].companyId);
      }
      window.location.href = '/modulos';
    } catch {
      setError('Credenciales inválidas');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    document.documentElement.classList.add('starfield-page');
    return () => {
      document.documentElement.classList.remove('starfield-page');
    };
  }, []);

  const handleForgotPassword = () => {
    setError('');
    setInfo('› funcionalidad próximamente disponible');
  };

  return (
    <div className="sw-root">
      <Starfield zIndex={0} />
      <div className="login-page">
        <div className="sw-vignette" aria-hidden="true" />

        <div className="sw-topbar">
          <span>PORTAL · ACCESO</span>
          <div className="sw-topbar__right">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="sw-theme-toggle"
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            <span aria-hidden="true">V1.0</span>
          </div>
        </div>

        <main className="sw-stage">
          <section className="sw-card">
            {/* Logo */}
            <div className="sw-logo">
              <svg
                width="38"
                height="38"
                viewBox="0 0 40 40"
                fill="none"
                aria-hidden="true"
                className="sw-logo__mark"
              >
                <defs>
                  <linearGradient id="sw-tri-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="oklch(0.88 0.10 220)" />
                    <stop offset="100%" stopColor="oklch(0.55 0.14 235)" />
                  </linearGradient>
                </defs>
                <path
                  d="M20 4 L36 32 L4 32 Z"
                  stroke="url(#sw-tri-grad)"
                  strokeWidth="1.4"
                  fill="none"
                  strokeLinejoin="round"
                />
                <path d="M20 14 L28 28 L12 28 Z" fill="url(#sw-tri-grad)" opacity="0.85" />
              </svg>
              <span className="sw-wordmark">
                Excelsia<span className="sw-wordmark__dot">.</span>
              </span>
            </div>

            <p className="sw-tagline">
              Gestiona tu empresa <span className="sw-tagline__strong">en un solo lugar</span>.
            </p>

            <div className="sw-auth-indicator" aria-hidden="true">
              <span className="sw-pulse" />
              <span>AUTHENTICATION REQUIRED</span>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="sw-form" noValidate>
              <div className="sw-field">
                <label htmlFor="email" className="sw-field__label">
                  user
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="nombre@empresa.cl"
                  className="sw-field__input"
                  {...register('email')}
                />
              </div>
              {errors.email && <p className="sw-field-error">› {errors.email.message}</p>}

              <div className="sw-field">
                <label htmlFor="password" className="sw-field__label">
                  passwd
                </label>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="sw-field__input"
                  {...register('password')}
                />
                <button
                  type="button"
                  className="sw-field__toggle"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? 'hide' : 'show'}
                </button>
              </div>
              {errors.password && <p className="sw-field-error">› {errors.password.message}</p>}

              <div className="sw-row-actions">
                <button type="button" onClick={handleForgotPassword} className="sw-link">
                  recuperar acceso
                </button>
                <button type="submit" disabled={isLoading} className="sw-submit">
                  <span>{isLoading ? '› verificando...' : 'Iniciar sesión'}</span>
                  {!isLoading && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden="true"
                      className="sw-submit__arrow"
                    >
                      <path
                        d="M2 7 H12 M8 3 L12 7 L8 11"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </div>

              <div className="sw-log" role="status" aria-live="polite">
                {error && <span className="err">› {error}</span>}
                {!error && info && <span className="ok">{info}</span>}
              </div>
            </form>
          </section>
        </main>

        <div className="sw-bottombar" aria-hidden="true">
          <span>CONEXIÓN SEGURA</span>
          <span>AES-256 · END-TO-END</span>
        </div>
      </div>

      <style jsx global>{`
        .sw-root {
          --ink: #eef1f7;
          --ink-dim: rgba(238, 241, 247, 0.62);
          --ink-faint: rgba(238, 241, 247, 0.36);
          --accent: oklch(0.82 0.12 220);
          --field-bg: rgba(255, 255, 255, 0.1);
          --line: rgba(238, 241, 247, 0.12);

          position: fixed;
          inset: 0;
          color: var(--ink);
          font-family: var(--font-space-grotesk), var(--font-outfit), sans-serif;
          background-color: #000000;
          background-image:
            radial-gradient(ellipse at 50% 40%, rgba(20, 30, 55, 0.35) 0%, transparent 55%),
            radial-gradient(ellipse at 80% 80%, rgba(40, 20, 60, 0.3) 0%, transparent 60%);
          overflow: hidden;
        }
        html:not(.dark) .sw-root {
          background-color: #1d3358;
          background-image:
            radial-gradient(ellipse at 50% 30%, rgba(110, 170, 230, 0.45) 0%, transparent 60%),
            radial-gradient(ellipse at 20% 90%, rgba(70, 130, 200, 0.35) 0%, transparent 60%),
            linear-gradient(180deg, #2a4f82 0%, #1a3158 50%, #142544 100%);
        }
        .sw-vignette {
          position: fixed;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          background: radial-gradient(circle at 50% 50%, transparent 30%, rgba(0, 0, 0, 0.55) 95%);
        }
        html:not(.dark) .sw-vignette {
          background: radial-gradient(
            circle at 50% 50%,
            transparent 35%,
            rgba(8, 18, 38, 0.45) 95%
          );
        }
        .sw-topbar,
        .sw-bottombar {
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
          z-index: 3;
        }
        .sw-topbar {
          top: 0;
          font-size: 11px;
        }
        .sw-bottombar {
          bottom: 0;
          font-size: 10px;
        }
        .sw-topbar__right {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .sw-theme-toggle {
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
        .sw-theme-toggle:hover {
          color: var(--ink);
          border-color: rgba(238, 241, 247, 0.45);
          background: rgba(255, 255, 255, 0.06);
        }
        .sw-stage {
          position: relative;
          z-index: 2;
          height: 100vh;
          width: 100vw;
          display: grid;
          place-items: center;
          padding: 80px 24px;
        }
        @keyframes sw-rise {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .sw-card {
          width: min(440px, 100%);
          background: transparent;
          border: none;
          animation: sw-rise 450ms ease-out both;
        }
        @keyframes sw-stars-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .sw-root canvas {
          animation: sw-stars-in 500ms ease-out both;
        }
        .sw-logo {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 18px;
        }
        .sw-logo__mark {
          filter: drop-shadow(0 0 12px rgba(120, 170, 230, 0.35));
        }
        .sw-wordmark {
          font-family: var(--font-space-grotesk), sans-serif;
          font-weight: 500;
          font-size: 19px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--ink);
          text-shadow: 0 0 16px rgba(120, 170, 230, 0.18);
        }
        .sw-wordmark__dot {
          color: var(--accent);
        }
        .sw-tagline {
          font-family: var(--font-space-grotesk), sans-serif;
          font-weight: 300;
          font-size: 13px;
          color: var(--ink-dim);
          margin-bottom: 30px;
          letter-spacing: 0.01em;
          text-align: center;
        }
        .sw-tagline__strong {
          font-weight: 500;
          color: var(--ink);
        }
        .sw-auth-indicator {
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 11.5px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--ink-dim);
          margin-bottom: 20px;
        }
        @keyframes sw-pulse-dot {
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
        .sw-pulse {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: var(--accent);
          animation: sw-pulse-dot 1.6s ease-in-out infinite;
          flex: none;
        }
        .sw-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .sw-field {
          position: relative;
          height: 50px;
          padding: 0 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          background: rgba(255, 255, 255, 0.16);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 4px;
          transition:
            background-color 200ms ease,
            border-color 200ms ease;
        }
        .sw-field:hover {
          background: rgba(255, 255, 255, 0.22);
        }
        .sw-field:focus-within {
          background: rgba(255, 255, 255, 0.26);
          border-color: rgba(255, 255, 255, 0.45);
        }
        .sw-field__label {
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: lowercase;
          color: var(--ink-faint);
          flex: none;
          width: 56px;
        }
        .sw-field__input {
          flex: 1;
          background: transparent !important;
          border: none !important;
          outline: none;
          color: var(--ink) !important;
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 13px;
          letter-spacing: 0.02em;
          padding: 0;
          height: 100%;
        }
        .sw-field__input::placeholder {
          color: rgba(238, 241, 247, 0.32);
        }
        .sw-field__input:-webkit-autofill,
        .sw-field__input:-webkit-autofill:hover,
        .sw-field__input:-webkit-autofill:focus {
          -webkit-text-fill-color: var(--ink);
          -webkit-box-shadow: 0 0 0 1000px transparent inset;
          transition: background-color 5000s ease-in-out 0s;
        }
        .sw-field__toggle {
          background: transparent;
          border: none;
          color: var(--ink-faint);
          cursor: pointer;
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 10px;
          letter-spacing: 0.18em;
          padding: 4px 6px;
          text-transform: lowercase;
          transition: color 150ms ease;
        }
        .sw-field__toggle:hover {
          color: var(--ink);
        }
        .sw-field-error {
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 11px;
          color: oklch(0.78 0.14 22);
          margin: -4px 4px 0;
        }
        .sw-row-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-top: 22px;
        }
        .sw-link {
          background: transparent;
          border: none;
          padding: 0;
          color: var(--ink-dim);
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: lowercase;
          cursor: pointer;
          text-decoration: underline dotted;
          text-underline-offset: 4px;
          transition: color 150ms ease;
        }
        .sw-link:hover {
          color: var(--ink);
        }
        .sw-submit {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border: 1px solid rgba(255, 255, 255, 0.7);
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          color: #ffffff;
          font-family: var(--font-space-grotesk), sans-serif;
          font-weight: 500;
          font-size: 12px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          padding: 12px 22px;
          border-radius: 4px;
          cursor: pointer;
          transition:
            background-color 200ms ease,
            border-color 200ms ease,
            transform 120ms ease;
        }
        .sw-submit:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.2);
          border-color: #ffffff;
        }
        .sw-submit:active:not(:disabled) {
          transform: scale(0.985);
        }
        .sw-submit:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }
        .sw-submit__arrow {
          transition: transform 200ms ease;
        }
        .sw-submit:hover:not(:disabled) .sw-submit__arrow {
          transform: translateX(2px);
        }
        .sw-log {
          min-height: 22px;
          margin-top: 14px;
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 11.5px;
          letter-spacing: 0.05em;
        }
        .sw-log .err {
          color: oklch(0.78 0.14 22);
        }
        .sw-log .ok {
          color: #9be0b1;
        }

        @media (max-width: 640px) {
          .sw-topbar,
          .sw-bottombar {
            padding: 20px 22px;
          }
          .sw-stage {
            padding: 70px 18px;
          }
          .sw-wordmark {
            font-size: 17px;
          }
          .sw-tagline {
            font-size: 12.5px;
          }
        }
      `}</style>
    </div>
  );
}
