'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, Phone, Plus, Star, Trash2, Pencil } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { Contact, ContactFormModal } from './ContactFormModal';

/* COM-004b — Contactos tab of the account ficha. Self-loading (prop is ONLY the
 * primitive accountId). 4-state machine loading|ok|forbidden|error. Write actions
 * are role-gated via the canWrite prop (NOT read-success — ACCOUNTANT reads
 * contacts but cannot write). The single-primary rule is enforced by the backend;
 * "Marcar principal" just PATCHes isPrimary=true and reloads. */
export default function AccountContactsTab({
  accountId,
  canWrite,
}: {
  accountId: string;
  canWrite: boolean;
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const rows = await apiClient.get<Contact[]>(`/api/comercial/contacts?accountId=${accountId}`);
      setContacts(rows);
      setState('ok');
    } catch (e) {
      setState(e instanceof ApiError && e.status === 403 ? 'forbidden' : 'error');
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const markPrimary = async (c: Contact) => {
    try {
      await apiClient.patch(`/api/comercial/contacts/${c.id}`, { isPrimary: true });
      await load();
    } catch {
      window.alert('No se pudo marcar como principal.');
    }
  };

  const remove = async (c: Contact) => {
    if (!window.confirm(`¿Eliminar el contacto "${c.firstName} ${c.lastName}"?`)) return;
    try {
      await apiClient.delete(`/api/comercial/contacts/${c.id}`);
      await load();
    } catch {
      window.alert('No se pudo eliminar el contacto.');
    }
  };

  if (state === 'loading') return <Card>Cargando contactos…</Card>;
  if (state === 'forbidden')
    return (
      <Card>
        <p className="text-sm text-[var(--text-secondary)]">
          No tienes permiso para ver los contactos de esta cuenta.
        </p>
      </Card>
    );
  if (state === 'error')
    return (
      <Card>
        <p className="text-sm text-red-600">No se pudieron cargar los contactos.</p>
      </Card>
    );

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white"
            style={{ background: '#2563eb' }}
          >
            <Plus size={15} /> Nuevo contacto
          </button>
        </div>
      )}

      {contacts.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">No hay contactos registrados.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {contacts.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--text-primary)]">
                      {c.firstName} {c.lastName}
                    </span>
                    {c.isPrimary && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{ background: 'rgba(37,99,235,0.12)', color: '#1d4ed8' }}
                      >
                        <Star size={9} /> Principal
                      </span>
                    )}
                  </div>
                  {c.role && (
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{c.role}</p>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
                {c.email && (
                  <div className="flex items-center gap-2">
                    <Mail size={13} />
                    <a href={`mailto:${c.email}`} className="hover:text-[var(--text-primary)]">
                      {c.email}
                    </a>
                  </div>
                )}
                {c.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={13} />
                    {c.phone}
                  </div>
                )}
                {!c.email && !c.phone && (
                  <span className="text-[var(--text-muted)]">Sin contacto</span>
                )}
              </div>

              {canWrite && (
                <div className="mt-3 flex items-center gap-2 border-t border-[var(--border-color)] pt-3">
                  {!c.isPrimary && (
                    <button
                      onClick={() => markPrimary(c)}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <Star size={12} /> Marcar principal
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditing(c);
                      setModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <Pencil size={12} /> Editar
                  </button>
                  <button
                    onClick={() => remove(c)}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={12} /> Eliminar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <ContactFormModal
          accountId={accountId}
          editing={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 text-sm text-[var(--text-secondary)]">
      {children}
    </div>
  );
}
