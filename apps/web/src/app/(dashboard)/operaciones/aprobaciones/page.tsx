'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileCheck,
  HardHat,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { Toast } from '../../../../components/shared/Toast';

type Source = 'all' | 'work-permit' | 'external-permit';

interface PendingItem {
  id: string;
  kind: 'work-permit' | 'external-permit';
  permitId: string;
  permitNumber: string;
  title: string;
  stepOrder: number;
  stepName: string;
  currentApprovalStep: number;
  totalApprovalSteps: number;
  requestedBy: string;
  createdAt: string;
  permitType: { code: string; name: string; color: string | null; category: string };
}

interface CountsResponse {
  mine: number;
  pendingCompany: number;
  approvedTodayByUser: number;
}

const REFRESH_MS = 60_000;

export default function AprobacionesPage() {
  const [counts, setCounts] = useState<CountsResponse | null>(null);
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<Source>('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [stepFilter, setStepFilter] = useState<string>('');
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  const [working, setWorking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (source !== 'all') params.set('source', source);
      const [c, pending] = await Promise.all([
        apiClient.get<CountsResponse>('/api/operations/permit-approvals/pending-counts'),
        apiClient.get<{ items: PendingItem[] }>(
          `/api/operations/permit-approvals/pending${
            params.toString() ? `?${params.toString()}` : ''
          }`,
        ),
      ]);
      setCounts(c);
      setItems(pending.items);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error cargando aprobaciones.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    load();
  }, [load]);

  /* Auto-refresh every minute so the queue stays current without
     forcing the user to reload. We pause when a bulk action is in
     flight to avoid racey UI transitions. */
  useEffect(() => {
    if (working) return;
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load, working]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (typeFilter && it.permitType.code !== typeFilter) return false;
      if (stepFilter && String(it.stepOrder) !== stepFilter) return false;
      return true;
    });
  }, [items, typeFilter, stepFilter]);

  const uniqueTypes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const it of items) {
      seen.set(it.permitType.code, it.permitType.name);
    }
    return [...seen.entries()].map(([code, name]) => ({ code, name }));
  }, [items]);

  const uniqueSteps = useMemo(() => {
    const set = new Set(items.map((it) => it.stepOrder));
    return [...set].sort((a, b) => a - b);
  }, [items]);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleApprove = async (item: PendingItem) => {
    setWorking(true);
    try {
      await apiClient.post(
        `/api/operations/permit-approvals/permit/${item.permitId}/approve?kind=${item.kind}`,
        { stepOrder: item.stepOrder },
      );
      setToast({
        message: `Paso ${item.stepOrder} aprobado para ${item.permitNumber}.`,
        type: 'success',
      });
      setSelected((p) => {
        const n = new Set(p);
        n.delete(item.id);
        return n;
      });
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo aprobar.',
        type: 'error',
      });
    } finally {
      setWorking(false);
    }
  };

  const handleReject = async (item: PendingItem) => {
    const reason = window.prompt(
      `Motivo del rechazo del paso ${item.stepOrder} (${item.stepName}). Mínimo 10 caracteres:`,
    );
    if (!reason) return;
    if (reason.trim().length < 10) {
      setToast({ message: 'El motivo debe tener al menos 10 caracteres.', type: 'error' });
      return;
    }
    setWorking(true);
    try {
      await apiClient.post(
        `/api/operations/permit-approvals/permit/${item.permitId}/reject?kind=${item.kind}`,
        { stepOrder: item.stepOrder, notes: reason.trim() },
      );
      setToast({ message: `Paso rechazado para ${item.permitNumber}.`, type: 'info' });
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo rechazar.',
        type: 'error',
      });
    } finally {
      setWorking(false);
    }
  };

  /* Bulk approve runs sequentially so a partial failure leaves a
     useful diff in the queue (the failed items stay PENDING). */
  const handleBulkApprove = async () => {
    setBulkConfirmOpen(false);
    setWorking(true);
    let ok = 0;
    let fail = 0;
    for (const id of selected) {
      const item = items.find((i) => i.id === id);
      if (!item) continue;
      try {
        await apiClient.post(
          `/api/operations/permit-approvals/permit/${item.permitId}/approve?kind=${item.kind}`,
          { stepOrder: item.stepOrder },
        );
        ok++;
      } catch {
        fail++;
      }
    }
    setSelected(new Set());
    setToast({
      message: fail === 0 ? `${ok} pasos aprobados.` : `${ok} aprobados, ${fail} con error.`,
      type: fail === 0 ? 'success' : 'info',
    });
    setWorking(false);
    load();
  };

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-6">
        <div
          className="text-xs uppercase tracking-wider text-[var(--text-secondary)]"
          style={{
            fontFamily: 'var(--font-ibm-plex-mono), monospace',
            letterSpacing: '0.18em',
            marginBottom: 14,
          }}
        >
          Operaciones / Aprobaciones
        </div>
        <h1
          className="text-[var(--text-primary)]"
          style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 600,
            fontSize: 28,
            letterSpacing: '-0.01em',
            margin: '0 0 8px',
          }}
        >
          Aprobaciones pendientes
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-ibm-plex-mono), monospace',
            fontSize: 11,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
          }}
        >
          Permisos y autorizaciones esperando tu revisión
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <KpiCard
          label="Esperando mi aprobación"
          value={counts?.mine ?? 0}
          icon={ClipboardCheck}
          color="#F97316"
        />
        <KpiCard
          label="Pendientes (todas)"
          value={counts?.pendingCompany ?? 0}
          icon={ClipboardList}
          color="#64748B"
        />
        <KpiCard
          label="Aprobadas hoy por mí"
          value={counts?.approvedTodayByUser ?? 0}
          icon={CheckCircle2}
          color="#22C55E"
        />
      </div>

      {/* Filters */}
      <div
        className="flex flex-wrap items-end gap-2 p-3 mb-4 rounded-xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
      >
        <div>
          <label className="text-xs text-[var(--text-secondary)]">Origen</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as Source)}
            className="cp-input"
            style={{ minWidth: 160 }}
          >
            <option value="all">Todos</option>
            <option value="work-permit">Permisos de trabajo</option>
            <option value="external-permit">Permisos externos</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)]">Tipo</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="cp-input"
            style={{ minWidth: 200 }}
          >
            <option value="">Todos</option>
            {uniqueTypes.map((t) => (
              <option key={t.code} value={t.code}>
                {t.code} · {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)]">Paso</label>
          <select
            value={stepFilter}
            onChange={(e) => setStepFilter(e.target.value)}
            className="cp-input"
          >
            <option value="">Todos</option>
            {uniqueSteps.map((s) => (
              <option key={s} value={String(s)}>
                Paso {s}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1 px-3 py-2 text-xs rounded-full border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={12} /> Actualizar
          </button>
          {selected.size > 0 && (
            <button
              onClick={() => setBulkConfirmOpen(true)}
              disabled={working}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs rounded-full text-white"
              style={{ background: '#22C55E', fontWeight: 600 }}
            >
              <CheckCircle2 size={12} /> Aprobar seleccionados ({selected.size})
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
      >
        {loading ? (
          <div className="p-10 text-center text-[var(--text-secondary)]">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-[var(--text-secondary)]">
            <ClipboardCheck size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="font-medium">Nada por aprobar 🎉</p>
            <p className="text-sm mt-1">
              Cuando alguien envíe un permiso para tu autorización, aparecerá aquí.
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <Th width={40}>
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={(e) =>
                      e.target.checked
                        ? setSelected(new Set(filtered.map((i) => i.id)))
                        : setSelected(new Set())
                    }
                  />
                </Th>
                <Th>Origen</Th>
                <Th>N° permiso · Título</Th>
                <Th>Tipo</Th>
                <Th>Paso</Th>
                <Th>Solicitado</Th>
                <Th align="right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
                const Icon = it.kind === 'work-permit' ? HardHat : FileCheck;
                const linkHref =
                  it.kind === 'work-permit'
                    ? `/operaciones/permisos/trabajo/${it.permitId}`
                    : `/operaciones/permisos`;
                return (
                  <tr key={it.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <Td>
                      <input
                        type="checkbox"
                        checked={selected.has(it.id)}
                        onChange={() => toggleSelected(it.id)}
                      />
                    </Td>
                    <Td>
                      <span
                        className="inline-flex items-center gap-1 text-xs"
                        style={{
                          color: it.kind === 'work-permit' ? '#F97316' : '#1d4ed8',
                          fontFamily: 'var(--font-outfit), sans-serif',
                          fontWeight: 600,
                        }}
                      >
                        <Icon size={13} /> {it.kind === 'work-permit' ? 'PT trabajo' : 'Externo'}
                      </span>
                    </Td>
                    <Td>
                      <Link
                        href={linkHref}
                        className="text-blue-600 hover:underline"
                        style={{
                          fontFamily: 'var(--font-jetbrains-mono), monospace',
                          fontSize: 12,
                        }}
                      >
                        {it.permitNumber}
                      </Link>
                      <div
                        className="text-[var(--text-primary)]"
                        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
                      >
                        {it.title}
                      </div>
                    </Td>
                    <Td>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                        style={{
                          background: it.permitType.color
                            ? `${it.permitType.color}22`
                            : 'rgba(100, 116, 139, 0.14)',
                          color: it.permitType.color ?? '#475569',
                          fontFamily: 'var(--font-jetbrains-mono), monospace',
                          fontWeight: 600,
                        }}
                      >
                        {it.permitType.code}
                      </span>
                    </Td>
                    <Td>
                      <span
                        style={{
                          fontFamily: 'var(--font-outfit), sans-serif',
                          fontWeight: 500,
                          fontSize: 13,
                        }}
                      >
                        Paso {it.stepOrder} de {it.totalApprovalSteps}: {it.stepName}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {formatRelative(it.createdAt)}
                      </span>
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleApprove(it)}
                          disabled={working}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs disabled:opacity-50"
                          style={{
                            background: 'rgba(34, 197, 94, 0.18)',
                            color: '#15803d',
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontWeight: 600,
                          }}
                        >
                          <CheckCircle2 size={12} /> Aprobar
                        </button>
                        <button
                          onClick={() => handleReject(it)}
                          disabled={working}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs disabled:opacity-50"
                          style={{
                            background: 'rgba(239, 68, 68, 0.14)',
                            color: '#b91c1c',
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontWeight: 600,
                          }}
                        >
                          <XCircle size={12} /> Rechazar
                        </button>
                        <Link
                          href={linkHref}
                          className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
                          title="Ver detalle"
                        >
                          <ChevronRight size={14} />
                        </Link>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Bulk confirmation */}
      {bulkConfirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-md p-5">
            <h3
              className="text-base text-[var(--text-primary)]"
              style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 600 }}
            >
              Aprobar {selected.size} pasos
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              Cada paso se firma con tu nombre, IP y user-agent. Verifica que estás autorizado en
              cada uno antes de continuar.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setBulkConfirmOpen(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-full"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkApprove}
                className="px-4 py-2 text-sm text-white rounded-full"
                style={{ background: '#22C55E', fontWeight: 600 }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof ClipboardCheck;
  color: string;
}) {
  return (
    <div
      className="p-4 rounded-xl"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-xs uppercase tracking-wider text-[var(--text-secondary)]"
          style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace', letterSpacing: '0.18em' }}
        >
          {label}
        </span>
        <Icon size={16} style={{ color }} />
      </div>
      <div
        style={{
          fontFamily: 'var(--font-outfit), sans-serif',
          fontWeight: 700,
          fontSize: 28,
          color: 'var(--text-primary)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Th({
  children,
  width,
  align,
}: {
  children: React.ReactNode;
  width?: number;
  align?: 'left' | 'right';
}) {
  return (
    <th
      style={{
        textAlign: align ?? 'left',
        padding: '10px 14px',
        fontFamily: 'var(--font-ibm-plex-mono), monospace',
        fontSize: 11,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--text-secondary)',
        fontWeight: 500,
        background: 'var(--input-bg)',
        borderBottom: '1px solid var(--border-color)',
        width,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td
      style={{
        padding: '10px 14px',
        textAlign: align ?? 'left',
        fontSize: 14,
        color: 'var(--text-primary)',
        verticalAlign: 'middle',
      }}
    >
      {children}
    </td>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.round(diff / 86_400_000);
  if (days < 30) return `hace ${days}d`;
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short' }).format(d);
}
