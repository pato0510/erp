'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, Paperclip, Pencil, Trash2, Upload, UserPlus } from 'lucide-react';
import { apiClient, ApiError } from '../../../../../lib/api';
import { TrainingFormModal } from '../../../../../components/hsec/TrainingFormModal';
import { formatFileSize, formatIncidentDate } from '../../../../../components/hsec/incidentTypes';
import type { RosterEntry } from '../../../../../components/hsec/incidentTypes';
import type {
  TrainingAttendee,
  TrainingDetail,
} from '../../../../../components/hsec/trainingTypes';
import {
  TRAINING_TYPE_LABEL,
  TRAINING_TYPE_STYLE,
} from '../../../../../components/hsec/trainingTypes';

/* HSEC-007 — training detail (ficha): asistentes (roster MULTI-select → sequential POSTs,
 * per-row 409/400 surfaced verbatim while the rest proceed → ONE refetch) + the single
 * planilla slot (upload / download / REPLACE with confirm — HSEC-006 replace semantics —
 * / quitar). Free edit + delete (decision 6).
 *
 * DIRECTOR RULING (HSEC-006 review, binding): after EVERY mutation the page REFETCHES the
 * shaped GET (fetchTraining below) and NEVER uses a POST/PATCH response body as state — the
 * raw update responses are unshaped and may someday carry the blob. */

