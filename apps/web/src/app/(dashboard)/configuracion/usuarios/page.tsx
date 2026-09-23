'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Pencil,
  Power,
  PowerOff,
  Users,
  Eye,
  EyeOff,
  ArrowLeft,
  X,
  KeyRound,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { formatRelativeDate } from '../../../../lib/formatters';
import { Toast } from '../../../../components/shared/Toast';
import { currentCompanyRole, useAuth } from '../../../../hooks/useAuth';
import { meetsPasswordPolicy, PASSWORD_POLICY_MESSAGE } from '../../../../lib/password-policy';
import { PasswordChecklist } from '../../../../components/shared/PasswordChecklist';

type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'ACCOUNTANT' | 'ANALYST' | 'VIEWER';

interface CompanyUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  membershipId: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLE_META: Record<UserRole, { label: string; color: string; badgeCls: string }> = {
  SUPER_ADMIN: { label: 'Super Admin', color: '#1E3A5F', badgeCls: 'bg-indigo-50 text-indigo-800' },
  ADMIN: {
    label: 'Administrador',
    color: 'var(--color-accent)',
    badgeCls: 'bg-blue-50 text-blue-700',
  },
  MANAGER: { label: 'Gerente', color: '#3B82F6', badgeCls: 'bg-blue-50 text-blue-600' },
  ACCOUNTANT: { label: 'Contador', color: '#64748B', badgeCls: 'bg-subtle text-fg' },
  ANALYST: {
    label: 'Analista',
    color: '#94A3B8',
    badgeCls: 'bg-subtle text-[var(--text-secondary)]',
  },
  VIEWER: {
    label: 'Visualizador',
    color: '#CBD5E1',
    badgeCls: 'bg-subtle text-[var(--text-secondary)]',
  },
};

const ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'ANALYST', 'VIEWER'];

type ModalState = null | { mode: 'create' } | { mode: 'edit'; user: CompanyUser };

/* AUTH-002 — the api rejects both (400); the UI says why before anyone tries. */
const SELF_LOCK_HINT = 'No puedes cambiar tu propio rol ni desactivar tu cuenta.';

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* AUTH-002 — dialog keyboard contract: focus moves in on open, Tab cycles inside, Escape
   closes, and focus returns to the element that opened the dialog. */
function useDialogKeyboard(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const first =
      root?.querySelector<HTMLElement>('[data-autofocus]') ??
      root?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const focusables = ref.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusables.length === 0) return;
      const head = focusables[0];
      const tail = focusables[focusables.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === head || !ref.current.contains(document.activeElement))
      ) {
        e.preventDefault();
        tail.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === tail || !ref.current.contains(document.activeElement))
      ) {
        e.preventDefault();
        head.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (trigger && trigger.isConnected) trigger.focus();
    };
  }, []);

  return ref;
}

function initials(first: string, last: string) {
  const a = first.trim()[0] ?? '';
  const b = last.trim()[0] ?? '';
  return (a + b).toUpperCase() || '·';
}

