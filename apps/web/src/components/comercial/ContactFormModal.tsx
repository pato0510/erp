'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';

/* COM-004b — create/edit a contact of an account. Mirrors the AccountFormModal
   shell. The backend enforces the single-primary rule (marking this primary
   unsets the previous one), so the UI just sends isPrimary and refreshes. */

export interface Contact {
  id: string;
  companyId: string;
  accountId: string;
  firstName: string;
  lastName: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

export function ContactFormModal({
  accountId,
  editing,
  onClose,
  onSaved,
}: {
  accountId: string;
  editing: Contact | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState(editing?.firstName ?? '');
  const [lastName, setLastName] = useState(editing?.lastName ?? '');
  const [role, setRole] = useState(editing?.role ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [isPrimary, setIsPrimary] = useState(editing?.isPrimary ?? false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setErr('Nombre y apellido son obligatorios.');
      return;
    }
    setSaving(true);
    setErr(null);
    const body = {
      accountId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: role.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      isPrimary,
    };
    try {
      if (editing) await apiClient.patch(`/api/comercial/contacts/${editing.id}`, body);
      else await apiClient.post('/api/comercial/contacts', body);
      onSaved();
    } catch (e) {
      setErr(
        e instanceof ApiError && e.status === 403
          ? 'No tienes permiso para esta acción.'
          : 'No se pudo guardar el contacto.',
      );
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            {editing ? 'Editar contacto' : 'Nuevo contacto'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={INPUT}
                placeholder="Ej. Ana"
              />
            </Field>
            <Field label="Apellido">
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={INPUT}
                placeholder="Ej. Soto"
              />
            </Field>
          </div>
          <Field label="Cargo">
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={INPUT}
              placeholder="Ej. Jefa de Operaciones"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT}
                placeholder="ana@cliente.cl"
              />
            </Field>
            <Field label="Teléfono">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={INPUT}
                placeholder="+56 9 …"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
            />
            Contacto principal de la cuenta
          </label>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)]"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: '#2563eb' }}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </label>
      {children}
    </div>
  );
}

export default ContactFormModal;
