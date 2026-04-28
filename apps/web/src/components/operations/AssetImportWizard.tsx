'use client';

import { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from 'lucide-react';
import { apiClient } from '../../lib/api';

type Step = 'upload' | 'preview' | 'result';

interface PreviewRow {
  rowNumber: number;
  data: {
    code: string;
    name: string;
    assetTypeName?: string;
    subtypeName?: string;
    locationName?: string;
    status?: string;
  };
  errors: Array<{ field: string; message: string }>;
  isDuplicate: boolean;
  isValid: boolean;
}

interface PreviewResponse {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: PreviewRow[];
}

interface ImportResponse {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
  importLogId: string;
  assets: Array<{ id: string; code: string; name: string }>;
}

interface Props {
  onClose: () => void;
  /* Called after a successful import — list page should refresh. */
  onImported: () => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export function AssetImportWizard({ onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [createAsDraft, setCreateAsDraft] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* When the user picks a new file we always reset the downstream state — the
     previous preview/result no longer match. */
  const handleFile = (f: File | null) => {
    setError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setError('El archivo excede el límite de 5 MB.');
      return;
    }
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!ext || !['csv', 'xls', 'xlsx'].includes(ext)) {
      setError('Sólo se admiten archivos .csv, .xls o .xlsx.');
      return;
    }
    setFile(f);
    setPreview(null);
    setResult(null);
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await apiClient.fetchBlob('/api/operations/assets/import/template');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla-equipos.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar la plantilla.');
    }
  };

  const goToPreview = async () => {
    if (!file) return;
    setError(null);
    setPreviewLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiClient.uploadFile<PreviewResponse>(
        '/api/operations/assets/import/preview',
        fd,
      );
      setPreview(res);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo procesar el archivo.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const doImport = async () => {
    if (!file) return;
    setError(null);
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('skipDuplicates', String(skipDuplicates));
      if (createAsDraft) fd.append('defaultStatus', 'OUT_OF_SERVICE');
      const res = await apiClient.uploadFile<ImportResponse>('/api/operations/assets/import', fd);
      setResult(res);
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la importación.');
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setSkipDuplicates(true);
    setCreateAsDraft(false);
  };

  const finishAndClose = () => {
    onImported();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-card)] z-10">
          <div>
            <h3
              className="text-[var(--text-primary)]"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
                fontSize: 16,
              }}
            >
              Importar equipos
            </h3>
            <StepDots step={step} />
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {step === 'upload' && (
            <UploadStep
              file={file}
              dragOver={dragOver}
              setDragOver={setDragOver}
              fileInputRef={fileInputRef}
              onFile={handleFile}
              onDownloadTemplate={handleDownloadTemplate}
            />
          )}

          {step === 'preview' && preview && (
            <PreviewStep
              preview={preview}
              skipDuplicates={skipDuplicates}
              setSkipDuplicates={setSkipDuplicates}
              createAsDraft={createAsDraft}
              setCreateAsDraft={setCreateAsDraft}
            />
          )}

          {step === 'result' && result && <ResultStep result={result} />}

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200 flex items-start gap-2">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[var(--border-color)] sticky bottom-0 bg-[var(--bg-card)]">
          {step === 'upload' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
              >
                Cancelar
              </button>
              <button
                onClick={goToPreview}
                disabled={!file || previewLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
                style={{
                  background: '#1C1C1E',
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                }}
              >
                {previewLoading ? 'Procesando...' : 'Siguiente: Vista previa'}
                <ArrowRight size={14} />
              </button>
            </>
          )}

          {step === 'preview' && preview && (
            <>
              <button
                onClick={() => setStep('upload')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
              >
                <ArrowLeft size={14} /> Atrás
              </button>
              <button
                onClick={doImport}
                disabled={importing || preview.validRows === 0}
                className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
                style={{
                  background: '#1C1C1E',
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                }}
              >
                {importing
                  ? 'Importando...'
                  : `Importar ${preview.validRows} ${preview.validRows === 1 ? 'equipo' : 'equipos'} válidos`}
              </button>
            </>
          )}

          {step === 'result' && (
            <>
              <button
                onClick={reset}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
              >
                Importar más
              </button>
              <button
                onClick={finishAndClose}
                className="px-4 py-2 text-sm text-white rounded-full"
                style={{
                  background: '#1C1C1E',
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                }}
              >
                Ver equipos
              </button>
            </>
          )}
        </div>
      </div>

      <style jsx global>{`
        .iw-summary-card {
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid var(--border-color);
          background: var(--input-bg);
          flex: 1;
          min-width: 130px;
        }
        .iw-summary-card__label {
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }
        .iw-summary-card__value {
          font-family: var(--font-outfit), sans-serif;
          font-weight: 600;
          font-size: 22px;
          margin-top: 2px;
        }
        .iw-table {
          width: 100%;
          border-collapse: collapse;
        }
        .iw-table th {
          text-align: left;
          padding: 8px 10px;
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-secondary);
          font-weight: 500;
          background: var(--input-bg);
          border-bottom: 1px solid var(--border-color);
        }
        .iw-table td {
          padding: 8px 10px;
          border-bottom: 1px solid var(--border-color);
          font-size: 13px;
          color: var(--text-primary);
          vertical-align: top;
        }
        .iw-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 999px;
          font-family: var(--font-jetbrains-mono), monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
      `}</style>
    </div>
  );
}

