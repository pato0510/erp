'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronRight,
  Clock,
  Filter,
  Pause,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react';
import { apiClient } from '../../lib/api';
import { Toast } from '../shared/Toast';
import { WorkPermitFormModal } from './WorkPermitFormModal';

type WorkPermitStatus =
  | 'DRAFT'
  | 'PENDING_AUTHORIZATION'
  | 'AUTHORIZED'
  | 'IN_EXECUTION'
  | 'SUSPENDED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'EXPIRED';

interface WorkPermitTypeOption {
  id: string;
  name: string;
  code: string;
  category: string;
  color?: string | null;
  isActive: boolean;
}

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface WorkPermitRow {
  id: string;
  permitNumber: string;
  title: string;
  workLocation?: string | null;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string | null;
  actualEnd?: string | null;
  requestedBy: string;
  supervisorId: string;
  status: WorkPermitStatus;
  statusReason?: string | null;
  incidentsReported: boolean;
  permitType: {
    id: string;
    name: string;
    code: string;
    category: string;
    color?: string | null;
    icon?: string | null;
    maxDurationHours: number;
  };
  asset?: { id: string; code: string; name: string } | null;
  location?: { id: string; name: string; code?: string | null } | null;
}

interface ActiveCounts {
  inExecution: number;
  pending: number;
  closedToday: number;
  totalMonth: number;
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const STATUS_LABELS: Record<WorkPermitStatus, string> = {
  DRAFT: 'Borrador',
  PENDING_AUTHORIZATION: 'Pendiente autorización',
  AUTHORIZED: 'Autorizado',
  IN_EXECUTION: 'En ejecución',
  SUSPENDED: 'Suspendido',
  CLOSED: 'Cerrado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado',
};

const STATUS_META: Record<WorkPermitStatus, { bg: string; fg: string; pulse?: boolean }> = {
  DRAFT: { bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
  PENDING_AUTHORIZATION: { bg: 'rgba(234, 179, 8, 0.14)', fg: '#a16207' },
  AUTHORIZED: { bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8' },
  IN_EXECUTION: { bg: 'rgba(249, 115, 22, 0.14)', fg: '#c2410c', pulse: true },
  SUSPENDED: { bg: 'rgba(239, 68, 68, 0.10)', fg: '#b91c1c' },
  CLOSED: { bg: 'rgba(34, 197, 94, 0.12)', fg: '#15803d' },
  CANCELLED: { bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
  EXPIRED: { bg: 'rgba(239, 68, 68, 0.12)', fg: '#b91c1c' },
};

const PAGE_SIZE = 20;

/* OPS-025 — full management surface for internal work permits.
   Lives inside the "Permisos de trabajo" tab on /operaciones/permisos.
   KPIs use /work-permits/active-count, the table uses /work-permits
   with filters. Action buttons hit the workflow endpoints
   (/submit, /authorize, /reject, /start, /suspend, /resume, /close,
   /cancel) — most actions navigate to the detail page when extra
   data is required. */
export function WorkPermitsTab({ currentUserId }: { currentUserId: string }) {
  const [counts, setCounts] = useState<ActiveCounts | null>(null);
  const [permits, setPermits] = useState<Paginated<WorkPermitRow> | null>(null);
  const [permitTypes, setPermitTypes] = useState<WorkPermitTypeOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<WorkPermitStatus[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [supervisorFilter, setSupervisorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'mine' | 'pending' | 'live'>('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  /* Catalogs once. */
  useEffect(() => {
    let alive = true;
    Promise.all([
      apiClient
        .get<WorkPermitTypeOption[]>('/api/operations/work-permit-types')
        .catch(() => [] as WorkPermitTypeOption[]),
      apiClient.get<UserOption[]>('/api/users').catch(() => [] as UserOption[]),
    ]).then(([t, u]) => {
      if (!alive) return;
      setPermitTypes(t.filter((x) => x.isActive));
      setUsers(u);
    });
    return () => {
      alive = false;
    };
  }, []);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    if (search.trim()) params.set('search', search.trim());
    if (typeFilter) params.set('permitTypeId', typeFilter);
    if (supervisorFilter) params.set('supervisorId', supervisorFilter);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);

    if (quickFilter === 'mine') {
      /* Use supervisorId for "Mis permisos" — matches the most common
         operator workflow. requestedBy is also valid; the simpler
         filter works well for the v1. */
      params.set('supervisorId', currentUserId);
    }
    if (quickFilter === 'live') {
      params.append('status', 'IN_EXECUTION');
    }
    if (quickFilter === 'pending') {
      params.append('status', 'PENDING_AUTHORIZATION');
    }
    if (quickFilter === 'all' && statusFilter.length > 0) {
      for (const s of statusFilter) params.append('status', s);
    }
    return params;
  }, [
    page,
    search,
    typeFilter,
    supervisorFilter,
    dateFrom,
    dateTo,
    quickFilter,
    statusFilter,
    currentUserId,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, list] = await Promise.all([
        apiClient.get<ActiveCounts>('/api/operations/work-permits/active-count'),
        apiClient.get<Paginated<WorkPermitRow>>(
          `/api/operations/work-permits?${buildParams().toString()}`,
        ),
      ]);
      setCounts(c);
      setPermits(list);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error cargando permisos de trabajo.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    load();
  }, [load]);

  const supervisors = useMemo(() => users, [users]);

  const handleAction = async (id: string, action: 'submit' | 'start' | 'resume') => {
    try {
      await apiClient.post(`/api/operations/work-permits/${id}/${action}`, {});
      const messages: Record<typeof action, string> = {
        submit: 'Permiso enviado para autorización.',
        start: 'Trabajo iniciado.',
        resume: 'Trabajo reanudado.',
      };
      setToast({ message: messages[action], type: 'success' });
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo ejecutar la acción.',
        type: 'error',
      });
    }
  };

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="En ejecución"
          value={counts?.inExecution ?? 0}
          icon={Play}
          color="#F97316"
          pulse={Boolean(counts?.inExecution)}
        />
        <KpiCard
          label="Pendientes autorización"
          value={counts?.pending ?? 0}
          icon={Clock}
          color="#EAB308"
        />
        <KpiCard
          label="Cerrados hoy"
          value={counts?.closedToday ?? 0}
          icon={CheckCircle2}
          color="#22C55E"
        />
        <KpiCard
          label="Total este mes"
          value={counts?.totalMonth ?? 0}
          icon={ShieldCheck}
          color="#64748B"
        />
      </div>

      {/* Quick filters + create */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex flex-wrap gap-2">
          <Chip active={quickFilter === 'all'} onClick={() => setQuickFilter('all')}>
            Todos
          </Chip>
          <Chip active={quickFilter === 'live'} onClick={() => setQuickFilter('live')}>
            En ejecución ahora
          </Chip>
          <Chip active={quickFilter === 'mine'} onClick={() => setQuickFilter('mine')}>
            Mis permisos
          </Chip>
          <Chip active={quickFilter === 'pending'} onClick={() => setQuickFilter('pending')}>
            Pendientes mi autorización
          </Chip>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full"
          style={{
            background: '#2563EB',
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 600,
          }}
        >
          <Plus size={14} /> Nuevo permiso de trabajo
        </button>
      </div>

      {/* Filters */}
      <div
        className="flex flex-wrap items-end gap-2 p-3 mb-4 rounded-xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
      >
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-[var(--text-secondary)]">Buscar</label>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="N° permiso, título, supervisor"
              className="cp-input pl-7"
            />
          </div>
        </div>
        <div style={{ minWidth: 160 }}>
          <label className="text-xs text-[var(--text-secondary)]">Tipo</label>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="cp-input"
          >
            <option value="">Todos</option>
            {permitTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} · {t.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label className="text-xs text-[var(--text-secondary)]">Supervisor</label>
          <select
            value={supervisorFilter}
            onChange={(e) => {
              setSupervisorFilter(e.target.value);
              setPage(1);
            }}
            className="cp-input"
          >
            <option value="">Todos</option>
            {supervisors.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)]">Desde</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="cp-input"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)]">Hasta</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="cp-input"
          />
        </div>
        {(search ||
          typeFilter ||
          supervisorFilter ||
          dateFrom ||
          dateTo ||
          statusFilter.length > 0) && (
          <button
            onClick={() => {
              setSearch('');
              setTypeFilter('');
              setSupervisorFilter('');
              setDateFrom('');
              setDateTo('');
              setStatusFilter([]);
              setPage(1);
            }}
            className="px-3 py-2 text-xs rounded-full border border-gray-300 hover:bg-gray-50 text-[var(--text-secondary)] inline-flex items-center gap-1"
          >
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
      >
        {loading ? (
          <div className="p-10 text-center text-[var(--text-secondary)]">Cargando...</div>
        ) : !permits || permits.data.length === 0 ? (
          <div className="p-10 text-center text-[var(--text-secondary)]">
            <Wrench size={32} className="mx-auto mb-2 text-gray-300" />
            <p>No hay permisos de trabajo registrados todavía.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <Th>N° permiso</Th>
                  <Th>Tipo</Th>
                  <Th>Título</Th>
                  <Th>Supervisor</Th>
                  <Th>Programado</Th>
                  <Th>Estado</Th>
                  <Th align="right">Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {permits.data.map((p) => {
                  const supervisor = users.find((u) => u.id === p.supervisorId);
                  return (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                      <Td>
                        <Link
                          href={`/operaciones/permisos/trabajo/${p.id}`}
                          className="font-mono text-blue-600 hover:underline"
                          style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                        >
                          {p.permitNumber}
                        </Link>
                      </Td>
                      <Td>
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                          style={{
                            background: p.permitType.color
                              ? `${p.permitType.color}22`
                              : 'rgba(100, 116, 139, 0.14)',
                            color: p.permitType.color ?? '#475569',
                            fontFamily: 'var(--font-jetbrains-mono), monospace',
                            fontWeight: 600,
                          }}
                        >
                          {p.permitType.code}
                        </span>
                      </Td>
                      <Td>
                        <div
                          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
                        >
                          {p.title}
                        </div>
                        {p.workLocation && (
                          <div className="text-xs text-[var(--text-muted)]">{p.workLocation}</div>
                        )}
                      </Td>
                      <Td>{supervisor ? `${supervisor.firstName} ${supervisor.lastName}` : '—'}</Td>
                      <Td>
                        <div style={{ fontSize: 12 }}>{formatDateTime(p.plannedStart)}</div>
                        <div className="text-xs text-[var(--text-muted)]">
                          → {formatDateTime(p.plannedEnd)}
                        </div>
                      </Td>
                      <Td>
                        <StatusBadge status={p.status} />
                      </Td>
                      <Td align="right">
                        <ActionButtons
                          permit={p}
                          currentUserId={currentUserId}
                          onAction={handleAction}
                        />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {permits && permits.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-[var(--text-secondary)]">
            Página {permits.page} de {permits.totalPages} · {permits.total} permisos
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-full disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              disabled={page >= permits.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-full disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {createOpen && (
        <WorkPermitFormModal
          onClose={() => setCreateOpen(false)}
          onCreated={(_, submitted) => {
            setCreateOpen(false);
            setToast({
              message: submitted
                ? 'Permiso creado y enviado para autorización.'
                : 'Permiso creado como borrador.',
              type: 'success',
            });
            load();
          }}
        />
      )}
    </div>
  );
}

/* ---------- Helpers ---------- */

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  pulse,
}: {
  label: string;
  value: number;
  icon: typeof Play;
  color: string;
  pulse?: boolean;
}) {
  return (
    <div
      className="p-4 rounded-xl"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-xs uppercase tracking-wider text-[var(--text-secondary)]"
          style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace', letterSpacing: '0.18em' }}
        >
          {label}
        </span>
        <Icon size={16} style={{ color }} className={pulse ? 'animate-pulse' : ''} />
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

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 text-xs rounded-full border transition"
      style={{
        background: active ? '#2563EB' : 'transparent',
        color: active ? '#fff' : 'var(--text-secondary)',
        borderColor: active ? '#2563EB' : 'var(--border-color)',
        fontFamily: 'var(--font-outfit), sans-serif',
        fontWeight: active ? 600 : 500,
      }}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: WorkPermitStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${meta.pulse ? 'animate-pulse' : ''}`}
      style={{
        background: meta.bg,
        color: meta.fg,
        fontFamily: 'var(--font-outfit), sans-serif',
        fontWeight: 600,
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
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

function ActionButtons({
  permit,
  currentUserId,
  onAction,
}: {
  permit: WorkPermitRow;
  currentUserId: string;
  onAction: (id: string, action: 'submit' | 'start' | 'resume') => void;
}) {
  const buttons: Array<{
    label: string;
    icon: typeof Play;
    color: string;
    onClick: () => void;
  }> = [];

  /* Inline buttons cover the cheap "no extra info needed" actions. The
     others (authorize/reject/suspend/close/cancel) require notes or
     reasons, so we route those through the detail page. */
  if (permit.status === 'DRAFT' && permit.requestedBy === currentUserId) {
    buttons.push({
      label: 'Enviar',
      icon: ChevronRight,
      color: '#2563EB',
      onClick: () => onAction(permit.id, 'submit'),
    });
  }
  if (permit.status === 'AUTHORIZED' && permit.supervisorId === currentUserId) {
    buttons.push({
      label: 'Iniciar',
      icon: Play,
      color: '#22C55E',
      onClick: () => onAction(permit.id, 'start'),
    });
  }
  if (permit.status === 'SUSPENDED' && permit.supervisorId === currentUserId) {
    buttons.push({
      label: 'Reanudar',
      icon: Play,
      color: '#22C55E',
      onClick: () => onAction(permit.id, 'resume'),
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {buttons.map((b, i) => {
        const Icon = b.icon;
        return (
          <button
            key={i}
            onClick={b.onClick}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs"
            style={{
              background: `${b.color}1A`,
              color: b.color,
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
            }}
          >
            <Icon size={11} /> {b.label}
          </button>
        );
      })}
      <Link
        href={`/operaciones/permisos/trabajo/${permit.id}`}
        className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
        title="Ver detalle"
      >
        <ChevronRight size={14} />
      </Link>
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

export default WorkPermitsTab;
