'use client';

import { useState } from 'react';
import { apiClient } from '../../lib/api';

interface Preview {
  candidates: number;
  sinContraparte: number;
  sinRegla: number;
  periodoCerrado: number;
  cambios: number;
  porRegla: {
    ruleId: string;
    ruleName: string;
    categoryId: string;
    categoryName: string;
    count: number;
  }[];
  aplicados?: number;
}

export function RecategorizePanel({ onApplied }: { onApplied: (count: number) => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState<'preview' | 'apply' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreview = async () => {
    setPending('preview');
    setError(null);
    setPreview(null);
    try {
      setPreview(await apiClient.post<Preview>('/api/movements/recategorize', { dryRun: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al previsualizar los cambios.');
    } finally {
      setPending(null);
    }
  };

  const apply = async () => {
    if (!preview?.cambios || pending) return;
    if (
      !window.confirm(
        `Se cambiará la categoría de ${preview.cambios} movimientos. Las categorías elegidas manualmente no se tocan.`,
      )
    )
      return;
    setPending('apply');
    setError(null);
    setPreview(null);
    try {
      const result = await apiClient.post<Preview>('/api/movements/recategorize', {
        dryRun: false,
      });
      onApplied(result.aplicados ?? 0);
      setPreview(await apiClient.post<Preview>('/api/movements/recategorize', { dryRun: true }));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error al aplicar las reglas. Previsualiza nuevamente.',
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <section
      aria-labelledby="recategorize-title"
      aria-busy={!!pending}
      className="bg-card border border-line rounded-xl shadow-sm mb-6"
    >
      <div className="px-5 py-4 border-b border-line">
        <h2 id="recategorize-title" className="text-sm font-semibold text-fg">
          Aplicar reglas a movimientos no categorizados
        </h2>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label
              htmlFor="recategorize-period"
              className="block text-xs font-medium text-fg-secondary mb-1"
            >
              Período
            </label>
            <select
              id="recategorize-period"
              name="fiscalPeriodId"
              defaultValue=""
              disabled={!!pending}
              className="px-3 py-2 text-sm border border-line rounded-lg bg-input text-fg focus-visible:ring-2 focus-visible:ring-accent"
            >
              <option value="">Todos los períodos</option>
            </select>
          </div>
          <button
            type="button"
            onClick={runPreview}
            disabled={!!pending}
            className="px-4 py-2 text-sm border border-line text-fg rounded-lg hover:bg-subtle-hover disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent"
          >
            {pending === 'preview' ? 'Previsualizando…' : 'Previsualizar'}
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!!pending || !preview?.cambios}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent"
          >
            {pending === 'apply' ? 'Aplicando…' : `Aplicar ${preview?.cambios ?? 0} cambios`}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-fg">
            {error}
          </p>
        )}
        {preview && (
          <div className="space-y-4">
            <dl aria-live="polite" className="flex flex-wrap gap-6 text-sm text-fg">
              {[
                ['Candidatos', preview.candidates],
                ['Sin contraparte', preview.sinContraparte],
                ['Sin regla', preview.sinRegla],
                ['Borradores en período cerrado', preview.periodoCerrado],
                ['Cambios', preview.cambios],
              ].map(([label, count]) => (
                <div key={label}>
                  <dt className="text-fg-secondary">{label}</dt>
                  <dd className="font-semibold tabular-nums">{count}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-fg-secondary">
              Los borradores en período cerrado podrán recategorizarse una vez confirmados o al
              reabrir el período.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-fg">
                <caption className="sr-only">Cambios por regla</caption>
                <thead className="bg-subtle text-fg-secondary">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left">
                      Regla
                    </th>
                    <th scope="col" className="px-4 py-3 text-left">
                      Categoría
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Movimientos
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {preview.porRegla.map((rule) => (
                    <tr key={rule.ruleId}>
                      <td className="px-4 py-3">{rule.ruleName}</td>
                      <td className="px-4 py-3">{rule.categoryName}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{rule.count}</td>
                    </tr>
                  ))}
                  {preview.porRegla.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-fg-secondary">
                        No hay cambios para aplicar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
