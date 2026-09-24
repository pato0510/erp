'use client';

/* COM-027 — Probabilidades por etapa (spec T4, founder decision F2). The eight stages in
 * pipeline order with their default probability (GET /comercial/stage-probabilities):
 * stage pill, probability, «Por defecto» / «Configurada» (isDefault). Ganada 100 % and
 * Perdida 0 % are fixed (editable false). With stageProbabilities.update (ADMIN /
 * SUPER_ADMIN) each editable stage gets a select 0, 10 … 100; «Guardar cambios» PUTs
 * ONLY the changed items and «Descartar» restores what was loaded. A change applies to new
 * opportunities and to future stage moves — never to existing opportunities (the api
 * rewrites nothing). Readers see the values without controls. The api validates; its 4xx
 * shows on the page (role="alert"). */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient, ApiError } from '../../../../lib/api';
import { useComercialPermissions } from '../../../../hooks/useCanWrite';
import {
  PROBABILITY_OPTIONS,
  STAGE_LABELS,
  stageAccent,
} from '../../../../components/comercial/stageLabels';

interface StageProbability {
  stage: string;
  probability: number;
  editable: boolean;
  isDefault: boolean;
}

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

export default function ProbabilidadesPage() {
  const perms = useComercialPermissions();
  const canRead = perms?.stageProbabilities.read ?? false;
  const canEdit = perms?.stageProbabilities.update ?? false;

  const [rows, setRows] = useState<StageProbability[]>([]);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = (data: StageProbability[]) => {
    setRows(data);
    setDraft(Object.fromEntries(data.map((r) => [r.stage, r.probability])));
  };

  const load = useCallback(async () => {
    setState('loading');
    try {
      apply(await apiClient.get<StageProbability[]>('/api/comercial/stage-probabilities'));
      setState('ok');
    } catch (e) {
      setState(e instanceof ApiError && e.status === 403 ? 'forbidden' : 'error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changed = useMemo(
    () =>
      rows
        .filter((r) => r.editable && draft[r.stage] !== r.probability)
        .map((r) => ({ stage: r.stage, probability: draft[r.stage] })),
    [rows, draft],
  );

  const save = async () => {
    if (changed.length === 0) return;
    setSaving(true);
    setErr(null);
    setNotice(null);
    try {
      apply(
        await apiClient.put<StageProbability[]>('/api/comercial/stage-probabilities', {
          items: changed,
        }),
      );
      setNotice(
        changed.length === 1 ? 'Se guardó 1 etapa.' : `Se guardaron ${changed.length} etapas.`,
      );
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? e.status === 403
            ? 'No tienes permiso para hacer esto.'
            : e.message
          : 'No se pudieron guardar las probabilidades.',
      );
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    apply(rows);
    setErr(null);
    setNotice(null);
  };

  const Header = (
    <div className="mb-2 flex items-center gap-3">
      <span className="h-6 w-1.5 rounded-full bg-accent" />
      <h1
        className="text-2xl font-semibold text-fg"
        style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
      >
        Probabilidades por etapa
      </h1>
    </div>
  );

  if ((perms && !canRead) || state === 'forbidden') {
    return (
      <div className="pt-2">
        {Header}
        <p className="mt-4 text-sm text-fg-secondary">
          No tienes permiso para ver las probabilidades por etapa.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl pt-2">
      {Header}
      <p className="mb-5 text-sm text-fg-secondary">
        Probabilidad de ganar que toma una oportunidad al crearse o al entrar en cada etapa.
        Cambiarla aplica a las oportunidades nuevas y a los próximos cambios de etapa; nunca
        modifica las oportunidades existentes.
      </p>

      {state === 'error' && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            No se pudieron cargar las probabilidades.
          </p>
          <button
            type="button"
            onClick={load}
            className={`rounded-md border border-line px-3 py-1 text-sm text-fg hover:bg-subtle-hover ${FOCUS}`}
          >
            Reintentar
          </button>
        </div>
      )}

      {state === 'loading' && (
        <div className="space-y-2" aria-busy="true" aria-label="Cargando probabilidades">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-subtle-hover" />
          ))}
        </div>
      )}

      {state === 'ok' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="overflow-x-auto rounded-xl border border-line bg-card-solid">
            <table className="w-full text-sm text-fg">
              <caption className="sr-only">Probabilidad por defecto de cada etapa</caption>
              <thead>
                <tr className="border-b border-line bg-subtle text-left text-xs font-medium text-fg-secondary">
                  <th scope="col" className="px-4 py-2.5">
                    Etapa
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    Probabilidad
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    Origen
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const label = STAGE_LABELS[r.stage] ?? r.stage;
                  const dirty = r.editable && draft[r.stage] !== r.probability;
                  return (
                    <tr key={r.stage} className="border-b border-line last:border-b-0">
                      <th scope="row" className="px-4 py-2.5 text-left font-normal">
                        <span
                          className="inline-flex rounded-md px-2 py-0.5 text-xs font-semibold text-white"
                          style={{ background: stageAccent(r.stage) }}
                        >
                          {label}
                        </span>
                      </th>
                      <td className="px-4 py-2.5">
                        {canEdit && r.editable ? (
                          <>
                            <label htmlFor={`prob-${r.stage}`} className="sr-only">
                              Probabilidad de {label}
                            </label>
                            <select
                              id={`prob-${r.stage}`}
                              value={draft[r.stage]}
                              disabled={saving}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, [r.stage]: Number(e.target.value) }))
                              }
                              className={`h-9 rounded-lg border bg-input px-3 text-sm text-fg ${FOCUS} ${
                                dirty ? 'border-accent' : 'border-line'
                              }`}
                            >
                              {PROBABILITY_OPTIONS.map((p) => (
                                <option key={p} value={p}>
                                  {p} %
                                </option>
                              ))}
                            </select>
                            {dirty && (
                              <span className="ml-2 text-xs text-fg-secondary">
                                antes {r.probability} %
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="tabular-nums">{r.probability} %</span>
                        )}
                        {!r.editable && (
                          <span className="ml-2 text-xs text-fg-secondary">
                            {r.stage === 'GANADA'
                              ? 'Fija: una ganada es 100 %.'
                              : 'Fija: una perdida es 0 %.'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-fg-secondary">
                        {!r.editable ? 'Fija' : r.isDefault ? 'Por defecto' : 'Configurada'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div aria-live="polite" className="mt-3 min-h-5 text-sm">
            {notice && <p className="text-green-700 dark:text-green-400">{notice}</p>}
          </div>
          {err && (
            <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-400">
              {err}
            </p>
          )}

          {canEdit && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={saving || changed.length === 0}
                className={`h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 ${FOCUS} focus-visible:outline-offset-2`}
              >
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button
                type="button"
                onClick={discard}
                disabled={saving || changed.length === 0}
                className={`h-9 rounded-lg border border-line px-4 text-sm text-fg hover:bg-subtle-hover disabled:opacity-50 ${FOCUS}`}
              >
                Descartar
              </button>
              {changed.length > 0 && (
                <span className="text-xs text-fg-secondary">
                  {changed.length === 1
                    ? '1 etapa con cambios sin guardar.'
                    : `${changed.length} etapas con cambios sin guardar.`}
                </span>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
