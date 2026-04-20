'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Download,
  ArrowLeft,
  Landmark,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { formatCLP, formatDate } from '../../../../lib/formatters';

type Step = 'upload' | 'preview' | 'result';

type FormatKey = 'generic' | 'bancochile' | 'bci';

interface Connection {
  id: string;
  provider: string;
  providerAccountId: string;
  bankAccount: { name: string; type: string; bankName?: string };
}

interface PreviewRow {
  date: string;
  description: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  balance?: number;
  reference?: string;
  idempotencyKey: string;
}

interface CartolaError {
  row: number;
  field: string;
  message: string;
}

interface PreviewResponse {
  detectedFormat: string;
  validCount: number;
  errorCount: number;
  preview: PreviewRow[];
  errors: CartolaError[];
}

interface ImportResponse {
  imported: number;
  skipped: number;
  errors: CartolaError[];
  syncRunId: string | null;
}

const FORMAT_OPTIONS: { value: FormatKey; label: string; hint: string }[] = [
  {
    value: 'bancochile',
    label: 'Banco de Chile / BCI',
    hint: 'Fecha, Descripción, Cargo, Abono, Saldo',
  },
  { value: 'bci', label: 'BCI', hint: 'Fecha, Descripción, Cargo, Abono, Saldo' },
  { value: 'generic', label: 'Formato genérico', hint: 'fecha, descripción, monto, tipo, saldo' },
];

