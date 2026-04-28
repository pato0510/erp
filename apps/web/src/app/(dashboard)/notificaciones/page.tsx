'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Info,
  TrendingUp,
  X,
} from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { Toast } from '../../../components/shared/Toast';
import { formatDate, formatRelativeDate } from '../../../lib/formatters';

type Severity = 'INFO' | 'WARNING' | 'CRITICAL' | 'BLOCKING';
type SourceType =
  | 'ALERT_INSTANCE'
  | 'ASSET_BLOCKED'
  | 'ESCALATION'
  | 'DOCUMENT_REJECTED'
  | 'DOCUMENT_APPROVED'
  | 'EXCEPTION_REQUESTED'
  | 'EXCEPTION_GRANTED'
  | 'GENERAL';

interface NotificationRow {
  id: string;
  alertInstanceId: string | null;
  sourceType: SourceType;
  title: string;
  message: string | null;
  severity: Severity;
  linkPath: string | null;
  icon: string | null;
  isRead: boolean;
  isDismissed: boolean;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  unreadCount?: number;
}

const SEVERITY_META: Record<Severity, { label: string; bg: string; fg: string }> = {
  INFO: { label: 'Info', bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8' },
  WARNING: { label: 'Warning', bg: 'rgba(234, 179, 8, 0.14)', fg: '#a16207' },
  CRITICAL: { label: 'Crítica', bg: 'rgba(249, 115, 22, 0.14)', fg: '#c2410c' },
  BLOCKING: { label: 'Bloqueante', bg: 'rgba(239, 68, 68, 0.14)', fg: '#b91c1c' },
};

const SOURCE_LABEL: Record<SourceType, string> = {
  ALERT_INSTANCE: 'Alerta',
  ASSET_BLOCKED: 'Activo bloqueado',
  ESCALATION: 'Escalada',
  DOCUMENT_REJECTED: 'Documento rechazado',
  DOCUMENT_APPROVED: 'Documento aprobado',
  EXCEPTION_REQUESTED: 'Excepción solicitada',
  EXCEPTION_GRANTED: 'Excepción otorgada',
  GENERAL: 'General',
};

const TAB_PRESETS = ['todas', 'unread', 'severity', 'source'] as const;
type Tab = (typeof TAB_PRESETS)[number];

function pickIcon(icon: string | null, sourceType: SourceType, color: string): React.ReactNode {
  if (sourceType === 'ESCALATION') return <TrendingUp size={16} color={color} />;
  if (sourceType === 'ASSET_BLOCKED') return <Ban size={16} color={color} />;
  switch (icon) {
    case 'AlertCircle':
      return <AlertCircle size={16} color={color} />;
    case 'AlertTriangle':
      return <AlertTriangle size={16} color={color} />;
    case 'Ban':
      return <Ban size={16} color={color} />;
    case 'HelpCircle':
      return <HelpCircle size={16} color={color} />;
    case 'TrendingUp':
      return <TrendingUp size={16} color={color} />;
    case 'Info':
      return <Info size={16} color={color} />;
    case 'Bell':
    default:
      return <Bell size={16} color={color} />;
  }
}

const PAGE_SIZE = 25;

export default function NotificacionesPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('todas');
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [sourceType, setSourceType] = useState<SourceType | ''>('');
  const [data, setData] = useState<Paginated<NotificationRow> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  /* Tab → API filter mapping. The "by severity"/"by source" tabs just
     enable the corresponding selector but don't constrain the call
     until the operator picks a value. */
  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (tab === 'unread') params.set('isRead', 'false');
    if (severity) params.set('severity', severity);
    if (sourceType) params.set('sourceType', sourceType);
    /* Hide dismissed by default — they're not interesting to scroll
       through; users can dismiss to clean up. */
    params.set('isDismissed', 'false');
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    return params;
  }, [tab, severity, sourceType, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<Paginated<NotificationRow>>(
        `/api/operations/notifications?${buildParams().toString()}`,
      );
      setData(res);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudieron cargar las notificaciones.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [tab, severity, sourceType]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (id: string) => {
    try {
      await apiClient.post(`/api/operations/notifications/${id}/read`);
      setData((d) =>
        d
          ? {
              ...d,
              data: d.data.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
            }
          : d,
      );
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo marcar como leída.',
        type: 'error',
      });
    }
  };

  const dismiss = async (id: string) => {
    try {
      await apiClient.post(`/api/operations/notifications/${id}/dismiss`);
      setData((d) =>
        d
          ? {
              ...d,
              data: d.data.filter((n) => n.id !== id),
              total: Math.max(0, d.total - 1),
            }
          : d,
      );
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo descartar.',
        type: 'error',
      });
    }
  };

  const markAllRead = async () => {
    try {
      await apiClient.post('/api/operations/notifications/mark-all-read');
      setToast({ message: 'Todas marcadas como leídas.', type: 'success' });
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo actualizar.',
        type: 'error',
      });
    }
  };

  const dismissSelected = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    /* No bulk endpoint — fan out per-row sequentially. The list is at
       most page-size so the cost is bounded. */
    for (const id of ids) {
      try {
        await apiClient.post(`/api/operations/notifications/${id}/dismiss`);
      } catch {
        /* skip on error, continue */
      }
    }
    setSelected(new Set());
    setToast({ message: `${ids.length} notificaciones descartadas.`, type: 'success' });
    load();
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const allSelectedOnPage =
    !!data && data.data.length > 0 && data.data.every((r) => selected.has(r.id));
  const toggleSelectAll = () => {
    if (!data) return;
    if (allSelectedOnPage) {
      const next = new Set(selected);
      data.data.forEach((n) => next.delete(n.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      data.data.forEach((n) => next.add(n.id));
      setSelected(next);
    }
  };

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-5">
        <div className="ops-breadcrumb">Notificaciones</div>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <h1
            className="text-[var(--text-primary)]"
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
              fontSize: 28,
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            Notificaciones
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={markAllRead}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                color: 'var(--text-primary)',
              }}
            >
              <CheckCheck size={14} /> Marcar todas como leídas
            </button>
            {selected.size > 0 && (
              <button
                onClick={dismissSelected}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-full text-white"
                style={{
                  background: '#475569',
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                }}
              >
                <X size={14} /> Descartar {selected.size} seleccionadas
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs + filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div
          className="inline-flex items-center gap-1 p-1 rounded-lg"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          {TAB_PRESETS.map((t) => {
            const labels: Record<Tab, string> = {
              todas: 'Todas',
              unread: 'No leídas',
              severity: 'Por severidad',
              source: 'Por tipo',
            };
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="inline-flex items-center px-3 py-1.5 text-xs rounded-md transition"
                style={{
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                  background: tab === t ? '#2563eb' : 'transparent',
                  color: tab === t ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {labels[t]}
              </button>
            );
          })}
        </div>

        {tab === 'severity' && (
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity | '')}
            className="cp-input"
            style={{ width: 'auto', minWidth: 200 }}
          >
            <option value="">Todas las severidades</option>
            {(Object.keys(SEVERITY_META) as Severity[]).map((s) => (
              <option key={s} value={s}>
                {SEVERITY_META[s].label}
              </option>
            ))}
          </select>
        )}
        {tab === 'source' && (
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as SourceType | '')}
            className="cp-input"
            style={{ width: 'auto', minWidth: 220 }}
          >
            <option value="">Todos los tipos</option>
            {(Object.keys(SOURCE_LABEL) as SourceType[]).map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* List */}
      <div
        className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl"
        style={{ overflow: 'hidden' }}
      >
        {loading && !data && (
          <div className="p-3 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded"
                style={{ height: 60, background: 'rgba(0,0,0,0.04)' }}
              />
            ))}
          </div>
        )}
        {data && data.data.length === 0 && (
          <div className="p-12 text-center">
            <Bell size={28} className="mx-auto text-gray-300 mb-2" />
            <p
              className="text-[var(--text-secondary)]"
              style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: 14 }}
            >
              No hay notificaciones que mostrar.
            </p>
          </div>
        )}
        {data && data.data.length > 0 && (
          <>
            <div
              className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border-color)]"
              style={{ background: 'var(--input-bg)' }}
            >
              <input
                type="checkbox"
                checked={allSelectedOnPage}
                onChange={toggleSelectAll}
                style={{ accentColor: '#2563eb' }}
                aria-label="Seleccionar todas"
              />
              <span
                className="text-[var(--text-secondary)]"
                style={{
                  fontFamily: 'var(--font-ibm-plex-mono), monospace',
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                {selected.size > 0 ? `${selected.size} seleccionadas` : `${data.total} total`}
              </span>
            </div>
            <ul>
              {data.data.map((n) => {
                const sev = SEVERITY_META[n.severity];
                return (
                  <li
                    key={n.id}
                    className="px-4 py-3 border-b border-[var(--border-color)] flex items-start gap-3"
                    style={{
                      background: n.isRead ? 'transparent' : 'rgba(37, 99, 235, 0.04)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(n.id)}
                      onChange={() => toggleSelect(n.id)}
                      style={{ accentColor: '#2563eb', marginTop: 4 }}
                      aria-label="Seleccionar"
                    />
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 999,
                        background: sev.bg,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {pickIcon(n.icon, n.sourceType, sev.fg)}
                    </span>
                    <button
                      onClick={async () => {
                        if (!n.isRead) await markRead(n.id);
                        if (n.linkPath) router.push(n.linkPath);
                      }}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="cfg-chip" style={{ background: sev.bg, color: sev.fg }}>
                          {sev.label}
                        </span>
                        <span
                          className="cfg-chip"
                          style={{ background: 'rgba(100, 116, 139, 0.14)', color: '#475569' }}
                        >
                          {SOURCE_LABEL[n.sourceType]}
                        </span>
                        {!n.isRead && (
                          <span
                            aria-hidden
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 999,
                              background: '#2563eb',
                            }}
                          />
                        )}
                      </div>
                      <p
                        className="text-[var(--text-primary)] truncate"
                        style={{
                          fontFamily: 'var(--font-outfit), sans-serif',
                          fontWeight: n.isRead ? 500 : 600,
                          fontSize: 14,
                          margin: 0,
                        }}
                      >
                        {n.title}
                      </p>
                      {n.message && (
                        <p
                          className="text-[var(--text-secondary)] mt-0.5"
                          style={{
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontSize: 13,
                          }}
                        >
                          {n.message}
                        </p>
                      )}
                      <p
                        className="text-[var(--text-muted)] mt-0.5"
                        style={{
                          fontFamily: 'var(--font-jetbrains-mono), monospace',
                          fontSize: 11,
                        }}
                        title={formatDate(n.createdAt)}
                      >
                        {formatRelativeDate(n.createdAt)}
                      </p>
                    </button>
                    <div className="flex items-center gap-1">
                      {!n.isRead && (
                        <button
                          onClick={() => markRead(n.id)}
                          title="Marcar como leída"
                          className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
                        >
                          <CheckCheck size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => dismiss(n.id)}
                        title="Descartar"
                        className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)]">
                <span
                  className="text-[var(--text-secondary)]"
                  style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: 12 }}
                >
                  Página {data.page} de {data.totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="p-2 rounded border border-gray-300 disabled:opacity-30 hover:bg-[var(--input-bg)] transition"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    disabled={page >= data.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="p-2 rounded border border-gray-300 disabled:opacity-30 hover:bg-[var(--input-bg)] transition"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <style jsx global>{`
        .ops-breadcrumb {
          font-family: var(--font-ibm-plex-mono), var(--font-jetbrains-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.5);
          margin-bottom: 14px;
        }
        html.dark .ops-breadcrumb {
          color: rgba(255, 255, 255, 0.5);
        }
        .cp-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-family: var(--font-outfit), sans-serif;
          font-size: 14px;
          color: var(--text-primary);
          background: var(--input-bg);
          outline: none;
        }
        .cp-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
        .cfg-chip {
          display: inline-flex;
          align-items: center;
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
