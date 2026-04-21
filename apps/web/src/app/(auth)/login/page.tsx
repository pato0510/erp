'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight } from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { ExcelsiaLogo } from '../../../components/shared/ExcelsiaLogo';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
});

type LoginForm = z.infer<typeof loginSchema>;

const TYPEWRITER_PHRASES = [
  'iniciando sesión...',
  'cargando módulos...',
  'sincronizando datos...',
  'listo para operar.',
];

const TYPE_MS = 75;
const ERASE_MS = 35;
const HOLD_MS = 1800;

type TypewriterPhase = 'typing' | 'holding' | 'erasing' | 'done';

function useTypewriter(phrases: string[]) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<TypewriterPhase>('typing');

  useEffect(() => {
    const current = phrases[phraseIndex];
    const isLast = phraseIndex === phrases.length - 1;

    if (phase === 'typing') {
      if (text.length < current.length) {
        const t = setTimeout(() => setText(current.slice(0, text.length + 1)), TYPE_MS);
        return () => clearTimeout(t);
      }
      if (isLast) {
        setPhase('done');
        return undefined;
      }
      const t = setTimeout(() => setPhase('holding'), 50);
      return () => clearTimeout(t);
    }

    if (phase === 'holding') {
      const t = setTimeout(() => setPhase('erasing'), HOLD_MS);
      return () => clearTimeout(t);
    }

    if (phase === 'erasing') {
      if (text.length > 0) {
        const t = setTimeout(() => setText(current.slice(0, text.length - 1)), ERASE_MS);
        return () => clearTimeout(t);
      }
      setPhraseIndex((i) => i + 1);
      setPhase('typing');
    }
    return undefined;
  }, [text, phase, phraseIndex, phrases]);

  return text;
}

