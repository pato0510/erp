'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';
import { DIALOG_INPUT, DIALOG_LABEL } from './DialogShell';

/* COM-029 — what the lead picker (LeadPickerDialog) and the lead ficha share: the COM-024
 * row shapes, the contact's display name and the «Contacto» select (the contacts of the
 * lead's account — founder L1: optional, and only from that account). */

export interface LeadContact {
  id: string;
  firstName: string;
  lastName: string;
}

/** GET /api/comercial/leads?accountId= — one row of the list. */
export interface LeadListRow {
  id: string;
  name: string;
  accountId: string;
  account: { id: string; name: string };
  contactId: string | null;
  contact: LeadContact | null;
  opportunitiesCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const contactName = (c: LeadContact) => `${c.firstName} ${c.lastName}`.trim();

export const opportunitiesLabel = (n: number) =>
  `${n} ${n === 1 ? 'oportunidad' : 'oportunidades'}`;

/** «Contacto» — «Sin contacto» (value '') or one of the account's contacts, by name. */
export function LeadContactSelect({
  id,
  accountId,
  value,
  onChange,
}: {
  id: string;
  accountId: string;
  value: string;
  onChange: (contactId: string) => void;
}) {
  const [contacts, setContacts] = useState<LeadContact[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient
      .get<LeadContact[]>(`/api/comercial/contacts?accountId=${encodeURIComponent(accountId)}`)
      .then((rows) => {
        if (!active) return;
        setContacts(
          [...rows].sort((a, b) => contactName(a).localeCompare(contactName(b), 'es-CL')),
        );
      })
      .catch(() => {
        if (!active) return;
        setContacts([]);
        setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [accountId]);

  return (
    <div>
      <label htmlFor={id} className={DIALOG_LABEL}>
        Contacto (opcional)
      </label>
      <select
        id={id}
        value={value}
        disabled={contacts === null}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={failed ? `${id}-hint` : undefined}
        className={DIALOG_INPUT}
      >
        {contacts === null ? (
          <option value={value}>Cargando contactos…</option>
        ) : (
          <>
            <option value="">Sin contacto</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {contactName(c)}
              </option>
            ))}
          </>
        )}
      </select>
      {failed ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-fg-secondary">
          No se pudieron cargar los contactos de la cuenta.
        </p>
      ) : (
        contacts?.length === 0 && (
          <p className="mt-1 text-xs text-fg-secondary">La cuenta aún no tiene contactos.</p>
        )
      )}
    </div>
  );
}
