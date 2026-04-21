'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Power, PowerOff, Users, Eye, EyeOff, ArrowLeft, X } from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { formatRelativeDate } from '../../../../lib/formatters';
import { Toast } from '../../../../components/shared/Toast';

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
  ADMIN: { label: 'Administrador', color: '#2563EB', badgeCls: 'bg-blue-50 text-blue-700' },
  MANAGER: { label: 'Gerente', color: '#3B82F6', badgeCls: 'bg-blue-50 text-blue-600' },
  ACCOUNTANT: { label: 'Contador', color: '#64748B', badgeCls: 'bg-slate-100 text-slate-700' },
  ANALYST: { label: 'Analista', color: '#94A3B8', badgeCls: 'bg-gray-100 text-gray-700' },
  VIEWER: { label: 'Visualizador', color: '#CBD5E1', badgeCls: 'bg-gray-50 text-gray-600' },
};

const ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'ANALYST', 'VIEWER'];

type ModalState = null | { mode: 'create' } | { mode: 'edit'; user: CompanyUser };

function initials(first: string, last: string) {
  const a = first.trim()[0] ?? '';
  const b = last.trim()[0] ?? '';
  return (a + b).toUpperCase() || '·';
}

export default function UsuariosPage() {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
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
        const body: Record<string, unknown> = {
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: dto.role,
        };
        if (dto.password) body.password = dto.password;
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
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 mb-3 transition"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
      >
        <ArrowLeft size={12} /> Configuración
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl text-gray-900">Usuarios</h1>
          <p
            className="text-sm text-gray-500 mt-1"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 300 }}
          >
            Gestiona los usuarios con acceso a tu empresa
          </p>
        </div>
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full transition"
          style={{
            background: '#1C1C1E',
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 500,
          }}
        >
          <Plus size={16} /> Nuevo Usuario
        </button>
      </div>

      {/* List */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-5 py-4 animate-pulse flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-48" />
                  <div className="h-3 bg-gray-200 rounded w-64" />
                </div>
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-600 font-medium">No hay usuarios en esta empresa</p>
            <button
              onClick={() => setModal({ mode: 'create' })}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full"
              style={{
                background: '#1C1C1E',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Plus size={16} /> Nuevo Usuario
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {users.map((u) => {
              const meta = ROLE_META[u.role];
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
                        className="truncate text-gray-900"
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
                        className="mono text-xs text-gray-400"
                        style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                      >
                        {u.email}
                      </span>
                      {u.lastLoginAt && (
                        <span className="text-xs text-gray-400">
                          · Último acceso {formatRelativeDate(u.lastLoginAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setModal({ mode: 'edit', user: u })}
                    className="p-2 rounded-md hover:bg-gray-100 text-gray-500"
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleToggle(u)}
                    className="p-2 rounded-md hover:bg-gray-100"
                    title={u.isActive ? 'Desactivar' : 'Activar'}
                    style={{ color: u.isActive ? '#64748B' : '#16A34A' }}
                  >
                    {u.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && <UserModal modal={modal} onClose={() => setModal(null)} onSave={handleSave} />}

      <style jsx global>{`
        .u-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #e8eaed;
          border-radius: 8px;
          font-family: var(--font-outfit), sans-serif;
          font-size: 14px;
          color: #1c1c1e;
          background: #ffffff;
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
}: {
  modal: Exclude<ModalState, null>;
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
    // Password rules: required on create, optional on edit. When provided,
    // must be at least 8 chars and match confirmation.
    if (isCreate || password.length > 0) {
      if (password.length < 8) {
        setErr('La contraseña debe tener al menos 8 caracteres');
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
        password: password || undefined,
        role,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 sticky top-0 bg-white">
          <h3 className="text-base font-semibold text-gray-900">
            {isCreate ? 'Nuevo usuario' : 'Editar usuario'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre" required>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="u-input"
                maxLength={100}
              />
            </Field>
            <Field label="Apellido" required>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="u-input"
                maxLength={100}
              />
            </Field>
          </div>

          <Field label="Email" required={isCreate}>
            <input
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
                className="text-xs text-gray-400 mt-1"
                style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 300 }}
              >
                El email no se puede modificar.
              </p>
            )}
          </Field>

          <Field label="Rol" required>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="u-input"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_META[r].label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label={isCreate ? 'Contraseña' : 'Nueva contraseña (opcional)'}
            required={isCreate}
            help={
              isCreate
                ? 'Mínimo 8 caracteres.'
                : 'Déjalo vacío para conservar la contraseña actual.'
            }
          >
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="u-input pr-10"
                placeholder="••••••••"
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700"
                tabIndex={-1}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>

          {(isCreate || password.length > 0) && (
            <Field label="Confirmar contraseña" required={isCreate}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="u-input"
                placeholder="••••••••"
              />
            </Field>
          )}

          {err && (
            <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-lg border border-red-100">
              {err}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
            style={{
              background: '#1C1C1E',
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
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block mb-1.5 text-gray-700"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500, fontSize: 13 }}
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {help && (
        <p
          className="mt-1.5 text-xs text-gray-400"
          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 300 }}
        >
          {help}
        </p>
      )}
    </div>
  );
}
