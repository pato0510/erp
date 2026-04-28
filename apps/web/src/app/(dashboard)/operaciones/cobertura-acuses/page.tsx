'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, Eye, Users, X } from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { Toast } from '../../../../components/shared/Toast';

type AckStatus = 'PENDING' | 'READ' | 'ACKNOWLEDGED' | 'EXPIRED' | 'EXEMPTED';

interface CompanyCoverage {
  totalAssignments: number;
  acknowledged: number;
  pending: number;
  read: number;
  expired: number;
  exempted: number;
  coveragePercentage: number;
  byCategory: Record<string, { total: number; acknowledged: number; coverage: number }>;
  worstProcedures: Array<{
    procedureId: string;
    code: string;
    title: string;
    total: number;
    acknowledged: number;
    coverage: number;
  }>;
  topUsersWithPending: Array<{
    userId: string;
    name: string;
    email: string | null;
    pending: number;
  }>;
}

interface ProcedureCoverage {
  procedureId: string;
  code: string;
  title: string;
  totalRequired: number;
  acknowledged: number;
  pending: number;
  read: number;
  expired: number;
  exempted: number;
  coveragePercentage: number;
  users: Array<{
    userId: string;
    userName: string;
    userEmail: string | null;
    role: string | null;
    status: AckStatus;
    acknowledgedAt: string | null;
    dueDate: string | null;
    daysOverdue: number;
  }>;
}

interface UserCoverage {
  userId: string;
  totalAssigned: number;
  acknowledged: number;
  pending: number;
  read: number;
  expired: number;
  exempted: number;
  coveragePercentage: number;
  procedures: Array<{
    id: string;
    procedureId: string;
    status: AckStatus;
    dueDate: string | null;
    acknowledgedAt: string | null;
    procedure: { id: string; code: string; title: string; category: string; version: string };
  }>;
}

interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

const STATUS_LABELS: Record<AckStatus, string> = {
  PENDING: 'Por leer',
  READ: 'En lectura',
  ACKNOWLEDGED: 'Acusado',
  EXPIRED: 'Vencido',
  EXEMPTED: 'Exento',
};

