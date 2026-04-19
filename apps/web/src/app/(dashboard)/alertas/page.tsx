'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  RefreshCw,
  ChevronDown,
  CheckCircle,
} from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { AlertCard } from '../../../components/alerts/AlertCard';
import { formatCLP } from '../../../lib/formatters';

interface Alert {
  id: string;
  type: string;
  severity: string;
  status: string;
  title: string;
  message: string;
  createdAt: string;
}

interface Thresholds {
  lowCashThreshold: string;
  commitmentDaysWarning: number;
  commitmentDaysCritical: number;
}

export default function AlertasPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const [cashThreshold, setCashThreshold] = useState('');
  const [daysWarning, setDaysWarning] = useState('');
  const [daysCritical, setDaysCritical] = useState('');

  const reloadRef = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [alertsList, th] = await Promise.all([
        apiClient.get<Alert[]>('/api/alerts'),
        apiClient.get<Thresholds>('/api/alerts/thresholds'),
      ]);
      setAlerts(alertsList);
      setThresholds(th);
      setCashThreshold(String(Number(th.lowCashThreshold)));
      setDaysWarning(String(th.commitmentDaysWarning));
      setDaysCritical(String(th.commitmentDaysCritical));
    } catch {
      // handled by apiClient
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  reloadRef.current = load;

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await apiClient.post('/api/alerts/generate');
      reloadRef.current?.();
    } catch {
      // handled
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDismiss = async (id: string) => {
    await apiClient.patch(`/api/alerts/${id}/dismiss`);
    reloadRef.current?.();
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      await apiClient.patch('/api/alerts/thresholds', {
        lowCashThreshold: Number(cashThreshold),
        commitmentDaysWarning: Number(daysWarning),
        commitmentDaysCritical: Number(daysCritical),
      });
      reloadRef.current?.();
    } catch {
      // handled
    } finally {
      setIsSavingConfig(false);
    }
  };

  const criticalAlerts = alerts.filter((a) => a.severity === 'CRITICAL');
  const warningAlerts = alerts.filter((a) => a.severity === 'WARNING');
  const infoAlerts = alerts.filter((a) => a.severity === 'INFO');

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Alertas</h1>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
        >
          <RefreshCw size={16} className={isGenerating ? 'animate-spin' : ''} />
          {isGenerating ? 'Generando...' : 'Generar Alertas'}
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3 mb-6">
        {criticalAlerts.length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
            <AlertCircle size={12} />
            {criticalAlerts.length} alerta{criticalAlerts.length > 1 ? 's' : ''} crítica
            {criticalAlerts.length > 1 ? 's' : ''}
          </span>
        )}
        {warningAlerts.length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 border border-yellow-200">
            <AlertTriangle size={12} />
            {warningAlerts.length} advertencia{warningAlerts.length > 1 ? 's' : ''}
          </span>
        )}
        {infoAlerts.length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
            <Info size={12} />
            {infoAlerts.length} informativa{infoAlerts.length > 1 ? 's' : ''}
          </span>
        )}
        {alerts.length === 0 && !isLoading && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
            <CheckCircle size={12} />
            Sin alertas activas
          </span>
        )}
      </div>

      {/* Alerts list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-48 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-72" />
            </div>
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <CheckCircle size={40} className="mx-auto text-green-400 mb-3" />
          <p className="text-gray-500 font-medium">No hay alertas activas</p>
          <p className="text-gray-400 text-sm mt-1">
            Presiona &ldquo;Generar Alertas&rdquo; para verificar el estado
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...criticalAlerts, ...warningAlerts, ...infoAlerts].map((alert) => (
            <AlertCard key={alert.id} alert={alert} onDismiss={handleDismiss} />
          ))}
        </div>
      )}

      {/* Threshold configuration */}
      <div className="mt-8">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition"
        >
          <ChevronDown size={16} className={`transition ${showConfig ? 'rotate-180' : ''}`} />
          Configurar umbrales de alerta
        </button>

        {showConfig && thresholds && (
          <div className="mt-4 bg-white border border-gray-200 rounded-xl p-6 max-w-lg space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Saldo mínimo de alerta
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={cashThreshold}
                  onChange={(e) => setCashThreshold(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
                />
                <span className="text-xs text-gray-400">
                  Actual: {formatCLP(thresholds.lowCashThreshold)}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Días advertencia (vencimiento)
                </label>
                <input
                  type="number"
                  value={daysWarning}
                  onChange={(e) => setDaysWarning(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Días críticos (vencimiento)
                </label>
                <input
                  type="number"
                  value={daysCritical}
                  onChange={(e) => setDaysCritical(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
                />
              </div>
            </div>
            <button
              onClick={handleSaveConfig}
              disabled={isSavingConfig}
              className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 transition"
            >
              {isSavingConfig ? 'Guardando...' : 'Guardar umbrales'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