/* ====================================================================== */

function StepDots({ step }: { step: Step }) {
  const order: Step[] = ['upload', 'preview', 'result'];
  const idx = order.indexOf(step);
  return (
    <div className="flex items-center gap-1 mt-1">
      {order.map((s, i) => (
        <span
          key={s}
          style={{
            width: i === idx ? 18 : 6,
            height: 6,
            borderRadius: 999,
            background: i <= idx ? '#2563eb' : 'var(--border-color)',
            transition: 'all 200ms ease',
          }}
        />
      ))}
      <span
        className="ml-2 text-[var(--text-secondary)]"
        style={{
          fontFamily: 'var(--font-ibm-plex-mono), monospace',
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        Paso {idx + 1} de 3
      </span>
    </div>
  );
}

function UploadStep({
  file,
  dragOver,
  setDragOver,
  fileInputRef,
  onFile,
  onDownloadTemplate,
}: {
  file: File | null;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onFile: (f: File | null) => void;
  onDownloadTemplate: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]" style={{ lineHeight: 1.5 }}>
        Carga masivamente equipos desde un archivo CSV o Excel. La primera fila debe contener los
        nombres de las columnas. Tipos, subtipos y ubicaciones se reconocen por nombre, así que
        configúralos antes de importar.
      </p>

      <button
        type="button"
        onClick={onDownloadTemplate}
        className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
      >
        <Download size={14} /> Descargar plantilla
      </button>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        onClick={() => fileInputRef.current?.click()}
        className="cursor-pointer"
        style={{
          border: '2px dashed',
          borderColor: dragOver ? '#2563eb' : 'var(--border-color)',
          borderRadius: 12,
          padding: 32,
          textAlign: 'center',
          background: dragOver ? 'rgba(37, 99, 235, 0.04)' : 'var(--input-bg)',
          transition: 'all 150ms ease',
        }}
      >
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileSpreadsheet size={28} style={{ color: '#2563eb' }} />
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 600,
                  fontSize: 14,
                  color: 'var(--text-primary)',
                }}
              >
                {file.name}
              </div>
              <div
                className="text-[var(--text-muted)] mt-0.5"
                style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 11,
                }}
              >
                {(file.size / 1024).toFixed(1)} KB
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFile(null);
              }}
              className="ml-3 p-1 rounded hover:bg-gray-100 text-[var(--text-secondary)]"
              aria-label="Quitar archivo"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <>
            <Upload size={28} style={{ margin: '0 auto 8px', color: '#94a3b8' }} />
            <p
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                fontSize: 14,
                color: 'var(--text-primary)',
              }}
            >
              Arrastra tu archivo aquí o haz clic para seleccionar
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              .csv, .xls, .xlsx · máx 5 MB · hasta 1000 filas
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
}