const STATUS_META: Record<AckStatus, { bg: string; fg: string }> = {
  PENDING: { bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
  READ: { bg: 'rgba(234, 179, 8, 0.14)', fg: '#a16207' },
  ACKNOWLEDGED: { bg: 'rgba(34, 197, 94, 0.14)', fg: '#15803d' },
  EXPIRED: { bg: 'rgba(239, 68, 68, 0.12)', fg: '#b91c1c' },
  EXEMPTED: { bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
};

export default function CoberturaAcusesPage() {
  const [companyCoverage, setCompanyCoverage] = useState<CompanyCoverage | null>(null);
  const [procedures, setProcedures] = useState<
    Array<{ id: string; code: string; title: string; category: string; version: string }>
  >([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [tab, setTab] = useState<'procedimientos' | 'usuarios'>('procedimientos');
  const [loading, setLoading] = useState(true);

  const [procedureDrillId, setProcedureDrillId] = useState<string | null>(null);
  const [procedureDrill, setProcedureDrill] = useState<ProcedureCoverage | null>(null);
  const [userDrillId, setUserDrillId] = useState<string | null>(null);
  const [userDrill, setUserDrill] = useState<UserCoverage | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cov, procRes, usersRes] = await Promise.all([
        apiClient.get<CompanyCoverage>('/api/operations/acknowledgments/company-coverage'),
        apiClient
          .get<{
            data: Array<{
              id: string;
              code: string;
              title: string;
              category: string;
              version: string;
            }>;
          }>('/api/operations/procedures?limit=100')
          .catch(() => ({ data: [] })),
        apiClient.get<UserSummary[]>('/api/users').catch(() => [] as UserSummary[]),
      ]);
      setCompanyCoverage(cov);
      setProcedures(procRes.data ?? []);
      setUsers(usersRes);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error cargando cobertura.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* Per-procedure drill-down. */
  useEffect(() => {
    if (!procedureDrillId) {
      setProcedureDrill(null);
      return;
    }
    apiClient
      .get<ProcedureCoverage>(`/api/operations/acknowledgments/coverage/${procedureDrillId}`)
      .then(setProcedureDrill)
      .catch((err) =>
        setToast({
          message: err instanceof Error ? err.message : 'Error cargando detalle.',
          type: 'error',
        }),
      );
  }, [procedureDrillId]);

  useEffect(() => {
    if (!userDrillId) {
      setUserDrill(null);
      return;
    }
    apiClient
      .get<UserCoverage>(`/api/operations/acknowledgments/user/${userDrillId}/coverage`)
      .then(setUserDrill)
      .catch((err) =>
        setToast({
          message: err instanceof Error ? err.message : 'Error cargando detalle.',
          type: 'error',
        }),
      );
  }, [userDrillId]);

  const handleExempt = async (procedureId: string, targetUserId: string) => {
    const reason = window.prompt('Motivo de la exención (mínimo 20 caracteres):');
    if (!reason) return;
    if (reason.trim().length < 20) {
      setToast({ message: 'El motivo debe tener al menos 20 caracteres.', type: 'error' });
      return;
    }
    try {
      await apiClient.post(
        `/api/operations/acknowledgments/${procedureId}/exempt/${targetUserId}`,
        { reason: reason.trim() },
      );
      setToast({ message: 'Usuario exento.', type: 'success' });
      if (procedureDrillId) setProcedureDrillId(procedureDrillId); // re-trigger
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo exentar.',
        type: 'error',
      });
    }
  };

  const handleReapply = async (procedureId: string, targetUserId: string) => {
    if (!window.confirm('¿Reactivar el acuse para este usuario?')) return;
    try {
      await apiClient.post(
        `/api/operations/acknowledgments/${procedureId}/reapply/${targetUserId}`,
        {},
      );
      setToast({ message: 'Acuse reactivado.', type: 'success' });
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo reactivar.',
        type: 'error',
      });
    }
  };

  const lowCoverageCount =
    companyCoverage?.worstProcedures.filter((p) => p.coverage < 70).length ?? 0;
  const usersWithExpired = companyCoverage?.expired ?? 0;
  const totalPending = (companyCoverage?.pending ?? 0) + (companyCoverage?.read ?? 0);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <h1
        className="text-[var(--text-primary)] mb-1"
        style={{
          fontFamily: 'var(--font-outfit), sans-serif',
          fontWeight: 600,
          fontSize: 28,
          letterSpacing: '-0.01em',
        }}
      >
        Cobertura de acuses
      </h1>
      <p
        className="mb-6"
        style={{
          fontFamily: 'var(--font-ibm-plex-mono), monospace',
          fontSize: 11,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
        }}
      >
        Estado de lectura por procedimiento y por usuario
      </p>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Cobertura global"
          value={`${companyCoverage?.coveragePercentage ?? 0}%`}
          icon={CheckCircle2}
          color="#22C55E"
        />
        <KpiCard
          label="Procedimientos < 70%"
          value={lowCoverageCount}
          icon={AlertTriangle}
          color="#F97316"
        />
        <KpiCard label="Vencidos" value={usersWithExpired} icon={Clock} color="#EF4444" />
        <KpiCard label="Pendientes totales" value={totalPending} icon={Eye} color="#64748B" />
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 mb-4 p-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg"
        style={{ width: 'fit-content' }}
      >
        <TabButton active={tab === 'procedimientos'} onClick={() => setTab('procedimientos')}>
          Por procedimiento
        </TabButton>
        <TabButton active={tab === 'usuarios'} onClick={() => setTab('usuarios')}>
          Por usuario
        </TabButton>
      </div>

      {loading ? (
        <div
          className="p-10 text-center text-[var(--text-secondary)] rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          Cargando...
        </div>
      ) : tab === 'procedimientos' ? (
        <ProceduresTable
          procedures={procedures}
          coverage={companyCoverage}
          onSelect={(id) => setProcedureDrillId(id)}
        />
      ) : (
        <UsersTable users={users} onSelect={(id) => setUserDrillId(id)} />
      )}

      {/* Drill-down modals */}
      {procedureDrillId && procedureDrill && (
        <DrillModal
          title={`Cobertura · ${procedureDrill.code}`}
          subtitle={procedureDrill.title}
          onClose={() => setProcedureDrillId(null)}
        >
          <CoverageStats
            total={procedureDrill.totalRequired}
            acknowledged={procedureDrill.acknowledged}
            pending={procedureDrill.pending + procedureDrill.read}
            expired={procedureDrill.expired}
            exempted={procedureDrill.exempted}
            percentage={procedureDrill.coveragePercentage}
          />
          <div className="mt-3" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <Th>Usuario</Th>
                  <Th>Rol</Th>
                  <Th>Estado</Th>
                  <Th>Fecha límite</Th>
                  <Th>Acuso</Th>
                  <Th align="right">Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {procedureDrill.users.map((u) => (
                  <tr key={u.userId} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <Td>
                      <div
                        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
                      >
                        {u.userName}
                      </div>
                      {u.userEmail && (
                        <div className="text-xs text-[var(--text-muted)]">{u.userEmail}</div>
                      )}
                    </Td>
                    <Td>
                      <span className="text-xs text-[var(--text-secondary)]">{u.role ?? '—'}</span>
                    </Td>
                    <Td>
                      <StatusBadge status={u.status} />
                    </Td>
                    <Td>
                      {u.dueDate ? (
                        <span className="text-xs">{formatDate(u.dueDate)}</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                      {u.daysOverdue > 0 && (
                        <div className="text-xs text-red-700">+{u.daysOverdue}d</div>
                      )}
                    </Td>
                    <Td>
                      {u.acknowledgedAt ? (
                        <span className="text-xs text-[var(--text-secondary)]">
                          {formatDate(u.acknowledgedAt)}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </Td>
                    <Td align="right">
                      {u.status !== 'EXEMPTED' && u.status !== 'ACKNOWLEDGED' && (
                        <button
                          onClick={() => handleExempt(procedureDrill.procedureId, u.userId)}
                          className="text-xs text-blue-600 hover:underline mr-2"
                        >
                          Exentar
                        </button>
                      )}
                      {u.status === 'EXEMPTED' && (
                        <button
                          onClick={() => handleReapply(procedureDrill.procedureId, u.userId)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Reactivar
                        </button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DrillModal>
      )}

      {userDrillId && userDrill && (
        <DrillModal
          title={`Cobertura · ${users.find((u) => u.id === userDrillId)?.firstName ?? userDrillId}`}
          subtitle={users.find((u) => u.id === userDrillId)?.email ?? ''}
          onClose={() => setUserDrillId(null)}
        >
          <CoverageStats
            total={userDrill.totalAssigned}
            acknowledged={userDrill.acknowledged}
            pending={userDrill.pending + userDrill.read}
            expired={userDrill.expired}
            exempted={userDrill.exempted}
            percentage={userDrill.coveragePercentage}
          />
          <div className="mt-3" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <Th>Procedimiento</Th>
                  <Th>Versión</Th>
                  <Th>Estado</Th>
                  <Th>Fecha límite</Th>
                </tr>
              </thead>
              <tbody>
                {userDrill.procedures.map((row) => (
                  <tr key={row.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <Td>
                      <Link
                        href={`/operaciones/procedimientos/${row.procedure.id}`}
                        className="text-blue-600 hover:underline"
                        style={{
                          fontFamily: 'var(--font-jetbrains-mono), monospace',
                          fontSize: 12,
                        }}
                      >
                        {row.procedure.code}
                      </Link>
                      <div className="text-sm">{row.procedure.title}</div>
                    </Td>
                    <Td>v{row.procedure.version}</Td>
                    <Td>
                      <StatusBadge status={row.status} />
                    </Td>
                    <Td>
                      {row.dueDate ? (
                        <span className="text-xs">{formatDate(row.dueDate)}</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DrillModal>
      )}
    </div>
  );
}

function ProceduresTable({
  procedures,
  coverage,
  onSelect,
}: {
  procedures: Array<{ id: string; code: string; title: string; category: string; version: string }>;
  coverage: CompanyCoverage | null;
  onSelect: (procedureId: string) => void;
}) {
  /* Build a map of procedure-level coverage from the company-wide
     "worstProcedures" subset. For procedures not in the worst-list
     we just show the click-through link without inline metrics. */
  const worstByProcedure = new Map(
    (coverage?.worstProcedures ?? []).map((p) => [p.procedureId, p]),
  );
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <Th>Procedimiento</Th>
            <Th>Versión</Th>
            <Th>Total</Th>
            <Th>Acusados</Th>
            <Th>Cobertura</Th>
            <Th align="right">Detalle</Th>
          </tr>
        </thead>
        <tbody>
          {procedures.map((p) => {
            const stats = worstByProcedure.get(p.id);
            return (
              <tr key={p.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                <Td>
                  <Link
                    href={`/operaciones/procedimientos/${p.id}`}
                    className="text-blue-600 hover:underline"
                    style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12 }}
                  >
                    {p.code}
                  </Link>
                  <div
                    className="text-sm"
                    style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
                  >
                    {p.title}
                  </div>
                </Td>
                <Td>v{p.version}</Td>
                <Td>{stats ? stats.total : '—'}</Td>
                <Td>{stats ? stats.acknowledged : '—'}</Td>
                <Td>
                  {stats ? (
                    <CoverageBar pct={stats.coverage} />
                  ) : (
                    <span className="text-[var(--text-muted)]">—</span>
                  )}
                </Td>
                <Td align="right">
                  <button
                    onClick={() => onSelect(p.id)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Ver
                  </button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UsersTable({
  users,
  onSelect,
}: {
  users: UserSummary[];
  onSelect: (userId: string) => void;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <Th>Usuario</Th>
            <Th>Rol</Th>
            <Th align="right">Detalle</Th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderTop: '1px solid var(--border-color)' }}>
              <Td>
                <div style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}>
                  {u.firstName} {u.lastName}
                </div>
                <div className="text-xs text-[var(--text-muted)]">{u.email}</div>
              </Td>
              <Td>
                <span className="text-xs text-[var(--text-secondary)]">{u.role}</span>
              </Td>
              <Td align="right">
                <button
                  onClick={() => onSelect(u.id)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Ver
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Helpers ---------- */

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: typeof Eye;
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

function TabButton({
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
      className="px-4 py-1.5 text-sm rounded-md transition"
      style={{
        background: active ? '#2563EB' : 'transparent',
        color: active ? '#fff' : 'var(--text-secondary)',
        fontFamily: 'var(--font-outfit), sans-serif',
        fontWeight: active ? 600 : 500,
      }}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: AckStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
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

function CoverageBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? '#22C55E' : pct >= 70 ? '#EAB308' : '#EF4444';
  return (
    <div className="flex items-center gap-2">
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 999,
          background: 'rgba(100, 116, 139, 0.18)',
          overflow: 'hidden',
          minWidth: 80,
          maxWidth: 140,
        }}
      >
        <div
          style={{
            width: `${Math.min(100, Math.max(0, pct))}%`,
            height: '100%',
            background: color,
          }}
        />
      </div>
      <span
        className="text-xs"
        style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', color, fontWeight: 600 }}
      >
        {pct}%
      </span>
    </div>
  );
}

function CoverageStats({
  total,
  acknowledged,
  pending,
  expired,
  exempted,
  percentage,
}: {
  total: number;
  acknowledged: number;
  pending: number;
  expired: number;
  exempted: number;
  percentage: number;
}) {
  return (
    <div className="grid grid-cols-5 gap-2 mb-3">
      <Stat label="Total" value={total} />
      <Stat label="Acusados" value={acknowledged} color="#15803d" />
      <Stat label="Pendientes" value={pending} color="#a16207" />
      <Stat label="Vencidos" value={expired} color="#b91c1c" />
      <Stat label="Exentos" value={exempted} />
      <div className="col-span-5 mt-1">
        <CoverageBar pct={percentage} />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div
      className="p-2 rounded-lg text-center"
      style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)' }}
    >
      <div
        className="text-xs uppercase tracking-wider text-[var(--text-secondary)]"
        style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace', letterSpacing: '0.12em' }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-outfit), sans-serif',
          fontWeight: 700,
          fontSize: 18,
          color: color ?? 'var(--text-primary)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DrillModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-card)] z-10">
          <div>
            <h3 className="text-base font-semibold">{title}</h3>
            {subtitle && <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}
