'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { downloadFile } from '../../../lib/download';
import { PeriodSelector } from '../../../components/shared/PeriodSelector';
import { formatCLP } from '../../../lib/formatters';

interface ExecutiveSummary {
  company: { name: string; taxId: string; period: string };
  cash: { total: number; free: number; committed: number; opening: number };
  movements: { income: number; expense: number; balance: number; count: number };
  topCategories: { name: string; total: number; percentage: number }[];
  commitments: { total: number; totalAmount: number };
  alerts: { critical: number; warning: number; info: number };
  generatedAt: string;
}

export default function ReportesPage() {
  const [movPeriodId, setMovPeriodId] = useState('');
  const [cashPeriodId, setCashPeriodId] = useState('');
  const [summaryPeriodId, setSummaryPeriodId] = useState('');
  const [isExportingMov, setIsExportingMov] = useState(false);
  const [isExportingCash, setIsExportingCash] = useState(false);
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  const handleExportMovements = async () => {
    setIsExportingMov(true);
    try {
      const params = movPeriodId ? `?fiscalPeriodId=${movPeriodId}` : '';
      const date = new Date().toISOString().split('T')[0];
      await downloadFile(`/api/reports/movements/export${params}`, `movimientos-${date}.xlsx`);
    } catch {
      // handled
    } finally {
      setIsExportingMov(false);
    }
  };

  const handleExportCashflow = async () => {
    if (!cashPeriodId) return;
    setIsExportingCash(true);
    try {
      const date = new Date().toISOString().split('T')[0];
      await downloadFile(
        `/api/reports/cashflow/export?fiscalPeriodId=${cashPeriodId}`,
        `caja-${date}.xlsx`,
      );
    } catch {
      // handled
    } finally {
      setIsExportingCash(false);
    }
  };

  const handleLoadSummary = useCallback(async () => {
    setIsLoadingSummary(true);
    try {
      const params = summaryPeriodId ? `?fiscalPeriodId=${summaryPeriodId}` : '';
      const data = await apiClient.get<ExecutiveSummary>(`/api/reports/executive-summary${params}`);
      setSummary(data);
    } catch {
      // handled
    } finally {
      setIsLoadingSummary(false);
    }
  }, [summaryPeriodId]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Reportes y Exportaciones</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Export Movements */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileSpreadsheet size={20} className="text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Movimientos</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Exporta todos los movimientos con categorías, contrapartes y montos.
          </p>
          <div className="space-y-3">
            <PeriodSelector value={movPeriodId} onChange={setMovPeriodId} />
            <button
              onClick={handleExportMovements}
              disabled={isExportingMov}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-medium"
            >
              <Download size={16} />
              {isExportingMov ? 'Exportando...' : 'Exportar Excel'}
            </button>
          </div>
        </div>

        {/* Export Cashflow */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <FileSpreadsheet size={20} className="text-green-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Caja y Tesorería</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Exporta posición de caja, compromisos y cuentas bancarias.
          </p>
          <div className="space-y-3">
            <PeriodSelector value={cashPeriodId} onChange={setCashPeriodId} />
            <button
              onClick={handleExportCashflow}
              disabled={isExportingCash || !cashPeriodId}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition font-medium"
            >
              <Download size={16} />
              {isExportingCash ? 'Exportando...' : 'Exportar Excel'}
            </button>
          </div>
        </div>

        {/* Executive Summary */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <FileText size={20} className="text-purple-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Resumen Ejecutivo</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Genera un resumen imprimible con todos los KPIs del período.
          </p>
          <div className="space-y-3">
            <PeriodSelector value={summaryPeriodId} onChange={setSummaryPeriodId} />
            <button
              onClick={handleLoadSummary}
              disabled={isLoadingSummary}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition font-medium"
            >
              <FileText size={16} />
              {isLoadingSummary ? 'Generando...' : 'Ver Resumen'}
            </button>
          </div>
        </div>
      </div>

      {/* Executive Summary Display */}
      {summary && (
        <div
          id="executive-summary"
          className="bg-white border border-gray-200 rounded-xl shadow-sm print:shadow-none print:border-0"
        >
          <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between print:border-b-2">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{summary.company.name}</h2>
              <p className="text-sm text-gray-500">
                RUT: {summary.company.taxId} · Período: {summary.company.period}
              </p>
            </div>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition print:hidden"
            >
              <Printer size={16} /> Imprimir
            </button>
          </div>

          <div className="p-8 space-y-8">
            {/* Cash KPIs */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Posición de Caja
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Caja Total', value: summary.cash.total, color: 'text-green-700' },
                  { label: 'Caja Libre', value: summary.cash.free, color: 'text-blue-700' },
                  {
                    label: 'Comprometido',
                    value: summary.cash.committed,
                    color: 'text-orange-700',
                  },
                  { label: 'Apertura', value: summary.cash.opening, color: 'text-gray-700' },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{kpi.label}</p>
                    <p className={`text-lg font-bold ${kpi.color}`}>{formatCLP(kpi.value)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Movements */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Movimientos del Período
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-xs text-green-600">Ingresos</p>
                  <p className="text-lg font-bold text-green-700">
                    {formatCLP(summary.movements.income)}
                  </p>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-xs text-red-600">Egresos</p>
                  <p className="text-lg font-bold text-red-700">
                    {formatCLP(summary.movements.expense)}
                  </p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs text-blue-600">Balance</p>
                  <p className="text-lg font-bold text-blue-700">
                    {formatCLP(summary.movements.balance)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Confirmados</p>
                  <p className="text-lg font-bold text-gray-700">{summary.movements.count}</p>
                </div>
              </div>
            </div>

            {/* Top Categories */}
            {summary.topCategories.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Principales Categorías de Gasto
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 font-medium text-gray-500">Categoría</th>
                      <th className="text-right py-2 font-medium text-gray-500">Monto</th>
                      <th className="text-right py-2 font-medium text-gray-500">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.topCategories.map((cat) => (
                      <tr key={cat.name} className="border-b border-gray-100">
                        <td className="py-2 text-gray-900">{cat.name}</td>
                        <td className="py-2 text-right text-gray-700">{formatCLP(cat.total)}</td>
                        <td className="py-2 text-right text-gray-500">{cat.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer */}
            <div className="text-xs text-gray-400 pt-4 border-t border-gray-100">
              Generado el {new Date(summary.generatedAt).toLocaleString('es-CL')} · Excelsia ERP
            </div>
          </div>
        </div>
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          aside,
          nav,
          header,
          .print\\:hidden {
            display: none !important;
          }
          main {
            padding: 0 !important;
          }
          body {
            background: white !important;
          }
          #executive-summary {
            border: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}
