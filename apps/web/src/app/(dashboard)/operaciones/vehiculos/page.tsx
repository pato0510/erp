'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Gauge,
  MapPin,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { Toast } from '../../../../components/shared/Toast';
import {
  ASSET_STATUS_LABELS,
  AssetStatusBadge,
  type AssetStatus,
} from '../../../../components/operations/AssetStatusBadge';
import type {
  AssetForFormParent,
  AssetTypeOption,
  LocationOption,
} from '../../../../components/operations/AssetFormModal';
import {
  FUEL_TYPE_LABELS,
  VehicleFormModal,
  type FuelType,
  type VehicleForForm,
  type VehicleFormSubmit,
} from '../../../../components/operations/VehicleFormModal';
import { KilometersUpdateModal } from '../../../../components/operations/KilometersUpdateModal';
import { VehicleImportWizard } from '../../../../components/operations/VehicleImportWizard';

interface VehicleAssetRelation {
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
  tags?: string[] | null;
  assignedToUserId?: string | null;
  photoMimeType?: string | null;
  photoPath?: string | null;
  isActive: boolean;
  assetType?: { id: string; name: string; category: string } | null;
  assetSubtype?: { id: string; name: string } | null;
  location?: { id: string; name: string; code?: string | null } | null;
  parent?: { id: string; code: string; name: string } | null;
}

interface VehicleRow {
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
  asset: VehicleAssetRelation;
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const PAGE_SIZE = 20;

const STATUS_OPTIONS: AssetStatus[] = [
  'OPERATIONAL',
  'WITH_OBSERVATIONS',
  'NON_OPERATIONAL',
  'IN_MAINTENANCE',
  'BLOCKED_DOCUMENTAL',
  'BLOCKED_PERMIT',
  'OUT_OF_SERVICE',
  'DECOMMISSIONED',
];

const kmFmt = new Intl.NumberFormat('es-CL');

type ModalState = null | { mode: 'create' } | { mode: 'edit'; vehicle: VehicleForForm };
type ConfirmState = null | { id: string; licensePlate: string; name: string };
type KmModalState = null | {
  vehicleId: string;
  licensePlate: string;
  name: string;
  currentKilometers: number;
};

export default function VehiculosPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [assetTypeId, setAssetTypeId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | AssetStatus>('');
  const [fuelTypeFilter, setFuelTypeFilter] = useState<'' | FuelType>('');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Paginated<VehicleRow> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [allAssetTypes, setAllAssetTypes] = useState<AssetTypeOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [parentCandidates, setParentCandidates] = useState<AssetForFormParent[]>([]);
  const [catalogsLoaded, setCatalogsLoaded] = useState(false);

  const [modal, setModal] = useState<ModalState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [kmModal, setKmModal] = useState<KmModalState>(null);
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  /* Debounce search input → search to avoid hitting the API on every keystroke. */
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  /* Reset to page 1 when filters change. */
  useEffect(() => {
    setPage(1);
  }, [search, assetTypeId, locationId, statusFilter, fuelTypeFilter, yearFrom, yearTo]);

  /* Asset types are loaded unfiltered then partitioned. The full list is used
     for filter UX (so we can detect "no VEHICLE-category type exists" and show
     the setup banner) and the filtered subset feeds the form/picker. */
  const vehicleAssetTypes = useMemo(
    () => allAssetTypes.filter((t) => t.category === 'VEHICLE'),
    [allAssetTypes],
  );

  const loadCatalogs = useCallback(async () => {
    try {
      const [types, locs, parents] = await Promise.all([
        apiClient.get<AssetTypeOption[]>('/api/operations/asset-types'),
        apiClient.get<LocationOption[]>('/api/operations/locations'),
        /* parentCandidates pulls from full asset list (a vehicle's parent could
           be any operational asset — a building, fleet HQ, etc). */
        apiClient.get<{ data: Array<{ id: string; code: string; name: string }> }>(
          '/api/operations/assets?limit=100',
        ),
      ]);
      setAllAssetTypes(types);
      setLocations(locs);
      setParentCandidates(parents.data.map((p) => ({ id: p.id, code: p.code, name: p.name })));
    } catch {
      /* Silent — list load handles its own error state. */
    } finally {
      setCatalogsLoaded(true);
    }
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (assetTypeId) params.set('assetTypeId', assetTypeId);
      if (locationId) params.set('locationId', locationId);
      if (statusFilter) params.set('status', statusFilter);
      if (fuelTypeFilter) params.set('fuelType', fuelTypeFilter);
      if (yearFrom) params.set('yearFrom', yearFrom);
      if (yearTo) params.set('yearTo', yearTo);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      const res = await apiClient.get<Paginated<VehicleRow>>(
        `/api/operations/fleet/vehicles?${params.toString()}`,
      );
      setData(res);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error cargando vehículos',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [search, assetTypeId, locationId, statusFilter, fuelTypeFilter, yearFrom, yearTo, page]);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  useEffect(() => {
    load();
  }, [load]);

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setAssetTypeId('');
    setLocationId('');
    setStatusFilter('');
    setFuelTypeFilter('');
    setYearFrom('');
    setYearTo('');
  };