function PreviewStep({
  preview,
  skipDuplicates,
  setSkipDuplicates,
  createAsDraft,
  setCreateAsDraft,
}: {
  preview: PreviewResponse;
  skipDuplicates: boolean;
  setSkipDuplicates: (v: boolean) => void;
  createAsDraft: boolean;
  setCreateAsDraft: (v: boolean) => void;
}) {
  /* Cap the rendered list at 200 rows to keep the modal performant — the
     summary still reflects the full counts. */
  const displayRows = preview.rows.slice(0, 200);
  const truncated = preview.rows.length > displayRows.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <SummaryCard label="Total" value={preview.totalRows} color="#475569" />
        <SummaryCard label="Válidas" value={preview.validRows} color="#15803d" />
        <SummaryCard label="Con errores" value={preview.invalidRows} color="#b91c1c" />
        {preview.duplicateRows > 0 && (
          <SummaryCard label="Duplicadas" value={preview.duplicateRows} color="#a16207" />
        )}
      </div>

      <div className="space-y-2">
        <ToggleRow
          checked={skipDuplicates}
          onChange={setSkipDuplicates}
          label="Omitir duplicados"
          description="Si está activo, los códigos que ya existen en el sistema se omiten. De lo contrario, se actualizan con los datos del archivo."
        />
        <ToggleRow
          checked={createAsDraft}
          onChange={setCreateAsDraft}
          label="Crear como Fuera de servicio"
          description="Los nuevos equipos quedan en estado FUERA_DE_SERVICIO en vez de OPERATIONAL. Útil para revisar antes de activar."
        />
      </div>

      <div
        className="rounded-lg border border-[var(--border-color)] overflow-hidden"
        style={{ maxHeight: 320, overflowY: 'auto' }}
      >
        <table className="iw-table">
          <thead>
            <tr>
              <th style={{ width: 56 }}>Fila</th>
              <th style={{ width: 60 }}>Estado</th>
              <th>Código</th>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Errores</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => (
              <tr key={row.rowNumber}>
                <td
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                  }}
                >
                  {row.rowNumber}
                </td>
                <td>
                  <RowStatusPill row={row} />
                </td>
                <td
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  {row.data.code || '—'}
                </td>
                <td
                  style={{
                    fontFamily: 'var(--font-outfit), sans-serif',
                  }}
                >
                  {row.data.name || '—'}
                </td>
                <td className="text-[var(--text-secondary)]">
                  {row.data.assetTypeName || '—'}
                  {row.data.subtypeName ? ` · ${row.data.subtypeName}` : ''}
                </td>
                <td>
                  {row.errors.length === 0 ? (
                    <span className="text-[var(--text-muted)]">—</span>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {row.errors.map((e, i) => (
                        <li
                          key={i}
                          className="text-red-600"
                          style={{ fontSize: 12, lineHeight: 1.4 }}
                        >
                          {e.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {truncated && (
          <div
            className="text-xs text-[var(--text-muted)] text-center"
            style={{ padding: '8px 12px', borderTop: '1px solid var(--border-color)' }}
          >
            Mostrando las primeras 200 filas. La importación procesará todas las filas válidas del
            archivo.
          </div>
        )}
      </div>
    </div>
  );
}

function ResultStep({ result }: { result: ImportResponse }) {
  const total = result.imported + result.updated;
  return (
    <div className="space-y-4">
      <div
        style={{
          padding: 24,
          borderRadius: 12,
          background: 'rgba(34, 197, 94, 0.08)',
          border: '1px solid rgba(34, 197, 94, 0.2)',
          textAlign: 'center',
        }}
      >
        <CheckCircle2 size={36} style={{ margin: '0 auto 8px', color: '#16a34a' }} />
        <h4
          style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 600,
            fontSize: 18,
            color: 'var(--text-primary)',
            margin: '0 0 4px',
          }}
        >
          Importación completada
        </h4>
        <p className="text-sm text-[var(--text-secondary)]">
          {result.imported} {result.imported === 1 ? 'equipo creado' : 'equipos creados'}
          {result.updated > 0 ? ` · ${result.updated} actualizados` : ''}
          {result.skipped > 0 ? ` · ${result.skipped} omitidos` : ''}
          {result.errors > 0 ? ` · ${result.errors} con errores` : ''}
        </p>
      </div>

      {total > 0 && (
        <div
          className="rounded-lg border border-[var(--border-color)] overflow-hidden"
          style={{ maxHeight: 280, overflowY: 'auto' }}
        >
          <table className="iw-table">
            <thead>
              <tr>
                <th style={{ width: 140 }}>Código</th>
                <th>Nombre</th>
              </tr>
            </thead>
            <tbody>
              {result.assets.map((a) => (
                <tr key={a.id}>
                  <td
                    style={{
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                      fontWeight: 600,
                      fontSize: 12,
                    }}
                  >
                    {a.code}
                  </td>
                  <td style={{ fontFamily: 'var(--font-outfit), sans-serif' }}>{a.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="iw-summary-card">
      <div className="iw-summary-card__label">{label}</div>
      <div className="iw-summary-card__value" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function ToggleRow({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-[var(--border-color)] hover:bg-[var(--input-bg)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <div className="flex-1">
        <div
          className="text-sm text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
        >
          {label}
        </div>
        <div className="text-xs text-[var(--text-muted)] mt-0.5" style={{ lineHeight: 1.5 }}>
          {description}
        </div>
      </div>
    </label>
  );
}

function RowStatusPill({ row }: { row: PreviewRow }) {
  if (!row.isValid) {
    return (
      <span
        className="iw-status-pill"
        style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#b91c1c' }}
        title="Con errores"
      >
        ✗
      </span>
    );
  }
  if (row.isDuplicate) {
    return (
      <span
        className="iw-status-pill"
        style={{ background: 'rgba(234, 179, 8, 0.14)', color: '#a16207' }}
        title="Código ya existe"
      >
        ⚠
      </span>
    );
  }
  return (
    <span
      className="iw-status-pill"
      style={{ background: 'rgba(34, 197, 94, 0.12)', color: '#15803d' }}
      title="Válida"
    >
      ✓
    </span>
  );
}

export default AssetImportWizard;
