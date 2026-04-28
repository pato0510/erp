'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Bell,
  CheckCheck,
  HelpCircle,
  Info,
  TrendingUp,
  X,
} from 'lucide-react';
import { apiClient } from '../lib/api';
import { formatRelativeDate } from '../lib/formatters';

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

interface ListResponse {
  data: NotificationRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  unreadCount?: number;
}

const POLL_MS = 60_000;

const SEVERITY_COLOR: Record<Severity, string> = {
  INFO: '#1d4ed8',
  WARNING: '#a16207',
  CRITICAL: '#c2410c',
  BLOCKING: '#b91c1c',
};

/* Pick the badge color from the highest-severity unread notification —
   keeps the bell red when something is on fire. */
const SEVERITY_PRIORITY: Severity[] = ['BLOCKING', 'CRITICAL', 'WARNING', 'INFO'];

function pickIcon(name: string | null, sourceType: SourceType): React.ReactNode {
  /* Map the lucide name string the backend stores into a real component.
     ESCALATION wins regardless of the stored icon so escalations stand
     out in the dropdown. */
  if (sourceType === 'ESCALATION') return <TrendingUp size={14} />;
  if (sourceType === 'ASSET_BLOCKED') return <Ban size={14} />;
  switch (name) {
    case 'AlertCircle':
      return <AlertCircle size={14} />;
    case 'AlertTriangle':
      return <AlertTriangle size={14} />;
    case 'Ban':
      return <Ban size={14} />;
    case 'HelpCircle':
      return <HelpCircle size={14} />;
    case 'TrendingUp':
      return <TrendingUp size={14} />;
    case 'Info':
      return <Info size={14} />;
    case 'Bell':
    default:
      return <Bell size={14} />;
  }
}

/* OPS-022 — bell + dropdown rendered in the dashboard topbar. The
   parent layout positions it; this component owns its own state and
   polling. Polling cadence is 60s for the unread badge; the full list
   is only fetched when the dropdown opens. */
