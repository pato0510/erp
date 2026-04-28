'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { apiClient } from '../../lib/api';

interface Props {
  vehicleId: string;
  licensePlate: string;
  vehicleName: string;
  currentKilometers: number;
  onClose: () => void;
  onSaved: () => void;
}

const fmt = new Intl.NumberFormat('es-CL');

export function KilometersUpdateModal({
  vehicleId,
  licensePlate,
  vehicleName,
  currentKilometers,
  onClose,
  onSaved,
}: Props) {
  const [value, setValue] = useState<string>(String(currentKilometers));
  const [readingDate, setReadingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const km = Number(value.replace(/\./g, '').replace(/,/g, ''));
    if (!Number.isFinite(km) || !Number.isInteger(km) || km < 0) {
      return setError('El kilometraje debe ser un número entero ≥ 0.');
    }
    if (km < currentKilometers) {
      return setError(
        `El nuevo valor (${fmt.format(km)} km) es menor al actual (${fmt.format(currentKilometers)} km).`,
      );
    }
    setSubmitting(true);
    try {
      await apiClient.patch(`/api/operations/fleet/vehicles/${vehicleId}/kilometers`, {
        kilometers: km,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el kilometraje.');
    } finally {
      setSubmitting(false);
    }
  };

  const previewKm = (() => {
    const n = Number(value.replace(/\./g, '').replace(/,/g, ''));
    return Number.isFinite(n) && n >= 0 ? n : null;
  })();

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)]">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            Actualizar kilometraje
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-1">Vehículo</p>
            <p
              className="text-[var(--text-primary)]"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontWeight: 600,
                  marginRight: 8,
                }}
              >
                {licensePlate}
              </span>
              {vehicleName}
            </p>
          </div>

          <div>
            <p className="text-xs text-[var(--text-muted)] mb-1">Kilometraje actual</p>
            <p
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              {fmt.format(currentKilometers)} km
            </p>
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
              Nuevo kilometraje <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={currentKilometers}
              step={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              className="cp-input"
              style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
            />
            {previewKm != null && previewKm >= currentKilometers && (
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Diferencia: +{fmt.format(previewKm - currentKilometers)} km
              </p>
            )}
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
              Fecha de lectura
            </label>
            <input
              type="date"
              value={readingDate}
              onChange={(e) => setReadingDate(e.target.value)}
              className="cp-input"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            {submitting ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default KilometersUpdateModal;
