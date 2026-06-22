'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  TrendingUp,
  Users,
  X,
  MapPin,
  FileText,
  CheckCircle2,
  Clock,
  ClipboardList,
  ChevronRight,
  Loader2,
  Calendar,
  Megaphone,
  BadgeCheck,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { formatCLP, formatDate } from '../../../../lib/formatters';

/* ─────────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────────── */

interface Stage {
  id: string;
  name: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
}

interface Opportunity {
  id: string;
  title: string;
  amount: number | string;
  probability: number | string;
  expectedCloseDate: string | null;
  ownerName: string;
  stageId: string;
  stageName: string;
  stageIsWon: boolean;
  stageOrder: number;
  clientName: string;
  counterpartyId: string;
  serviceId: string | null;
  serviceName: string | null;
  serviceCategory: string | null;
  sourceCampaignId: string | null;
  sourceCampaignName: string | null;
  needDetected: string | null;
  serviceZone: string | null;
  requiresVisit: boolean;
  requiresDrone: boolean;
  requiresCertifiedStaff: boolean;
  lossReason: string | null;
  tags: string[];
  generatedCommitmentAmount: number | string | null;
  generatedCommitmentDate: string | null;
}

interface Activity {
  id: string;
  type: string;
  subject: string;
  notes: string | null;
  dueDate: string | null;
  done: boolean;
  ownerName: string | null;
  createdAt: string;
}

interface OpportunityDetail extends Opportunity {
  activities: Activity[];
}

type ColumnMap = Record<string, Opportunity[]>;

/* ─────────────────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────────────────── */

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  DRONE:       { bg: 'rgba(37,99,235,0.12)',  text: '#60a5fa',  border: 'rgba(37,99,235,0.25)' },
  LIMPIEZA:    { bg: 'rgba(20,184,166,0.12)', text: '#2dd4bf',  border: 'rgba(20,184,166,0.25)' },
  INSPECCION:  { bg: 'rgba(245,158,11,0.12)', text: '#fbbf24',  border: 'rgba(245,158,11,0.25)' },
  AUDIOVISUAL: { bg: 'rgba(139,92,246,0.12)', text: '#a78bfa',  border: 'rgba(139,92,246,0.25)' },
  INDUSTRIAL:  { bg: 'rgba(239,68,68,0.12)',  text: '#f87171',  border: 'rgba(239,68,68,0.25)' },
};

const CATEGORY_LABELS: Record<string, string> = {
  DRONE:       'Dron',
  LIMPIEZA:    'Limpieza',
  INSPECCION:  'Inspección',
  AUDIOVISUAL: 'Audiovisual',
  INDUSTRIAL:  'Industrial',
};

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  LLAMADA:    'Llamada',
  EMAIL:      'Email',
  REUNION:    'Reunión',
  VISITA:     'Visita',
  PROPUESTA:  'Propuesta',
  SEGUIMIENTO:'Seguimiento',
  OTRO:       'Otro',
};

/* ─────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────── */

function buildColumnMap(stages: Stage[], opportunities: Opportunity[]): ColumnMap {
  const map: ColumnMap = {};
  for (const stage of stages) {
    map[stage.id] = [];
  }
  for (const opp of opportunities) {
    if (map[opp.stageId]) {
      map[opp.stageId].push(opp);
    } else {
      map[opp.stageId] = [opp];
    }
  }
  return map;
}

function columnTotal(opps: Opportunity[]): number {
  return opps.reduce((sum, o) => sum + Number(o.amount), 0);
}

function categoryStyle(cat: string | null) {
  if (!cat) return CATEGORY_COLORS['DRONE'];
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS['DRONE'];
}

function categoryLabel(cat: string | null) {
  if (!cat) return 'Servicio';
  return CATEGORY_LABELS[cat] ?? cat;
}

