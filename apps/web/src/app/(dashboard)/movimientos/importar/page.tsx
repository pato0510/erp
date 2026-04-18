'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, Download } from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { useMovements } from '../../../../hooks/useMovements';
import { formatCLP } from '../../../../lib/formatters';

interface PreviewRow {
  date: string;
  type: string;
  amount: number;
  description: string;
  categoryName?: string;
  counterpartyName?: string;
}

interface ImportError {
  row: number;
  field: string;
  message: string;
}

interface Period {
  id: string;
  name: string;
}

type Step = 'upload' | 'preview' | 'result';

export default function ImportarPage() {
  const router = useRouter();
  const { previewImport, importMovements } = useMovements();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [validCount, setValidCount] = useState(0);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  useEffect(() => {
    apiClient
      .get<Period[]>('/api/fiscal-periods?year=2026')
      .then((ps) => {
        setPeriods(ps);
        const current = ps.find((p) => p.name.includes('Abril'));
        if (current) setSelectedPeriod(current.id);
      })
      .catch(() => undefined);
  }, []);

  const handleFile = useCallback(
    async (f: File) => {
      setFile(f);
      setIsLoading(true);
      try {
        const res = await previewImport(f);
        setPreview(res.preview);
        setErrors(res.errors);
        setValidCount(res.validCount);
        setStep('preview');
      } catch (err) {
        setErrors([
          { row: 0, field: 'file', message: err instanceof Error ? err.message : 'Error' },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [previewImport],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleConfirmImport = async () => {
    if (!file || !selectedPeriod) return;
    setIsLoading(true);
    try {
      const res = await importMovements(file, selectedPeriod);
      setResult({ created: res.created, skipped: res.skipped });
      setErrors(res.errors);
      setStep('result');
    } catch (err) {
      setErrors([
        { row: 0, field: 'import', message: err instanceof Error ? err.message : 'Error' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadTemplate = () => {
    window.open('http://localhost:3001/api/movements/import/template', '_blank');
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Importar Movimientos</h1>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          <Download size={16} /> Descargar Plantilla
        </button>
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-400 transition cursor-pointer"
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {isLoading ? (
            <div className="text-gray-500">Procesando archivo...</div>
          ) : (
            <>
              <Upload size={40} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-700 font-medium">Arrastra un archivo CSV o Excel aquí</p>
              <p className="text-gray-400 text-sm mt-1">
                o haz clic para seleccionar (.csv, .xlsx, .xls)
              </p>
            </>
          )}
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex gap-4">
            <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle size={20} className="text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800">{validCount} filas válidas</p>
                <p className="text-xs text-green-600">Listas para importar</p>
              </div>
            </div>
            {errors.length > 0 && (
              <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
                <AlertCircle size={20} className="text-red-600" />
                <div>
                  <p className="text-sm font-medium text-red-800">{errors.length} errores</p>
                  <p className="text-xs text-red-600">Se omitirán estas filas</p>
                </div>
              </div>
            )}
          </div>

          {/* Period selector */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Período fiscal de destino
            </label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full max-w-xs"
            >
              <option value="">Seleccionar período...</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Preview table */}
          {preview.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <FileSpreadsheet size={16} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-700">
                  Vista previa (primeras {preview.length} filas)
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-gray-500">Tipo</th>
                    <th className="text-left px-4 py-2 text-gray-500">Descripción</th>
                    <th className="text-left px-4 py-2 text-gray-500">Categoría</th>
                    <th className="text-right px-4 py-2 text-gray-500">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.map((row, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2">
                        <span className={row.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}>
                          {row.type === 'INCOME' ? '↑ Ingreso' : '↓ Egreso'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-900">{row.description}</td>
                      <td className="px-4 py-2 text-gray-600">{row.categoryName || '-'}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatCLP(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-white border border-red-200 rounded-xl p-4">
              <h3 className="text-sm font-medium text-red-800 mb-2">Errores encontrados</h3>
              <div className="space-y-1 max-h-40 overflow-auto">
                {errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600">
                    Fila {e.row}: <span className="font-medium">{e.field}</span> — {e.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleConfirmImport}
              disabled={isLoading || validCount === 0 || !selectedPeriod}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {isLoading ? 'Importando...' : `Importar ${validCount} movimientos`}
            </button>
            <button
              onClick={() => {
                setStep('upload');
                setFile(null);
                setPreview([]);
                setErrors([]);
              }}
              className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              Elegir otro archivo
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Result */}
      {step === 'result' && result && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Importación completada</h2>
          <p className="text-gray-600 mb-6">
            Se crearon <span className="font-bold text-green-600">{result.created}</span>{' '}
            movimientos como borrador.
            {result.skipped > 0 && (
              <span className="text-red-500"> ({result.skipped} filas omitidas por errores)</span>
            )}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.push('/movimientos')}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
            >
              Ver Movimientos
            </button>
            <button
              onClick={() => {
                setStep('upload');
                setFile(null);
                setResult(null);
                setErrors([]);
              }}
              className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              Importar otro archivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
