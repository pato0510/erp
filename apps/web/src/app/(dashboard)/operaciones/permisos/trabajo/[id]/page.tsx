'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileUp,
  Gauge,
  Lock,
  Pause,
  Play,
  ShieldCheck,
  Trash2,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../../../../../../lib/api';
import { useAuth } from '../../../../../../hooks/useAuth';
import { Toast } from '../../../../../../components/shared/Toast';
import { PermitApprovalTimeline } from '../../../../../../components/operations/PermitApprovalTimeline';
import { formatDate } from '../../../../../../lib/formatters';

type WorkPermitStatus =
  | 'DRAFT'
  | 'PENDING_AUTHORIZATION'
  | 'AUTHORIZED'
  | 'IN_EXECUTION'
  | 'SUSPENDED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'EXPIRED';

type WorkPermitCategory =
  | 'HEIGHT_WORK'
  | 'HOT_WORK'
  | 'CONFINED_SPACE'
  | 'LOCKOUT_TAGOUT'
  | 'EXCAVATION'
  | 'LIFTING'
  | 'ELECTRICAL_WORK'
  | 'CHEMICAL_HANDLING'
  | 'OTHER';

interface AttachmentRecord {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  filePath?: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

interface GasMeasurement {
  id: string;
  gas: string;
  value: number;
  unit: string;
  measuredAt: string;
  recordedBy: string;
}

interface TeamMember {
  userId?: string;
  name: string;
  role?: string;
  signature?: string;
}

interface WorkPermitDetail {
  id: string;
  companyId: string;
  permitTypeId: string;
  permitNumber: string;
  title: string;
  description: string;
  workLocation?: string | null;
  assetId?: string | null;
  locationId?: string | null;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string | null;
  actualEnd?: string | null;
  requestedBy: string;
  supervisorId: string;
  workTeam: TeamMember[];
  identifiedRisks: string[];
  controlMeasures: string[];
  additionalNotes?: string | null;
  authorizedBy?: string | null;
  authorizedAt?: string | null;
  authorizationNotes?: string | null;
  closedBy?: string | null;
  closedAt?: string | null;
  closureNotes?: string | null;
  incidentsReported: boolean;
  incidentDescription?: string | null;
  status: WorkPermitStatus;
  statusReason?: string | null;
  statusChangedAt?: string | null;
  /* OPS-026 — multi-step approval state. Optional + defaults
     because permits created before the migration default to
     0/1/false on the server side. */
  currentApprovalStep?: number;
  totalApprovalSteps?: number;
  isFullyApproved?: boolean;
  gasMeasurements?: GasMeasurement[] | null;
  isolationPoints?: unknown[] | null;
  attachments: AttachmentRecord[];
  createdAt: string;
  updatedAt: string;
  permitType: {
    id: string;
    name: string;
    code: string;
    category: WorkPermitCategory;
    color?: string | null;
    icon?: string | null;
    description?: string | null;
    maxDurationHours: number;
    requiredRoles: string[];
    requiresGasMeasurement: boolean;
    requiresIsolation: boolean;
    requiresMedicalAptitude: boolean;
    requiresSpecificTraining: boolean;
  };
  asset?: { id: string; code: string; name: string } | null;
  location?: { id: string; name: string; code?: string | null } | null;
}

interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
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

export default function WorkPermitDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const router = useRouter();
  const { user } = useAuth();
  const [permit, setPermit] = useState<WorkPermitDetail | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  /* Modal local state for the actions that require notes/reasons. */
  const [authorizeOpen, setAuthorizeOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [gasOpen, setGasOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, u] = await Promise.all([
        apiClient.get<WorkPermitDetail>(`/api/operations/work-permits/${id}`),
        apiClient.get<UserSummary[]>('/api/users').catch(() => [] as UserSummary[]),
      ]);
      setPermit(p);
      setUsers(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el permiso.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const userById = useCallback(
    (uid?: string | null) => (uid ? (users.find((u) => u.id === uid) ?? null) : null),
    [users],
  );

  const handleSimpleAction = async (action: 'submit' | 'start' | 'resume') => {
    try {
      await apiClient.post(`/api/operations/work-permits/${id}/${action}`, {});
      const messages = {
        submit: 'Enviado para autorización.',
        start: 'Trabajo iniciado.',
        resume: 'Trabajo reanudado.',
      } as const;
      setToast({ message: messages[action], type: 'success' });
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo ejecutar la acción.',
        type: 'error',
      });
    }
  };