  const handleSave = async (dto: VehicleFormSubmit) => {
    if (modal?.mode === 'edit') {
      await apiClient.patch(`/api/operations/fleet/vehicles/${modal.vehicle.id}`, dto);
      setToast({ message: 'Vehículo actualizado', type: 'success' });
    } else {
      await apiClient.post('/api/operations/fleet/vehicles', dto);
      setToast({ message: 'Vehículo creado', type: 'success' });
    }
    setModal(null);
    load();
    /* Refresh parent candidates so a freshly-created vehicle's underlying asset
       can be picked as a parent for a future asset/vehicle. */
    loadCatalogs();
  };

  const handleDelete = async () => {
    if (!confirm) return;
    try {
      await apiClient.delete(`/api/operations/fleet/vehicles/${confirm.id}`);
      setToast({ message: 'Vehículo eliminado', type: 'success' });
      setConfirm(null);
      load();
      loadCatalogs();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo eliminar el vehículo',
        type: 'error',
      });
      setConfirm(null);
    }
  };

  const hasFilters = !!(
    search ||
    assetTypeId ||
    locationId ||
    statusFilter ||
    fuelTypeFilter ||
    yearFrom ||
    yearTo
  );

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-6">
        <div className="ops-breadcrumb">Operaciones / Vehículos</div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1
            className="text-[var(--text-primary)]"
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
              fontSize: 28,
              letterSpacing: '-0.01em',
            }}
          >
            Vehículos
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setImportWizardOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-full hover:bg-gray-50"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                color: 'var(--text-primary)',
              }}
            >
              <Upload size={16} /> Importar
            </button>
            <button
              onClick={() => setModal({ mode: 'create' })}
              disabled={vehicleAssetTypes.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: '#1C1C1E',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Plus size={16} /> Nuevo vehículo
            </button>
          </div>
        </div>
      </div>

      {/* Setup banner — shown when no VEHICLE-category asset type exists yet */}
      {catalogsLoaded && vehicleAssetTypes.length === 0 && (
        <div
          className="mb-6 p-4 rounded-xl flex items-start gap-3"
          style={{
            background: 'rgba(37, 99, 235, 0.08)',
            border: '1px solid rgba(37, 99, 235, 0.2)',
          }}
        >
          <Settings size={20} style={{ color: '#1d4ed8', flexShrink: 0, marginTop: 2 }} />
          <div className="flex-1">
            <p
              className="text-[var(--text-primary)] mb-1"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Aún no has creado tipos de vehículo.
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              Configura tu módulo primero. Para crear vehículos necesitas al menos un tipo de activo
              con categoría <strong>Vehículo</strong>.
            </p>
          </div>
          <Link
            href="/operaciones/configuracion?tab=tipos"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-full text-white flex-shrink-0"
            style={{
              background: '#2563eb',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            Ir a Configuración <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {/* Filters */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="text"
            placeholder="Buscar por patente, código, modelo, VIN..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="cp-input pl-9"
          />
        </div>
        <select
          value={assetTypeId}
          onChange={(e) => setAssetTypeId(e.target.value)}
          className="cp-input"
          style={{ width: 'auto', minWidth: 160 }}
        >
          <option value="">Todos los tipos</option>
          {vehicleAssetTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="cp-input"
          style={{ width: 'auto', minWidth: 160 }}
        >
          <option value="">Todas las ubicaciones</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AssetStatus | '')}
          className="cp-input"
          style={{ width: 'auto', minWidth: 180 }}
        >
          <option value="">Todos los estados</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {ASSET_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={fuelTypeFilter}
          onChange={(e) => setFuelTypeFilter(e.target.value as FuelType | '')}
          className="cp-input"
          style={{ width: 'auto', minWidth: 160 }}
        >
          <option value="">Todos los combustibles</option>
          {(Object.keys(FUEL_TYPE_LABELS) as FuelType[]).map((f) => (
            <option key={f} value={f}>
              {FUEL_TYPE_LABELS[f]}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1900}
          placeholder="Año desde"
          value={yearFrom}
          onChange={(e) => setYearFrom(e.target.value)}
          className="cp-input"
          style={{ width: 110 }}
        />
        <input
          type="number"
          min={1900}
          placeholder="Año hasta"
          value={yearTo}
          onChange={(e) => setYearTo(e.target.value)}
          className="cp-input"
          style={{ width: 110 }}
        />
        {hasFilters && (
          <button
            onClick={resetFilters}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-gray-100 rounded-lg"
            title="Limpiar filtros"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            <X size={14} /> Limpiar
          </button>
        )}
      </div>

      {/* List */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-[var(--border-color)]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-5 py-3 animate-pulse flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-48" />
                  <div className="h-3 bg-gray-200 rounded w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : !data || data.data.length === 0 ? (
          <EmptyState
            hasFilters={hasFilters}
            canCreate={vehicleAssetTypes.length > 0}
            onCreate={() => setModal({ mode: 'create' })}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-color)] bg-[var(--input-bg)]">
                    <Th style={{ width: 56 }}> </Th>
                    <Th>Patente</Th>
                    <Th>Código</Th>
                    <Th>Marca / Modelo</Th>
                    <Th>Año</Th>
                    <Th>Kilometraje</Th>
                    <Th>Combustible</Th>
                    <Th>Ubicación</Th>
                    <Th>Estado</Th>
                    <Th align="right" style={{ width: 96 }}>
                      Acciones
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((v) => (
                    <VehicleRowView
                      key={v.id}
                      vehicle={v}
                      onOpen={() => router.push(`/operaciones/vehiculos/${v.id}`)}
                      onEdit={() => setModal({ mode: 'edit', vehicle: toFormShape(v) })}
                      onDelete={() =>
                        setConfirm({
                          id: v.id,
                          licensePlate: v.licensePlate,
                          name: v.asset.name,
                        })
                      }
                      onUpdateKm={() =>
                        setKmModal({
                          vehicleId: v.id,
                          licensePlate: v.licensePlate,
                          name: v.asset.name,
                          currentKilometers: v.currentKilometers,
                        })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)]">
              <p className="text-xs text-[var(--text-secondary)]">
                {data.total} vehículo{data.total === 1 ? '' : 's'}
                {data.totalPages > 1 && ` · Página ${data.page} de ${data.totalPages}`}
              </p>
              {data.totalPages > 1 && (
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="p-2 rounded border border-gray-300 disabled:opacity-30 hover:bg-[var(--bg-card)] transition"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    disabled={page >= data.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="p-2 rounded border border-gray-300 disabled:opacity-30 hover:bg-[var(--bg-card)] transition"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {modal && (
        <VehicleFormModal
          mode={modal.mode}
          vehicle={modal.mode === 'edit' ? modal.vehicle : null}
          vehicleAssetTypes={vehicleAssetTypes}
          locations={locations}
          parentCandidates={parentCandidates}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title="Eliminar vehículo"
          message={
            <>
              ¿Confirmas eliminar el vehículo{' '}
              <strong className="text-[var(--text-primary)]">{confirm.licensePlate}</strong>
              {confirm.name && ` · ${confirm.name}`}? Esta acción se puede revertir reactivándolo.
            </>
          }
          confirmLabel="Eliminar"
          onConfirm={handleDelete}
          onCancel={() => setConfirm(null)}
        />
      )}

      {kmModal && (
        <KilometersUpdateModal
          vehicleId={kmModal.vehicleId}
          licensePlate={kmModal.licensePlate}
          vehicleName={kmModal.name}
          currentKilometers={kmModal.currentKilometers}
          onClose={() => setKmModal(null)}
          onSaved={() => {
            setKmModal(null);
            setToast({ message: 'Kilometraje actualizado', type: 'success' });
            load();
          }}
        />
      )}

      {importWizardOpen && (
        <VehicleImportWizard
          onClose={() => setImportWizardOpen(false)}
          onImported={() => {
            setToast({ message: 'Vehículos importados correctamente', type: 'success' });
            load();
            loadCatalogs();
          }}
        />
      )}

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
          transition:
            border-color 120ms ease,
            box-shadow 120ms ease;
        }
        .cp-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
      `}</style>
    </div>
  );
}

/* --------------------------------------------------------------------- */

function toFormShape(v: VehicleRow): VehicleForForm {
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

function Th({
  children,
  align,
  style,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  style?: React.CSSProperties;
}) {
  return (
    <th
      style={{
        textAlign: align ?? 'left',
        padding: '10px 16px',
        fontFamily: 'var(--font-ibm-plex-mono), monospace',
        fontSize: 11,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--text-secondary)',
        fontWeight: 500,
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function VehicleRowView({
  vehicle,
  onOpen,
  onEdit,
  onDelete,
  onUpdateKm,
}: {
  vehicle: VehicleRow;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUpdateKm: () => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    if (!vehicle.hasPhoto) {
      setThumbUrl(null);
      return;
    }
    let url: string | null = null;
    apiClient
      .fetchBlob(`/api/operations/assets/${vehicle.assetId}/photo`)
      .then((blob) => {
        if (!aliveRef.current) return;
        url = URL.createObjectURL(blob);
        setThumbUrl(url);
      })
      .catch(() => {
        if (aliveRef.current) setThumbUrl(null);
      });
    return () => {
      aliveRef.current = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [vehicle.assetId, vehicle.hasPhoto]);

  return (
    <tr
      onClick={onOpen}
      className="border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--input-bg)] transition cursor-pointer"
    >
      <td style={{ padding: '8px 16px' }}>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
          style={{
            background: 'var(--input-bg)',
            border: '1px solid var(--border-color)',
          }}
        >
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt={vehicle.licensePlate}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <Truck size={16} className="text-[var(--text-muted)]" />
          )}
        </div>
      </td>
      <td style={{ padding: '8px 16px' }}>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {vehicle.licensePlate}
        </span>
        {vehicle.vin && (
          <div
            className="mt-0.5 text-[var(--text-muted)]"
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 10,
            }}
            title={`VIN: ${vehicle.vin}`}
          >
            {vehicle.vin}
          </div>
        )}
      </td>
      <td style={{ padding: '8px 16px' }}>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--text-secondary)',
          }}
        >
          {vehicle.asset.code}
        </span>
      </td>
      <td style={{ padding: '8px 16px' }}>
        <div
          className="text-[var(--text-primary)]"
          style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 500,
            fontSize: 14,
          }}
        >
          {vehicle.asset.manufacturer || vehicle.asset.name}
        </div>
        <div className="text-xs text-[var(--text-muted)] mt-0.5">
          {vehicle.asset.model || vehicle.asset.assetType?.name || '—'}
        </div>
      </td>
      <td style={{ padding: '8px 16px' }}>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 13,
            color: 'var(--text-primary)',
          }}
        >
          {vehicle.year ?? '—'}
        </span>
      </td>
      <td style={{ padding: '8px 16px' }} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUpdateKm();
          }}
          className="inline-flex items-center gap-1.5 px-2 py-1 -mx-2 -my-1 rounded-md hover:bg-[var(--input-bg)] group"
          title="Actualizar kilometraje"
        >
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}
          >
            {kmFmt.format(vehicle.currentKilometers)} km
          </span>
          <Gauge
            size={13}
            className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition"
          />
        </button>
      </td>
      <td style={{ padding: '8px 16px' }}>
        <span className="text-sm text-[var(--text-secondary)]">
          {FUEL_TYPE_LABELS[vehicle.fuelType]}
        </span>
      </td>
      <td style={{ padding: '8px 16px' }}>
        {vehicle.asset.location ? (
          <span className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)]">
            <MapPin size={12} className="flex-shrink-0" />
            {vehicle.asset.location.name}
          </span>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">—</span>
        )}
      </td>
      <td style={{ padding: '8px 16px' }}>
        <AssetStatusBadge status={vehicle.asset.status} />
      </td>
      <td style={{ padding: '8px 16px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="p-2 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
          title="Editar"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-2 rounded-md hover:bg-red-50 text-red-600 ml-1"
          title="Eliminar"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}

function EmptyState({
  hasFilters,
  canCreate,
  onCreate,
}: {
  hasFilters: boolean;
  canCreate: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="p-12 text-center">
      <Truck size={36} className="mx-auto text-gray-300 mb-3" />
      <p
        className="text-[var(--text-secondary)]"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
      >
        {hasFilters ? 'No se encontraron vehículos' : 'No hay vehículos registrados aún'}
      </p>
      <p className="text-[var(--text-muted)] text-sm mt-1">
        {hasFilters
          ? 'Ajusta los filtros o crea uno nuevo.'
          : 'Crea tu primer vehículo para comenzar.'}
      </p>
      {!hasFilters && canCreate && (
        <button
          onClick={onCreate}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full"
          style={{
            background: '#1C1C1E',
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 500,
          }}
        >
          <Plus size={16} /> Crear primer vehículo
        </button>
      )}
    </div>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
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
            {title}
          </h3>
        </div>
        <div className="px-5 py-4 text-sm text-[var(--text-secondary)]">{message}</div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)]">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm text-white rounded-full"
            style={{
              background: '#DC2626',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
