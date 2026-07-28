'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, Paperclip, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { apiClient, ApiError } from '../../../../../lib/api';
import { AfectadoFormModal } from '../../../../../components/hsec/AfectadoFormModal';
import { IncidentFormModal } from '../../../../../components/hsec/IncidentFormModal';
import type {
  HsecIncident,
  HsecIncidentStatus,
  IncidentPerson,
  RosterEntry,
} from '../../../../../components/hsec/incidentTypes';
import {
  formatFileSize,
  formatIncidentDate,
  INCIDENT_STATUS_TARGETS,
  SEVERITY_LABEL,
  SEVERITY_STYLE,
  STATUS_LABEL,
  STATUS_STYLE,
  TYPE_LABEL,
} from '../../../../../components/hsec/incidentTypes';

/* HSEC-005 — incident detail (ficha). Estado is a dropdown offering ONLY the legal targets
 * from INCIDENT_STATUS_TARGETS (the client mirror of the backend machine — see
 * incidentTypes.ts; the backend re-validates and its Spanish 400 surfaces verbatim if the
 * maps ever drift). Afectados ride the HSEC-003 nested endpoints + the /hsec/roster picker;
 * adjuntos ride the HSEC-004 endpoints (max 5 — the button disables at 5 AND a raced backend
 * 400 still surfaces verbatim). Free edit + delete in any status (decision 6). */

const MAX_ATTACHMENTS = 5;