/* ─────────────────────────────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────────────────────────────── */

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-[rgba(128,128,128,0.12)] ${className}`} />
  );
}

function ProbabilityBar({ probability }: { probability: number }) {
  const pct = Math.max(0, Math.min(100, probability));
  const color = pct >= 70 ? '#16a34a' : pct >= 40 ? '#ca8a04' : '#dc2626';
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[rgba(128,128,128,0.14)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-semibold shrink-0" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

/* ── Opportunity Card ─────────────────────────────────────────────── */

interface OpportunityCardProps {
  opp: Opportunity;
  stageIsWon: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onClick: (opp: Opportunity) => void;
}

function OpportunityCard({ opp, stageIsWon, onDragStart, onClick }: OpportunityCardProps) {
  const amount = Number(opp.amount);
  const probability = Number(opp.probability);
  const catStyle = categoryStyle(opp.serviceCategory);

  return (
    <div
      draggable
      onDragStart={(e) => { e.stopPropagation(); onDragStart(e, opp.id); }}
      onClick={() => onClick(opp)}
      className="
        rounded-lg border border-[var(--border-color)]
        p-3.5 cursor-pointer select-none
        hover:border-[rgba(37,99,235,0.4)] hover:shadow-md
        transition-all duration-150 group
      "
      style={{ background: 'rgba(28,28,38,0.55)', backdropFilter: 'blur(12px)' }}
    >
      {/* Service category chip */}
      {opp.serviceName && (
        <div className="mb-2">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border"
            style={{ background: catStyle.bg, color: catStyle.text, borderColor: catStyle.border }}
          >
            {categoryLabel(opp.serviceCategory)} · {opp.serviceName}
          </span>
        </div>
      )}

      {/* Title */}
      <p className="text-sm font-semibold text-[var(--text-primary)] leading-snug line-clamp-2 group-hover:text-[#2563eb] transition-colors">
        {opp.title}
      </p>

      {/* Client */}
      <p className="mt-1 text-xs text-[var(--text-secondary)] truncate flex items-center gap-1">
        <Users size={11} className="shrink-0" />
        {opp.clientName}
      </p>

      {/* Amount */}
      <p className="mt-2 text-base font-bold text-[var(--text-primary)]">
        {formatCLP(amount)}
      </p>

      {/* Probability bar */}
      <ProbabilityBar probability={probability} />

      {/* Owner & close date */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-[var(--text-secondary)] truncate">
          {opp.ownerName}
        </span>
        {opp.expectedCloseDate && (
          <span className="text-[10px] text-[var(--text-secondary)] shrink-0 flex items-center gap-0.5">
            <Calendar size={9} />
            {formatDate(opp.expectedCloseDate)}
          </span>
        )}
      </div>

      {/* Tags */}
      {opp.tags && opp.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {opp.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[rgba(37,99,235,0.10)] text-[#60a5fa]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Source campaign */}
      {opp.sourceCampaignName && (
        <div className="mt-2">
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-[rgba(37,99,235,0.13)] text-[#93c5fd] border border-[rgba(37,99,235,0.22)]">
            📣 {opp.sourceCampaignName}
          </span>
        </div>
      )}

      {/* Won commitment badge */}
      {stageIsWon && opp.generatedCommitmentAmount != null && (
        <div className="mt-2.5 rounded-md bg-[rgba(22,163,74,0.12)] border border-[rgba(22,163,74,0.3)] px-2.5 py-1.5">
          <p className="text-[10px] font-semibold text-green-400 leading-snug">
            → Compromiso en Finanzas (demo)
          </p>
          <p className="text-xs font-bold text-green-300 mt-0.5">
            {formatCLP(Number(opp.generatedCommitmentAmount))}
          </p>
          {opp.generatedCommitmentDate && (
            <p className="text-[10px] text-green-500 mt-0.5">
              {formatDate(opp.generatedCommitmentDate)}
            </p>
          )}
        </div>
      )}

      {/* Detail hint */}
      <div className="mt-2.5 flex items-center gap-1 text-[10px] text-[rgba(148,163,184,0.5)] group-hover:text-[rgba(148,163,184,0.8)] transition-colors">
        <ClipboardList size={9} />
        Ver detalle
        <ChevronRight size={9} />
      </div>
    </div>
  );
}

/* ── Kanban Column ────────────────────────────────────────────────── */

interface KanbanColumnProps {
  stage: Stage;
  opps: Opportunity[];
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, stageId: string) => void;
  onDragLeave: (stageId: string) => void;
  onDrop: (e: React.DragEvent, stageId: string) => void;
  onCardClick: (opp: Opportunity) => void;
}

function KanbanColumn({
  stage, opps, isDragOver,
  onDragStart, onDragOver, onDragLeave, onDrop, onCardClick,
}: KanbanColumnProps) {
  const total = columnTotal(opps);
  const headerColor = stage.isWon
    ? 'border-t-green-500'
    : stage.isLost
    ? 'border-t-red-500'
    : 'border-t-[#2563eb]';

  return (
    <div className="flex flex-col flex-shrink-0 w-72 rounded-xl overflow-hidden" style={{ minHeight: '60vh' }}>
      {/* Header */}
      <div
        className={`bg-[var(--bg-card)] border border-[var(--border-color)] border-t-2 ${headerColor} rounded-t-xl px-3.5 py-3 flex-shrink-0`}
        style={{ background: 'rgba(24,24,34,0.7)', backdropFilter: 'blur(12px)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <h3
            className="text-sm font-semibold text-[var(--text-primary)] truncate"
            style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
          >
            {stage.name}
          </h3>
          <span className="flex-shrink-0 inline-flex items-center justify-center rounded-full bg-[rgba(37,99,235,0.14)] text-[#93c5fd] text-[10px] font-bold w-5 h-5">
            {opps.length}
          </span>
        </div>
        <p className="mt-1 text-xs font-medium text-[var(--text-secondary)]">
          {formatCLP(total)}
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => onDragOver(e, stage.id)}
        onDragLeave={() => onDragLeave(stage.id)}
        onDrop={(e) => onDrop(e, stage.id)}
        className={`
          flex-1 flex flex-col gap-2.5 p-2.5
          border-x border-b border-[var(--border-color)] rounded-b-xl
          transition-colors duration-150
          ${isDragOver
            ? 'bg-[rgba(37,99,235,0.08)] border-[rgba(37,99,235,0.4)]'
            : 'bg-[rgba(14,14,20,0.35)]'
          }
        `}
      >
        {opps.length === 0 ? (
          <div
            className={`
              flex-1 flex items-center justify-center rounded-lg border-2 border-dashed
              text-[11px] text-[var(--text-secondary)] transition-colors duration-150 min-h-[80px]
              ${isDragOver
                ? 'border-[rgba(37,99,235,0.5)] text-[#93c5fd]'
                : 'border-[rgba(128,128,128,0.18)]'
              }
            `}
          >
            {isDragOver ? 'Soltar aquí' : 'Sin oportunidades'}
          </div>
        ) : (
          opps.map((opp) => (
            <OpportunityCard
              key={opp.id}
              opp={opp}
              stageIsWon={stage.isWon}
              onDragStart={onDragStart}
              onClick={onCardClick}
            />
          ))
        )}
        {opps.length > 0 && isDragOver && (
          <div className="rounded-lg border-2 border-dashed border-[rgba(37,99,235,0.5)] h-14 flex items-center justify-center text-[11px] text-[#93c5fd]">
            Soltar aquí
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Live Staff Panel ─────────────────────────────────────────────── */

interface ForServiceStaffMember {
  name: string;
  role: string;
  certStatus: string | null;
  availabilityStatus: string | null;
  available: boolean;
}

interface ForServiceResult {
  service: string;
  requiredCertType: string | null;
  requiresDrone: boolean;
  qualified: number;
  available: number;
  canStaff: boolean;
  date: string;
  staff: ForServiceStaffMember[];
}

const CERT_TYPE_LABELS: Record<string, string> = {
  PILOTO_DRONE: 'Piloto de Drone',
  SEGURIDAD: 'Seguridad',
  TECNICA: 'Técnica',
  CLIENTE: 'Cliente',
  FAENA: 'Faena',
  INDUCCION: 'Inducción',
};

const CERT_STATUS_LABELS: Record<string, string> = {
  VIGENTE: 'Vigente',
  POR_VENCER: 'Por vencer',
  VENCIDA: 'Vencida',
};

const AVAIL_STATUS_LABELS: Record<string, string> = {
  DISPONIBLE: 'Disponible',
  VACACIONES: 'Vacaciones',
  LICENCIA: 'Licencia',
  CAPACITACION: 'Capacitación',
  ASIGNADO: 'Asignado',
  DIA_LIBRE: 'Día libre',
};

function certStatusColor(status: string | null): string {
  if (status === 'VIGENTE') return '#16a34a';
  if (status === 'POR_VENCER') return '#d97706';
  if (status === 'VENCIDA') return '#b91c1c';
  return 'rgba(148,163,184,0.6)';
}

function LiveStaffPanel({ opp }: { opp: Opportunity }) {
  const [data, setData] = useState<ForServiceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const oppId = opp.id;
  const serviceName = opp.serviceName ?? '';

  useEffect(() => {
    if (!serviceName) {
      setData(null);
      setFetchError(null);
      return;
    }
    setLoading(true);
    setFetchError(null);
    setData(null);

    apiClient
      .get<ForServiceResult>(`/api/rrhh/availability/for-service?service=${encodeURIComponent(serviceName)}`)
      .then((d) => setData(d))
      .catch(() => setFetchError('No se pudo obtener disponibilidad de personal.'))
      .finally(() => setLoading(false));
  }, [oppId, serviceName]);

  const roleLabel =
    data?.requiredCertType === 'PILOTO_DRONE' ? 'pilotos' : 'técnicos';

  const headlineColor = data
    ? data.canStaff
      ? '#16a34a'
      : data.qualified > 0
      ? '#d97706'
      : '#b91c1c'
    : 'var(--text-primary)';

  return (
    <div className="rounded-xl border border-[rgba(37,99,235,0.2)] bg-[rgba(37,99,235,0.06)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
          Disponibilidad de personal
        </h4>
        <span className="text-[9px] font-medium text-[rgba(148,163,184,0.6)] border border-[rgba(148,163,184,0.2)] rounded-full px-2 py-0.5 uppercase tracking-wide">
          En vivo desde RRHH
        </span>
      </div>

      {/* No service name fallback */}
      {!serviceName && (
        <div className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
          <CheckCircle2 size={13} className="text-[#60a5fa] shrink-0 mt-0.5" />
          <span>Personal estándar disponible</span>
        </div>
      )}

      {/* Loading */}
      {serviceName && loading && (
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <Loader2 size={13} className="animate-spin shrink-0" />
          <span>Consultando disponibilidad...</span>
        </div>
      )}

      {/* Fetch error */}
      {fetchError && (
        <div className="flex items-start gap-2 text-xs text-red-400">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{fetchError}</span>
        </div>
      )}

      {/* Live data */}
      {data && !loading && (
        <div className="flex flex-col gap-3">
          {/* Headline */}
          {data.requiredCertType === null ? (
            <p className="text-xs font-medium" style={{ color: '#60a5fa' }}>
              Servicio sin requisito de certificación específico
              <span className="ml-2 text-[var(--text-secondary)] font-normal">
                · {data.available} disponibles de {data.qualified} calificados
              </span>
            </p>
          ) : (
            <p className="text-sm font-semibold" style={{ color: headlineColor }}>
              {data.available} de {data.qualified}{' '}
              {CERT_TYPE_LABELS[data.requiredCertType] ?? roleLabel}{' '}
              certificados disponibles
            </p>
          )}

          {/* Staff list */}
          {data.staff.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {data.staff.map((member, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)]"
                >
                  {/* Available indicator */}
                  <span className="shrink-0">
                    {member.available ? (
                      <CheckCircle2 size={12} style={{ color: '#16a34a' }} />
                    ) : (
                      <X size={12} style={{ color: '#b91c1c' }} />
                    )}
                  </span>

                  {/* Name + role */}
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                      {member.name}
                    </span>
                    <span className="ml-1.5 text-[10px] text-[var(--text-secondary)]">
                      {member.role}
                    </span>
                  </div>

                  {/* Cert status badge */}
                  {member.certStatus && (
                    <span
                      className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border"
                      style={{
                        color: certStatusColor(member.certStatus),
                        borderColor: certStatusColor(member.certStatus),
                        background: `${certStatusColor(member.certStatus)}18`,
                      }}
                    >
                      {CERT_STATUS_LABELS[member.certStatus] ?? member.certStatus}
                    </span>
                  )}

                  {/* Availability label */}
                  {member.availabilityStatus && (
                    <span className="shrink-0 text-[9px] text-[var(--text-secondary)]">
                      {AVAIL_STATUS_LABELS[member.availabilityStatus] ?? member.availabilityStatus}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {data.staff.length === 0 && (
            <p className="text-xs text-[var(--text-secondary)]">
              Sin personal registrado para este servicio.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Opportunity Detail Drawer ────────────────────────────────────── */

interface DrawerProps {
  opp: Opportunity | null;
  onClose: () => void;
}

function OpportunityDrawer({ opp, onClose }: DrawerProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<OpportunityDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!opp) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    setLoadingDetail(true);
    setDetailError(null);
    setDetail(null);

    apiClient
      .get<OpportunityDetail>(`/api/comercial/opportunities/${opp.id}`)
      .then((d) => setDetail(d))
      .catch(() => setDetailError('No se pudo cargar el detalle.'))
      .finally(() => setLoadingDetail(false));
  }, [opp?.id]);

  // Close on Escape key
  useEffect(() => {
    if (!opp) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [opp, onClose]);

  const isOpen = !!opp;
  const amount = opp ? Number(opp.amount) : 0;
  const probability = opp ? Number(opp.probability) : 0;
  const catStyle = categoryStyle(opp?.serviceCategory ?? null);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer panel */}
      <div
        className={`
          fixed top-0 right-0 z-50 h-full w-full max-w-[520px]
          flex flex-col
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        style={{ background: 'rgba(14,14,22,0.97)', backdropFilter: 'blur(20px)', borderLeft: '1px solid rgba(255,255,255,0.07)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de oportunidad"
      >
        {/* Drawer header */}
        <div
          className="flex-shrink-0 flex items-start justify-between gap-3 px-6 pt-5 pb-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="min-w-0">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#2563eb]"
              style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
            >
              Oportunidad
            </span>
            <h2
              className="mt-1 text-lg font-semibold text-[var(--text-primary)] leading-snug line-clamp-2"
              style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
            >
              {opp?.title ?? ''}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 mt-0.5 rounded-lg p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.07)] transition-colors"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {!opp ? null : (
            <>
              {/* Primary info grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Client */}
                <div className="col-span-2 rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">Cliente</p>
                  <p className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                    <Users size={13} className="text-[#60a5fa] shrink-0" />
                    {opp.clientName}
                  </p>
                </div>

                {/* Amount */}
                <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">Monto</p>
                  <p className="text-base font-bold text-[var(--text-primary)]">{formatCLP(amount)}</p>
                </div>

                {/* Probability */}
                <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">Probabilidad</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2 rounded-full bg-[rgba(128,128,128,0.14)] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${probability}%`,
                          backgroundColor: probability >= 70 ? '#16a34a' : probability >= 40 ? '#ca8a04' : '#dc2626',
                        }}
                      />
                    </div>
                    <span className="text-sm font-bold text-[var(--text-primary)]">{probability}%</span>
                  </div>
                </div>

                {/* Owner */}
                <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">Responsable</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{opp.ownerName}</p>
                </div>

                {/* Expected close */}
                <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">Cierre estimado</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {opp.expectedCloseDate ? formatDate(opp.expectedCloseDate) : '—'}
                  </p>
                </div>
              </div>

              {/* Service */}
              {opp.serviceName && (
                <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-2">Servicio</p>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border"
                      style={{ background: catStyle.bg, color: catStyle.text, borderColor: catStyle.border }}
                    >
                      {categoryLabel(opp.serviceCategory)}
                    </span>
                    <span className="text-sm font-medium text-[var(--text-primary)]">{opp.serviceName}</span>
                  </div>
                </div>
              )}

              {/* Operational flags */}
              <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-3">Requerimientos operacionales</p>
                <div className="flex flex-wrap gap-2">
                  <FlagChip active={opp.requiresDrone} icon={<Sparkles size={11} />} label="Dron" />
                  <FlagChip active={opp.requiresCertifiedStaff} icon={<BadgeCheck size={11} />} label="Personal certificado" />
                  <FlagChip active={opp.requiresVisit} icon={<MapPin size={11} />} label="Visita terreno" />
                </div>
                {opp.serviceZone && (
                  <p className="mt-3 text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                    <MapPin size={12} className="text-[#fbbf24]" />
                    Zona de servicio: <span className="font-medium text-[var(--text-primary)]">{opp.serviceZone}</span>
                  </p>
                )}
              </div>

              {/* Needs detected */}
              {opp.needDetected && (
                <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">Necesidad detectada</p>
                  <p className="text-sm text-[var(--text-primary)] leading-relaxed">{opp.needDetected}</p>
                </div>
              )}

              {/* Source campaign */}
              {opp.sourceCampaignName && (
                <div className="rounded-xl border border-[rgba(37,99,235,0.2)] bg-[rgba(37,99,235,0.05)] px-4 py-3 flex items-center gap-3">
                  <Megaphone size={15} className="text-[#93c5fd] shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[#93c5fd] mb-0.5">Campaña origen</p>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{opp.sourceCampaignName}</p>
                  </div>
                </div>
              )}

              {/* Won commitment */}
              {opp.stageIsWon && opp.generatedCommitmentAmount != null && (
                <div className="rounded-xl border border-[rgba(22,163,74,0.3)] bg-[rgba(22,163,74,0.08)] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-green-400 mb-1">Compromiso en Finanzas (demo)</p>
                  <p className="text-lg font-bold text-green-300">{formatCLP(Number(opp.generatedCommitmentAmount))}</p>
                  {opp.generatedCommitmentDate && (
                    <p className="text-xs text-green-500 mt-0.5">{formatDate(opp.generatedCommitmentDate)}</p>
                  )}
                </div>
              )}

              {/* Live staff panel — sourced from RRHH */}
              <LiveStaffPanel opp={opp} />

              {/* Activities */}
              <div>
                <h3
                  className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-3 flex items-center gap-1.5"
                >
                  <ClipboardList size={13} className="text-[#60a5fa]" />
                  Actividades
                </h3>

                {loadingDetail ? (
                  <div className="flex items-center gap-2 py-4 text-xs text-[var(--text-secondary)]">
                    <Loader2 size={14} className="animate-spin" />
                    Cargando actividades...
                  </div>
                ) : detailError ? (
                  <p className="text-xs text-red-400 py-2">{detailError}</p>
                ) : !detail || detail.activities.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[rgba(128,128,128,0.2)] py-6 text-center text-xs text-[var(--text-secondary)]">
                    Sin actividades registradas
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {detail.activities.map((act) => (
                      <ActivityRow key={act.id} activity={act} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Drawer footer — CTA */}
        <div
          className="flex-shrink-0 px-6 py-4 flex items-center gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <button
            onClick={() => opp && router.push(`/comercial/cotizaciones?opportunityId=${opp.id}`)}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }}
          >
            <FileText size={15} />
            Crear cotización
          </button>
          <button
            onClick={onClose}
            className="rounded-xl border border-[rgba(255,255,255,0.12)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[rgba(255,255,255,0.2)] transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Flag chip ────────────────────────────────────────────────────── */

function FlagChip({ active, icon, label }: { active: boolean; icon: React.ReactNode; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors"
      style={
        active
          ? { background: 'rgba(37,99,235,0.12)', color: '#60a5fa', borderColor: 'rgba(37,99,235,0.3)' }
          : { background: 'rgba(128,128,128,0.07)', color: 'rgba(148,163,184,0.4)', borderColor: 'rgba(128,128,128,0.12)' }
      }
    >
      {icon}
      {label}
      {active ? (
        <CheckCircle2 size={10} className="ml-0.5" />
      ) : (
        <X size={10} className="ml-0.5 opacity-40" />
      )}
    </span>
  );
}

/* ── Activity row ─────────────────────────────────────────────────── */

function ActivityRow({ activity }: { activity: Activity }) {
  const typeLabel = ACTIVITY_TYPE_LABELS[activity.type] ?? activity.type;
  return (
    <div
      className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] px-3.5 py-2.5 flex items-start gap-3"
    >
      <div
        className="shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center"
        style={activity.done
          ? { background: 'rgba(22,163,74,0.15)' }
          : { background: 'rgba(37,99,235,0.12)' }
        }
      >
        {activity.done ? (
          <CheckCircle2 size={11} className="text-green-400" />
        ) : (
          <Clock size={11} className="text-[#60a5fa]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[var(--text-primary)] truncate">{activity.subject}</span>
          <span
            className="shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(37,99,235,0.1)', color: '#93c5fd' }}
          >
            {typeLabel}
          </span>
        </div>
        {activity.notes && (
          <p className="mt-0.5 text-[11px] text-[var(--text-secondary)] line-clamp-2">{activity.notes}</p>
        )}
        <div className="mt-1 flex items-center gap-2 text-[10px] text-[rgba(148,163,184,0.5)]">
          {activity.ownerName && <span>{activity.ownerName}</span>}
          {activity.dueDate && (
            <>
              <span>·</span>
              <span className="flex items-center gap-0.5">
                <Calendar size={9} />
                {formatDate(activity.dueDate)}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Main page
───────────────────────────────────────────────────────────────────── */

export default function ComercialPipelinePage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [columnMap, setColumnMap] = useState<ColumnMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [drawerOpp, setDrawerOpp] = useState<Opportunity | null>(null);

  const draggedIdRef = useRef<string | null>(null);
  const snapshotRef = useRef<ColumnMap | null>(null);

  /* ── Load data ─────────────────────────────────────────────────── */

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stagesData, oppsData] = await Promise.all([
        apiClient.get<Stage[]>('/api/comercial/stages'),
        apiClient.get<Opportunity[]>('/api/comercial/opportunities'),
      ]);
      const sorted = [...stagesData].sort((a, b) => a.order - b.order);
      setStages(sorted);
      setColumnMap(buildColumnMap(sorted, oppsData));
    } catch {
      setError('No se pudo cargar el pipeline. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── Drag handlers ─────────────────────────────────────────────── */

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    draggedIdRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stageId);
  }, []);

  const handleDragLeave = useCallback((stageId: string) => {
    setDragOverStage((prev) => (prev === stageId ? null : prev));
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetStageId: string) => {
      e.preventDefault();
      setDragOverStage(null);

      const oppId = draggedIdRef.current;
      if (!oppId) return;
      draggedIdRef.current = null;

      let sourceStageId: string | null = null;
      let movedOpp: Opportunity | null = null;

      for (const [sid, opps] of Object.entries(columnMap)) {
        const found = opps.find((o) => o.id === oppId);
        if (found) {
          sourceStageId = sid;
          movedOpp = found;
          break;
        }
      }

      if (!movedOpp || sourceStageId === targetStageId) return;

      const targetStage = stages.find((s) => s.id === targetStageId);
      if (!targetStage) return;

      snapshotRef.current = JSON.parse(JSON.stringify(columnMap));

      const updatedOpp: Opportunity = {
        ...movedOpp,
        stageId: targetStageId,
        stageName: targetStage.name,
        stageIsWon: targetStage.isWon,
        stageOrder: targetStage.order,
      };

      setColumnMap((prev) => {
        const next: ColumnMap = {};
        for (const [sid, opps] of Object.entries(prev)) {
          next[sid] = opps.filter((o) => o.id !== oppId);
        }
        next[targetStageId] = [...(next[targetStageId] ?? []), updatedOpp];
        return next;
      });

      try {
        const result = await apiClient.patch<Opportunity>(
          `/api/comercial/opportunities/${oppId}/move-stage`,
          { stageId: targetStageId }
        );

        setColumnMap((prev) => {
          const next: ColumnMap = {};
          for (const [sid, opps] of Object.entries(prev)) {
            next[sid] = opps.map((o) => (o.id === oppId ? { ...o, ...result } : o));
          }
          return next;
        });

        /* Sync drawer if the moved opp is open */
        setDrawerOpp((prev) =>
          prev && prev.id === oppId ? { ...prev, ...result } : prev
        );

        setMoveError(null);
      } catch {
        if (snapshotRef.current) setColumnMap(snapshotRef.current);
        setMoveError('No se pudo mover la oportunidad. Intenta de nuevo.');
        setTimeout(() => setMoveError(null), 4000);
      }
    },
    [columnMap, stages]
  );

  /* ── Drawer handler ────────────────────────────────────────────── */

  const handleCardClick = useCallback((opp: Opportunity) => {
    setDrawerOpp(opp);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpp(null);
  }, []);

  /* ── Derived totals ────────────────────────────────────────────── */

  const totalOpps = Object.values(columnMap).reduce((sum, opps) => sum + opps.length, 0);
  const totalValue = Object.values(columnMap).reduce(
    (sum, opps) => sum + columnTotal(opps),
    0
  );
  const wonStages = stages.filter((s) => s.isWon);
  const wonValue = wonStages.reduce(
    (sum, s) => sum + columnTotal(columnMap[s.id] ?? []),
    0
  );

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <>
      <div className="flex flex-col h-full min-h-0" style={{ minHeight: 'calc(100vh - 64px)' }}>
        {/* Page header */}
        <div className="px-4 sm:px-6 pt-6 pb-4 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <span
                className="text-[11px] font-semibold uppercase tracking-widest text-[#2563eb]"
                style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
              >
                Comercial · Pipeline
              </span>
              <h1
                className="mt-1 text-2xl font-semibold text-[var(--text-primary)]"
                style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
              >
                Pipeline de Ventas
              </h1>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                Arrastra las oportunidades entre etapas · haz clic para ver el detalle.
              </p>
            </div>

            {!loading && (
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                    Total pipeline
                  </p>
                  <p className="text-lg font-bold text-[var(--text-primary)]">
                    {formatCLP(totalValue)}
                  </p>
                </div>
                <div className="h-10 w-px bg-[var(--border-color)]" />
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                    Oportunidades
                  </p>
                  <p className="text-lg font-bold text-[var(--text-primary)]">
                    {totalOpps}
                  </p>
                </div>
                {wonValue > 0 && (
                  <>
                    <div className="h-10 w-px bg-[var(--border-color)]" />
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-green-500">
                        Ganado
                      </p>
                      <p className="text-lg font-bold text-green-400">
                        {formatCLP(wonValue)}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Error banners */}
        {error && (
          <div className="mx-4 sm:mx-6 mb-4 flex-shrink-0 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300 flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            {error}
          </div>
        )}

        {moveError && (
          <div className="mx-4 sm:mx-6 mb-4 flex-shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            {moveError}
          </div>
        )}

        {/* Kanban board */}
        <div
          className="flex-1 overflow-x-auto overflow-y-auto px-4 sm:px-6 pb-6"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {loading ? (
            <div className="flex gap-4 w-max">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-72 flex flex-col gap-2.5">
                  <Skeleton className="h-16 rounded-xl" />
                  {Array.from({ length: 3 - (i % 2) }).map((_, j) => (
                    <Skeleton key={j} className="h-36 rounded-lg" />
                  ))}
                </div>
              ))}
            </div>
          ) : stages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <TrendingUp size={40} className="text-[var(--text-secondary)] opacity-40" />
              <p className="text-sm text-[var(--text-secondary)]">
                No hay etapas configuradas en el pipeline.
              </p>
            </div>
          ) : (
            <div
              className="flex gap-4 w-max pb-2"
              onDragEnd={() => {
                draggedIdRef.current = null;
                setDragOverStage(null);
              }}
            >
              {stages.map((stage) => (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  opps={columnMap[stage.id] ?? []}
                  isDragOver={dragOverStage === stage.id}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onCardClick={handleCardClick}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Opportunity detail drawer */}
      <OpportunityDrawer opp={drawerOpp} onClose={handleDrawerClose} />
    </>
  );
}
