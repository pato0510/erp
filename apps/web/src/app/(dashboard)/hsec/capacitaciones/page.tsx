'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Paperclip, Plus } from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/api';
import { TrainingFormModal } from '../../../../components/hsec/TrainingFormModal';
import { formatIncidentDate } from '../../../../components/hsec/incidentTypes';
import type { RosterEntry } from '../../../../components/hsec/incidentTypes';
import type { HsecTrainingType, TrainingListRow } from '../../../../components/hsec/trainingTypes';
import {
  TRAINING_TYPE_LABEL,
  TRAINING_TYPE_STYLE,
} from '../../../../components/hsec/trainingTypes';

/* HSEC-007 — trainings list. Tipo AND asistente are SERVER-side filters (?type;
 * ?employeeId via a roster select — the HSEC-006 attendee-based filter); the date range is
 * CLIENT-side over the fetched set. Row click → detail. The planilla indicator derives from
 * the shipped list payload (fileName non-null). DIRECTOR RULING (HSEC-006 review): every
 * mutation refetches the shaped GET — no response body ever becomes state. */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* HSEC-010 — useSearchParams requires a Suspense boundary (the operaciones/alertas idiom). */
export default function HsecCapacitacionesPage() {
  return (
    <Suspense fallback={null}>
      <HsecCapacitacionesContent />
    </Suspense>
  );
}

function HsecCapacitacionesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<TrainingListRow[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  /* HSEC-010 — SEARCHPARAMS INITIALIZATION: ?tipo / ?empleado / ?desde / ?hasta seed the
     EXISTING filter state (validated; invalid → defaults) — no new filter logic. */
  const spTipo = searchParams.get('tipo');
  const spEmpleado = searchParams.get('empleado');
  const spDesde = searchParams.get('desde');
  const spHasta = searchParams.get('hasta');

  // Server-side filters; client-side date range.
  const [tipo, setTipo] = useState<'todos' | HsecTrainingType>(
    spTipo && spTipo in TRAINING_TYPE_LABEL ? (spTipo as HsecTrainingType) : 'todos',
  );
  const [asistente, setAsistente] = useState(
    spEmpleado && UUID_RE.test(spEmpleado) ? spEmpleado : '',
  );
  const [desde, setDesde] = useState(spDesde && DATE_RE.test(spDesde) ? spDesde : '');
  const [hasta, setHasta] = useState(spHasta && DATE_RE.test(spHasta) ? spHasta : '');

  const fetchList = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tipo !== 'todos') params.set('type', tipo);
    if (asistente) params.set('employeeId', asistente);
    const qs = params.toString() ? `?${params.toString()}` : '';
    apiClient
      .get<TrainingListRow[]>(`/api/hsec/trainings${qs}`)
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : 'No se pudieron cargar las capacitaciones.'),
      )
      .finally(() => setLoading(false));
  }, [tipo, asistente]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    apiClient
      .get<RosterEntry[]>('/api/hsec/roster')
      .then(setRoster)
      .catch(() => setRoster([]));
  }, []);

  /* Client-side date range over the fetched set — ISO day-slice comparison (lexicographic ==
     chronological); the stored value never passes through a local-zone Date render. */
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const day = r.date.slice(0, 10);
      if (desde && day < desde) return false;
      if (hasta && day > hasta) return false;
      return true;
    });
  }, [rows, desde, hasta]);

  const SELECT =
    'rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm text-[var(--text-primary)]';

  return (
    <div className="pt-2">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
          <h1
            className="text-2xl font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            Capacitaciones
          </h1>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: '#2563eb' }}
        >
          <Plus size={16} /> Nueva capacitación
        </button>
      </div>

      {/* Filters: tipo + asistente server-side; date range client-side. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as typeof tipo)}
          className={SELECT}
        >
          <option value="todos">Tipo: todos</option>
          {(Object.keys(TRAINING_TYPE_LABEL) as HsecTrainingType[]).map((t) => (
            <option key={t} value={t}>
              {TRAINING_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select
          value={asistente}
          onChange={(e) => setAsistente(e.target.value)}
          className={SELECT}
          aria-label="Asistente"
        >
          <option value="">Asistente: todos</option>
          {roster.map((r) => (
            <option key={r.employeeId} value={r.employeeId}>
              {r.fullName}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          className={SELECT}
          aria-label="Desde"
        />
        <span className="text-xs text-[var(--text-secondary)]">→</span>
        <input
          type="date"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          className={SELECT}
          aria-label="Hasta"
        />
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-[var(--border-color)] bg-gray-50 dark:bg-white/5">
            <tr>
              {['Tipo', 'Tema', 'Fecha', 'Relator', 'Asistentes', 'Planilla'].map((h, i) => (
                <th
                  key={i}
                  className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-sm text-[var(--text-secondary)]"
                >
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-sm text-[var(--text-secondary)]"
                >
                  No hay capacitaciones que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/hsec/capacitaciones/${r.id}`)}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <td className="px-3 py-2.5">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        background: TRAINING_TYPE_STYLE[r.type].bg,
                        color: TRAINING_TYPE_STYLE[r.type].color,
                      }}
                    >
                      {TRAINING_TYPE_LABEL[r.type]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-[var(--text-primary)]">{r.topic}</td>
                  <td className="px-3 py-2.5 text-[var(--text-primary)]">
                    {formatIncidentDate(r.date)}
                    {r.time && (
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-[var(--text-secondary)] dark:bg-white/10">
                        {r.time}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text-secondary)]">{r.instructorName}</td>
                  <td className="px-3 py-2.5 text-[var(--text-primary)]">{r.attendeesCount}</td>
                  <td className="px-3 py-2.5">
                    {r.fileName ? (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                        <Paperclip size={13} /> Sí
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--text-secondary)]">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <TrainingFormModal
          editing={null}
          onClose={() => setModalOpen(false)}
          onSaved={(id) => {
            setModalOpen(false);
            router.push(`/hsec/capacitaciones/${id}`);
          }}
        />
      )}
    </div>
  );
}
