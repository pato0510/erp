'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, Paperclip, Pencil, Trash2, Upload } from 'lucide-react';
import { apiClient, ApiError } from '../../../../../lib/api';
import { EppDeliveryFormModal } from '../../../../../components/hsec/EppDeliveryFormModal';
import { formatFileSize, formatDbDate } from '../../../../../components/hsec/incidentTypes';
import type { RosterEntry } from '../../../../../components/hsec/incidentTypes';
import type { EppDeliveryDetail, EppItem } from '../../../../../components/hsec/eppTypes';

/* HSEC-009 — delivery detail (ficha): líneas table + the single acuse slot (the HSEC-007
 * planilla component pattern: empty → subir; present → download / REPLACE with confirm /
 * quitar). Free edit + delete (decision 6 — delete warns the lines go with it).
 *
 * DIRECTOR RULING (HSEC-006, binding): after EVERY mutation the page REFETCHES the shaped
 * GET (fetchDelivery below) and NEVER uses a POST/PATCH response body as state. */

export default function HsecEppDeliveryDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [delivery, setDelivery] = useState<EppDeliveryDetail | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [items, setItems] = useState<EppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const fetchDelivery = useCallback(() => {
    apiClient
      .get<EppDeliveryDetail>(`/api/hsec/epp-deliveries/${id}`)
      .then((data) => {
        setDelivery(data);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar la entrega.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchDelivery();
    apiClient
      .get<RosterEntry[]>('/api/hsec/roster')
      .then(setRoster)
      .catch(() => setRoster([]));
    apiClient
      .get<EppItem[]>('/api/hsec/epp-items')
      .then(setItems)
      .catch(() => setItems([]));
  }, [fetchDelivery]);

  const removeDelivery = async () => {
    if (!delivery) return;
    if (
      !window.confirm(
        `¿Eliminar la entrega de ${delivery.fullName ?? 'este trabajador'} del ${formatDbDate(delivery.date)}? Se eliminarán también sus líneas.`,
      )
    )
      return;
    try {
      await apiClient.delete(`/api/hsec/epp-deliveries/${delivery.id}`);
      router.push('/hsec/epp');
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'No se pudo eliminar la entrega.');
    }
  };

  const pickFile = (isReplace: boolean) => {
    if (isReplace && !window.confirm('El nuevo acuse REEMPLAZARÁ al actual. ¿Continuar?')) return;
    fileInput.current?.click();
  };

  const upload = async (file: File) => {
    if (!delivery) return;
    setBusy(true);
    setActionError(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      // Response body DISCARDED (ruling) — the refetch carries the shaped hasFile/fileName.
      await apiClient.uploadFile(`/api/hsec/epp-deliveries/${delivery.id}/file`, fd);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'No se pudo subir el acuse.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
      fetchDelivery();
    }
  };

  const download = async () => {
    if (!delivery?.fileName) return;
    try {
      const blob = await apiClient.fetchBlob(
        `/api/hsec/epp-deliveries/${delivery.id}/file?download=1`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = delivery.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setActionError('No se pudo descargar el acuse.');
    }
  };

  const removeFile = async () => {
    if (!delivery) return;
    if (!window.confirm(`¿Quitar el acuse "${delivery.fileName}"?`)) return;
    setActionError(null);
    try {
      await apiClient.delete(`/api/hsec/epp-deliveries/${delivery.id}/file`);
      fetchDelivery(); // ruling: refetch
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'No se pudo quitar el acuse.');
    }
  };

  if (loading) return <p className="pt-6 text-sm text-[var(--text-secondary)]">Cargando…</p>;
  if (error || !delivery)
    return (
      <div className="pt-6">
        <p className="text-sm text-red-600">{error ?? 'Entrega no encontrada.'}</p>
        <button
          onClick={() => router.push('/hsec/epp')}
          className="mt-3 inline-flex items-center gap-1 text-sm text-[#2563eb]"
        >
          <ArrowLeft size={14} /> Volver a entregas
        </button>
      </div>
    );

  const CARD = 'rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4';

  return (
    <div className="pt-2">
      <button
        onClick={() => router.push('/hsec/epp')}
        className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={14} /> Entregas de EPP
      </button>

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
          <h1
            className="text-2xl font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            {delivery.fullName ?? delivery.employeeId}
          </h1>
          <span className="text-sm text-[var(--text-secondary)]">
            {formatDbDate(delivery.date)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
          >
            <Pencil size={14} /> Editar
          </button>
          <button
            onClick={removeDelivery}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600"
          >
            <Trash2 size={14} /> Eliminar
          </button>
        </div>
      </div>

      {actionError && <p className="mb-3 text-sm text-red-600">{actionError}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Líneas */}
        <div className={CARD}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Elementos entregados ({delivery.lines.length})
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)]">
                {['Elemento', 'Cantidad', 'Talla'].map((h) => (
                  <th
                    key={h}
                    className="py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {delivery.lines.map((l) => (
                <tr key={l.id}>
                  <td className="py-2 text-[var(--text-primary)]">
                    {l.itemName}
                    {!l.itemActive && (
                      <span className="ml-2 text-xs text-[var(--text-secondary)]">(inactivo)</span>
                    )}
                  </td>
                  <td className="py-2 text-[var(--text-primary)]">{l.quantity}</td>
                  <td className="py-2 text-[var(--text-secondary)]">{l.size ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {delivery.notes && (
            <p className="mt-3 whitespace-pre-wrap border-t border-[var(--border-color)] pt-3 text-sm text-[var(--text-secondary)]">
              {delivery.notes}
            </p>
          )}
        </div>

        {/* Acuse — single slot */}
        <div className={CARD}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Acuse firmado
          </h2>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
          {delivery.hasFile && delivery.fileName ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-2 text-[var(--text-primary)]">
                <Paperclip size={14} className="text-[var(--text-secondary)]" />
                {delivery.fileName}
                {delivery.fileSize !== null && (
                  <span className="text-xs text-[var(--text-secondary)]">
                    {formatFileSize(delivery.fileSize)}
                  </span>
                )}
              </span>
              <button
                onClick={download}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-2.5 py-1 text-xs text-[var(--text-primary)]"
              >
                <Download size={13} /> Descargar
              </button>
              <button
                onClick={() => pickFile(true)}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-2.5 py-1 text-xs text-[var(--text-primary)] disabled:opacity-50"
              >
                <Upload size={13} /> Reemplazar
              </button>
              <button
                onClick={removeFile}
                className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-600"
              >
                <Trash2 size={13} /> Quitar
              </button>
            </div>
          ) : (
            <div>
              <p className="mb-2 text-sm text-[var(--text-secondary)]">
                Sin acuse adjunto. Sube el escaneo del acuse de recepción firmado.
              </p>
              <button
                onClick={() => pickFile(false)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                style={{ background: '#2563eb' }}
              >
                <Upload size={13} /> Subir acuse
              </button>
            </div>
          )}
        </div>
      </div>

      {editOpen && (
        <EppDeliveryFormModal
          editing={delivery}
          roster={roster}
          items={items}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            fetchDelivery(); // ruling: refetch the shaped GET after the modal's mutation
          }}
        />
      )}
    </div>
  );
}
