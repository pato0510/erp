'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  HelpCircle,
  Upload,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../../lib/api';
import { Toast } from '../shared/Toast';
import { ComplianceGauge } from './ComplianceGauge';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { DocumentStatusBadge, type DerivedDocumentStatus } from './DocumentStatusBadge';
import { DocumentUploadModal } from './DocumentUploadModal';
import { formatDate } from '../../lib/formatters';

type FolderState =
  | 'VIGENTE'
  | 'POR_VENCER'
  | 'VENCIDO'
  | 'FALTANTE'
  | 'PENDIENTE_REVISION'
  | 'RECHAZADO'
  | 'BORRADOR';

interface DocumentTypeMeta {
  id: string;
  name: string;
  code: string;
  category: string;
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  blocksOperation: boolean;
  hasExpiration?: boolean;
  defaultValidityDays?: number | null;
  alertDaysBefore?: number;
  color?: string | null;
}

interface LatestRecord {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  issueDate?: string | null;
  expirationDate?: string | null;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'REPLACED' | 'ARCHIVED';
  version: number;
  derivedStatus: DerivedDocumentStatus;
}

interface RequiredDocument {
  documentType: DocumentTypeMeta;
  latestRecord: LatestRecord | null;
  derivedStatus: FolderState;
  daysUntilExpiration: number | null;
  resolvedFrom: 'asset' | 'subtype' | 'type';
}

interface AdditionalDocument extends LatestRecord {
  documentTypeId: string;
  documentType: DocumentTypeMeta;
}

interface FolderResponse {
  asset: {
    id: string;
    code: string;
    name: string;
    description?: string | null;
    status: string;
    assetType?: { id: string; name: string; category: string; color?: string | null } | null;
    assetSubtype?: { id: string; name: string } | null;
    location?: { id: string; name: string; code?: string | null; address?: string | null } | null;
  };
  compliance: {
    totalRequired: number;
    valid: number;
    expiringSoon: number;
    expired: number;
    missing: number;
    pendingReview: number;
    rejected: number;
    compliancePercentage: number;
    bySeverity: { critical: number; high: number; medium: number; low: number };
  };
  requiredDocuments: RequiredDocument[];
  additionalDocuments: AdditionalDocument[];
  generatedAt: string;
}

interface Props {
  assetId: string;
  /* Chooses the breadcrumb root and the "Volver al activo" target. Same
     view content for both. */
  assetKind: 'equipo' | 'vehiculo';
  /* Optional override for the "Volver al activo" link. Vehicles need this
     because their detail URL uses Vehicle.id while the folder operates on
     the underlying OperationalAsset.id. */
  backHref?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  EQUIPMENT: 'Equipo',
  VEHICLE: 'Vehículo',
  TOOL: 'Herramienta',
  INFRASTRUCTURE: 'Infraestructura',
  LEGAL: 'Legal',
  SAFETY: 'Seguridad',
  OPERATIONAL: 'Operacional',
  FINANCIAL: 'Financiero',
  TECHNICAL: 'Técnico',
  ADMINISTRATIVE: 'Administrativo',
};

const CRITICALITY_ORDER: Array<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'> = [
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
];

const CRITICALITY_META: Record<
  'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
  { label: string; bg: string; fg: string; sectionLabel: string }
> = {
  CRITICAL: {
    label: 'Crítica',
    bg: 'rgba(239, 68, 68, 0.12)',
    fg: '#b91c1c',
    sectionLabel: 'Documentos críticos',
  },
  HIGH: {
    label: 'Alta',
    bg: 'rgba(234, 179, 8, 0.14)',
    fg: '#a16207',
    sectionLabel: 'Documentos de alta criticidad',
  },
  MEDIUM: {
    label: 'Media',
    bg: 'rgba(37, 99, 235, 0.12)',
    fg: '#1d4ed8',
    sectionLabel: 'Documentos de criticidad media',
  },
  LOW: {
    label: 'Baja',
    bg: 'rgba(100, 116, 139, 0.14)',
    fg: '#475569',
    sectionLabel: 'Documentos de baja criticidad',
  },
};