export default function HsecTrainingDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [training, setTraining] = useState<TrainingDetail | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const replacing = useRef(false);

  const fetchTraining = useCallback(() => {
    apiClient
      .get<TrainingDetail>(`/api/hsec/trainings/${id}`)
      .then((data) => {
        setTraining(data);
        setError(null);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : 'No se pudo cargar la capacitación.'),
      )
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchTraining();
    apiClient
      .get<RosterEntry[]>('/api/hsec/roster')
      .then(setRoster)
      .catch(() => setRoster([]));
  }, [fetchTraining]);

  /* MULTI-ADD: sequential POSTs, one per selection — a per-row 409/400 is collected VERBATIM
     while the remaining selections still proceed; then ONE refetch of the shaped GET (the
     ruling — the per-row response bodies are discarded). */
  const addSelected = async () => {
    if (!training || selected.length === 0) return;
    setBusy(true);
    const errors: string[] = [];
    for (const employeeId of selected) {
      try {
        await apiClient.post(`/api/hsec/trainings/${training.id}/attendees`, { employeeId });
      } catch (e) {
        const name = roster.find((r) => r.employeeId === employeeId)?.fullName ?? employeeId;
        errors.push(`${name}: ${e instanceof ApiError ? e.message : 'No se pudo agregar.'}`);
      }
    }
    setActionErrors(errors);
    setSelected([]);
    setBusy(false);
    fetchTraining(); // ONE refetch for the whole batch
  };

  const removeAttendee = async (a: TrainingAttendee) => {
    if (!training) return;
    if (!window.confirm(`¿Quitar a ${a.fullName ?? 'este asistente'} de la capacitación?`)) return;
    setActionErrors([]);
    try {
      await apiClient.delete(`/api/hsec/trainings/${training.id}/attendees/${a.id}`);
      fetchTraining(); // ruling: refetch, never trust the mutation response
    } catch (e) {
      setActionErrors([e instanceof ApiError ? e.message : 'No se pudo quitar al asistente.']);
    }
  };

  const removeTraining = async () => {
    if (!training) return;
    if (
      !window.confirm(
        `¿Eliminar la capacitación "${training.topic}"? Se quitarán también sus asistentes.`,
      )
    )
      return;
    try {
      await apiClient.delete(`/api/hsec/trainings/${training.id}`);
      router.push('/hsec/capacitaciones');
    } catch (e) {
      setActionErrors([e instanceof ApiError ? e.message : 'No se pudo eliminar la capacitación.']);
    }
  };

  const pickFile = (isReplace: boolean) => {
    if (isReplace && !window.confirm('La nueva planilla REEMPLAZARÁ a la actual. ¿Continuar?'))
      return;
    replacing.current = isReplace;
    fileInput.current?.click();
  };

  const upload = async (file: File) => {
    if (!training) return;
    setBusy(true);
    setActionErrors([]);
    const fd = new FormData();
    fd.append('file', file);
    try {
      // Response body DISCARDED (ruling) — refetch below carries the shaped hasFile/fileName.
      await apiClient.uploadFile(`/api/hsec/trainings/${training.id}/file`, fd);
    } catch (e) {
      setActionErrors([e instanceof ApiError ? e.message : 'No se pudo subir la planilla.']);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
      fetchTraining();
    }
  };

  const download = async () => {
    if (!training?.fileName) return;
    try {
      const blob = await apiClient.fetchBlob(`/api/hsec/trainings/${training.id}/file?download=1`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = training.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setActionErrors(['No se pudo descargar la planilla.']);
    }
  };

  const removeFile = async () => {
    if (!training) return;
    if (!window.confirm(`¿Quitar la planilla "${training.fileName}"?`)) return;
    setActionErrors([]);
    try {
      await apiClient.delete(`/api/hsec/trainings/${training.id}/file`);
      fetchTraining(); // ruling: refetch
    } catch (e) {
      setActionErrors([e instanceof ApiError ? e.message : 'No se pudo quitar la planilla.']);
    }
  };

  if (loading) return <p className="pt-6 text-sm text-[var(--text-secondary)]">Cargando…</p>;
  if (error || !training)
    return (
      <div className="pt-6">
        <p className="text-sm text-red-600">{error ?? 'Capacitación no encontrada.'}</p>
        <button
          onClick={() => router.push('/hsec/capacitaciones')}
          className="mt-3 inline-flex items-center gap-1 text-sm text-[#2563eb]"
        >
          <ArrowLeft size={14} /> Volver a capacitaciones
        </button>
      </div>
    );

  const attendeeIds = new Set(training.attendees.map((a) => a.employeeId));
  const addable = roster.filter((r) => !attendeeIds.has(r.employeeId));
  const CARD = 'rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4';

  return (
    <div className="pt-2">
      <button
        onClick={() => router.push('/hsec/capacitaciones')}
        className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={14} /> Capacitaciones
      </button>

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
          <h1
            className="text-2xl font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            {training.topic}
          </h1>
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{
              background: TRAINING_TYPE_STYLE[training.type].bg,
              color: TRAINING_TYPE_STYLE[training.type].color,
            }}
          >
            {TRAINING_TYPE_LABEL[training.type]}
          </span>
          <span className="text-sm text-[var(--text-secondary)]">
            {formatIncidentDate(training.date)}
            {training.time ? ` · ${training.time}` : ''}
            {training.durationMinutes ? ` · ${training.durationMinutes} min` : ''}
            {` · ${training.instructorName}`}
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
            onClick={removeTraining}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600"
          >
            <Trash2 size={14} /> Eliminar
          </button>
        </div>
      </div>

      {actionErrors.length > 0 && (
        <div className="mb-3 space-y-1">
          {actionErrors.map((msg, i) => (
            <p key={i} className="text-sm text-red-600">
              {msg}
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Asistentes */}
        <div className={CARD}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Asistentes ({training.attendees.length})
          </h2>
          {training.attendees.length === 0 ? (
            <p className="mb-3 text-sm text-[var(--text-secondary)]">Sin asistentes registrados.</p>
          ) : (
            <ul className="mb-4 divide-y divide-[var(--border-color)]">
              {training.attendees.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-[var(--text-primary)]">{a.fullName ?? a.employeeId}</span>
                  <button
                    onClick={() => removeAttendee(a)}
                    className="text-[var(--text-secondary)] hover:text-red-600"
                    aria-label={`Quitar ${a.fullName ?? ''}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Roster MULTI-select → sequential POSTs → ONE refetch. */}
          <div className="border-t border-[var(--border-color)] pt-3">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Agregar asistentes
            </label>
            <select
              multiple
              size={Math.min(5, Math.max(2, addable.length))}
              value={selected}
              onChange={(e) =>
                setSelected(Array.from(e.target.selectedOptions).map((o) => o.value))
              }
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
            >
              {addable.map((r) => (
                <option key={r.employeeId} value={r.employeeId}>
                  {r.fullName}
                </option>
              ))}
            </select>
            <button
              onClick={addSelected}
              disabled={busy || selected.length === 0}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ background: '#2563eb' }}
            >
              <UserPlus size={13} /> Agregar seleccionados ({selected.length})
            </button>
          </div>
        </div>

        {/* Planilla — single slot */}
        <div className={CARD}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Planilla firmada
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
          {training.hasFile && training.fileName ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-2 text-[var(--text-primary)]">
                <Paperclip size={14} className="text-[var(--text-secondary)]" />
                {training.fileName}
                {training.fileSize !== null && (
                  <span className="text-xs text-[var(--text-secondary)]">
                    {formatFileSize(training.fileSize)}
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
                Sin planilla adjunta. Sube el escaneo de la planilla de asistencia firmada.
              </p>
              <button
                onClick={() => pickFile(false)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                style={{ background: '#2563eb' }}
              >
                <Upload size={13} /> Subir planilla
              </button>
            </div>
          )}
          {training.notes && (
            <p className="mt-4 whitespace-pre-wrap border-t border-[var(--border-color)] pt-3 text-sm text-[var(--text-secondary)]">
              {training.notes}
            </p>
          )}
        </div>
      </div>

      {editOpen && (
        <TrainingFormModal
          editing={training}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            fetchTraining(); // ruling: refetch the shaped GET after the modal's mutation
          }}
        />
      )}
    </div>
  );
}