export default function HsecIncidentDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [incident, setIncident] = useState<HsecIncident | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [personModal, setPersonModal] = useState<{ open: boolean; editing: IncidentPerson | null }>(
    { open: false, editing: null },
  );
  const fileInput = useRef<HTMLInputElement>(null);

  const fetchIncident = useCallback(() => {
    apiClient
      .get<HsecIncident>(`/api/hsec/incidents/${id}`)
      .then((data) => {
        setIncident(data);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar el incidente.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchIncident();
    apiClient
      .get<RosterEntry[]>('/api/hsec/roster')
      .then(setRoster)
      .catch(() => setRoster([]));
  }, [fetchIncident]);

  const changeStatus = async (target: HsecIncidentStatus) => {
    if (!incident) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiClient.patch(`/api/hsec/incidents/${incident.id}/status`, { status: target });
      fetchIncident();
    } catch (e) {
      // The machine's verbatim Spanish 400 (should never fire — the dropdown is legal-only).
      setActionError(e instanceof ApiError ? e.message : 'No se pudo cambiar el estado.');
    } finally {
      setBusy(false);
    }
  };

  const removeIncident = async () => {
    if (!incident) return;
    if (
      !window.confirm(
        `¿Eliminar el incidente ${incident.incidentNumber}? Esta acción no se puede deshacer.`,
      )
    )
      return;
    try {
      await apiClient.delete(`/api/hsec/incidents/${incident.id}`);
      router.push('/hsec/incidentes');
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'No se pudo eliminar el incidente.');
    }
  };

  const removePerson = async (p: IncidentPerson) => {
    if (!incident) return;
    if (!window.confirm(`¿Quitar a ${p.fullName ?? 'este trabajador'} de los afectados?`)) return;
    setActionError(null);
    try {
      await apiClient.delete(`/api/hsec/incidents/${incident.id}/persons/${p.id}`);
      fetchIncident();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'No se pudo quitar al afectado.');
    }
  };

  const upload = async (file: File) => {
    if (!incident) return;
    setBusy(true);
    setActionError(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      await apiClient.uploadFile(`/api/hsec/incidents/${incident.id}/attachments`, fd);
      fetchIncident();
    } catch (e) {
      // Includes the raced max-5 backend 400, verbatim.
      setActionError(e instanceof ApiError ? e.message : 'No se pudo subir el archivo.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const download = async (attId: string, fileName: string) => {
    if (!incident) return;
    try {
      const blob = await apiClient.fetchBlob(
        `/api/hsec/incidents/${incident.id}/attachments/${attId}?download=1`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setActionError('No se pudo descargar el archivo.');
    }
  };

  const removeAttachment = async (attId: string, fileName: string) => {
    if (!incident) return;
    if (!window.confirm(`¿Eliminar el adjunto "${fileName}"?`)) return;
    setActionError(null);
    try {
      await apiClient.delete(`/api/hsec/incidents/${incident.id}/attachments/${attId}`);
      fetchIncident();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'No se pudo eliminar el adjunto.');
    }
  };

  if (loading) return <p className="pt-6 text-sm text-[var(--text-secondary)]">Cargando…</p>;
  if (error || !incident)
    return (
      <div className="pt-6">
        <p className="text-sm text-red-600">{error ?? 'Incidente no encontrado.'}</p>
        <button
          onClick={() => router.push('/hsec/incidentes')}
          className="mt-3 inline-flex items-center gap-1 text-sm text-[#2563eb]"
        >
          <ArrowLeft size={14} /> Volver a incidentes
        </button>
      </div>
    );

  const targets = INCIDENT_STATUS_TARGETS[incident.status];
  const attachments = incident.attachments ?? [];
  const persons = incident.persons ?? [];
  const CARD = 'rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4';

  return (
    <div className="pt-2">
      <button
        onClick={() => router.push('/hsec/incidentes')}
        className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={14} /> Incidentes
      </button>

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
          <h1
            className="text-2xl font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            {incident.incidentNumber}
          </h1>
          <span
            className="rounded-full px-2.5 py-0.5 text-xs"
            style={{
              background: SEVERITY_STYLE[incident.severity].bg,
              color: SEVERITY_STYLE[incident.severity].color,
              fontWeight: SEVERITY_STYLE[incident.severity].weight,
            }}
          >
            {SEVERITY_LABEL[incident.severity]}
          </span>
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{
              background: STATUS_STYLE[incident.status].bg,
              color: STATUS_STYLE[incident.status].color,
            }}
          >
            {STATUS_LABEL[incident.status]}
          </span>
          <span className="text-sm text-[var(--text-secondary)]">
            {formatIncidentDate(incident.occurredDate)}
            {incident.occurredTime ? ` · ${incident.occurredTime}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Estado: ONLY the legal targets (client mirror; backend is the authority). */}
          <select
            value=""
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) changeStatus(e.target.value as HsecIncidentStatus);
            }}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
          >
            <option value="">Cambiar estado…</option>
            {targets.map((t) => (
              <option key={t} value={t}>
                → {STATUS_LABEL[t]}
              </option>
            ))}
          </select>
          <button
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
          >
            <Pencil size={14} /> Editar
          </button>
          <button
            onClick={removeIncident}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600"
          >
            <Trash2 size={14} /> Eliminar
          </button>
        </div>
      </div>

      {actionError && <p className="mb-3 text-sm text-red-600">{actionError}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Ficha */}
        <div className={CARD}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Ficha
          </h2>
          <dl className="space-y-2 text-sm">
            <Row k="Tipo" v={TYPE_LABEL[incident.type]} />
            <Row k="Lugar" v={incident.location} />
            <Row k="Descripción" v={incident.description} />
            <Row k="Causa inmediata" v={incident.immediateCause ?? '—'} />
            <Row k="Acciones correctivas" v={incident.correctiveActions ?? '—'} />
          </dl>
        </div>

        {/* Afectados */}
        <div className={CARD}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              Afectados ({persons.length})
            </h2>
            <button
              onClick={() => setPersonModal({ open: true, editing: null })}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-white"
              style={{ background: '#2563eb' }}
            >
              <Plus size={13} /> Agregar
            </button>
          </div>
          {persons.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Sin afectados registrados.</p>
          ) : (
            <ul className="divide-y divide-[var(--border-color)]">
              {persons.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-2 py-2">
                  <div className="text-sm">
                    <p className="font-medium text-[var(--text-primary)]">
                      {p.fullName ?? p.employeeId}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {[
                        p.injuryType,
                        p.bodyPart,
                        p.medicalAttention ? 'Atención médica' : null,
                        p.lostDays !== null ? `${p.lostDays} días perdidos` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Sin detalle de lesión'}
                    </p>
                    {p.detail && (
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{p.detail}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => setPersonModal({ open: true, editing: p })}
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      aria-label="Editar afectado"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => removePerson(p)}
                      className="text-[var(--text-secondary)] hover:text-red-600"
                      aria-label="Quitar afectado"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Adjuntos */}
        <div className={`${CARD} lg:col-span-2`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              Adjuntos ({attachments.length}/{MAX_ATTACHMENTS})
            </h2>
            <div>
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
              <button
                onClick={() => fileInput.current?.click()}
                disabled={busy || attachments.length >= MAX_ATTACHMENTS}
                title={
                  attachments.length >= MAX_ATTACHMENTS
                    ? 'Máximo 5 archivos adjuntos por incidente.'
                    : undefined
                }
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                style={{ background: '#2563eb' }}
              >
                <Upload size={13} /> Subir archivo
              </button>
            </div>
          </div>
          {attachments.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Sin archivos adjuntos.</p>
          ) : (
            <ul className="divide-y divide-[var(--border-color)]">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <Paperclip size={14} className="shrink-0 text-[var(--text-secondary)]" />
                    <span className="truncate text-[var(--text-primary)]">{a.fileName}</span>
                    <span className="shrink-0 text-xs text-[var(--text-secondary)]">
                      {formatFileSize(a.fileSize)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => download(a.id, a.fileName)}
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      aria-label={`Descargar ${a.fileName}`}
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={() => removeAttachment(a.id, a.fileName)}
                      className="text-[var(--text-secondary)] hover:text-red-600"
                      aria-label={`Eliminar ${a.fileName}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editOpen && (
        <IncidentFormModal
          editing={incident}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            fetchIncident();
          }}
        />
      )}
      {personModal.open && (
        <AfectadoFormModal
          incidentId={incident.id}
          roster={roster}
          editing={personModal.editing}
          onClose={() => setPersonModal({ open: false, editing: null })}
          onSaved={() => {
            setPersonModal({ open: false, editing: null });
            fetchIncident();
          }}
        />
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2">
      <dt className="text-[var(--text-secondary)]">{k}</dt>
      <dd className="whitespace-pre-wrap text-[var(--text-primary)]">{v}</dd>
    </div>
  );
}
