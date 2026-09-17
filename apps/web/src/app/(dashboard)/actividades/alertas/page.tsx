'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiClient } from '../../../../lib/api';
import { useAuth } from '../../../../hooks/useAuth';
import { useActividadesPermissions } from '../../../../hooks/useActividadesPermissions';
import {
  Todo,
  TodoRowCells,
  TODOS_CHANGED_EVENT,
} from '../../../../components/actividades/TodoRowCells';

interface TodoAlerts {
  counts: { overdue: number; dueSoon: number; total: number };
  overdue: Todo[];
  dueSoon: Todo[];
}
const BUTTON =
  'rounded-lg border border-line px-3 py-2 text-sm text-fg hover:bg-subtle-hover disabled:opacity-50 focus-visible:outline-accent';
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'No se pudieron cargar las alertas. Intenta actualizar.';

export default function TodoAlertsPage() {
  const { user } = useAuth();
  const permissions = useActividadesPermissions();
  const canRead = permissions?.todo.read ?? false;
  const canUpdate = permissions?.todo.update ?? false;
  const companyId = apiClient.getCompanyId();
  const userId = user?.id;
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const effectiveScope = canUpdate ? scope : 'mine';
  const [data, setData] = useState<TodoAlerts | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!canRead || !companyId || !userId) return;
    let active = true;
    setLoading(true);
    setData(null);
    setError(null);
    apiClient
      .get<TodoAlerts>(`/api/todos/alerts?scope=${effectiveScope}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) setError(messageOf(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canRead, companyId, userId, effectiveScope, refresh]);

  async function complete(row: Todo) {
    setBusy(row.id);
    setError(null);
    setNotice(null);
    try {
      await apiClient.patch(`/api/todos/${row.id}/complete`);
      setNotice('To-do completado.');
      setRefresh((value) => value + 1);
      window.dispatchEvent(new Event(TODOS_CHANGED_EVENT));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo completar el to-do. Intenta nuevamente.',
      );
    } finally {
      setBusy(null);
    }
  }

  if (!permissions || !user)
    return (
      <p className="p-6 text-fg-secondary" role="status">
        Cargando…
      </p>
    );
  if (!canRead)
    return (
      <p className="p-6 text-fg-secondary" role="alert">
        No tienes acceso a las alertas.
      </p>
    );

  return (
    <div className="space-y-6">
      <nav aria-label="Ruta de navegación" className="text-sm text-fg-secondary">
        <Link href="/actividades" className="hover:underline focus-visible:outline-accent">
          Gestión organizacional
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Alertas</span>
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-fg" style={{ fontFamily: 'var(--font-display)' }}>
          Alertas{data ? ` (${data.counts.total})` : ''}
        </h1>
        <button
          className={BUTTON}
          disabled={loading || busy !== null}
          onClick={() => {
            setRefresh((value) => value + 1);
            window.dispatchEvent(new Event(TODOS_CHANGED_EVENT));
          }}
        >
          Actualizar
        </button>
      </div>
      <div className="flex gap-2" role="group" aria-label="Alcance de los to-dos">
        <button
          className={`${BUTTON} ${effectiveScope === 'mine' ? 'bg-subtle' : ''}`}
          aria-pressed={effectiveScope === 'mine'}
          disabled={busy !== null}
          onClick={() => {
            setScope('mine');
            setNotice(null);
          }}
        >
          Mis to-dos
        </button>
        {canUpdate && (
          <button
            className={`${BUTTON} ${effectiveScope === 'all' ? 'bg-subtle' : ''}`}
            aria-pressed={effectiveScope === 'all'}
            disabled={busy !== null}
            onClick={() => {
              setScope('all');
              setNotice(null);
            }}
          >
            Todos
          </button>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-100 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-fg-secondary">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status" className="py-8 text-fg-secondary">
          Cargando alertas…
        </p>
      ) : (
        data && (
          <>
            <AlertSection
              title="Vencidos"
              id="vencidos"
              rows={data.overdue}
              busy={busy}
              onComplete={complete}
            />
            <AlertSection
              title="Vencen hoy o mañana"
              id="proximos"
              rows={data.dueSoon}
              busy={busy}
              onComplete={complete}
            />
          </>
        )
      )}
    </div>
  );
}

function AlertSection({
  title,
  id,
  rows,
  busy,
  onComplete,
}: {
  title: string;
  id: string;
  rows: Todo[];
  busy: string | null;
  onComplete: (row: Todo) => void;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="text-lg font-semibold text-fg">
          {title} ({rows.length})
        </h2>
        <Link
          href="/actividades/todos"
          className="text-sm text-fg underline underline-offset-2 hover:no-underline focus-visible:outline-accent"
        >
          Ver to-dos
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-sm text-fg-secondary">Sin alertas.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="bg-subtle text-fg-secondary">
              <tr>
                {['Hecho', 'Título', 'Responsable', 'Fecha límite', 'Prioridad'].map((heading) => (
                  <th key={heading} scope="col" className="px-4 py-3 font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id} className="text-fg">
                  <TodoRowCells
                    row={row}
                    busy={busy}
                    canReopen={false}
                    onToggle={() => onComplete(row)}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
