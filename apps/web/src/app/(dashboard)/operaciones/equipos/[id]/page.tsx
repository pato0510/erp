'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  Wrench,
} from 'lucide-react';
import { apiClient } from '../../../../../lib/api';
import { Toast } from '../../../../../components/shared/Toast';
import {
  AssetFormModal,
  type AssetForForm,
  type AssetForFormParent,
  type AssetFormSubmit,
  type AssetTypeOption,
  type LocationOption,
} from '../../../../../components/operations/AssetFormModal';
import {
  AssetStatusBadge,
  type AssetStatus,
} from '../../../../../components/operations/AssetStatusBadge';
import { StatusChangeModal } from '../../../../../components/operations/StatusChangeModal';
import { formatCLP, formatDate, formatRelativeDate } from '../../../../../lib/formatters';

interface UserSummary {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface ChildSummary {
  id: string;
  code: string;
  name: string;
  status: AssetStatus;
  isActive: boolean;
  hasPhoto: boolean;
}

interface AssetDetail {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  assetTypeId: string;
  assetSubtypeId?: string | null;
  locationId?: string | null;
  parentAssetId?: string | null;
  serialNumber?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  acquisitionDate?: string | null;
  acquisitionCost?: string | number | null;
  status: AssetStatus;
  statusReason?: string | null;
  statusChangedAt?: string | null;
  dynamicAttributes?: Record<string, unknown> | null;
  tags?: string[] | null;
  assignedToUserId?: string | null;
  isActive: boolean;
  hasPhoto: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  assetType?: {
    id: string;
    name: string;
    category: string;
    color?: string | null;
    icon?: string | null;
  } | null;
  assetSubtype?: {
    id: string;
    name: string;
    specifications?: Record<string, unknown> | null;
  } | null;
  location?: {
    id: string;
    name: string;
    code?: string | null;
    address?: string | null;
    latitude?: string | number | null;
    longitude?: string | number | null;
  } | null;
  parent?: { id: string; code: string; name: string; status: AssetStatus } | null;
  children: ChildSummary[];
  assignedUser?: UserSummary | null;
  createdByUser?: UserSummary | null;
}

interface ResolvedRequirement {
  id: string;
  documentTypeId: string;
  isMandatory: boolean;
  notes?: string | null;
  resolvedFrom: 'asset' | 'subtype' | 'type';
  documentType: {
    id: string;
    name: string;
    code: string;
    category: string;
    criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    blocksOperation: boolean;
    color?: string | null;
  };
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

const CRITICALITY_META: Record<
  ResolvedRequirement['documentType']['criticality'],
  { label: string; bg: string; fg: string }
> = {
  LOW: { label: 'Baja', bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
  MEDIUM: { label: 'Media', bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8' },
  HIGH: { label: 'Alta', bg: 'rgba(234, 179, 8, 0.14)', fg: '#a16207' },
  CRITICAL: { label: 'Crítica', bg: 'rgba(239, 68, 68, 0.12)', fg: '#b91c1c' },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AssetDetailPage({ params }: PageProps) {
  /* Next.js 16 wraps dynamic-segment params in a Promise — `use()` unwraps it
     synchronously for client components. */
  const { id } = use(params);
  const router = useRouter();

  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [requirements, setRequirements] = useState<ResolvedRequirement[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [editModal, setEditModal] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [childModal, setChildModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [assetTypes, setAssetTypes] = useState<AssetTypeOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [parentCandidates, setParentCandidates] = useState<AssetForFormParent[]>([]);

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const photoCacheKeyRef = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, r] = await Promise.all([
        apiClient.get<AssetDetail>(`/api/operations/assets/${id}`),
        apiClient
          .get<ResolvedRequirement[]>(`/api/operations/document-requirements/resolve/${id}`)
          .catch(() => [] as ResolvedRequirement[]),
      ]);
      setAsset(a);
      setRequirements(r);
      setNotFound(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error cargando el activo';
      if (msg.includes('not found') || msg.toLowerCase().includes('no encontrado')) {
        setNotFound(true);
      } else {
        setToast({ message: msg, type: 'error' });
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  /* Catalogs are loaded lazily — only when the user opens a modal that needs
     them. We pre-fetch on mount since it's a single page interaction usually
     followed by Edit. */
  const loadCatalogs = useCallback(async () => {
    try {
      const [types, locs, parents] = await Promise.all([
        apiClient.get<AssetTypeOption[]>('/api/operations/asset-types'),
        apiClient.get<LocationOption[]>('/api/operations/locations'),
        apiClient.get<{ data: AssetForFormParent[] }>('/api/operations/assets?limit=100'),
      ]);
      setAssetTypes(types);
      setLocations(locs);
      setParentCandidates(parents.data.map((p) => ({ id: p.id, code: p.code, name: p.name })));
    } catch {
      /* Non-critical — modal selectors will simply be empty. */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  /* Fetch the photo blob via authenticated fetchBlob (auth headers needed). */
  useEffect(() => {
    let alive = true;
    let createdUrl: string | null = null;
    if (!asset?.hasPhoto) {
      setPhotoUrl(null);
      return () => undefined;
    }
    apiClient
      .fetchBlob(`/api/operations/assets/${asset.id}/photo?cb=${photoCacheKeyRef.current}`)
      .then((blob) => {
        if (!alive) return;
        createdUrl = URL.createObjectURL(blob);
        setPhotoUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return createdUrl;
        });
      })
      .catch(() => {
        if (alive) setPhotoUrl(null);
      });
    return () => {
      alive = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [asset?.id, asset?.hasPhoto]);

  const handleEditSave = async (dto: AssetFormSubmit) => {
    if (!asset) return;
    await apiClient.patch(`/api/operations/assets/${asset.id}`, dto);
    setToast({ message: 'Equipo actualizado', type: 'success' });
    setEditModal(false);
    photoCacheKeyRef.current += 1;
    load();
  };

  const handleStatusSave = async (status: AssetStatus, statusReason: string | undefined) => {
    if (!asset) return;
    await apiClient.patch(`/api/operations/assets/${asset.id}`, {
      status,
      statusReason: statusReason ?? null,
    });
    setToast({ message: 'Estado actualizado', type: 'success' });
    setStatusModal(false);
    load();
  };

  const handleChildSave = async (dto: AssetFormSubmit) => {
    if (!asset) return;
    await apiClient.post('/api/operations/assets', { ...dto, parentAssetId: asset.id });
    setToast({ message: 'Activo hijo creado', type: 'success' });
    setChildModal(false);
    load();
  };

  const handleDelete = async () => {
    if (!asset) return;
    try {
      await apiClient.delete(`/api/operations/assets/${asset.id}`);
      setToast({ message: 'Equipo eliminado', type: 'success' });
      setConfirmDelete(false);
      router.push('/operaciones/equipos');
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo eliminar',
        type: 'error',
      });
      setConfirmDelete(false);
    }
  };

  if (loading && !asset) {
    return <DetailSkeleton />;
  }

  if (notFound || !asset) {
    return (
      <div>
        <div className="ops-breadcrumb">Operaciones / Equipos</div>
        <div
          className="card"
          style={{
            padding: 32,
            textAlign: 'center',
          }}
        >
          <Wrench size={36} style={{ margin: '0 auto 12px', color: '#cbd5e1' }} />
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
            href="/operaciones/equipos"
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-sm rounded-full text-white"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={14} /> Volver a equipos
          </Link>
        </div>
        <DetailStyles />
      </div>
    );
  }

  const dynamicEntries = asset.dynamicAttributes ? Object.entries(asset.dynamicAttributes) : [];

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
          <Link href="/operaciones/equipos" className="ops-breadcrumb__link">
            Equipos
          </Link>
          {' / '}
          <span style={{ color: 'var(--text-primary)' }}>{asset.name}</span>
        </div>
        <Link
          href="/operaciones/equipos"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-3"
          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
        >
          <ArrowLeft size={14} /> Volver a equipos
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
              {asset.name}
            </h1>
            <p
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-secondary)',
                marginTop: 4,
              }}
            >
              {asset.code}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <AssetStatusBadge status={asset.status} />
            <button
              onClick={() => setEditModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                color: 'var(--text-primary)',
              }}
            >
              <Pencil size={14} /> Editar
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg text-red-600 border border-red-200 hover:bg-red-50"
              style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
            >
              <Trash2 size={14} /> Eliminar
            </button>
          </div>
        </div>
      </div>

      {/* Two-column grid */}
      <div className="grid-2col">
        {/* LEFT */}
        <div className="space-y-4">
          {/* Photo + basic info */}
          <Card>
            <SectionTitle>Información básica</SectionTitle>
            <div className="flex flex-col items-center md:flex-row md:items-start gap-4">
              <div className="asset-photo">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={asset.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <Wrench size={48} className="text-[var(--text-muted)]" />
                )}
              </div>
              <div className="flex-1 w-full space-y-1">
                <KvRow label="Tipo" value={asset.assetType?.name} />
                <KvRow
                  label="Categoría"
                  value={
                    asset.assetType?.category ? CATEGORY_LABELS[asset.assetType.category] : null
                  }
                />
                <KvRow label="Subtipo" value={asset.assetSubtype?.name} />
                <KvRow
                  label="Asignado a"
                  value={
                    asset.assignedUser
                      ? formatUser(asset.assignedUser)
                      : asset.assignedToUserId
                        ? 'Usuario desconocido'
                        : null
                  }
                  fallback="Sin asignar"
                />
                {asset.tags && asset.tags.length > 0 && (
                  <div className="kv-row">
                    <span className="kv-row__key">Tags</span>
                    <span className="kv-row__value">
                      <span className="flex flex-wrap gap-1 justify-end">
                        {asset.tags.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700"
                            style={{
                              fontFamily: 'var(--font-outfit), sans-serif',
                              fontWeight: 500,
                              fontSize: 11,
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </span>
                    </span>
                  </div>
                )}
                {asset.description && (
                  <div className="pt-2 mt-2 border-t border-[var(--border-color)]">
                    <p className="text-sm text-[var(--text-secondary)]" style={{ lineHeight: 1.5 }}>
                      {asset.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Identification */}
          <Card>
            <SectionTitle>Identificación</SectionTitle>
            <KvRow label="N° de serie" value={asset.serialNumber} mono />
            <KvRow label="Fabricante" value={asset.manufacturer} />
            <KvRow label="Modelo" value={asset.model} />
            <KvRow
              label="Fecha adquisición"
              value={asset.acquisitionDate ? formatDate(asset.acquisitionDate) : null}
            />
            <KvRow
              label="Costo adquisición"
              value={
                asset.acquisitionCost != null ? formatCLP(Number(asset.acquisitionCost)) : null
              }
              mono
            />
          </Card>

          {/* Dynamic attributes */}
          <Card>
            <SectionTitle>Atributos dinámicos</SectionTitle>
            {dynamicEntries.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]" style={{ padding: '8px 0' }}>
                No hay atributos dinámicos definidos.
              </p>
            ) : (
              dynamicEntries.map(([k, v]) => (
                <KvRow key={k} label={k} value={typeof v === 'string' ? v : JSON.stringify(v)} />
              ))
            )}
          </Card>
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
          {/* Status */}
          <Card>
            <SectionTitle>Estado y operación</SectionTitle>
            <div
              className="flex items-center justify-between gap-3 mb-3"
              style={{ padding: '4px 0' }}
            >
              <AssetStatusBadge status={asset.status} />
              <button
                onClick={() => setStatusModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                style={{
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                }}
              >
                <RefreshCw size={12} /> Cambiar estado
              </button>
            </div>
            <KvRow label="Razón" value={asset.statusReason} />
            <KvRow
              label="Cambio"
              value={
                asset.statusChangedAt
                  ? `${formatRelativeDate(asset.statusChangedAt)} · ${formatDate(asset.statusChangedAt)}`
                  : null
              }
            />
          </Card>

          {/* Location */}
          <Card>
            <SectionTitle>
              <MapPin size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
              Ubicación
            </SectionTitle>
            {!asset.location ? (
              <p className="text-sm text-[var(--text-muted)]" style={{ padding: '8px 0' }}>
                Este activo no tiene ubicación asignada.
              </p>
            ) : (
              <>
                <KvRow label="Nombre" value={asset.location.name} />
                <KvRow label="Código" value={asset.location.code} mono />
                <KvRow label="Dirección" value={asset.location.address} />
                {asset.location.latitude != null && asset.location.longitude != null && (
                  <div
                    className="mt-3 p-3 rounded-lg flex items-center gap-2"
                    style={{
                      background: 'rgba(37, 99, 235, 0.08)',
                      border: '1px dashed rgba(37, 99, 235, 0.3)',
                    }}
                  >
                    <MapPin size={14} style={{ color: '#1d4ed8' }} />
                    <span
                      style={{
                        fontFamily: 'var(--font-jetbrains-mono), monospace',
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {Number(asset.location.latitude).toFixed(4)},{' '}
                      {Number(asset.location.longitude).toFixed(4)}
                    </span>
                  </div>
                )}
              </>
            )}
          </Card>

          {/* Hierarchy */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle inline>Jerarquía</SectionTitle>
              <button
                onClick={() => setChildModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                style={{
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                }}
              >
                <Plus size={12} /> Agregar activo hijo
              </button>
            </div>

            <div>
              <p
                className="text-[var(--text-secondary)]"
                style={{
                  fontFamily: 'var(--font-ibm-plex-mono), monospace',
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Activo padre
              </p>
              {asset.parent ? (
                <Link href={`/operaciones/equipos/${asset.parent.id}`} className="hierarchy-row">
                  <span className="hierarchy-row__code">{asset.parent.code}</span>
                  <span className="hierarchy-row__name">{asset.parent.name}</span>
                  <AssetStatusBadge status={asset.parent.status} />
                  <ChevronRight size={14} className="text-[var(--text-muted)]" />
                </Link>
              ) : (
                <p className="text-sm text-[var(--text-muted)]" style={{ padding: '4px 0' }}>
                  Este activo no tiene padre.
                </p>
              )}
            </div>

            <div className="mt-4">
              <p
                className="text-[var(--text-secondary)]"
                style={{
                  fontFamily: 'var(--font-ibm-plex-mono), monospace',
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Activos hijos ({asset.children.length})
              </p>
              {asset.children.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]" style={{ padding: '4px 0' }}>
                  Este activo no tiene activos hijos.
                </p>
              ) : (
                <div className="hierarchy-list">
                  {asset.children.map((c) => (
                    <Link
                      key={c.id}
                      href={`/operaciones/equipos/${c.id}`}
                      className="hierarchy-row"
                      style={{ opacity: c.isActive ? 1 : 0.55 }}
                    >
                      <span className="hierarchy-row__code">{c.code}</span>
                      <span className="hierarchy-row__name">{c.name}</span>
                      <AssetStatusBadge status={c.status} />
                      <ChevronRight size={14} className="text-[var(--text-muted)]" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Documents (full-width) */}
      <div className="mt-4">
        <Card>
          <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
            <div>
              <SectionTitle inline>
                <FileText
                  size={14}
                  style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }}
                />
                Documentos requeridos
              </SectionTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Documentos que este activo debe mantener vigentes.
              </p>
            </div>
          </div>
          {requirements.length === 0 ? (
            <div
              style={{
                padding: '24px 12px',
                textAlign: 'center',
                color: 'var(--text-muted)',
              }}
            >
              <FileText size={28} style={{ margin: '0 auto 8px', color: '#cbd5e1' }} />
              <p className="text-sm">
                Aún no hay requerimientos documentales para este tipo de activo. Configúralos desde{' '}
                <Link
                  href="/operaciones/configuracion?tab=documentos"
                  className="text-blue-600 hover:underline"
                >
                  Configuración → Tipos de Documento
                </Link>{' '}
                y la matriz de requisitos.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="req-table">
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th>Categoría</th>
                    <th>Criticidad</th>
                    <th>Bloqueante</th>
                    <th>Resuelto desde</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {requirements.map((r) => {
                    const crit = CRITICALITY_META[r.documentType.criticality];
                    return (
                      <tr key={r.id}>
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
                                  fontSize: 14,
                                }}
                              >
                                {r.documentType.name}
                              </div>
                              <div
                                className="text-[var(--text-muted)]"
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
                        <td>
                          {CATEGORY_LABELS[r.documentType.category] ?? r.documentType.category}
                        </td>
                        <td>
                          <span
                            className="req-chip"
                            style={{ background: crit.bg, color: crit.fg }}
                          >
                            {crit.label}
                          </span>
                        </td>
                        <td>
                          {r.documentType.blocksOperation ? (
                            <span
                              className="req-chip"
                              style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#b91c1c' }}
                            >
                              Sí
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">No</span>
                          )}
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
                        <td>
                          <span
                            className="req-chip"
                            style={{ background: 'rgba(234, 179, 8, 0.14)', color: '#a16207' }}
                          >
                            Pendiente de cargar
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* History */}
      <div className="mt-4">
        <Card>
          <SectionTitle>
            <Settings size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
            Historial de cambios
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Últimas modificaciones registradas en este activo.
          </p>
          <KvRow
            label="Creado el"
            value={`${formatDate(asset.createdAt)} ${
              asset.createdByUser ? `· por ${formatUser(asset.createdByUser)}` : ''
            }`}
          />
          <KvRow
            label="Última modificación"
            value={`${formatDate(asset.updatedAt)} · ${formatRelativeDate(asset.updatedAt)}`}
          />
        </Card>
      </div>

      {/* Modals */}
      {editModal && (
        <AssetFormModal
          mode="edit"
          asset={toFormShape(asset)}
          assetTypes={assetTypes}
          locations={locations}
          parentCandidates={parentCandidates.filter((p) => p.id !== asset.id)}
          onClose={() => setEditModal(false)}
          onSave={handleEditSave}
        />
      )}
      {statusModal && (
        <StatusChangeModal
          currentStatus={asset.status}
          onClose={() => setStatusModal(false)}
          onSave={handleStatusSave}
        />
      )}
      {childModal && (
        <AssetFormModal
          mode="create"
          asset={{
            id: '',
            code: '',
            name: '',
            assetTypeId: asset.assetTypeId,
            assetSubtypeId: asset.assetSubtypeId ?? '',
            locationId: asset.locationId ?? '',
            parentAssetId: asset.id,
            status: 'OPERATIONAL',
            tags: [],
            dynamicAttributes: {},
            hasPhoto: false,
          }}
          assetTypes={assetTypes}
          locations={locations}
          parentCandidates={parentCandidates}
          onClose={() => setChildModal(false)}
          onSave={handleChildSave}
        />
      )}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-[var(--border-color)]">
              <h3
                className="text-[var(--text-primary)]"
                style={{
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 600,
                  fontSize: 16,
                }}
              >
                Eliminar equipo
              </h3>
            </div>
            <div className="px-5 py-4 text-sm text-[var(--text-secondary)]">
              ¿Confirmas eliminar el equipo{' '}
              <strong className="text-[var(--text-primary)]">{asset.code}</strong> · {asset.name}?
              Esta acción se puede revertir reactivándolo.
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)]">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm text-white rounded-full"
                style={{
                  background: '#DC2626',
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      <DetailStyles />
    </div>
  );
}

/* ======================================================================== */

function toFormShape(a: AssetDetail): AssetForForm {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    description: a.description ?? '',
    assetTypeId: a.assetTypeId,
    assetSubtypeId: a.assetSubtypeId ?? '',
    locationId: a.locationId ?? '',
    parentAssetId: a.parentAssetId ?? '',
    serialNumber: a.serialNumber ?? '',
    manufacturer: a.manufacturer ?? '',
    model: a.model ?? '',
    acquisitionDate: a.acquisitionDate ?? '',
    acquisitionCost: a.acquisitionCost ?? null,
    status: a.status,
    statusReason: a.statusReason ?? '',
    dynamicAttributes: a.dynamicAttributes ?? {},
    tags: a.tags ?? [],
    assignedToUserId: a.assignedToUserId ?? '',
    hasPhoto: !!a.hasPhoto,
  };
}

function formatUser(u: UserSummary): string {
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  if (fullName) return `${fullName} · ${u.email}`;
  return u.email;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="card">{children}</div>;
}

function SectionTitle({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <h3
      style={{
        fontFamily: 'var(--font-outfit), sans-serif',
        fontWeight: 500,
        fontSize: 16,
        letterSpacing: '-0.005em',
        color: 'var(--text-primary)',
        margin: inline ? 0 : '0 0 12px',
      }}
    >
      {children}
    </h3>
  );
}

function KvRow({
  label,
  value,
  mono,
  fallback,
}: {
  label: string;
  value?: string | number | null;
  mono?: boolean;
  fallback?: string;
}) {
  const display = value !== undefined && value !== null && value !== '' ? value : (fallback ?? '—');
  const isFallback = display === '—' || (fallback !== undefined && display === fallback);
  return (
    <div className="kv-row">
      <span className="kv-row__key">{label}</span>
      <span
        className="kv-row__value"
        style={{
          fontFamily: mono
            ? 'var(--font-jetbrains-mono), monospace'
            : 'var(--font-outfit), sans-serif',
          color: isFallback ? 'var(--text-muted)' : 'var(--text-primary)',
        }}
      >
        {display}
      </span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div>
      <div className="ops-breadcrumb">Operaciones / Equipos</div>
      <div
        className="animate-pulse"
        style={{ height: 24, width: 200, background: 'rgba(0,0,0,0.06)', borderRadius: 4 }}
      />
      <div
        className="animate-pulse mt-2"
        style={{ height: 32, width: 320, background: 'rgba(0,0,0,0.06)', borderRadius: 4 }}
      />
      <div className="grid-2col mt-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse"
            style={{
              height: 200,
              background: 'rgba(0,0,0,0.04)',
              borderRadius: 8,
            }}
          />
        ))}
      </div>
      <DetailStyles />
    </div>
  );
}

function DetailStyles() {
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
      .grid-2col {
        display: grid;
        grid-template-columns: 1fr;
        gap: 16px;
      }
      @media (min-width: 1024px) {
        .grid-2col {
          grid-template-columns: 1fr 1fr;
        }
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
      .asset-photo {
        width: 200px;
        height: 200px;
        border-radius: 12px;
        background: var(--input-bg);
        border: 1px solid var(--border-color);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        flex-shrink: 0;
      }
      @media (min-width: 768px) {
        .asset-photo {
          width: 220px;
          height: 220px;
        }
      }
      .kv-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding: 8px 0;
        border-bottom: 1px solid var(--border-color);
      }
      .kv-row:last-child {
        border-bottom: none;
      }
      .kv-row__key {
        font-family: var(--font-ibm-plex-mono), monospace;
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--text-secondary);
        white-space: nowrap;
        flex-shrink: 0;
      }
      .kv-row__value {
        font-size: 14px;
        text-align: right;
        word-break: break-word;
      }
      .hierarchy-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 320px;
        overflow-y: auto;
      }
      .hierarchy-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--input-bg);
        border: 1px solid var(--border-color);
        text-decoration: none;
        transition:
          background 120ms ease,
          border-color 120ms ease;
      }
      .hierarchy-row:hover {
        background: rgba(37, 99, 235, 0.06);
        border-color: rgba(37, 99, 235, 0.3);
      }
      .hierarchy-row__code {
        font-family: var(--font-jetbrains-mono), monospace;
        font-weight: 600;
        font-size: 12px;
        color: var(--text-primary);
        flex-shrink: 0;
      }
      .hierarchy-row__name {
        flex: 1;
        font-family: var(--font-outfit), sans-serif;
        font-weight: 500;
        font-size: 14px;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
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
    `}</style>
  );
}
