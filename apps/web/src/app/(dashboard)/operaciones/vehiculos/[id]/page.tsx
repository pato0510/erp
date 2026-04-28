'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  Gauge,
  MapPin,
  Pencil,
  RefreshCw,
  Settings,
  Trash2,
  Truck,
} from 'lucide-react';
import { apiClient } from '../../../../../lib/api';
import { Toast } from '../../../../../components/shared/Toast';
import {
  AssetStatusBadge,
  type AssetStatus,
} from '../../../../../components/operations/AssetStatusBadge';
import { StatusChangeModal } from '../../../../../components/operations/StatusChangeModal';
import {
  DocumentStatusBadge,
  type DerivedDocumentStatus,
} from '../../../../../components/operations/DocumentStatusBadge';
import {
  FUEL_TYPE_LABELS,
  VehicleFormModal,
  type FuelType,
  type VehicleForForm,
  type VehicleFormSubmit,
} from '../../../../../components/operations/VehicleFormModal';
import { KilometersUpdateModal } from '../../../../../components/operations/KilometersUpdateModal';
import type {
  AssetForFormParent,
  AssetTypeOption,
  LocationOption,
} from '../../../../../components/operations/AssetFormModal';
import { formatCLP, formatDate, formatRelativeDate } from '../../../../../lib/formatters';

