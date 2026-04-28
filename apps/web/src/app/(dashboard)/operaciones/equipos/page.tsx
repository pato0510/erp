'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { Toast } from '../../../../components/shared/Toast';
import {
  AssetFormModal,
  type AssetForForm,
  type AssetForFormParent,
  type AssetFormSubmit,
  type AssetTypeOption,
  type LocationOption,
} from '../../../../components/operations/AssetFormModal';
import {
  ASSET_STATUS_LABELS,
  AssetStatusBadge,
  type AssetStatus,
} from '../../../../components/operations/AssetStatusBadge';

interface AssetRow {
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
  dynamicAttributes?: Record<string, unknown> | null;
  tags?: string[] | null;
  assignedToUserId?: string | null;
  hasPhoto: boolean;
  isActive: boolean;
  assetType?: {
    id: string;
    name: string;
    category: string;
    icon?: string | null;
    color?: string | null;
  } | null;
  assetSubtype?: { id: string; name: string } | null;
  location?: { id: string; name: string; code?: string | null } | null;
  parent?: { id: string; code: string; name: string } | null;
  _count?: { children: number };
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

type ModalState = null | { mode: 'create' } | { mode: 'edit'; asset: AssetForForm };

type ConfirmState = null | { id: string; code: string; name: string };

export default function EquiposPage() {
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [assetTypeId, setAssetTypeId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | AssetStatus>('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Paginated<AssetRow> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [assetTypes, setAssetTypes] = useState<AssetTypeOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [parentCandidates, setParentCandidates] = useState<AssetForFormParent[]>([]);
  const [catalogsLoaded, setCatalogsLoaded] = useState(false);

  const [modal, setModal] = useState<ModalState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
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
  }, [search, assetTypeId, locationId, statusFilter]);

  const loadCatalogs = useCallback(async () => {
    try {
      const [types, locs, parents] = await Promise.all([
        apiClient.get<AssetTypeOption[]>('/api/operations/asset-types'),
        apiClient.get<LocationOption[]>('/api/operations/locations'),
        apiClient.get<Paginated<AssetRow>>('/api/operations/assets?limit=100'),
      ]);
      setAssetTypes(types);
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
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      const res = await apiClient.get<Paginated<AssetRow>>(
        `/api/operations/assets?${params.toString()}`,
      );
      setData(res);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error cargando equipos',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [search, assetTypeId, locationId, statusFilter, page]);

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
  };

  const handleSave = async (dto: AssetFormSubmit) => {
    if (modal?.mode === 'edit') {
      await apiClient.patch(`/api/operations/assets/${modal.asset.id}`, dto);
      setToast({ message: 'Equipo actualizado', type: 'success' });
    } else {
      await apiClient.post('/api/operations/assets', dto);
      setToast({ message: 'Equipo creado', type: 'success' });
    }
    setModal(null);
    load();
    /* Refresh parent candidates so a freshly-created asset can be a parent. */
    loadCatalogs();
  };

  const handleDelete = async () => {
    if (!confirm) return;
    try {
      await apiClient.delete(`/api/operations/assets/${confirm.id}`);
      setToast({ message: 'Equipo eliminado', type: 'success' });
      setConfirm(null);
      load();
      loadCatalogs();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo eliminar el equipo',
        type: 'error',
      });
      setConfirm(null);
    }
  };

  const hasFilters = !!(search || assetTypeId || locationId || statusFilter);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-6">
        <div className="ops-breadcrumb">Operaciones / Equipos</div>
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
            Equipos
          </h1>
          <button
            onClick={() => setModal({ mode: 'create' })}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            <Plus size={16} /> Nuevo equipo
          </button>
        </div>
      </div>

      {/* Setup banner — shown when no asset types exist yet */}
      {catalogsLoaded && assetTypes.length === 0 && (
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
              Aún no has creado tipos de activo.
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              Configura tu módulo primero para poder crear equipos.
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
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="text"
            placeholder="Buscar por código, nombre, serie..."
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
          {assetTypes.map((t) => (
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
          <EmptyState hasFilters={hasFilters} onCreate={() => setModal({ mode: 'create' })} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-color)] bg-[var(--input-bg)]">
                    <Th style={{ width: 56 }}> </Th>
                    <Th>Código</Th>
                    <Th>Nombre / Tipo</Th>
                    <Th>Ubicación</Th>
                    <Th>Estado</Th>
                    <Th align="right" style={{ width: 96 }}>
                      Acciones
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((a) => (
                    <AssetRowView
                      key={a.id}
                      asset={a}
                      onEdit={() => setModal({ mode: 'edit', asset: toFormShape(a) })}
                      onDelete={() => setConfirm({ id: a.id, code: a.code, name: a.name })}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)]">
              <p className="text-xs text-[var(--text-secondary)]">
                {data.total} equipo{data.total === 1 ? '' : 's'}
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
        <AssetFormModal
          mode={modal.mode}
          asset={modal.mode === 'edit' ? modal.asset : null}
          assetTypes={assetTypes}
          locations={locations}
          parentCandidates={parentCandidates}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title="Eliminar equipo"
          message={
            <>
              ¿Confirmas eliminar el equipo{' '}
              <strong className="text-[var(--text-primary)]">{confirm.code}</strong>
              {confirm.name && ` · ${confirm.name}`}? Esta acción se puede revertir reactivándolo.
            </>
          }
          confirmLabel="Eliminar"
          onConfirm={handleDelete}
          onCancel={() => setConfirm(null)}
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

function toFormShape(a: AssetRow): AssetForForm {
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

/* AssetRow gets its own component so we can scope per-row state (the photo
   thumbnail blob URL) without re-rendering the entire list when one image
   loads. */
function AssetRowView({
  asset,
  onEdit,
  onDelete,
}: {
  asset: AssetRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    if (!asset.hasPhoto) {
      setThumbUrl(null);
      return;
    }
    let url: string | null = null;
    apiClient
      .fetchBlob(`/api/operations/assets/${asset.id}/photo`)
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
  }, [asset.id, asset.hasPhoto]);

  const childrenCount = asset._count?.children ?? 0;

  return (
    <tr className="border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--input-bg)] transition">
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
              alt={asset.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <Wrench size={16} className="text-[var(--text-muted)]" />
          )}
        </div>
      </td>
      <td style={{ padding: '8px 16px' }}>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {asset.code}
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
          {asset.name}
        </div>
        <div className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-2">
          <span>
            {asset.assetType?.name ?? '—'}
            {asset.assetSubtype?.name ? ` · ${asset.assetSubtype.name}` : ''}
          </span>
          {childrenCount > 0 && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700"
              style={{ fontSize: 10, fontWeight: 600 }}
            >
              {childrenCount} {childrenCount === 1 ? 'hijo' : 'hijos'}
            </span>
          )}
        </div>
      </td>
      <td style={{ padding: '8px 16px' }}>
        {asset.location ? (
          <span className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)]">
            <MapPin size={12} className="flex-shrink-0" />
            {asset.location.name}
          </span>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">—</span>
        )}
      </td>
      <td style={{ padding: '8px 16px' }}>
        <AssetStatusBadge status={asset.status} />
      </td>
      <td style={{ padding: '8px 16px', textAlign: 'right' }}>
        <button
          onClick={onEdit}
          className="p-2 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
          title="Editar"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-md hover:bg-red-50 text-red-600 ml-1"
          title="Eliminar"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}

function EmptyState({ hasFilters, onCreate }: { hasFilters: boolean; onCreate: () => void }) {
  return (
    <div className="p-12 text-center">
      <Wrench size={36} className="mx-auto text-gray-300 mb-3" />
      <p
        className="text-[var(--text-secondary)]"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
      >
        {hasFilters ? 'No se encontraron equipos' : 'No hay equipos registrados aún'}
      </p>
      <p className="text-[var(--text-muted)] text-sm mt-1">
        {hasFilters
          ? 'Ajusta los filtros o crea uno nuevo.'
          : 'Crea tu primer equipo para comenzar.'}
      </p>
      {!hasFilters && (
        <button
          onClick={onCreate}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full"
          style={{
            background: '#1C1C1E',
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 500,
          }}
        >
          <Plus size={16} /> Crear primer equipo
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