export function NotificationCenter() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [highestSeverity, setHighestSeverity] = useState<Severity>('INFO');
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await apiClient.get<{ count: number }>(
        '/api/operations/notifications/unread-count',
      );
      setUnread(res.count);
    } catch {
      /* Network blip or 401 — keep the previous count. */
    }
  }, []);

  /* Initial + polling unread count. Always-on regardless of dropdown
     state so the badge stays current. */
  useEffect(() => {
    refreshUnread();
    const interval = setInterval(refreshUnread, POLL_MS);
    return () => clearInterval(interval);
  }, [refreshUnread]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<ListResponse>(
        '/api/operations/notifications?isDismissed=false&limit=10',
      );
      setItems(res.data);
      const top = res.data.find((d) => !d.isRead);
      if (top) setHighestSeverity(top.severity);
      else setHighestSeverity('INFO');
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /* Fetch the full list whenever the dropdown opens. We also re-fetch
     after every action so the panel reflects post-mutation state
     without stale rows. */
  useEffect(() => {
    if (open) loadList();
  }, [open, loadList]);

  /* Close on outside click — vanilla DOM listener so we don't need
     additional libs. */
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const onItemClick = async (n: NotificationRow) => {
    if (!n.isRead) {
      try {
        await apiClient.post(`/api/operations/notifications/${n.id}/read`);
        setItems((prev) =>
          prev ? prev.map((p) => (p.id === n.id ? { ...p, isRead: true } : p)) : prev,
        );
        setUnread((u) => Math.max(0, u - 1));
      } catch {
        /* Best-effort — don't block navigation on read-mark failure. */
      }
    }
    setOpen(false);
    if (n.linkPath) router.push(n.linkPath);
  };

  const markAllRead = async () => {
    try {
      await apiClient.post('/api/operations/notifications/mark-all-read');
      setItems((prev) => (prev ? prev.map((p) => ({ ...p, isRead: true })) : prev));
      setUnread(0);
    } catch {
      /* Surfaces no error UI — the user can retry. */
    }
  };

  const badgeColor = unread > 0 ? SEVERITY_COLOR[highestSeverity] : '#475569';

  return (
    <div className="notif-root" ref={dropdownRef}>
      <button onClick={() => setOpen((o) => !o)} className="notif-bell" aria-label="Notificaciones">
        <Bell size={16} />
        {unread > 0 && (
          <span className="notif-badge" style={{ background: badgeColor }}>
            {unread > 9 ? '9+' : String(unread)}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel__head">
            <span
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Notificaciones
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              className="p-1 rounded hover:bg-gray-100"
            >
              <X size={14} />
            </button>
          </div>

          <div className="notif-panel__body">
            {loading && !items && (
              <div className="space-y-2 p-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded"
                    style={{ height: 56, background: 'rgba(0,0,0,0.05)' }}
                  />
                ))}
              </div>
            )}

            {items && items.length === 0 && (
              <div className="p-6 text-center">
                <Bell size={20} className="mx-auto text-gray-300 mb-2" />
                <p
                  className="text-[var(--text-secondary)]"
                  style={{
                    fontFamily: 'var(--font-outfit), sans-serif',
                    fontSize: 13,
                  }}
                >
                  No tienes notificaciones
                </p>
              </div>
            )}

            {items && items.length > 0 && (
              <ul>
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => onItemClick(n)}
                      className="notif-item"
                      style={{
                        background: n.isRead ? 'transparent' : 'rgba(37, 99, 235, 0.04)',
                      }}
                    >
                      <span
                        className="notif-item__icon"
                        style={{
                          color: SEVERITY_COLOR[n.severity],
                          background: `${SEVERITY_COLOR[n.severity]}1a`,
                        }}
                      >
                        {pickIcon(n.icon, n.sourceType)}
                      </span>
                      <div className="flex-1 min-w-0 text-left">
                        <p
                          className="text-[var(--text-primary)] truncate"
                          style={{
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontWeight: n.isRead ? 500 : 600,
                            fontSize: 13,
                            margin: 0,
                          }}
                        >
                          {n.title}
                        </p>
                        {n.message && (
                          <p
                            className="text-[var(--text-secondary)] truncate"
                            style={{
                              fontFamily: 'var(--font-outfit), sans-serif',
                              fontSize: 12,
                              margin: 0,
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
                        >
                          {formatRelativeDate(n.createdAt)}
                        </p>
                      </div>
                      {!n.isRead && (
                        <span
                          aria-hidden
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: '#2563eb',
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="notif-panel__foot">
            <button
              onClick={markAllRead}
              className="text-blue-600 hover:underline inline-flex items-center gap-1"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              <CheckCheck size={12} /> Marcar todas como leídas
            </button>
            <Link
              href="/notificaciones"
              onClick={() => setOpen(false)}
              className="text-blue-600 hover:underline"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              Ver todas →
            </Link>
          </div>
        </div>
      )}

      <style jsx>{`
        .notif-root {
          position: relative;
        }
        .notif-bell {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 999px;
          background: var(--bg-card);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
          cursor: pointer;
          transition: background 120ms ease;
        }
        .notif-bell:hover {
          background: var(--input-bg);
        }
        .notif-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          border-radius: 999px;
          font-family: var(--font-jetbrains-mono), monospace;
          font-size: 10px;
          font-weight: 700;
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 2px solid var(--bg-card);
        }
        .notif-panel {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: 360px;
          max-width: 90vw;
          background: var(--bg-card);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.15);
          z-index: 50;
          overflow: hidden;
        }
        @media (max-width: 600px) {
          .notif-panel {
            width: 100vw;
            right: -16px;
            border-radius: 0 0 12px 12px;
          }
        }
        .notif-panel__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          border-bottom: 1px solid var(--border-color);
        }
        .notif-panel__body {
          max-height: 420px;
          overflow-y: auto;
        }
        .notif-item {
          width: 100%;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 14px;
          border-bottom: 1px solid var(--border-color);
          background: transparent;
          text-align: left;
          cursor: pointer;
          transition: background 120ms ease;
        }
        .notif-item:hover {
          background: var(--input-bg);
        }
        .notif-item:last-child {
          border-bottom: none;
        }
        .notif-item__icon {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .notif-panel__foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border-top: 1px solid var(--border-color);
          background: var(--input-bg);
        }
      `}</style>
    </div>
  );
}

export default NotificationCenter;