const STATE_TO_BADGE: Record<FolderState, DerivedDocumentStatus> = {
  VIGENTE: 'VIGENTE',
  POR_VENCER: 'POR_VENCER',
  VENCIDO: 'VENCIDO',
  FALTANTE: 'FALTANTE',
  PENDIENTE_REVISION: 'PENDIENTE_REVISION',
  RECHAZADO: 'RECHAZADO',
  BORRADOR: 'BORRADOR',
};

export function AssetFolderView({ assetId, assetKind, backHref }: Props) {
  const [folder, setFolder] = useState<FolderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const [uploadDoc, setUploadDoc] = useState<null | { documentTypeId?: string }>(null);
  const [previewDoc, setPreviewDoc] = useState<LatestRecord | null>(null);
  const [exporting, setExporting] = useState<null | 'pdf' | 'zip'>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<FolderResponse>(
        `/api/operations/documents/folder/${assetId}`,
      );
      setFolder(data);
      setNotFound(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error cargando la carpeta documental';
      if (msg.toLowerCase().includes('no encontrado') || msg.toLowerCase().includes('not found')) {
        setNotFound(true);
      } else {
        setToast({ message: msg, type: 'error' });
      }
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    load();
  }, [load]);

  const exportFile = async (kind: 'pdf' | 'zip') => {
    setExporting(kind);
    try {
      const blob = await apiClient.fetchBlob(
        `/api/operations/documents/folder/${assetId}/export-${kind}`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = folder
        ? `carpeta-documental-${folder.asset.code}-${date}.${kind}`
        : `carpeta-documental-${date}.${kind}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo generar la exportación.',
        type: 'error',
      });
    } finally {
      setExporting(null);
    }
  };

  if (loading && !folder) {
    return <FolderSkeleton kind={assetKind} />;
  }

  if (notFound || !folder) {
    return (
      <div>
        <div className="ops-breadcrumb">
          Operaciones / {assetKind === 'equipo' ? 'Equipos' : 'Vehículos'} / Carpeta documental
        </div>
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <FileText size={36} style={{ margin: '0 auto 12px', color: '#cbd5e1' }} />
          <p
            className="text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 600 }}
          >
            Activo no encontrado
          </p>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Es posible que haya sido eliminado o no tengas acceso.
          </p>
          <Link
            href={`/operaciones/${assetKind === 'equipo' ? 'equipos' : 'vehiculos'}`}
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-sm rounded-full text-white"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={14} /> Volver
          </Link>
        </div>
        <FolderStyles />
      </div>
    );
  }

  const c = folder.compliance;
  const hasUrgent = c.expired > 0 || c.missing > 0 || c.bySeverity.critical > 0;
  const groupedRequired = (() => {
    const groups = new Map<string, RequiredDocument[]>();
    for (const r of folder.requiredDocuments) {
      const k = r.documentType.criticality;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    return groups;
  })();

  const detailHref =
    backHref ??
    `/operaciones/${assetKind === 'equipo' ? 'equipos' : 'vehiculos'}/${folder.asset.id}`;
  const listHref = `/operaciones/${assetKind === 'equipo' ? 'equipos' : 'vehiculos'}`;
  const generatedAt = new Date(folder.generatedAt);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-5">
        <div className="ops-breadcrumb">
          <Link href="/operaciones" className="ops-breadcrumb__link">
            Operaciones
          </Link>
          {' / '}
          <Link href={listHref} className="ops-breadcrumb__link">
            {assetKind === 'equipo' ? 'Equipos' : 'Vehículos'}
          </Link>
          {' / '}
          <Link href={detailHref} className="ops-breadcrumb__link">
            {folder.asset.name}
          </Link>
          {' / '}
          <span style={{ color: 'var(--text-primary)' }}>Carpeta documental</span>
        </div>
        <Link
          href={detailHref}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-3"
          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
        >
          <ArrowLeft size={14} /> Volver al activo
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
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
              Carpeta documental
            </h1>
            <p
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginTop: 4,
              }}
            >
              {folder.asset.code} · {folder.asset.name}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => exportFile('pdf')}
              disabled={exporting !== null}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                color: 'var(--text-primary)',
              }}
            >
              <FileText size={14} />
              {exporting === 'pdf' ? 'Generando...' : 'Exportar PDF'}
            </button>
            <button
              onClick={() => exportFile('zip')}
              disabled={exporting !== null}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-full text-white disabled:opacity-50"
              style={{
                background: '#1C1C1E',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Download size={14} />
              {exporting === 'zip' ? 'Empaquetando...' : 'Descargar ZIP'}
            </button>
          </div>
        </div>
      </div>

      {/* Action items */}
      {hasUrgent && (
        <div
          className="mb-4 p-4 rounded-xl flex items-start gap-3"
          style={{
            background: 'rgba(239, 68, 68, 0.06)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
          }}
        >
          <AlertTriangle size={20} style={{ color: '#b91c1c', flexShrink: 0, marginTop: 2 }} />
          <div className="flex-1">
            <p
              className="text-[var(--text-primary)]"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              {c.bySeverity.critical > 0
                ? 'Documentos críticos requieren atención'
                : 'Documentos requieren atención'}
            </p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {[
                c.expired > 0 && `${c.expired} ${c.expired === 1 ? 'vencido' : 'vencidos'}`,
                c.missing > 0 && `${c.missing} ${c.missing === 1 ? 'faltante' : 'faltantes'}`,
                c.expiringSoon > 0 &&
                  `${c.expiringSoon} ${c.expiringSoon === 1 ? 'por vencer' : 'por vencer'}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Section 1 — Compliance gauge + stats */}
      <div className="card mb-4" style={{ padding: 24 }}>
        <div
          className="flex items-center gap-6 flex-wrap"
          style={{ justifyContent: 'space-between' }}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <ComplianceGauge
              percentage={c.compliancePercentage}
              size={200}
              subtitle={`${c.valid + c.expiringSoon} de ${c.totalRequired} documentos al día`}
              caption={`Generado el ${generatedAt.toLocaleString('es-CL')}`}
            />
          </div>
          <div className="folder-stats">
            <StatRow
              label="Total requeridos"
              value={c.totalRequired}
              icon={<FileText size={14} />}
              tone="muted"
            />
            <StatRow
              label="Vigentes"
              value={c.valid}
              icon={<CheckCircle2 size={14} />}
              tone="success"
            />
            <StatRow
              label="Por vencer"
              value={c.expiringSoon}
              icon={<AlertCircle size={14} />}
              tone="warning"
            />
            <StatRow
              label="Vencidos"
              value={c.expired}
              icon={<XCircle size={14} />}
              tone="danger"
            />
            <StatRow
              label="Faltantes"
              value={c.missing}
              icon={<HelpCircle size={14} />}
              tone="danger"
            />
            <StatRow
              label="Pendientes de revisión"
              value={c.pendingReview}
              icon={<Clock size={14} />}
              tone="info"
            />
          </div>
        </div>
        {(c.bySeverity.critical > 0 ||
          c.bySeverity.high > 0 ||
          c.bySeverity.medium > 0 ||
          c.bySeverity.low > 0) && (
          <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
            <span
              className="text-[var(--text-secondary)]"
              style={{
                fontFamily: 'var(--font-ibm-plex-mono), monospace',
                fontSize: 11,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                marginRight: 12,
              }}
            >
              Brechas por severidad
            </span>
            <SeverityChip count={c.bySeverity.critical} label="críticos" tone="critical" />
            <SeverityChip count={c.bySeverity.high} label="altos" tone="high" />
            <SeverityChip count={c.bySeverity.medium} label="medios" tone="medium" />
            <SeverityChip count={c.bySeverity.low} label="bajos" tone="low" />
          </div>
        )}
      </div>

      {/* Section 2 — Required documents grouped by criticality */}
      <div className="card mb-4">
        <SectionTitle>Documentos requeridos</SectionTitle>
        {folder.requiredDocuments.length === 0 ? (
          <div
            style={{
              padding: '24px 12px',
              textAlign: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <FileText size={28} style={{ margin: '0 auto 8px', color: '#cbd5e1' }} />
            <p className="text-sm">
              No hay requerimientos documentales para este activo. Configúralos desde{' '}
              <Link
                href="/operaciones/configuracion?tab=documentos"
                className="text-blue-600 hover:underline"
              >
                Configuración → Tipos de Documento
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {CRITICALITY_ORDER.map((crit) => {
              const group = groupedRequired.get(crit);
              if (!group || group.length === 0) return null;
              const meta = CRITICALITY_META[crit];
              return (
                <div key={crit}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="req-chip" style={{ background: meta.bg, color: meta.fg }}>
                      {meta.label}
                    </span>
                    <h4
                      className="text-[var(--text-primary)]"
                      style={{
                        fontFamily: 'var(--font-outfit), sans-serif',
                        fontWeight: 500,
                        fontSize: 14,
                        margin: 0,
                      }}
                    >
                      {meta.sectionLabel} ({group.length})
                    </h4>
                  </div>
                  <RequirementsTable
                    rows={group}
                    onUpload={(documentTypeId) => setUploadDoc({ documentTypeId })}
                    onPreview={(rec) => setPreviewDoc(rec)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 3 — Additional documents */}
      <div className="card mb-4">
        <SectionTitle>Documentos complementarios</SectionTitle>
        {folder.additionalDocuments.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]" style={{ padding: '8px 0' }}>
            No hay documentos complementarios cargados.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="req-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Categoría</th>
                  <th>Archivo</th>
                  <th>Estado</th>
                  <th>Vencimiento</th>
                  <th style={{ width: 80, textAlign: 'right' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {folder.additionalDocuments.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div
                        style={{
                          fontFamily: 'var(--font-outfit), sans-serif',
                          fontWeight: 500,
                          fontSize: 13,
                        }}
                      >
                        {d.documentType.name}
                      </div>
                      <div
                        className="text-[var(--text-muted)] mt-0.5"
                        style={{
                          fontFamily: 'var(--font-jetbrains-mono), monospace',
                          fontSize: 11,
                        }}
                      >
                        {d.documentType.code}
                      </div>
                    </td>
                    <td>{CATEGORY_LABELS[d.documentType.category] ?? d.documentType.category}</td>
                    <td>
                      <span
                        className="truncate inline-block max-w-[220px]"
                        title={d.fileName}
                        style={{
                          fontFamily: 'var(--font-outfit), sans-serif',
                          fontSize: 13,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {d.fileName}
                      </span>
                    </td>
                    <td>
                      <DocumentStatusBadge status={d.derivedStatus} />
                    </td>
                    <td>
                      {d.expirationDate ? (
                        <span
                          style={{
                            fontFamily: 'var(--font-jetbrains-mono), monospace',
                            fontSize: 12,
                          }}
                        >
                          {formatDate(d.expirationDate)}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => setPreviewDoc(d)}
                        title="Ver"
                        className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
                      >
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {uploadDoc && (
        <DocumentUploadModal
          assetId={folder.asset.id}
          documentTypeId={uploadDoc.documentTypeId}
          onClose={() => setUploadDoc(null)}
          onUploaded={() => {
            setToast({ message: 'Documento cargado exitosamente', type: 'success' });
            load();
          }}
        />
      )}
      {previewDoc && (
        <DocumentPreviewModal
          documentId={previewDoc.id}
          fileName={previewDoc.fileName}
          mimeType={previewDoc.mimeType}
          documentTypeName="Documento"
          assetCode={folder.asset.code}
          assetName={folder.asset.name}
          derivedStatus={previewDoc.derivedStatus}
          version={previewDoc.version}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      <FolderStyles />
    </div>
  );
}

/* --------------------------------------------------------------------- */

function RequirementsTable({
  rows,
  onUpload,
  onPreview,
}: {
  rows: RequiredDocument[];
  onUpload: (documentTypeId: string) => void;
  onPreview: (rec: LatestRecord) => void;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="req-table">
        <thead>
          <tr>
            <th>Tipo de documento</th>
            <th>Categoría</th>
            <th>Bloqueante</th>
            <th>Estado actual</th>
            <th>Vencimiento</th>
            <th>Resuelto desde</th>
            <th style={{ width: 90, textAlign: 'right' }}>Acción</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const exp = r.latestRecord?.expirationDate
              ? formatDate(r.latestRecord.expirationDate)
              : '—';
            const expHint =
              r.daysUntilExpiration !== null && r.derivedStatus === 'POR_VENCER'
                ? ` (en ${r.daysUntilExpiration} días)`
                : r.daysUntilExpiration !== null && r.derivedStatus === 'VENCIDO'
                  ? ` (hace ${Math.abs(r.daysUntilExpiration)} días)`
                  : '';
            return (
              <tr key={r.documentType.id}>
                <td>
                  <div className="flex items-center gap-2">
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        background: r.documentType.color || '#475569',
                        color: '#fff',
                        fontFamily: 'var(--font-jetbrains-mono), monospace',
                        fontSize: 9,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {r.documentType.code.slice(0, 3)}
                    </span>
                    <div>
                      <div
                        style={{
                          fontFamily: 'var(--font-outfit), sans-serif',
                          fontWeight: 500,
                          fontSize: 13,
                        }}
                      >
                        {r.documentType.name}
                      </div>
                      <div
                        className="text-[var(--text-muted)] mt-0.5"
                        style={{
                          fontFamily: 'var(--font-jetbrains-mono), monospace',
                          fontSize: 11,
                        }}
                      >
                        {r.documentType.code}
                      </div>
                    </div>
                  </div>
                </td>
                <td>{CATEGORY_LABELS[r.documentType.category] ?? r.documentType.category}</td>
                <td>
                  {r.documentType.blocksOperation ? (
                    <span
                      className="req-chip"
                      style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#b91c1c' }}
                    >
                      Sí
                    </span>
                  ) : (
                    <span className="text-[var(--text-muted)] text-sm">No</span>
                  )}
                </td>
                <td>
                  <DocumentStatusBadge
                    status={STATE_TO_BADGE[r.derivedStatus]}
                    hint={expHint || undefined}
                  />
                </td>
                <td>
                  <span
                    style={{
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                      fontSize: 12,
                    }}
                  >
                    {exp}
                  </span>
                </td>
                <td>
                  <span
                    className="req-chip"
                    style={{ background: 'rgba(100, 116, 139, 0.1)', color: '#475569' }}
                  >
                    {r.resolvedFrom === 'asset'
                      ? 'Activo'
                      : r.resolvedFrom === 'subtype'
                        ? 'Subtipo'
                        : 'Tipo'}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {r.latestRecord ? (
                    <button
                      onClick={() => onPreview(r.latestRecord!)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border border-gray-300 hover:bg-gray-50"
                      style={{
                        fontFamily: 'var(--font-outfit), sans-serif',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                      }}
                    >
                      <Eye size={11} /> Ver
                    </button>
                  ) : (
                    <button
                      onClick={() => onUpload(r.documentType.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full text-white"
                      style={{
                        background: '#2563eb',
                        fontFamily: 'var(--font-outfit), sans-serif',
                        fontWeight: 500,
                      }}
                    >
                      <Upload size={11} /> Cargar
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatRow({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'muted' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const colors: Record<typeof tone, string> = {
    muted: '#475569',
    success: '#15803d',
    warning: '#a16207',
    danger: '#b91c1c',
    info: '#1d4ed8',
  };
  const fg = colors[tone];
  return (
    <div className="folder-stat">
      <span style={{ color: fg, display: 'inline-flex', alignItems: 'center' }}>{icon}</span>
      <span className="folder-stat__label" style={{ fontFamily: 'var(--font-outfit), sans-serif' }}>
        {label}
      </span>
      <span
        className="folder-stat__value"
        style={{
          color: fg,
          fontFamily: 'var(--font-jetbrains-mono), monospace',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function SeverityChip({
  count,
  label,
  tone,
}: {
  count: number;
  label: string;
  tone: 'critical' | 'high' | 'medium' | 'low';
}) {
  const meta: Record<typeof tone, { bg: string; fg: string }> = {
    critical: { bg: 'rgba(239, 68, 68, 0.12)', fg: '#b91c1c' },
    high: { bg: 'rgba(234, 179, 8, 0.14)', fg: '#a16207' },
    medium: { bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8' },
    low: { bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
  };
  const m = meta[tone];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full mr-2"
      style={{
        background: m.bg,
        color: m.fg,
        fontFamily: 'var(--font-jetbrains-mono), monospace',
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {count}{' '}
      <span style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}>{label}</span>
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontFamily: 'var(--font-outfit), sans-serif',
        fontWeight: 500,
        fontSize: 16,
        letterSpacing: '-0.005em',
        color: 'var(--text-primary)',
        margin: '0 0 12px',
      }}
    >
      {children}
    </h3>
  );
}

function FolderSkeleton({ kind }: { kind: 'equipo' | 'vehiculo' }) {
  return (
    <div>
      <div className="ops-breadcrumb">
        Operaciones / {kind === 'equipo' ? 'Equipos' : 'Vehículos'} / Carpeta documental
      </div>
      <div
        className="animate-pulse mt-3"
        style={{ height: 32, width: 320, background: 'rgba(0,0,0,0.06)', borderRadius: 4 }}
      />
      <div
        className="animate-pulse mt-3"
        style={{ height: 220, background: 'rgba(0,0,0,0.04)', borderRadius: 8 }}
      />
      <div
        className="animate-pulse mt-3"
        style={{ height: 320, background: 'rgba(0,0,0,0.04)', borderRadius: 8 }}
      />
      <FolderStyles />
    </div>
  );
}

function FolderStyles() {
  return (
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
      .ops-breadcrumb__link {
        color: inherit;
        text-decoration: none;
      }
      .ops-breadcrumb__link:hover {
        color: var(--text-primary);
      }
      .card {
        background: var(--bg-card);
        border: 0.5px solid var(--border-color);
        border-radius: 8px;
        padding: 20px;
      }
      html.dark .card {
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
      }
      .req-table {
        width: 100%;
        border-collapse: collapse;
      }
      .req-table th {
        text-align: left;
        padding: 10px 12px;
        font-family: var(--font-ibm-plex-mono), monospace;
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--text-secondary);
        font-weight: 500;
        border-bottom: 1px solid var(--border-color);
      }
      .req-table td {
        padding: 10px 12px;
        border-bottom: 1px solid var(--border-color);
        font-size: 14px;
        color: var(--text-primary);
        vertical-align: middle;
      }
      .req-table tr:last-child td {
        border-bottom: none;
      }
      .req-chip {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        font-family: var(--font-jetbrains-mono), monospace;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.02em;
      }
      .folder-stats {
        display: grid;
        grid-template-columns: 1fr;
        gap: 8px;
        flex: 1;
        min-width: 280px;
      }
      @media (min-width: 640px) {
        .folder-stats {
          grid-template-columns: 1fr 1fr;
        }
      }
      .folder-stat {
        display: grid;
        grid-template-columns: 18px 1fr auto;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        background: var(--input-bg);
      }
      .folder-stat__label {
        font-size: 13px;
        color: var(--text-primary);
      }
      .folder-stat__value {
        font-size: 16px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
    `}</style>
  );
}

export default AssetFolderView;
