'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/api';
import { IncidentFormModal } from '../../../../components/hsec/IncidentFormModal';
import type {
  HsecIncident,
  HsecIncidentSeverity,
  HsecIncidentStatus,
  HsecIncidentType,
} from '../../../../components/hsec/incidentTypes';
import {
  formatDbDate,
  SEVERITY_LABEL,
  SEVERITY_STYLE,
  STATUS_LABEL,
  STATUS_STYLE,
  TYPE_LABEL,
} from '../../../../components/hsec/incidentTypes';

/* HSEC-005 — incidents list. Estado is the ONLY server-side filter (?status — the HSEC-002
 * contract); tipo, severidad and the date range are CLIENT-side over the fetched set (the
 * Gestión precedent — small volumes, no double filtering). Row click → detail. Free delete
 * with confirm (PART1 decision 6). The module needs no canWrite gating: the founder-signed
 * matrix is uniform (everyone who can read /hsec can write; others 403 at the API). */

type EstadoFilter = 'todos' | HsecIncidentStatus;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* HSEC-010 — useSearchParams requires a Suspense boundary (the operaciones/alertas idiom). */
export default function HsecIncidentesPage() {
  return (
    <Suspense fallback={null}>
      <HsecIncidentesContent />
    </Suspense>
  );
}

function HsecIncidentesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<HsecIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  /* HSEC-010 — SEARCHPARAMS INITIALIZATION: the dashboard cards deep-link here with
     ?estado / ?severidad / ?tipo / ?desde / ?hasta. Params only seed the EXISTING filter
     state (validated; invalid values fall back to defaults) — no new filter logic. */
  const spEstado = searchParams.get('estado');
  const spTipo = searchParams.get('tipo');
  const spSeveridad = searchParams.get('severidad');
  const spDesde = searchParams.get('desde');
  const spHasta = searchParams.get('hasta');

  // Server-side estado; client-side lenses.
  const [estado, setEstado] = useState<EstadoFilter>(
    spEstado && spEstado in STATUS_LABEL ? (spEstado as HsecIncidentStatus) : 'todos',
  );
  const [tipo, setTipo] = useState<'todos' | HsecIncidentType>(
    spTipo && spTipo in TYPE_LABEL ? (spTipo as HsecIncidentType) : 'todos',
  );
  const [severidad, setSeveridad] = useState<'todos' | HsecIncidentSeverity>(
    spSeveridad && spSeveridad in SEVERITY_LABEL ? (spSeveridad as HsecIncidentSeverity) : 'todos',
  );
  const [desde, setDesde] = useState(spDesde && DATE_RE.test(spDesde) ? spDesde : '');
  const [hasta, setHasta] = useState(spHasta && DATE_RE.test(spHasta) ? spHasta : '');

  const fetchList = useCallback(() => {
    setLoading(true);
    const qs = estado === 'todos' ? '' : `?status=${estado}`;
    apiClient
      .get<HsecIncident[]>(`/api/hsec/incidents${qs}`)
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : 'No se pudieron cargar los incidentes.'),
      )
      .finally(() => setLoading(false));
  }, [estado]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  /* Client-side lenses over the fetched set. Date bounds compare the ISO day slice
     (lexicographic == chronological) — the stored value never passes through a local-zone
     Date render (the date trap). */
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (tipo !== 'todos' && r.type !== tipo) return false;
      if (severidad !== 'todos' && r.severity !== severidad) return false;
      const day = r.occurredDate.slice(0, 10);
      if (desde && day < desde) return false;
      if (hasta && day > hasta) return false;
      return true;
    });
  }, [rows, tipo, severidad, desde, hasta]);

  const remove = async (r: HsecIncident) => {
    if (
      !window.confirm(
        `¿Eliminar el incidente ${r.incidentNumber}? Esta acción no se puede deshacer.`,
      )
    )
      return;
    setBusyId(r.id);
    try {
      await apiClient.delete(`/api/hsec/incidents/${r.id}`);
      fetchList();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo eliminar el incidente.');
    } finally {
      setBusyId(null);
    }
  };

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
            Incidentes
          </h1>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: '#2563eb' }}
        >
          <Plus size={16} /> Nuevo incidente
        </button>
      </div>

      {/* Filters: estado server-side; the rest client-side (Gestión precedent). */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoFilter)}
          className={SELECT}
        >
          <option value="todos">Estado: todos</option>
          {(Object.keys(STATUS_LABEL) as HsecIncidentStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as typeof tipo)}
          className={SELECT}
        >
          <option value="todos">Tipo: todos</option>
          {(Object.keys(TYPE_LABEL) as HsecIncidentType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select
          value={severidad}
          onChange={(e) => setSeveridad(e.target.value as typeof severidad)}
          className={SELECT}
        >
          <option value="todos">Severidad: todas</option>
          {(Object.keys(SEVERITY_LABEL) as HsecIncidentSeverity[]).map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABEL[s]}
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
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-[var(--border-color)] bg-gray-50 dark:bg-white/5">
            <tr>
              {['Número', 'Fecha', 'Tipo', 'Severidad', 'Estado', 'Lugar', ''].map((h, i) => (
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
                  colSpan={7}
                  className="px-3 py-8 text-center text-sm text-[var(--text-secondary)]"
                >
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-sm text-[var(--text-secondary)]"
                >
                  No hay incidentes que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/hsec/incidentes/${r.id}`)}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <td className="px-3 py-2.5 font-medium text-[var(--text-primary)]">
                    {r.incidentNumber}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text-primary)]">
                    {formatDbDate(r.occurredDate)}
                    {r.occurredTime && (
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-[var(--text-secondary)] dark:bg-white/10">
                        {r.occurredTime}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text-primary)]">{TYPE_LABEL[r.type]}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        background: SEVERITY_STYLE[r.severity].bg,
                        color: SEVERITY_STYLE[r.severity].color,
                        fontWeight: SEVERITY_STYLE[r.severity].weight,
                      }}
                    >
                      {SEVERITY_LABEL[r.severity]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        background: STATUS_STYLE[r.status].bg,
                        color: STATUS_STYLE[r.status].color,
                      }}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text-secondary)]">{r.location}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(r);
                      }}
                      disabled={busyId === r.id}
                      className="text-[var(--text-secondary)] hover:text-red-600 disabled:opacity-50"
                      aria-label={`Eliminar ${r.incidentNumber}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <IncidentFormModal
          editing={null}
          onClose={() => setModalOpen(false)}
          onSaved={(id) => {
            setModalOpen(false);
            router.push(`/hsec/incidentes/${id}`);
          }}
        />
      )}
    </div>
  );
}