  if (loading) {
    return <div className="p-6 text-[var(--text-secondary)]">Cargando permiso...</div>;
  }
  if (error || !permit) {
    return (
      <div className="p-6">
        <div className="text-red-600">{error ?? 'Permiso no encontrado.'}</div>
        <Link
          href="/operaciones/permisos?tab=trabajo"
          className="mt-4 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
        >
          <ArrowLeft size={14} /> Volver al listado
        </Link>
      </div>
    );
  }

  const meta = STATUS_META[permit.status];
  const isSupervisor = permit.supervisorId === user?.id;
  const isRequester = permit.requestedBy === user?.id;
  const role = (user as { role?: string } | null)?.role;
  const isAdminOrManager = role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'MANAGER';
  const canAuthorize =
    permit.status === 'PENDING_AUTHORIZATION' &&
    !isRequester &&
    !isSupervisor &&
    (permit.permitType.requiredRoles.length === 0 ||
      (role && (permit.permitType.requiredRoles.includes(role) || role === 'SUPER_ADMIN')));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Breadcrumb */}
      <Link
        href="/operaciones/permisos?tab=trabajo"
        className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4"
        style={{
          fontFamily: 'var(--font-ibm-plex-mono), monospace',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        <ArrowLeft size={12} /> Operaciones / Permisos / Trabajo
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontWeight: 700,
                fontSize: 22,
                color: 'var(--text-primary)',
              }}
            >
              {permit.permitNumber}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${meta.pulse ? 'animate-pulse' : ''}`}
              style={{
                background: meta.bg,
                color: meta.fg,
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
              }}
            >
              {STATUS_LABELS[permit.status]}
            </span>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
              style={{
                background: permit.permitType.color
                  ? `${permit.permitType.color}22`
                  : 'rgba(100, 116, 139, 0.14)',
                color: permit.permitType.color ?? '#475569',
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontWeight: 600,
              }}
            >
              {permit.permitType.code}
            </span>
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
              fontSize: 22,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            {permit.title}
          </h1>
          {permit.workLocation && (
            <p className="text-sm text-[var(--text-secondary)] mt-1">{permit.workLocation}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Action buttons by status */}
          {permit.status === 'DRAFT' && (isRequester || isAdminOrManager) && (
            <ActionBtn
              icon={ChevronRight}
              label="Enviar a autorización"
              color="#2563EB"
              onClick={() => handleSimpleAction('submit')}
            />
          )}
          {permit.status === 'DRAFT' && (isRequester || isAdminOrManager) && (
            <ActionBtn
              icon={XCircle}
              label="Cancelar"
              color="#64748B"
              onClick={() => setCancelOpen(true)}
            />
          )}
          {canAuthorize && (
            <ActionBtn
              icon={CheckCircle2}
              label="Autorizar"
              color="#22C55E"
              onClick={() => setAuthorizeOpen(true)}
            />
          )}
          {permit.status === 'PENDING_AUTHORIZATION' && !isRequester && isAdminOrManager && (
            <ActionBtn
              icon={XCircle}
              label="Rechazar"
              color="#EF4444"
              onClick={() => setRejectOpen(true)}
            />
          )}
          {permit.status === 'AUTHORIZED' && (isSupervisor || isRequester || isAdminOrManager) && (
            <ActionBtn
              icon={Play}
              label="Iniciar trabajo"
              color="#22C55E"
              onClick={() => handleSimpleAction('start')}
            />
          )}
          {permit.status === 'AUTHORIZED' && (isRequester || isSupervisor || isAdminOrManager) && (
            <ActionBtn
              icon={XCircle}
              label="Cancelar"
              color="#64748B"
              onClick={() => setCancelOpen(true)}
            />
          )}
          {permit.status === 'IN_EXECUTION' && (isSupervisor || isAdminOrManager) && (
            <>
              <ActionBtn
                icon={Pause}
                label="Suspender"
                color="#EAB308"
                onClick={() => setSuspendOpen(true)}
              />
              <ActionBtn
                icon={CheckCircle2}
                label="Cerrar"
                color="#22C55E"
                onClick={() => setCloseOpen(true)}
              />
            </>
          )}
          {permit.status === 'SUSPENDED' && (isSupervisor || isAdminOrManager) && (
            <>
              <ActionBtn
                icon={Play}
                label="Reanudar"
                color="#22C55E"
                onClick={() => handleSimpleAction('resume')}
              />
              <ActionBtn
                icon={CheckCircle2}
                label="Cerrar"
                color="#15803D"
                onClick={() => setCloseOpen(true)}
              />
            </>
          )}
        </div>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT */}
        <div className="space-y-4">
          <Card title="Información del trabajo" icon={Wrench}>
            <DescTerm label="Tipo">
              {permit.permitType.name} · {permit.permitType.category}
            </DescTerm>
            <DescTerm label="Descripción">
              <p className="whitespace-pre-wrap">{permit.description}</p>
            </DescTerm>
            {permit.asset && (
              <DescTerm label="Activo asociado">
                <Link
                  href={`/operaciones/equipos/${permit.asset.id}`}
                  className="text-blue-600 hover:underline"
                >
                  {permit.asset.code} · {permit.asset.name}
                </Link>
              </DescTerm>
            )}
            {permit.location && <DescTerm label="Ubicación">{permit.location.name}</DescTerm>}
          </Card>

          <Card title="Equipo de trabajo" icon={ShieldCheck}>
            {permit.workTeam.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Sin integrantes registrados.</p>
            ) : (
              <ul className="space-y-1">
                {permit.workTeam.map((m, idx) => {
                  const internal = m.userId ? userById(m.userId) : null;
                  return (
                    <li
                      key={idx}
                      className="flex items-center justify-between text-sm py-1 border-b border-[var(--border-color)] last:border-b-0"
                    >
                      <span
                        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
                      >
                        {m.name}
                        {internal && (
                          <span className="ml-2 text-xs text-[var(--text-muted)]">
                            ({internal.email})
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)]">{m.role ?? '—'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Riesgos identificados" icon={AlertTriangle}>
            {permit.identifiedRisks.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Sin riesgos registrados.</p>
            ) : (
              <ul className="space-y-1">
                {permit.identifiedRisks.map((r, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <AlertTriangle
                      size={14}
                      style={{ color: '#EAB308', flexShrink: 0, marginTop: 2 }}
                    />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Medidas de control" icon={ShieldCheck}>
            {permit.controlMeasures.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Sin medidas registradas.</p>
            ) : (
              <ul className="space-y-1">
                {permit.controlMeasures.map((c, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <CheckCircle2
                      size={14}
                      style={{ color: '#22C55E', flexShrink: 0, marginTop: 2 }}
                    />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <AttachmentsCard permitId={permit.id} attachments={permit.attachments} onChange={load} />
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
          {/* OPS-026 — multi-step approval chain. Refresh key reuses
              the parent's load() invocations so post-approve actions
              repaint the chain without a full remount. */}
          <Card title="Cadena de aprobación" icon={ShieldCheck}>
            <PermitApprovalTimeline
              permitId={permit.id}
              kind="work-permit"
              users={users}
              refreshKey={(permit.currentApprovalStep ?? 0) + (permit.isFullyApproved ? 1000 : 0)}
            />
          </Card>

          <Card title="Estado y fechas" icon={Clock}>
            <Timeline permit={permit} userById={userById} />
          </Card>

          <Card title="Programación vs ejecución" icon={Clock}>
            <DescTerm label="Inicio planificado">{formatDateTime(permit.plannedStart)}</DescTerm>
            <DescTerm label="Término planificado">{formatDateTime(permit.plannedEnd)}</DescTerm>
            <DescTerm label="Inicio real">
              {permit.actualStart ? formatDateTime(permit.actualStart) : '—'}
            </DescTerm>
            <DescTerm label="Término real">
              {permit.actualEnd ? formatDateTime(permit.actualEnd) : '—'}
            </DescTerm>
            <DescTerm label="Duración máxima permitida">
              {permit.permitType.maxDurationHours}h
            </DescTerm>
          </Card>

          <Card title="Personas" icon={ShieldCheck}>
            <DescTerm label="Solicitante">{formatUser(userById(permit.requestedBy))}</DescTerm>
            <DescTerm label="Supervisor">{formatUser(userById(permit.supervisorId))}</DescTerm>
            <DescTerm label="Autorizado por">
              {permit.authorizedBy
                ? `${formatUser(userById(permit.authorizedBy))} · ${formatDateTime(permit.authorizedAt)}`
                : '—'}
            </DescTerm>
            {permit.authorizationNotes && (
              <p className="text-xs text-[var(--text-muted)] mt-1 italic">
                "{permit.authorizationNotes}"
              </p>
            )}
            <DescTerm label="Cerrado por">
              {permit.closedBy
                ? `${formatUser(userById(permit.closedBy))} · ${formatDateTime(permit.closedAt)}`
                : '—'}
            </DescTerm>
          </Card>

          {permit.permitType.category === 'CONFINED_SPACE' && (
            <Card title="Mediciones de gases" icon={Gauge}>
              <GasMeasurementsCard
                measurements={permit.gasMeasurements ?? []}
                userById={userById}
                onAdd={() => setGasOpen(true)}
                disabled={
                  !['DRAFT', 'PENDING_AUTHORIZATION', 'AUTHORIZED', 'IN_EXECUTION'].includes(
                    permit.status,
                  )
                }
              />
            </Card>
          )}

          {permit.permitType.category === 'LOCKOUT_TAGOUT' && (
            <Card title="Aislaciones (LOTO)" icon={Lock}>
              <p className="text-sm text-[var(--text-muted)]">
                Aún no se han registrado puntos de aislación. Agrégalos desde el listado de medidas
                de control y verifica energía cero antes de iniciar.
              </p>
            </Card>
          )}

          {permit.incidentsReported && (
            <Card title="Incidentes reportados" icon={AlertTriangle}>
              <p className="text-sm whitespace-pre-wrap text-red-700">
                {permit.incidentDescription ?? 'Sin descripción.'}
              </p>
            </Card>
          )}

          {permit.additionalNotes && (
            <Card title="Notas adicionales" icon={Wrench}>
              <p className="text-sm whitespace-pre-wrap">{permit.additionalNotes}</p>
            </Card>
          )}
        </div>
      </div>

      {/* Modals */}
      {authorizeOpen && (
        <ReasonModal
          title="Autorizar permiso"
          confirmLabel="Autorizar"
          confirmColor="#22C55E"
          fieldLabel="Notas de autorización (opcional)"
          required={false}
          onClose={() => setAuthorizeOpen(false)}
          onSubmit={async (notes) => {
            await apiClient.post(`/api/operations/work-permits/${id}/authorize`, {
              authorizationNotes: notes || undefined,
            });
          }}
          onSuccess={() => {
            setAuthorizeOpen(false);
            setToast({ message: 'Permiso autorizado.', type: 'success' });
            load();
          }}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}
      {rejectOpen && (
        <ReasonModal
          title="Rechazar permiso"
          confirmLabel="Rechazar"
          confirmColor="#EF4444"
          fieldLabel="Motivo del rechazo"
          minChars={10}
          required
          onClose={() => setRejectOpen(false)}
          onSubmit={(reason) =>
            apiClient.post(`/api/operations/work-permits/${id}/reject`, { reason })
          }
          onSuccess={() => {
            setRejectOpen(false);
            setToast({ message: 'Permiso rechazado.', type: 'info' });
            load();
          }}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}
      {suspendOpen && (
        <ReasonModal
          title="Suspender permiso"
          confirmLabel="Suspender"
          confirmColor="#EAB308"
          fieldLabel="Motivo de la suspensión"
          minChars={5}
          required
          onClose={() => setSuspendOpen(false)}
          onSubmit={(reason) =>
            apiClient.post(`/api/operations/work-permits/${id}/suspend`, { reason })
          }
          onSuccess={() => {
            setSuspendOpen(false);
            setToast({ message: 'Permiso suspendido.', type: 'info' });
            load();
          }}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}
      {cancelOpen && (
        <ReasonModal
          title="Cancelar permiso"
          confirmLabel="Cancelar permiso"
          confirmColor="#64748B"
          fieldLabel="Motivo de la cancelación"
          minChars={5}
          required
          onClose={() => setCancelOpen(false)}
          onSubmit={(reason) =>
            apiClient.post(`/api/operations/work-permits/${id}/cancel`, { reason })
          }
          onSuccess={() => {
            setCancelOpen(false);
            setToast({ message: 'Permiso cancelado.', type: 'info' });
            load();
          }}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}
      {closeOpen && (
        <CloseModal
          permitId={id}
          onClose={() => setCloseOpen(false)}
          onSuccess={() => {
            setCloseOpen(false);
            setToast({ message: 'Permiso cerrado.', type: 'success' });
            load();
          }}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}
      {gasOpen && (
        <GasMeasurementModal
          permitId={id}
          onClose={() => setGasOpen(false)}
          onSuccess={() => {
            setGasOpen(false);
            setToast({ message: 'Medición registrada.', type: 'success' });
            load();
          }}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}
    </div>
  );
}

/* ---------- Subcomponents ---------- */

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Wrench;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
    >
      <h3
        className="flex items-center gap-1.5 text-sm mb-3"
        style={{
          fontFamily: 'var(--font-outfit), sans-serif',
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        <Icon size={14} /> {title}
      </h3>
      <div>{children}</div>
    </div>
  );
}

function DescTerm({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-[var(--border-color)] last:border-b-0">
      <span
        className="text-xs uppercase tracking-wider text-[var(--text-secondary)] flex-shrink-0"
        style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace', letterSpacing: '0.12em' }}
      >
        {label}
      </span>
      <span
        className="text-sm text-right text-[var(--text-primary)]"
        style={{ wordBreak: 'break-word' }}
      >
        {children}
      </span>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  color,
  onClick,
}: {
  icon: typeof Play;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm"
      style={{
        background: `${color}1A`,
        color,
        fontFamily: 'var(--font-outfit), sans-serif',
        fontWeight: 600,
      }}
    >
      <Icon size={13} /> {label}
    </button>
  );
}

function Timeline({
  permit,
  userById,
}: {
  permit: WorkPermitDetail;
  userById: (uid?: string | null) => UserSummary | null;
}) {
  const events: Array<{ label: string; date: string | null; user?: string | null; color: string }> =
    [
      {
        label: 'Solicitado',
        date: permit.createdAt,
        user: formatUser(userById(permit.requestedBy)),
        color: '#94A3B8',
      },
      {
        label: 'Autorizado',
        date: permit.authorizedAt ?? null,
        user: permit.authorizedBy ? formatUser(userById(permit.authorizedBy)) : null,
        color: '#1d4ed8',
      },
      {
        label: 'Inicio real',
        date: permit.actualStart ?? null,
        color: '#F97316',
      },
      {
        label: 'Cierre',
        date: permit.closedAt ?? null,
        user: permit.closedBy ? formatUser(userById(permit.closedBy)) : null,
        color: '#15803D',
      },
    ];

  return (
    <ol className="space-y-3">
      {events.map((e, idx) => (
        <li key={idx} className="flex items-start gap-2">
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 999,
              marginTop: 6,
              background: e.date ? e.color : 'rgba(0,0,0,0.15)',
              flexShrink: 0,
            }}
          />
          <div>
            <div
              className="text-xs uppercase tracking-wider text-[var(--text-secondary)]"
              style={{
                fontFamily: 'var(--font-ibm-plex-mono), monospace',
                letterSpacing: '0.12em',
              }}
            >
              {e.label}
            </div>
            <div className="text-sm text-[var(--text-primary)]">
              {e.date ? formatDateTime(e.date) : 'Pendiente'}
            </div>
            {e.user && <div className="text-xs text-[var(--text-muted)]">{e.user}</div>}
          </div>
        </li>
      ))}
      {permit.statusReason && (
        <li className="text-xs text-[var(--text-muted)] italic">"{permit.statusReason}"</li>
      )}
    </ol>
  );
}

function AttachmentsCard({
  permitId,
  attachments,
  onChange,
}: {
  permitId: string;
  attachments: AttachmentRecord[];
  onChange: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await apiClient.uploadFile(`/api/operations/work-permits/${permitId}/attachments`, fd);
      onChange();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo cargar el archivo.');
    } finally {
      setUploading(false);
    }
  };
  const handleDelete = async (idx: number) => {
    if (!window.confirm('¿Eliminar este adjunto?')) return;
    try {
      await apiClient.delete(`/api/operations/work-permits/${permitId}/attachments/${idx}`);
      onChange();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo eliminar.');
    }
  };
  const handleDownload = async (idx: number, name: string) => {
    try {
      const blob = await apiClient.fetchBlob(
        `/api/operations/work-permits/${permitId}/attachments/${idx}?download=1`,
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo descargar.');
    }
  };

  return (
    <Card title="Adjuntos" icon={FileUp}>
      {attachments.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] mb-2">Sin adjuntos.</p>
      ) : (
        <ul className="space-y-1 mb-2">
          {attachments.map((a, idx) => (
            <li
              key={a.id}
              className="flex items-center justify-between text-sm py-1.5 px-2 rounded-md hover:bg-gray-50"
            >
              <span className="truncate">
                {a.fileName}
                <span className="text-xs text-[var(--text-muted)] ml-2">
                  {Math.round(a.fileSize / 1024)} KB
                </span>
              </span>
              <span className="flex items-center gap-1 ml-2">
                <button
                  onClick={() => handleDownload(idx, a.fileName)}
                  className="p-1 rounded hover:bg-gray-100 text-[var(--text-secondary)]"
                  title="Descargar"
                >
                  <Download size={13} />
                </button>
                <button
                  onClick={() => handleDelete(idx)}
                  className="p-1 rounded hover:bg-red-50 text-red-600"
                  title="Eliminar"
                >
                  <Trash2 size={13} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          if (fileRef.current) fileRef.current.value = '';
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading || attachments.length >= 5}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-full border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
      >
        <FileUp size={12} /> {uploading ? 'Subiendo...' : 'Cargar adjunto'}
      </button>
      {attachments.length >= 5 && (
        <span className="ml-2 text-xs text-[var(--text-muted)]">Máximo 5 adjuntos.</span>
      )}
    </Card>
  );
}

function GasMeasurementsCard({
  measurements,
  userById,
  onAdd,
  disabled,
}: {
  measurements: GasMeasurement[];
  userById: (uid?: string | null) => UserSummary | null;
  onAdd: () => void;
  disabled: boolean;
}) {
  return (
    <>
      {measurements.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] mb-2">Sin mediciones registradas.</p>
      ) : (
        <ul className="space-y-1 mb-2">
          {measurements.map((m) => (
            <li key={m.id} className="text-sm flex items-center justify-between">
              <span style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}>
                {m.gas}: {m.value} {m.unit}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                {formatDateTime(m.measuredAt)} · {formatUser(userById(m.recordedBy))}
              </span>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={onAdd}
        disabled={disabled}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-full border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
      >
        <Gauge size={12} /> Registrar medición
      </button>
    </>
  );
}

function ReasonModal({
  title,
  confirmLabel,
  confirmColor,
  fieldLabel,
  minChars,
  required,
  onClose,
  onSubmit,
  onSuccess,
  onError,
}: {
  title: string;
  confirmLabel: string;
  confirmColor: string;
  fieldLabel: string;
  minChars?: number;
  required: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const handleSubmit = async () => {
    if (required && reason.trim().length < (minChars ?? 1)) {
      onError(`Ingresa un texto de al menos ${minChars ?? 1} caracteres.`);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(reason.trim());
      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo completar la acción.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)]">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-2">
          <label
            className="block text-xs text-[var(--text-secondary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            {fieldLabel} {required && <span className="text-red-500">*</span>}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="cp-input"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-full"
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
            style={{
              background: confirmColor,
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
            }}
          >
            {submitting ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CloseModal({
  permitId,
  onClose,
  onSuccess,
  onError,
}: {
  permitId: string;
  onClose: () => void;
  onSuccess: () => void;
  onError: (m: string) => void;
}) {
  const [closureNotes, setClosureNotes] = useState('');
  const [incidents, setIncidents] = useState(false);
  const [incidentDescription, setIncidentDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (closureNotes.trim().length < 5) {
      onError('Describe el cierre del trabajo.');
      return;
    }
    if (incidents && incidentDescription.trim().length === 0) {
      onError('Describe el incidente reportado.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`/api/operations/work-permits/${permitId}/close`, {
        closureNotes: closureNotes.trim(),
        incidentsReported: incidents,
        incidentDescription: incidents ? incidentDescription.trim() : undefined,
      });
      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo cerrar el permiso.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)]">
          <h3 className="text-base font-semibold">Cerrar permiso</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Notas de cierre <span className="text-red-500">*</span>
            </label>
            <textarea
              value={closureNotes}
              onChange={(e) => setClosureNotes(e.target.value)}
              rows={3}
              className="cp-input"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={incidents}
              onChange={(e) => setIncidents(e.target.checked)}
            />
            Se reportaron incidentes durante la ejecución
          </label>
          {incidents && (
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                Descripción del incidente <span className="text-red-500">*</span>
              </label>
              <textarea
                value={incidentDescription}
                onChange={(e) => setIncidentDescription(e.target.value)}
                rows={3}
                className="cp-input"
              />
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-full"
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
            style={{
              background: '#22C55E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
            }}
          >
            {submitting ? 'Cerrando...' : 'Cerrar permiso'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GasMeasurementModal({
  permitId,
  onClose,
  onSuccess,
  onError,
}: {
  permitId: string;
  onClose: () => void;
  onSuccess: () => void;
  onError: (m: string) => void;
}) {
  const [gas, setGas] = useState('O2');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('%');
  const [measuredAt, setMeasuredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (!gas.trim() || value === '' || !unit.trim() || !measuredAt) {
      onError('Completa todos los campos.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`/api/operations/work-permits/${permitId}/gas-measurement`, {
        gas: gas.trim(),
        value: Number(value),
        unit: unit.trim(),
        measuredAt: new Date(measuredAt).toISOString(),
      });
      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo registrar la medición.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)]">
          <h3 className="text-base font-semibold">Registrar medición de gas</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Gas</label>
            <select value={gas} onChange={(e) => setGas(e.target.value)} className="cp-input">
              <option value="O2">O₂ (Oxígeno)</option>
              <option value="H2S">H₂S (Sulfuro)</option>
              <option value="CO">CO (Monóxido)</option>
              <option value="LEL">LEL (% explosividad)</option>
              <option value="OTRO">Otro</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Valor</label>
            <input
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="cp-input"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Unidad</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className="cp-input" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Medido en</label>
            <input
              type="datetime-local"
              value={measuredAt}
              onChange={(e) => setMeasuredAt(e.target.value)}
              className="cp-input"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-full"
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
            style={{ background: '#7C3AED', fontWeight: 600 }}
          >
            {submitting ? 'Guardando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Format helpers ---------- */

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}

function formatUser(u: UserSummary | null): string {
  if (!u) return '—';
  return `${u.firstName} ${u.lastName}`.trim() || u.email;
}
