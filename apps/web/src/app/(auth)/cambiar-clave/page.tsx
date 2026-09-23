'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';
import { ApiError, apiClient } from '../../../lib/api';
import { useAuth } from '../../../hooks/useAuth';
import { useTheme } from '../../../lib/theme';
import { meetsPasswordPolicy } from '../../../lib/password-policy';
import { PasswordChecklist } from '../../../components/shared/PasswordChecklist';
import { AuthStageStyles } from '../AuthStageStyles';

/**
 * AUTH-002 — /cambiar-clave: the forced change after an admin reset (mustChangePassword)
 * and the voluntary change from the sidebars. Renders over the shared SpaceBackdrop
 * (SPACE_PATHS) with the login's sw-* stage. The server is the authority on the policy and
 * on "distinta de la actual"; the checklist only gates the submit.
 */
export default function CambiarClavePage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { user, isLoading, logout } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  const flagged = user?.mustChangePassword === true;
  const policyOk = meetsPasswordPolicy(next);
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = current.length > 0 && policyOk && confirm === next && !submitting;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setSubmitting(true);
    try {
      await apiClient.post('/api/auth/change-password', {
        currentPassword: current,
        newPassword: next,
      });
      // The api re-issued THIS session's cookies; submitting stays true until unmount.
      router.replace('/modulos');
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.status === 429) {
        setError('Demasiados intentos. Espera un minuto e inténtalo de nuevo.');
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
      }
    }
  };

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.replace('/modulos');
  };

  return (
    <div className="sw-root cc-root">
      {/* HUB-006 — starfield, backdrop and vignette live in the shared SpaceBackdrop. */}
      <div className="login-page">
        <div className="sw-topbar">
          <span>PORTAL · CREDENCIALES</span>
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
          {user && (
            <section className="sw-card" aria-labelledby="cc-title">
              <h1 id="cc-title" className="cc-title">
                {flagged ? 'Crea tu nueva contraseña' : 'Cambiar contraseña'}
              </h1>
              {flagged && (
                <p className="sw-tagline">
                  Tu acceso fue restablecido. Por seguridad, cambia la clave temporal antes de
                  continuar.
                </p>
              )}

              <form onSubmit={onSubmit} className="sw-form cc-form" noValidate>
                {/* Lets password managers pair the new secret with the account. */}
                <input
                  type="email"
                  name="username"
                  autoComplete="username"
                  value={user.email}
                  readOnly
                  hidden
                />

                <div>
                  <label htmlFor="cc-current" className="cc-label">
                    {flagged ? 'Clave temporal' : 'Contraseña actual'}
                  </label>
                  <div className="sw-field">
                    <input
                      id="cc-current"
                      name="current-password"
                      type={showCurrent ? 'text' : 'password'}
                      autoComplete="current-password"
                      className="sw-field__input"
                      value={current}
                      onChange={(e) => setCurrent(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="sw-field__toggle"
                      onClick={() => setShowCurrent((s) => !s)}
                      aria-label={showCurrent ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showCurrent ? 'hide' : 'show'}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="cc-new" className="cc-label">
                    Nueva contraseña
                  </label>
                  <div className="sw-field">
                    <input
                      id="cc-new"
                      name="new-password"
                      type={showNext ? 'text' : 'password'}
                      autoComplete="new-password"
                      className="sw-field__input"
                      value={next}
                      onChange={(e) => setNext(e.target.value)}
                      aria-describedby="cc-rules"
                      aria-invalid={next.length > 0 && !policyOk}
                      maxLength={100}
                      required
                    />
                    <button
                      type="button"
                      className="sw-field__toggle"
                      onClick={() => setShowNext((s) => !s)}
                      aria-label={
                        showNext ? 'Ocultar contraseñas nuevas' : 'Mostrar contraseñas nuevas'
                      }
                    >
                      {showNext ? 'hide' : 'show'}
                    </button>
                  </div>
                  <PasswordChecklist id="cc-rules" password={next} className="cc-checklist" />
                </div>

                <div>
                  <label htmlFor="cc-confirm" className="cc-label">
                    Repite la nueva contraseña
                  </label>
                  <div className="sw-field">
                    <input
                      id="cc-confirm"
                      name="confirm-password"
                      type={showNext ? 'text' : 'password'}
                      autoComplete="new-password"
                      className="sw-field__input"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      aria-describedby={mismatch ? 'cc-mismatch' : undefined}
                      aria-invalid={mismatch}
                      maxLength={100}
                      required
                    />
                  </div>
                  {mismatch && (
                    <p id="cc-mismatch" className="sw-field-error cc-mismatch">
                      › Las contraseñas no coinciden
                    </p>
                  )}
                </div>

                <div className="sw-row-actions">
                  <div className="cc-links">
                    {!flagged && (
                      <button type="button" onClick={goBack} className="sw-link">
                        volver
                      </button>
                    )}
                    <button type="button" onClick={logout} className="sw-link">
                      salir
                    </button>
                  </div>
                  <button type="submit" disabled={!canSubmit} className="sw-submit">
                    <span>{submitting ? '› guardando...' : 'Guardar contraseña'}</span>
                  </button>
                </div>

                <div className="sw-log">
                  {error && (
                    <span role="alert" className="err">
                      › {error}
                    </span>
                  )}
                </div>
              </form>
            </section>
          )}
        </main>

        <div className="sw-bottombar" aria-hidden="true">
          <span>CONEXIÓN SEGURA</span>
          <span>AES-256 · END-TO-END</span>
        </div>
      </div>

      <AuthStageStyles />
      <style jsx global>{`
        /* Longer than the login: the stage scrolls instead of clipping on short screens. */
        .sw-root.cc-root {
          overflow-y: auto;
        }
        .cc-root .sw-stage {
          height: auto;
          min-height: 100vh;
        }
        .cc-title {
          font-family: var(--font-space-grotesk), sans-serif;
          font-weight: 400;
          font-size: 24px;
          letter-spacing: -0.005em;
          color: var(--ink);
          text-align: center;
          margin: 0 0 12px;
        }
        .cc-root .sw-tagline {
          margin-bottom: 26px;
        }
        .cc-form {
          gap: 16px;
          margin-top: 18px;
        }
        .cc-label {
          display: block;
          margin: 0 0 7px 2px;
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.1em;
          color: var(--ink-dim);
        }
        .cc-checklist {
          list-style: none;
          margin: 10px 2px 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 6px 18px;
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.04em;
          color: var(--ink-dim);
        }
        .cc-checklist li[data-met='true'] {
          color: var(--ink);
        }
        .cc-mismatch {
          margin: 8px 2px 0;
        }
        .cc-links {
          display: flex;
          gap: 18px;
        }
      `}</style>
    </div>
  );
}
