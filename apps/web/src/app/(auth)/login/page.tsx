'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Moon, Sun } from 'lucide-react';
import { apiClient } from '../../../lib/api';
// UI-003 — the brand vertical logo (designer SVG), replaces the inline mark + text wordmark.
import { ExcelsiaLogo } from '../../../components/shared/ExcelsiaLogo';
import { useTheme } from '../../../lib/theme';
// AUTH-002 — the sw-* rules now live in one shared place for every (auth) page.
import { AuthStageStyles } from '../AuthStageStyles';

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
  const router = useRouter();

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
      const me = await apiClient.get<{
        companies: { companyId: string }[];
        mustChangePassword?: boolean;
      }>('/api/auth/me');
      if (me.companies.length > 0) {
        apiClient.setCompanyId(me.companies[0].companyId);
      }
      // HUB-006 — client navigation: the root layout (and the shared SpaceBackdrop with
      // its stars) persists into the hub. isLoading stays true until this page unmounts.
      // AUTH-002 — a reset account (temporary password) goes to the forced change first.
      router.replace(me.mustChangePassword ? '/cambiar-clave' : '/modulos');
    } catch {
      setError('Credenciales inválidas');
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setError('');
    // AUTH-002 — recovery V1 is admin-initiated (founder, 2026-09-22): no email, no route.
    setInfo(
      '› Pide a un administrador de tu empresa que restablezca tu acceso. Recibirás una clave temporal que deberás cambiar al entrar.',
    );
  };

  return (
    <div className="sw-root">
      {/* HUB-006 — starfield, backdrop and vignette live in the shared SpaceBackdrop. */}
      <div className="login-page">
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
            {/* Logo — UI-003: vertical brand ("marca principal" for centered spaces). The
                login surface is dark in BOTH themes (black starfield / navy), so the
                inverse asset is the guide's correct choice here, not the color one. */}
            <div className="sw-logo">
              <ExcelsiaLogo variant="vertical" tone="inverse" height={160} alt="Excelsia" />
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

      <AuthStageStyles />
    </div>
  );
}
