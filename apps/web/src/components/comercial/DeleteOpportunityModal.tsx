'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';

/* COM-007b — the delete confirmation for an opportunity (COM-005 DELETE). Names the
   deal and states the consequences: its service bundle goes with it (FK CASCADE) while
   its activities REMAIN in the account's timeline (FK SET NULL — unlinked). The button
   that opens this only renders for writers on non-closed deals; the backend still 409s
   if the state changed concurrently (e.g. it was just closed), and we relay that.
   COM-011: an opportunity WITH quotes cannot be deleted (they are commercial documents,
   FK ON DELETE RESTRICT) — the consequences say so and the backend 409 is relayed if the
   page's delete button was shown before quotes existed. */
export function DeleteOpportunityModal({
  opportunity,
  onClose,
  onDeleted,
}: {
  opportunity: { id: string; name: string };
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const confirm = async () => {
    setDeleting(true);
    setErr(null);
    try {
      await apiClient.delete(`/api/comercial/opportunities/${opportunity.id}`);
      onDeleted();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo eliminar la oportunidad.');
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} style={{ color: '#b91c1c' }} />
            <h2
              className="text-lg font-semibold text-[var(--text-primary)]"
              style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
            >
              Eliminar oportunidad
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm text-[var(--text-secondary)]">
          <p className="text-[var(--text-primary)]">
            Vas a eliminar <span className="font-semibold">“{opportunity.name}”</span>.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Se elimina también su paquete de servicios.</li>
            <li>
              Las actividades registradas permanecen en la línea de tiempo de la cuenta (quedan
              desvinculadas de la oportunidad).
            </li>
            <li>
              Si la oportunidad tiene cotizaciones, no puede eliminarse (son documentos
              comerciales): elimina los borradores o conserva el historial.
            </li>
            <li>Esta acción no se puede deshacer.</li>
          </ul>
          {err && <p className="text-red-600">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)]"
          >
            Cancelar
          </button>
          <button
            onClick={confirm}
            disabled={deleting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: '#b91c1c' }}
          >
            {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteOpportunityModal;