export default function LoginPage() {
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const typed = useTypewriter(TYPEWRITER_PHRASES);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginForm) => {
    setError('');
    setIsLoading(true);
    try {
      await apiClient.post('/api/auth/login', data);
      const me = await apiClient.get<{ companies: { companyId: string }[] }>('/api/auth/me');
      if (me.companies.length > 0) {
        apiClient.setCompanyId(me.companies[0].companyId);
      }
      window.location.href = '/dashboard';
    } catch {
      setError('Credenciales inválidas');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="tn-login"
      style={{
        height: '100vh',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        background: '#ffffff',
      }}
    >
      {/* LEFT PANEL ─ Terminal Noir */}
      <aside
        className="tn-login__left"
        style={{
          position: 'relative',
          background: '#1C1C1E',
          color: '#ffffff',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '64px 72px',
        }}
      >
        {/* Geometric SVG background — circles confined to top-right */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 800 900"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <g fill="none">
            <circle cx="720" cy="150" r="220" stroke="#2C2C2E" strokeWidth="0.5" />
            <circle cx="720" cy="150" r="320" stroke="#2C2C2E" strokeWidth="0.5" />
            <circle cx="680" cy="110" r="42" stroke="#2563EB" strokeWidth="0.4" opacity="0.3" />
            <line x1="0" y1="460" x2="800" y2="120" stroke="#2C2C2E" strokeWidth="0.5" />
            <line x1="0" y1="600" x2="800" y2="260" stroke="#2C2C2E" strokeWidth="0.5" />
          </g>
          <circle cx="740" cy="78" r="2" fill="#2563EB" />
        </svg>

        {/* Top — logo (absolute) */}
        <div
          style={{
            position: 'absolute',
            top: 64,
            left: 72,
            zIndex: 1,
          }}
        >
          <ExcelsiaLogo size={26} variant="light" />
        </div>

        {/* Middle — eyebrow + headline + terminal (centered in panel) */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            maxWidth: 520,
            width: '100%',
            margin: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 22,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 14,
                height: 1,
                background: '#2563EB',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 10,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: '#2563EB',
              }}
            >
              Plataforma ERP
            </span>
          </div>

          <h1
            style={{
              fontFamily: 'var(--font-dm-serif), serif',
              fontWeight: 400,
              fontSize: 44,
              lineHeight: 1.15,
              color: '#ffffff',
              marginBottom: 36,
            }}
          >
            Gestiona tu
            <br />
            empresa en
            <br />
            <span style={{ color: '#1E3A5F', fontStyle: 'italic' }}>un solo lugar.</span>
          </h1>

          {/* Terminal block */}
          <div
            style={{
              background: '#141414',
              border: '0.5px solid #2C2C2E',
              borderRadius: 6,
              padding: '14px 16px',
              maxWidth: 300,
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 11,
              lineHeight: 2,
            }}
          >
            <div style={{ color: '#8E8E93' }}>
              <span style={{ color: '#2563EB', marginRight: 4 }}>✓</span>
              finanzas conectadas
            </div>
            <div style={{ color: '#8E8E93' }}>
              <span style={{ color: '#2563EB', marginRight: 4 }}>✓</span>
              operaciones activas
            </div>
            <div style={{ color: '#8E8E93' }}>
              <span style={{ color: '#2563EB', marginRight: 4 }}>✓</span>
              reportes en tiempo real
            </div>
            <div
              style={{
                color: '#8E8E93',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span style={{ color: '#2563EB', marginRight: 4 }}>›</span>
              <span>{typed}</span>
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 7,
                  height: 11,
                  background: '#2563EB',
                  marginLeft: 3,
                  animation: 'tn-blink 1s step-end infinite',
                }}
              />
            </div>
          </div>
        </div>

        {/* Bottom — stats (absolute) */}
        <div
          style={{
            position: 'absolute',
            bottom: 64,
            left: 72,
            right: 72,
            zIndex: 1,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 24,
          }}
        >
          {[
            { value: '100%', label: 'Nube segura' },
            { value: '24/7', label: 'Disponible' },
            { value: 'v1.0', label: 'Producción' },
          ].map((s) => (
            <div key={s.value}>
              <div
                style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 17,
                  color: '#ffffff',
                  fontWeight: 500,
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 9,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#8E8E93',
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* RIGHT PANEL ─ Form */}
      <section
        className="tn-login__right"
        style={{
          background: '#ffffff',
          padding: '40px 48px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top logo */}
        <div className="tn-login__right-logo">
          <ExcelsiaLogo size={22} variant="dark" />
        </div>

        {/* Centered form */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: '100%', maxWidth: 380 }}>
            <h2
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
                fontSize: 28,
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
                color: '#1C1C1E',
              }}
            >
              Bienvenido de vuelta.
            </h2>
            <p
              style={{
                marginTop: 8,
                fontFamily: 'var(--font-inter), sans-serif',
                fontWeight: 300,
                fontSize: 13,
                color: '#9aa0ad',
              }}
            >
              Ingresa a tu cuenta para continuar
            </p>

            <form
              onSubmit={handleSubmit(onSubmit)}
              style={{
                marginTop: 28,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div>
                <label
                  htmlFor="email"
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontSize: 10,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#1C1C1E',
                    marginBottom: 6,
                  }}
                >
                  Correo electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  {...register('email')}
                  placeholder="nombre@empresa.cl"
                  className="tn-input"
                />
                {errors.email && (
                  <p style={{ color: '#dc2626', fontSize: 12, marginTop: 5 }}>
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="password"
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontSize: 10,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#1C1C1E',
                    marginBottom: 6,
                  }}
                >
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  {...register('password')}
                  placeholder="••••••••"
                  className="tn-input"
                />
                {errors.password && (
                  <p style={{ color: '#dc2626', fontSize: 12, marginTop: 5 }}>
                    {errors.password.message}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <a
                  href="/forgot-password"
                  style={{
                    fontFamily: 'var(--font-inter), sans-serif',
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#2563EB',
                    textDecoration: 'none',
                  }}
                >
                  ¿Olvidaste tu contraseña?
                </a>
              </div>

              {error && (
                <div
                  style={{
                    background: 'rgba(220, 38, 38, 0.08)',
                    color: '#b91c1c',
                    border: '1px solid rgba(220, 38, 38, 0.2)',
                    borderRadius: 6,
                    padding: '10px 14px',
                    fontSize: 12,
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                  }}
                >
                  › {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  marginTop: 4,
                  width: '100%',
                  background: '#1C1C1E',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 40,
                  padding: '14px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.7 : 1,
                  transition: 'transform 120ms ease',
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = 'scale(0.985)';
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <span>{isLoading ? 'Ingresando...' : 'Iniciar sesión'}</span>
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: '#2563EB',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ArrowRight size={14} strokeWidth={2.75} />
                </span>
              </button>

              <div
                style={{
                  marginTop: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  color: '#c8cdd6',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: '#8E8E93',
                  }}
                />
                conexión segura · cifrado end-to-end
              </div>
            </form>
          </div>
        </div>
      </section>

      <style jsx>{`
        @keyframes tn-blink {
          0%,
          49% {
            opacity: 1;
          }
          50%,
          100% {
            opacity: 0;
          }
        }
        .tn-login__right-logo {
          display: none;
        }
        :global(.tn-input) {
          width: 100%;
          padding: 11px 14px;
          border: 1px solid #e8eaed;
          border-radius: 8px;
          background: #fafafa;
          font-family: var(--font-inter), sans-serif;
          font-size: 14px;
          color: #1c1c1e;
          outline: none;
          transition:
            border-color 150ms ease,
            background-color 150ms ease,
            box-shadow 150ms ease;
        }
        :global(.tn-input::placeholder) {
          color: #d0d5dd;
        }
        :global(.tn-input:focus) {
          border-color: #2563eb;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }
        @media (max-width: 768px) {
          .tn-login {
            grid-template-columns: 1fr !important;
          }
          .tn-login__left {
            display: none !important;
          }
          .tn-login__right {
            padding: 32px 24px !important;
          }
          .tn-login__right-logo {
            display: flex !important;
            justify-content: center;
            padding: 8px 0 24px;
          }
        }
      `}</style>
    </div>
  );
}