const FORMAT_LABELS: Record<string, string> = {
  bancochile_bci: 'Banco de Chile / BCI',
  santander_itau: 'Santander / Itaú',
  generic: 'Formato genérico',
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function CartolaImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);

  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionId, setConnectionId] = useState('');
  const [format, setFormat] = useState<FormatKey>('bancochile');

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [detectedFormat, setDetectedFormat] = useState('');
  const [errors, setErrors] = useState<CartolaError[]>([]);
  const [validCount, setValidCount] = useState(0);

  const [result, setResult] = useState<ImportResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<Connection[]>('/api/banking/connections')
      .then((conns) => {
        setConnections(conns);
        if (conns.length > 0) setConnectionId((prev) => prev || conns[0].id);
      })
      .catch(() => setUploadError('No se pudieron cargar las conexiones bancarias'));
  }, []);

  const handleFile = useCallback(
    async (f: File) => {
      if (!connectionId) {
        setUploadError('Selecciona una conexión bancaria primero');
        return;
      }
      setFile(f);
      setIsLoading(true);
      setUploadError(null);
      try {
        const formData = new FormData();
        formData.append('file', f);
        formData.append('bankConnectionId', connectionId);
        const res = await apiClient.uploadFile<PreviewResponse>(
          '/api/banking/cartola/preview',
          formData,
        );
        setPreview(res.preview);
        setErrors(res.errors);
        setValidCount(res.validCount);
        setDetectedFormat(res.detectedFormat);
        setStep('preview');
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Error al procesar archivo');
      } finally {
        setIsLoading(false);
      }
    },
    [connectionId],
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
    if (!file || !connectionId) return;
    setIsLoading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bankConnectionId', connectionId);
      const res = await apiClient.uploadFile<ImportResponse>(
        '/api/banking/cartola/import',
        formData,
      );
      setResult(res);
      setErrors(res.errors);
      setStep('result');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error al importar');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadTemplate = () => {
    window.open(`${API_BASE}/api/banking/cartola/template/${format}`, '_blank');
  };

  const reset = () => {
    setStep('upload');
    setFile(null);
    setPreview([]);
    setErrors([]);
    setValidCount(0);
    setDetectedFormat('');
    setResult(null);
    setUploadError(null);
  };

  const selectedConnection = connections.find((c) => c.id === connectionId);

  return (
    <div className="max-w-3xl">
      <Link
        href="/banco"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4 transition"
      >
        <ArrowLeft size={14} /> Volver a conexiones
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Importar Cartola Manual</h1>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm text-blue-900">
        <p className="font-medium mb-1">Importación manual como respaldo</p>
        <p className="text-blue-700 text-xs leading-relaxed">
          Sube la cartola descargada del portal del banco en formato CSV o Excel cuando la
          sincronización automática no esté disponible. Las filas duplicadas (misma fecha,
          descripción y monto) se detectan automáticamente.
        </p>
      </div>

      {uploadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center gap-2">
          <AlertCircle size={16} className="text-red-600" />
          <span className="text-sm text-red-700">{uploadError}</span>
        </div>
      )}

      {/* STEP 1 — Upload */}
      {step === 'upload' && (
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Conexión bancaria
              </label>
              <select
                value={connectionId}
                onChange={(e) => setConnectionId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Seleccionar...</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.bankAccount.name} · {c.provider.toUpperCase()}
                  </option>
                ))}
              </select>
              {connections.length === 0 && (
                <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                  <Landmark size={12} /> No hay conexiones activas. Crea una desde Banco.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Formato de cartola
              </label>
              <div className="flex gap-2 items-center">
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as FormatKey)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {FORMAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  <Download size={14} /> Plantilla
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {FORMAT_OPTIONS.find((o) => o.value === format)?.hint}
              </p>
            </div>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className={`bg-white border-2 border-dashed rounded-xl p-12 text-center transition ${
              connectionId
                ? 'border-gray-300 hover:border-blue-400 cursor-pointer'
                : 'border-gray-200 opacity-50 cursor-not-allowed'
            }`}
            onClick={() => connectionId && fileRef.current?.click()}
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
                <p className="text-gray-700 font-medium">Arrastra la cartola aquí</p>
                <p className="text-gray-400 text-sm mt-1">
                  o haz clic para seleccionar (.csv, .xlsx, .xls — máx 10MB)
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* STEP 2 — Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-600 flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-gray-400" />
            <span>
              Conexión:{' '}
              <span className="font-medium text-gray-900">
                {selectedConnection?.bankAccount.name}
              </span>
              <span className="mx-2 text-gray-300">·</span>
              Formato detectado:{' '}
              <span className="font-medium text-gray-900">
                {FORMAT_LABELS[detectedFormat] ?? detectedFormat}
              </span>
            </span>
          </div>

          <div className="flex gap-4">
            <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle size={20} className="text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800">
                  {validCount} movimientos válidos
                </p>
                <p className="text-xs text-green-600">Listos para importar</p>
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
                    <th className="text-left px-4 py-2 text-gray-500">Fecha</th>
                    <th className="text-left px-4 py-2 text-gray-500">Descripción</th>
                    <th className="text-left px-4 py-2 text-gray-500">Tipo</th>
                    <th className="text-right px-4 py-2 text-gray-500">Monto</th>
                    <th className="text-center px-4 py-2 text-gray-500">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.map((row) => (
                    <tr key={row.idempotencyKey}>
                      <td className="px-4 py-2 text-gray-700">{formatDate(row.date)}</td>
                      <td className="px-4 py-2 text-gray-900">{row.description}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`text-xs font-medium ${row.type === 'CREDIT' ? 'text-green-600' : 'text-red-500'}`}
                        >
                          {row.type === 'CREDIT' ? '↑ Abono' : '↓ Cargo'}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-medium ${row.type === 'CREDIT' ? 'text-green-600' : 'text-red-500'}`}
                      >
                        {row.type === 'CREDIT' ? '+' : '-'}
                        {formatCLP(Math.abs(Number(row.amount)))}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className="text-xs text-green-600 font-medium">Válido</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {errors.length > 0 && (
            <div className="bg-white border border-red-200 rounded-xl p-4">
              <h3 className="text-sm font-medium text-red-800 mb-2">Errores encontrados</h3>
              <div className="space-y-1 max-h-40 overflow-auto">
                {errors.slice(0, 50).map((e, i) => (
                  <p key={i} className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                    Fila {e.row}: <span className="font-medium">{e.field}</span> — {e.message}
                  </p>
                ))}
                {errors.length > 50 && (
                  <p className="text-xs text-red-500 italic mt-2">
                    ... y {errors.length - 50} errores más
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              Volver
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={isLoading || validCount === 0}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {isLoading ? 'Importando...' : `Importar ${validCount} movimientos`}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — Result */}
      {step === 'result' && result && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Cartola importada</h2>
          <div className="text-gray-600 mb-6 space-y-1">
            <p>
              ✓ <span className="font-bold text-green-600">{result.imported}</span> movimientos
              importados
            </p>
            {result.skipped > 0 && (
              <p className="text-sm text-gray-500">
                ⚠ {result.skipped} movimientos omitidos (ya existían)
              </p>
            )}
            {result.errors.length > 0 && (
              <p className="text-sm text-red-500">✗ {result.errors.length} errores</p>
            )}
          </div>
          <div className="flex gap-3 justify-center">
            <Link
              href="/banco"
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
            >
              Ver movimientos bancarios
            </Link>
            <button
              onClick={reset}
              className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              Importar otra cartola
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