interface UserSummary {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface VehicleAssetDetail {
  id: string;
  companyId: string;
  assetTypeId: string;
  assetSubtypeId?: string | null;
  locationId?: string | null;
  parentAssetId?: string | null;
  code: string;
  name: string;
  description?: string | null;
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
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  assetType?: {
    id: string;
    name: string;
    category: string;
    icon?: string | null;
    color?: string | null;
    description?: string | null;
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
  assignedUser?: UserSummary | null;
  createdByUser?: UserSummary | null;
}

interface VehicleDetail {
  id: string;
  assetId: string;
  licensePlate: string;
  vin?: string | null;
  year?: number | null;
  currentKilometers: number;
  lastKmUpdate?: string | null;
  fuelType: FuelType;
  registrationDate?: string | null;
  color?: string | null;
  hasPhoto: boolean;
  createdAt: string;
  updatedAt: string;
  asset: VehicleAssetDetail;
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
    hasExpiration: boolean;
    defaultValidityDays?: number | null;
    color?: string | null;
  };
}

interface DocumentRecordSummary {
  id: string;
  documentTypeId: string;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'REPLACED' | 'ARCHIVED';
  expirationDate?: string | null;
  version: number;
  createdAt: string;
  derivedStatus: DerivedDocumentStatus;
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

const kmFmt = new Intl.NumberFormat('es-CL');

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function VehicleDetailPage({ params }: PageProps) {
  /* Next.js 16 wraps dynamic-segment params in a Promise — `use()` unwraps it
     synchronously in client components. */
  const { id } = use(params);
  const router = useRouter();

  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [requirements, setRequirements] = useState<ResolvedRequirement[]>([]);
  const [documentRecords, setDocumentRecords] = useState<DocumentRecordSummary[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [editModal, setEditModal] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [kmModal, setKmModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [vehicleAssetTypes, setVehicleAssetTypes] = useState<AssetTypeOption[]>([]);
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
      const v = await apiClient.get<VehicleDetail>(`/api/operations/fleet/vehicles/${id}`);
      setVehicle(v);
      /* Resolve requirements against the underlying asset.id (not vehicle.id).
         The endpoint returns the full DocumentType including hasExpiration and
         defaultValidityDays so we can render the validity column.
         In parallel pull the asset's uploaded documents so each requirement
         row shows its real compliance state (vigente / por vencer / vencido /
         faltante) instead of a hardcoded placeholder. */
      const [reqs, docs] = await Promise.all([
        apiClient
          .get<ResolvedRequirement[]>(`/api/operations/document-requirements/resolve/${v.asset.id}`)
          .catch(() => [] as ResolvedRequirement[]),
        apiClient
          .get<{
            data: DocumentRecordSummary[];
          }>(`/api/operations/documents?assetId=${v.asset.id}&limit=100`)
          .catch(() => ({ data: [] as DocumentRecordSummary[] })),
      ]);
      setRequirements(reqs);
      setDocumentRecords(docs.data);
      setNotFound(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error cargando el vehículo';
      if (msg.includes('not found') || msg.toLowerCase().includes('no encontrado')) {
        setNotFound(true);
      } else {
        setToast({ message: msg, type: 'error' });
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  /* Catalogs are loaded lazily in parallel so the Edit modal opens with
     selectors populated. AssetType list is filtered to category=VEHICLE
     before being passed to VehicleFormModal. */
  const loadCatalogs = useCallback(async () => {
    try {
      const [types, locs, parents] = await Promise.all([
        apiClient.get<AssetTypeOption[]>('/api/operations/asset-types'),
        apiClient.get<LocationOption[]>('/api/operations/locations'),
        apiClient.get<{ data: AssetForFormParent[] }>('/api/operations/assets?limit=100'),
      ]);
      setVehicleAssetTypes(types.filter((t) => t.category === 'VEHICLE'));
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

  /* Auth-aware photo fetch — photoUrl is a blob: URL we own, so we revoke it
     on cleanup to avoid leaks across reloads. */
  useEffect(() => {
    let alive = true;
    let createdUrl: string | null = null;
    if (!vehicle?.hasPhoto) {
      setPhotoUrl(null);
      return () => undefined;
    }
    apiClient
      .fetchBlob(`/api/operations/assets/${vehicle.assetId}/photo?cb=${photoCacheKeyRef.current}`)
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
  }, [vehicle?.assetId, vehicle?.hasPhoto]);

  const handleEditSave = async (dto: VehicleFormSubmit) => {
    if (!vehicle) return;
    await apiClient.patch(`/api/operations/fleet/vehicles/${vehicle.id}`, dto);
    setToast({ message: 'Vehículo actualizado', type: 'success' });
    setEditModal(false);
    photoCacheKeyRef.current += 1;
    load();
  };

  const handleStatusSave = async (status: AssetStatus, statusReason: string | undefined) => {
    if (!vehicle) return;
    await apiClient.patch(`/api/operations/fleet/vehicles/${vehicle.id}`, {
      status,
      statusReason: statusReason ?? null,
    });
    setToast({ message: 'Estado actualizado', type: 'success' });
    setStatusModal(false);
    load();
  };

  const handleDelete = async () => {
    if (!vehicle) return;
    try {
      await apiClient.delete(`/api/operations/fleet/vehicles/${vehicle.id}`);
      setToast({ message: 'Vehículo eliminado', type: 'success' });
      setConfirmDelete(false);
      router.push('/operaciones/vehiculos');
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo eliminar el vehículo',
        type: 'error',
      });
      setConfirmDelete(false);
    }
  };

  if (loading && !vehicle) {
    return <DetailSkeleton />;
  }

  if (notFound || !vehicle) {
    return (
      <div>
        <div className="ops-breadcrumb">Operaciones / Vehículos</div>
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <Truck size={36} style={{ margin: '0 auto 12px', color: '#cbd5e1' }} />
          <p
            className="text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 600 }}
          >
            Vehículo no encontrado
          </p>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Es posible que haya sido eliminado o no tengas acceso.
          </p>
          <Link
            href="/operaciones/vehiculos"
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-sm rounded-full text-white"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={14} /> Volver a vehículos
          </Link>
        </div>
        <DetailStyles />
      </div>
    );
  }

  /* Pre-compute "Actualizado hace X días" for the kilometers card. The
     formatRelativeDate helper returns days/weeks but we always show it in days
     here to match how operators read the dashboard. */
  const lastKmRelative = vehicle.lastKmUpdate ? formatRelativeDate(vehicle.lastKmUpdate) : null;

  /* Pick the most recent document per documentTypeId — APPROVED records win,
     ties broken by version then createdAt. Used to overlay compliance state
     on each requirement row. */
  const latestDocByType = (() => {
    const map = new Map<string, DocumentRecordSummary>();
    for (const d of documentRecords) {
      const current = map.get(d.documentTypeId);
      if (!current) {
        map.set(d.documentTypeId, d);
        continue;
      }
      const aIsApproved = d.status === 'APPROVED';
      const bIsApproved = current.status === 'APPROVED';
      if (aIsApproved && !bIsApproved) {
        map.set(d.documentTypeId, d);
      } else if (aIsApproved === bIsApproved) {
        if (
          d.version > current.version ||
          (d.version === current.version && d.createdAt > current.createdAt)
        ) {
          map.set(d.documentTypeId, d);
        }
      }
    }
    return map;
  })();
  /* Whether the vehicle is currently extending a VEHICLE-category type. Always
     should be true for vehicles, but we render a soft fallback if mismatched. */
  const fuelLabel = FUEL_TYPE_LABELS[vehicle.fuelType] ?? vehicle.fuelType;

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
          <Link href="/operaciones/vehiculos" className="ops-breadcrumb__link">
            Vehículos
          </Link>
          {' / '}
          <span style={{ color: 'var(--text-primary)' }}>{vehicle.licensePlate}</span>
        </div>
        <Link
          href="/operaciones/vehiculos"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-3"
          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
        >
          <ArrowLeft size={14} /> Volver a vehículos
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1
              className="text-[var(--text-primary)]"
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontWeight: 700,
                fontSize: 28,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                margin: 0,
              }}
            >
              {vehicle.licensePlate}
            </h1>
            <p
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                fontSize: 14,
                color: 'var(--text-secondary)',
                marginTop: 4,
              }}
            >
              {vehicle.asset.name} ·{' '}
              <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
                {vehicle.asset.code}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <AssetStatusBadge status={vehicle.asset.status} />
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
        {/* LEFT COLUMN */}
        <div className="space-y-4">
          {/* Photo + vehicle info */}
          <Card>
            <SectionTitle>Información del vehículo</SectionTitle>
            <div className="flex flex-col items-center md:flex-row md:items-start gap-4">
              <div className="vehicle-photo">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={vehicle.licensePlate}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <Truck size={56} className="text-[var(--text-muted)]" />
                )}
              </div>
              <div className="flex-1 w-full space-y-1">
                <KvRow label="Patente" value={vehicle.licensePlate} mono emphasis />
                <KvRow label="VIN" value={vehicle.vin} mono />
                <KvRow label="Año" value={vehicle.year ?? null} mono />
                <KvRow label="Color" value={vehicle.color} />
                <KvRow label="Combustible" value={fuelLabel} />
                <KvRow
                  label="Asignado a"
                  value={
                    vehicle.asset.assignedUser
                      ? formatUser(vehicle.asset.assignedUser)
                      : vehicle.asset.assignedToUserId
                        ? 'Usuario desconocido'
                        : null
                  }
                  fallback="Sin asignar"
                />
                {vehicle.asset.description && (
                  <div className="pt-2 mt-2 border-t border-[var(--border-color)]">
                    <p className="text-sm text-[var(--text-secondary)]" style={{ lineHeight: 1.5 }}>
                      {vehicle.asset.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Kilometers */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle inline>
                <Gauge size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
                Kilometraje
              </SectionTitle>
              <button
                onClick={() => setKmModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                style={{
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                }}
              >
                <RefreshCw size={12} /> Actualizar kilometraje
              </button>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                color: 'var(--text-primary)',
              }}
            >
              <span className="km-big">{kmFmt.format(vehicle.currentKilometers)}</span>
              <span
                style={{
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontSize: 16,
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                }}
              >
                km
              </span>
            </div>
            {lastKmRelative && (
              <p
                className="mt-1 text-sm text-[var(--text-secondary)]"
                style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
              >
                Actualizado {lastKmRelative}
                {vehicle.lastKmUpdate && ` · ${formatDate(vehicle.lastKmUpdate)}`}
              </p>
            )}
            {!lastKmRelative && (
              <p className="mt-1 text-sm text-[var(--text-muted)]">Sin lecturas registradas.</p>
            )}
            <div
              className="mt-4 p-3 rounded-lg"
              style={{
                background: 'var(--input-bg)',
                border: '1px dashed var(--border-color)',
                textAlign: 'center',
              }}
            >
              <p className="text-xs text-[var(--text-muted)]">
                Próximamente: histórico de kilometraje
              </p>
            </div>
          </Card>

          {/* Identification */}
          <Card>
            <SectionTitle>Identificación adicional</SectionTitle>
            <KvRow label="N° de serie" value={vehicle.asset.serialNumber} mono />
            <KvRow label="Fabricante" value={vehicle.asset.manufacturer} />
            <KvRow label="Modelo" value={vehicle.asset.model} />
            <KvRow label="Tipo" value={vehicle.asset.assetType?.name} />
            <KvRow label="Subtipo" value={vehicle.asset.assetSubtype?.name} />
            <KvRow
              label="Adquisición"
              value={
                vehicle.asset.acquisitionDate ? formatDate(vehicle.asset.acquisitionDate) : null
              }
            />
            <KvRow
              label="Costo adquisición"
              value={
                vehicle.asset.acquisitionCost != null
                  ? formatCLP(Number(vehicle.asset.acquisitionCost))
                  : null
              }
              mono
            />
            <KvRow
              label="Primera inscripción"
              value={vehicle.registrationDate ? formatDate(vehicle.registrationDate) : null}
            />
          </Card>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">
          {/* Status */}
          <Card>
            <SectionTitle>Estado y operación</SectionTitle>
            <div
              className="flex items-center justify-between gap-3 mb-3"
              style={{ padding: '4px 0' }}
            >
              <AssetStatusBadge status={vehicle.asset.status} />
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
            <KvRow label="Razón" value={vehicle.asset.statusReason} />
            <KvRow
              label="Cambio"
              value={
                vehicle.asset.statusChangedAt
                  ? `${formatRelativeDate(vehicle.asset.statusChangedAt)} · ${formatDate(
                      vehicle.asset.statusChangedAt,
                    )}`
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
            {!vehicle.asset.location ? (
              <p className="text-sm text-[var(--text-muted)]" style={{ padding: '8px 0' }}>
                Este vehículo no tiene ubicación asignada.
              </p>
            ) : (
              <>
                <KvRow label="Nombre" value={vehicle.asset.location.name} />
                <KvRow label="Código" value={vehicle.asset.location.code} mono />
                <KvRow label="Dirección" value={vehicle.asset.location.address} />
                {vehicle.asset.location.latitude != null &&
                  vehicle.asset.location.longitude != null && (
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
                        {Number(vehicle.asset.location.latitude).toFixed(4)},{' '}
                        {Number(vehicle.asset.location.longitude).toFixed(4)}
                      </span>
                    </div>
                  )}
              </>
            )}
          </Card>

          {/* Hierarchy (parent only — vehicles don't typically have children) */}
          {vehicle.asset.parent && (
            <Card>
              <SectionTitle>Jerarquía</SectionTitle>
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
              <Link
                href={`/operaciones/equipos/${vehicle.asset.parent.id}`}
                className="hierarchy-row"
              >
                <span className="hierarchy-row__code">{vehicle.asset.parent.code}</span>
                <span className="hierarchy-row__name">{vehicle.asset.parent.name}</span>
                <AssetStatusBadge status={vehicle.asset.parent.status} />
                <ChevronRight size={14} className="text-[var(--text-muted)]" />
              </Link>
            </Card>
          )}

          {/* Tags */}
          <Card>
            <SectionTitle>Tags</SectionTitle>
            {!vehicle.asset.tags || vehicle.asset.tags.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]" style={{ padding: '4px 0' }}>
                Este vehículo no tiene tags.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {vehicle.asset.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center px-2 py-1 rounded-full bg-blue-50 text-blue-700"
                    style={{
                      fontFamily: 'var(--font-outfit), sans-serif',
                      fontWeight: 500,
                      fontSize: 12,
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
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
                Documentos legales requeridos
              </SectionTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Pack documental obligatorio para vehículos en Chile.
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
                Este vehículo no tiene pack documental aplicado. Ve a{' '}
                <Link
                  href="/operaciones/configuracion?tab=tipos"
                  className="text-blue-600 hover:underline"
                >
                  Configuración → Tipos de Activo
                </Link>{' '}
                y aplica el pack documental Chile al tipo de vehículo correspondiente.
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
                    <th>Vigencia</th>
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
                          {r.documentType.hasExpiration && r.documentType.defaultValidityDays ? (
                            <span
                              style={{
                                fontFamily: 'var(--font-jetbrains-mono), monospace',
                                fontSize: 12,
                              }}
                            >
                              {r.documentType.defaultValidityDays} días
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">—</span>
                          )}
                        </td>
                        <td>
                          <ComplianceCell record={latestDocByType.get(r.documentTypeId)} />
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
            Últimas modificaciones registradas en este vehículo.
          </p>
          <KvRow
            label="Creado el"
            value={`${formatDate(vehicle.asset.createdAt)}${
              vehicle.asset.createdByUser ? ` · por ${formatUser(vehicle.asset.createdByUser)}` : ''
            }`}
          />
          <KvRow
            label="Última modificación"
            value={`${formatDate(vehicle.asset.updatedAt)} · ${formatRelativeDate(
              vehicle.asset.updatedAt,
            )}`}
          />
        </Card>
      </div>

      {/* Modals */}
      {editModal && (
        <VehicleFormModal
          mode="edit"
          vehicle={toFormShape(vehicle)}
          vehicleAssetTypes={vehicleAssetTypes}
          locations={locations}
          parentCandidates={parentCandidates.filter((p) => p.id !== vehicle.assetId)}
          onClose={() => setEditModal(false)}
          onSave={handleEditSave}
        />
      )}
      {statusModal && (
        <StatusChangeModal
          currentStatus={vehicle.asset.status}
          onClose={() => setStatusModal(false)}
          onSave={handleStatusSave}
        />
      )}
      {kmModal && (
        <KilometersUpdateModal
          vehicleId={vehicle.id}
          licensePlate={vehicle.licensePlate}
          vehicleName={vehicle.asset.name}
          currentKilometers={vehicle.currentKilometers}
          onClose={() => setKmModal(false)}
          onSaved={() => {
            setKmModal(false);
            setToast({ message: 'Kilometraje actualizado', type: 'success' });
            load();
          }}
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
                Eliminar vehículo
              </h3>
            </div>
            <div className="px-5 py-4 text-sm text-[var(--text-secondary)]">
              ¿Confirmas eliminar el vehículo{' '}
              <strong className="text-[var(--text-primary)]">{vehicle.licensePlate}</strong> ·{' '}
              {vehicle.asset.name}? Esta acción se puede revertir reactivándolo.
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

function toFormShape(v: VehicleDetail): VehicleForForm {
  return {
    id: v.id,
    assetId: v.assetId,
    licensePlate: v.licensePlate,
    vin: v.vin ?? '',
    year: v.year ?? null,
    currentKilometers: v.currentKilometers,
    fuelType: v.fuelType,
    registrationDate: v.registrationDate ?? '',
    color: v.color ?? '',
    hasPhoto: !!v.hasPhoto,
    asset: {
      code: v.asset.code,
      name: v.asset.name,
      description: v.asset.description ?? '',
      assetTypeId: v.asset.assetTypeId,
      assetSubtypeId: v.asset.assetSubtypeId ?? '',
      locationId: v.asset.locationId ?? '',
      parentAssetId: v.asset.parentAssetId ?? '',
      serialNumber: v.asset.serialNumber ?? '',
      manufacturer: v.asset.manufacturer ?? '',
      model: v.asset.model ?? '',
      acquisitionDate: v.asset.acquisitionDate ?? '',
      acquisitionCost: v.asset.acquisitionCost ?? null,
      status: v.asset.status,
      statusReason: v.asset.statusReason ?? '',
      tags: v.asset.tags ?? [],
      assignedToUserId: v.asset.assignedToUserId ?? '',
    },
  };
}

function formatUser(u: UserSummary): string {
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  if (fullName) return `${fullName} · ${u.email}`;
  return u.email;
}

/* Renders the compliance pill for one (vehicle, documentType) pair. Uses the
   API-derived status; decorates VENCIDO / POR_VENCER with day counts so
   urgency is visible at a glance. */
function ComplianceCell({ record }: { record: DocumentRecordSummary | undefined }) {
  if (!record) {
    return <DocumentStatusBadge status="FALTANTE" />;
  }
  let hint: string | undefined;
  if (record.expirationDate) {
    const exp = new Date(record.expirationDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    exp.setHours(0, 0, 0, 0);
    const days = Math.round((exp.getTime() - today.getTime()) / 86400000);
    if (record.derivedStatus === 'VENCIDO' && days < 0) {
      hint = `(hace ${Math.abs(days)} días)`;
    } else if (record.derivedStatus === 'POR_VENCER' && days >= 0) {
      hint = `(en ${days} días)`;
    }
  }
  return <DocumentStatusBadge status={record.derivedStatus} hint={hint} />;
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
  emphasis,
}: {
  label: string;
  value?: string | number | null;
  mono?: boolean;
  fallback?: string;
  emphasis?: boolean;
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
          fontWeight: emphasis ? 700 : undefined,
          fontSize: emphasis ? 16 : undefined,
          letterSpacing: emphasis ? '0.04em' : undefined,
          textTransform: emphasis ? 'uppercase' : undefined,
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
      <div className="ops-breadcrumb">Operaciones / Vehículos</div>
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
      .vehicle-photo {
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
      @media (min-width: 1024px) {
        .vehicle-photo {
          width: 300px;
          height: 300px;
        }
      }
      .km-big {
        font-size: 36px;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      @media (min-width: 1024px) {
        .km-big {
          font-size: 48px;
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
