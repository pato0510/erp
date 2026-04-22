'use client';

import { useRef, useState } from 'react';
import { Eye, EyeOff, FileUp, X } from 'lucide-react';
import { apiClient } from '../../lib/api';

const ACCEPTED_EXTENSIONS = ['pfx', 'p12'];
const MAX_BYTES = 1 * 1024 * 1024;

interface TestResult {
  isActive: boolean;
  message: string;
}

interface SiiConnectionModalProps {
  initialRut?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function SiiConnectionModal({
  initialRut = '77.004.647-5',
  onClose,
  onSaved,
}: SiiConnectionModalProps) {
  const [rut, setRut] = useState(initialRut);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSetFile = (f: File | null): string | null => {
    if (!f) return 'Selecciona un archivo';
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!ext || !ACCEPTED_EXTENSIONS.includes(ext)) {
      return `Solo se aceptan archivos .${ACCEPTED_EXTENSIONS.join(' / .')}`;
    }
    if (f.size > MAX_BYTES) return 'El certificado no puede superar 1MB';
    setFile(f);
    return null;
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const errMsg = validateAndSetFile(e.dataTransfer.files?.[0] ?? null);
    if (errMsg) setError(errMsg);
    else setError('');
  };

  const handleSubmit = async () => {
    setError('');
    setTestResult(null);
    if (!file) {
      setError('Selecciona tu certificado .pfx');
      return;
    }
    if (!password) {
      setError('Ingresa la contraseña del certificado');
      return;
    }
    if (!rut.trim()) {
      setError('El RUT es requerido');
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('password', password);
      form.append('rut', rut.trim());
      await apiClient.uploadFile('/api/sii/connection/certificate', form);

      const test = await apiClient.post<TestResult>('/api/sii/connection/test');
      setTestResult(test);

      if (test.isActive) {
        // Give the user a beat to read the success message, then close.
        setTimeout(() => {
          onSaved();
        }, 900);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la conexión');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)]">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Conexión SII</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label
              className="block mb-1.5 text-[var(--text-secondary)]"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                fontSize: 13,
              }}
            >
              RUT de empresa <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={rut}
              onChange={(e) => setRut(e.target.value)}
              placeholder="77.004.647-5"
              className="sii-input"
            />
          </div>

          <div>
            <label
              className="block mb-1.5 text-[var(--text-secondary)]"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                fontSize: 13,
              }}
            >
              Certificado digital (.pfx) <span className="text-red-500">*</span>
            </label>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg px-5 py-6 text-center cursor-pointer transition ${
                dragActive
                  ? 'border-blue-500 bg-blue-50'
                  : file
                    ? 'border-green-400 bg-green-50'
                    : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              <FileUp
                size={24}
                className={`mx-auto mb-2 ${file ? 'text-green-600' : 'text-[var(--text-muted)]'}`}
              />
              {file ? (
                <>
                  <p className="text-sm text-[var(--text-primary)] font-medium truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {(file.size / 1024).toFixed(1)} KB · haz click para cambiarlo
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Arrastra tu .pfx aquí o haz click para elegirlo
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">Máximo 1MB</p>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".pfx,.p12"
                className="hidden"
                onChange={(e) => {
                  const errMsg = validateAndSetFile(e.target.files?.[0] ?? null);
                  if (errMsg) setError(errMsg);
                  else setError('');
                }}
              />
            </div>
          </div>

          <div>
            <label
              className="block mb-1.5 text-[var(--text-secondary)]"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                fontSize: 13,
              }}
            >
              Contraseña del certificado <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="sii-input pr-10"
                placeholder="••••••••"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-2.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                aria-label={showPassword ? 'Ocultar' : 'Mostrar'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg border border-red-200">
              {error}
            </div>
          )}

          {testResult && (
            <div
              className={`text-sm px-3 py-2 rounded-lg border ${
                testResult.isActive
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
            >
              {testResult.isActive ? '✓ ' : '✗ '}
              {testResult.message}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)]">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            {submitting ? 'Guardando...' : 'Guardar y probar conexión'}
          </button>
        </div>
      </div>

      <style jsx global>{`
        .sii-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-family: var(--font-outfit), sans-serif;
          font-size: 14px;
          color: var(--text-primary);
          background: var(--input-bg);
          outline: none;
          transition:
            border-color 120ms ease,
            box-shadow 120ms ease;
        }
        .sii-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
      `}</style>
    </div>
  );
}