export default function UsuariosPage() {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [resetTarget, setResetTarget] = useState<CompanyUser | null>(null);

  // AUTH-002 — the actor: id from /auth/me, role from its membership in the current company.
  const { user: me } = useAuth();
  const currentCompanyId = apiClient.getCompanyId();
  const actorRole = currentCompanyRole(me, currentCompanyId);
  const actorIsSuperAdmin = actorRole === 'SUPER_ADMIN';
  const roleOptions = actorIsSuperAdmin ? ROLES : ROLES.filter((r) => r !== 'SUPER_ADMIN');
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<CompanyUser[]>('/api/users');
      setUsers(res);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error cargando usuarios',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (dto: {
    id?: string;
    firstName: string;
    lastName: string;
    email: string;
    password?: string;
    role: UserRole;
  }) => {
    try {
      if (dto.id) {
        // AUTH-002 — credentials change only through reset-access; your own role is never sent.
        const body: Record<string, unknown> = {
          firstName: dto.firstName,
          lastName: dto.lastName,
        };
        if (dto.id !== me?.id) body.role = dto.role;
        await apiClient.patch(`/api/users/${dto.id}`, body);
        setToast({ message: 'Usuario actualizado', type: 'success' });
      } else {
        await apiClient.post('/api/users', {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          password: dto.password,
          role: dto.role,
        });
        setToast({ message: 'Usuario creado', type: 'success' });
      }
      setModal(null);
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error al guardar',
        type: 'error',
      });
    }
  };

  const handleToggle = async (u: CompanyUser) => {
    try {
      await apiClient.patch(`/api/users/${u.id}`, { isActive: !u.isActive });
      setToast({
        message: u.isActive ? 'Usuario desactivado' : 'Usuario reactivado',
        type: 'success',
      });
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error',
        type: 'error',
      });
    }
  };

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Back link */}
      <Link
        href="/configuracion"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-3 transition"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
      >
        <ArrowLeft size={12} /> Configuración
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl text-[var(--text-primary)]">Usuarios</h1>
          <p
            className="text-sm text-[var(--text-secondary)] mt-1"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 300 }}
          >
            Gestiona los usuarios con acceso a tu empresa
          </p>
        </div>
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full transition"
          style={{
            background: 'var(--color-dark)',
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 500,
          }}
        >
          <Plus size={16} /> Nuevo Usuario
        </button>
      </div>

      {/* List */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-[var(--border-color)]">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-5 py-4 animate-pulse flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-subtle-hover" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-subtle-hover rounded w-48" />
                  <div className="h-3 bg-subtle-hover rounded w-64" />
                </div>
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={36} className="mx-auto text-fg-muted mb-3" />
            <p className="text-[var(--text-secondary)] font-medium">
              No hay usuarios en esta empresa
            </p>
            <button
              onClick={() => setModal({ mode: 'create' })}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full"
              style={{
                background: 'var(--color-dark)',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Plus size={16} /> Nuevo Usuario
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-color)]">
            {users.map((u) => {
              const meta = ROLE_META[u.role];
              const isSelf = !!me && u.id === me.id;
              // AUTH-002 — a SUPER_ADMIN account is only touched by another SUPER_ADMIN.
              const lockedSuperAdmin = u.role === 'SUPER_ADMIN' && !actorIsSuperAdmin;
              return (
                <div
                  key={u.id}
                  className={`px-5 py-3 flex items-center gap-4 ${!u.isActive ? 'opacity-50' : ''}`}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0"
                    style={{
                      background: meta.color,
                      fontFamily: 'var(--font-outfit), sans-serif',
                      fontWeight: 600,
                      fontSize: 13,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {initials(u.firstName, u.lastName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className="truncate text-[var(--text-primary)]"
                        style={{
                          fontFamily: 'var(--font-outfit), sans-serif',
                          fontWeight: 500,
                          fontSize: 14,
                        }}
                      >
                        {u.firstName} {u.lastName}
                      </p>
                      <span
                        className={`badge text-[10px] px-2 py-0.5 rounded-full ${meta.badgeCls}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span
                        className="mono text-xs text-[var(--text-muted)]"
                        style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                      >
                        {u.email}
                      </span>
                      {u.lastLoginAt && (
                        <span className="text-xs text-[var(--text-muted)]">
                          · Último acceso {formatRelativeDate(u.lastLoginAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  {!lockedSuperAdmin && (
                    <>
                      {!isSelf && (
                        <button
                          onClick={() => setResetTarget(u)}
                          className="p-2 rounded-md hover:bg-subtle-hover text-[var(--text-secondary)]"
                          title="Restablecer acceso"
                          aria-label={`Restablecer acceso de ${u.firstName} ${u.lastName}`}
                        >
                          <KeyRound size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => setModal({ mode: 'edit', user: u })}
                        className="p-2 rounded-md hover:bg-subtle-hover text-[var(--text-secondary)]"
                        title="Editar"
                        aria-label={`Editar a ${u.firstName} ${u.lastName}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (!isSelf) handleToggle(u);
                        }}
                        className={`p-2 rounded-md ${isSelf ? 'cursor-not-allowed opacity-40' : 'hover:bg-subtle-hover'}`}
                        title={isSelf ? SELF_LOCK_HINT : u.isActive ? 'Desactivar' : 'Activar'}
                        aria-label={isSelf ? SELF_LOCK_HINT : u.isActive ? 'Desactivar' : 'Activar'}
                        aria-disabled={isSelf || undefined}
                        style={{ color: u.isActive ? '#64748B' : '#16A34A' }}
                      >
                        {u.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && (
        <UserModal
          modal={modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
          isSelf={modal.mode === 'edit' && modal.user.id === me?.id}
          roleOptions={roleOptions}
        />
      )}

      {resetTarget && (
        <ResetAccessDialog target={resetTarget} onClose={() => setResetTarget(null)} />
      )}

      <style jsx global>{`
        .u-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-family: var(--font-outfit), sans-serif;
          font-size: 14px;
          color: var(--text-primary);
          background: var(--input-bg);
          outline: none;
          transition:
            border-color 120ms ease,
            box-shadow 120ms ease;
        }
        .u-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
      `}</style>
    </div>
  );
}

function UserModal({
  modal,
  onClose,
  onSave,
  isSelf,
  roleOptions,
}: {
  modal: Exclude<ModalState, null>;
  isSelf: boolean;
  roleOptions: UserRole[];
  onClose: () => void;
  onSave: (dto: {
    id?: string;
    firstName: string;
    lastName: string;
    email: string;
    password?: string;
    role: UserRole;
  }) => void;
}) {
  const initial = modal.mode === 'edit' ? modal.user : null;

  const [firstName, setFirstName] = useState(initial?.firstName ?? '');
  const [lastName, setLastName] = useState(initial?.lastName ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [role, setRole] = useState<UserRole>(initial?.role ?? 'ACCOUNTANT');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const isCreate = modal.mode === 'create';
  const dialogRef = useDialogKeyboard(onClose);

  const submit = async () => {
    setErr('');
    if (!firstName.trim() || !lastName.trim()) {
      setErr('Nombre y apellido son obligatorios');
      return;
    }
    if (isCreate && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr('Email inválido');
      return;
    }
    // AUTH-002 — a password exists only on create (edit changes credentials through
    // reset-access); same policy and message as the api (AUTH-001).
    if (isCreate) {
      if (!meetsPasswordPolicy(password)) {
        setErr(PASSWORD_POLICY_MESSAGE);
        return;
      }
      if (password !== confirmPassword) {
        setErr('Las contraseñas no coinciden');
        return;
      }
    }
    setSubmitting(true);
    try {
      await onSave({
        id: initial?.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        password: isCreate ? password : undefined,
        role,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-modal-title"
        className="bg-card-solid rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] sticky top-0 bg-card-solid">
          <h3 id="user-modal-title" className="text-base font-semibold text-[var(--text-primary)]">
            {isCreate ? 'Nuevo usuario' : 'Editar usuario'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-subtle-hover"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre" required htmlFor="user-first-name">
              <input
                id="user-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="u-input"
                maxLength={100}
              />
            </Field>
            <Field label="Apellido" required htmlFor="user-last-name">
              <input
                id="user-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="u-input"
                maxLength={100}
              />
            </Field>
          </div>

          <Field label="Email" required={isCreate} htmlFor="user-email">
            <input
              id="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!isCreate}
              className="u-input"
              style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
              placeholder="usuario@empresa.cl"
            />
            {!isCreate && (
              <p
                className="text-xs text-[var(--text-muted)] mt-1"
                style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 300 }}
              >
                El email no se puede modificar.
              </p>
            )}
          </Field>

          <Field
            label="Rol"
            required
            htmlFor="user-role"
            help={isSelf ? SELF_LOCK_HINT : undefined}
            helpId="user-role-help"
          >
            <select
              id="user-role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="u-input"
              disabled={isSelf}
              title={isSelf ? SELF_LOCK_HINT : undefined}
              aria-describedby={isSelf ? 'user-role-help' : undefined}
            >
              {/* A non-SUPER_ADMIN never sees the option; SUPER_ADMIN rows are hidden from them. */}
              {(roleOptions.includes(role) ? roleOptions : [role, ...roleOptions]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_META[r].label}
                </option>
              ))}
            </select>
          </Field>

          {isCreate && (
            <>
              <Field label="Contraseña" required htmlFor="user-password">
                <div className="relative">
                  <input
                    id="user-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="u-input pr-10"
                    placeholder="••••••••••"
                    autoComplete="new-password"
                    maxLength={100}
                    aria-describedby="user-password-rules"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <PasswordChecklist
                  id="user-password-rules"
                  password={password}
                  className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]"
                />
              </Field>

              <Field label="Confirmar contraseña" required htmlFor="user-password-confirm">
                <input
                  id="user-password-confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="u-input"
                  placeholder="••••••••••"
                  autoComplete="new-password"
                  maxLength={100}
                />
              </Field>
            </>
          )}

          {err && (
            <div
              role="alert"
              className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-lg border border-red-100"
            >
              {err}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)] sticky bottom-0 bg-card-solid">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-line text-fg rounded-lg hover:bg-subtle-hover"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
            style={{
              background: 'var(--color-dark)',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            {submitting ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  help,
  helpId,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  helpId?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block mb-1.5 text-[var(--text-secondary)]"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500, fontSize: 13 }}
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {help && (
        <p
          id={helpId}
          className="mt-1.5 text-xs text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 300 }}
        >
          {help}
        </p>
      )}
    </div>
  );
}

/**
 * AUTH-002 — «Restablecer acceso»: confirm, then POST /api/users/:id/reset-access and show
 * the temporary password ONCE. It lives only in this component's state — never storage,
 * logs, the URL or a toast — and closing the dialog unmounts it, clearing it for good.
 * 403/404/409 messages from the api render inside the dialog.
 */
function ResetAccessDialog({ target, onClose }: { target: CompanyUser; onClose: () => void }) {
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const secretRef = useRef<HTMLInputElement | null>(null);
  const close = useCallback(() => {
    setTemporaryPassword(null);
    onClose();
  }, [onClose]);
  const dialogRef = useDialogKeyboard(close);
  const name = `${target.firstName} ${target.lastName}`.trim();

  const confirmReset = async () => {
    setError('');
    setSubmitting(true);
    try {
      const res = await apiClient.post<{ temporaryPassword: string }>(
        `/api/users/${target.id}/reset-access`,
      );
      setTemporaryPassword(res.temporaryPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restablecer el acceso.');
    } finally {
      setSubmitting(false);
    }
  };

  // Phase change keeps focus inside the dialog: the secret field takes it once shown.
  useEffect(() => {
    if (temporaryPassword) secretRef.current?.focus();
  }, [temporaryPassword]);

  const copy = async () => {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopyState('copied');
    } catch {
      secretRef.current?.select();
      setCopyState('failed');
    }
  };

  const buttonFont = { fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-access-title"
        aria-describedby="reset-access-desc"
        className="bg-card-solid rounded-xl shadow-xl w-full max-w-md"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)]">
          <h3
            id="reset-access-title"
            className="text-base font-semibold text-[var(--text-primary)]"
          >
            {temporaryPassword ? 'Clave temporal' : 'Restablecer acceso'}
          </h3>
          <button onClick={close} className="p-1 rounded hover:bg-subtle-hover" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {temporaryPassword ? (
            <>
              <p id="reset-access-desc" className="text-sm text-[var(--text-secondary)]">
                Esta clave no se volverá a mostrar. Entrégala por un canal seguro; el usuario deberá
                cambiarla al entrar.
              </p>
              <div className="flex items-center gap-2">
                <input
                  ref={secretRef}
                  readOnly
                  value={temporaryPassword}
                  aria-label={`Clave temporal de ${name}`}
                  onFocus={(e) => e.currentTarget.select()}
                  className="u-input"
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    letterSpacing: '0.08em',
                  }}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  onClick={copy}
                  className="px-4 py-2 text-sm border border-line text-fg rounded-lg hover:bg-subtle-hover flex-shrink-0"
                  style={buttonFont}
                >
                  Copiar
                </button>
              </div>
              <p role="status" className="text-xs text-[var(--text-secondary)] min-h-[1rem]">
                {copyState === 'copied' && 'Clave copiada al portapapeles.'}
                {copyState === 'failed' &&
                  'No se pudo copiar automáticamente: la clave quedó seleccionada, cópiala manualmente.'}
              </p>
            </>
          ) : (
            <p id="reset-access-desc" className="text-sm text-[var(--text-primary)]">
              ¿Restablecer el acceso de {name}? Se cerrarán todas sus sesiones y deberá crear una
              contraseña nueva al entrar.
            </p>
          )}

          {error && (
            <div
              role="alert"
              className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-lg border border-red-100"
            >
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)]">
          {temporaryPassword ? (
            <button
              onClick={close}
              className="px-4 py-2 text-sm text-white rounded-full"
              style={{ background: 'var(--color-dark)', ...buttonFont }}
            >
              Listo
            </button>
          ) : (
            <>
              <button
                onClick={close}
                data-autofocus
                className="px-4 py-2 text-sm border border-line text-fg rounded-lg hover:bg-subtle-hover"
                style={buttonFont}
              >
                Cancelar
              </button>
              <button
                onClick={confirmReset}
                disabled={submitting}
                className="px-4 py-2 text-sm text-white rounded-full bg-red-600 hover:bg-red-700 disabled:opacity-50"
                style={buttonFont}
              >
                {submitting ? 'Restableciendo...' : 'Restablecer'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
