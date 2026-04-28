'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, BookOpen, CheckCircle2, Clock, Eye, ShieldCheck } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { AcknowledgmentModal } from './AcknowledgmentModal';

type AckStatus = 'PENDING' | 'READ' | 'ACKNOWLEDGED' | 'EXPIRED' | 'EXEMPTED';

interface MyAck {
  id: string;
  procedureId: string;
  status: AckStatus;
  dueDate: string | null;
  acknowledgedAt: string | null;
}

interface ProcedureCoverage {
  procedureId: string;
  totalRequired: number;
  acknowledged: number;
  pending: number;
  read: number;
  expired: number;
  exempted: number;
  coveragePercentage: number;
}

interface Props {
  procedureId: string;
  procedureCode: string;
  procedureTitle: string;
  procedureVersion: string;
  requiresAcknowledgment: boolean;
  isAdminOrManager: boolean;
  onAcknowledged?: () => void;
}

/* OPS-028 — combines three responsibilities for the procedure
   detail page:
   1. The "tienes pendiente acusar" banner for the current user.
   2. The coverage stats card (admins only).
   3. The "ya acusaste" small confirmation chip. */
export function ProcedureAcknowledgmentSection({
  procedureId,
  procedureCode,
  procedureTitle,
  procedureVersion,
  requiresAcknowledgment,
  isAdminOrManager,
  onAcknowledged,
}: Props) {
  const [myAck, setMyAck] = useState<MyAck | null>(null);
  const [coverage, setCoverage] = useState<ProcedureCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!requiresAcknowledgment) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const myList = await apiClient.get<MyAck[]>('/api/operations/acknowledgments/my-pending');
      const mine = myList.find((m) => m.procedureId === procedureId) ?? null;
      setMyAck(mine);
      if (isAdminOrManager) {
        try {
          const cov = await apiClient.get<ProcedureCoverage>(
            `/api/operations/acknowledgments/coverage/${procedureId}`,
          );
          setCoverage(cov);
        } catch {
          /* swallow — coverage is best-effort */
        }
      }
    } finally {
      setLoading(false);
    }
  }, [procedureId, requiresAcknowledgment, isAdminOrManager]);

  useEffect(() => {
    load();
  }, [load]);

  if (!requiresAcknowledgment || loading) return null;

  const due = myAck?.dueDate ? new Date(myAck.dueDate) : null;
  const overdue = due && due.getTime() < Date.now();
  const daysToDue = due ? Math.round((due.getTime() - Date.now()) / 86_400_000) : null;

  return (
    <>
      {/* My-status banner / chip */}
      {myAck && myAck.status === 'ACKNOWLEDGED' && (
        <div
          className="rounded-xl p-3 mb-3 flex items-center gap-2 text-sm"
          style={{
            background: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            color: '#15803d',
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={16} />
          Acusado el {formatDate(myAck.acknowledgedAt)}.
        </div>
      )}

      {myAck &&
        (myAck.status === 'PENDING' || myAck.status === 'READ' || myAck.status === 'EXPIRED') && (
          <div
            className="rounded-xl p-4 mb-3 flex items-start gap-3"
            style={{
              background: overdue ? 'rgba(239, 68, 68, 0.10)' : 'rgba(234, 179, 8, 0.10)',
              border: `1px solid ${overdue ? 'rgba(239, 68, 68, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`,
            }}
          >
            <BookOpen
              size={18}
              style={{ color: overdue ? '#b91c1c' : '#a16207', flexShrink: 0, marginTop: 2 }}
            />
            <div className="flex-1">
              <div
                className="text-sm"
                style={{
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 600,
                  color: overdue ? '#b91c1c' : '#a16207',
                }}
              >
                Tienes pendiente acusar este procedimiento
              </div>
              {due && (
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {overdue
                    ? `Vencido hace ${Math.abs(daysToDue ?? 0)} día(s).`
                    : daysToDue === 0
                      ? 'Vence hoy.'
                      : `Vence en ${daysToDue} día(s).`}
                </p>
              )}
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-white rounded-full"
              style={{
                background: '#22C55E',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
              }}
            >
              <CheckCircle2 size={14} /> Marcar como acusado
            </button>
          </div>
        )}

      {/* Coverage card for admin / manager */}
      {isAdminOrManager && coverage && (
        <div
          className="rounded-xl p-4 mb-3"
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
            <ShieldCheck size={14} /> Cobertura de acuses
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-2">
            <Stat label="Total" value={coverage.totalRequired} />
            <Stat label="Acusados" value={coverage.acknowledged} color="#15803d" />
            <Stat label="Pendientes" value={coverage.pending + coverage.read} color="#a16207" />
            <Stat label="Vencidos" value={coverage.expired} color="#b91c1c" />
            <Stat label="Exentos" value={coverage.exempted} />
          </div>
          <CoverageBar pct={coverage.coveragePercentage} />
          <div className="mt-2 text-xs text-[var(--text-secondary)]">
            <a
              href="/operaciones/cobertura-acuses"
              className="text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              <Eye size={11} /> Ver detalle completo
            </a>
          </div>
        </div>
      )}

      {modalOpen && (
        <AcknowledgmentModal
          procedure={{
            id: procedureId,
            code: procedureCode,
            title: procedureTitle,
            version: procedureVersion,
          }}
          onClose={() => setModalOpen(false)}
          onAcknowledged={() => {
            setModalOpen(false);
            load();
            onAcknowledged?.();
          }}
        />
      )}
    </>
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

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}

export default ProcedureAcknowledgmentSection;
