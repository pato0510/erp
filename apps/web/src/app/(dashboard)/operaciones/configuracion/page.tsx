'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  FileText,
  Layers,
  MapPin,
  Pencil,
  Plus,
  ShieldCheck,
  Settings,
  Trash2,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { Toast } from '../../../../components/shared/Toast';
import {
  ASSET_CATEGORY_LABELS,
  AssetTypeFormModal,
  type AssetCategory,
  type AssetTypeForForm,
  type AssetTypeSubmit,
} from '../../../../components/operations/config/AssetTypeFormModal';
import {
  AssetSubtypeFormModal,
  type AssetSubtypeForForm,
  type AssetSubtypeSubmit,
} from '../../../../components/operations/config/AssetSubtypeFormModal';
import {
  LocationFormModal,
  type LocationForForm,
  type LocationSubmit,
} from '../../../../components/operations/config/LocationFormModal';
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_CRITICALITY_LABELS,
  DocumentTypeFormModal,
  type DocumentCriticality,
  type DocumentTypeForForm,
  type DocumentTypeSubmit,
} from '../../../../components/operations/config/DocumentTypeFormModal';
import {
  PERMIT_CATEGORY_LABELS,
  PERMIT_CRITICALITY_LABELS,
  PermitTypeFormModal,
  type PermitCriticality,
  type PermitTypeForForm,
  type PermitTypeSubmit,
} from '../../../../components/operations/config/PermitTypeFormModal';
import {
  WORK_PERMIT_CATEGORY_LABELS,
  WorkPermitTypeFormModal,
  type WorkPermitCategory,
  type WorkPermitTypeForForm,
  type WorkPermitTypeSubmit,
} from '../../../../components/operations/config/WorkPermitTypeFormModal';
import { AlertsConfigTab } from '../../../../components/operations/config/AlertsConfigTab';

type TabKey = 'tipos' | 'ubicaciones' | 'documentos' | 'permisos' | 'alertas';
const TABS: Array<{ key: TabKey; label: string; icon: typeof Layers }> = [
  { key: 'tipos', label: 'Tipos de Activo', icon: Layers },
  { key: 'ubicaciones', label: 'Ubicaciones', icon: MapPin },
  { key: 'documentos', label: 'Tipos de Documento', icon: FileText },
  { key: 'permisos', label: 'Tipos de Permiso', icon: ShieldCheck },
  { key: 'alertas', label: 'Alertas', icon: Bell },
];

interface AssetTypeRow extends AssetTypeForForm {
  subtypes?: Array<{ id: string; name: string; isActive: boolean }>;
  /* Backend computes this for VEHICLE-category types — true when all 4
     Chilean vehicle documents are already linked as DocumentRequirements. */
  vehiclePackApplied?: boolean;
}

interface ApplyVehiclePackResponse {
  created: string[];
  skipped: string[];
  missingDocumentTypes: string[];
}

interface AssetSubtypeRow extends AssetSubtypeForForm {
  assetType?: { id: string; name: string; category: AssetCategory } | null;
}

interface LocationRow extends LocationForForm {
  parent?: { id: string; name: string } | null;
}

type DocumentTypeRow = DocumentTypeForForm;

type PermitTypeRow = PermitTypeForForm;

type WorkPermitTypeRow = WorkPermitTypeForForm;

type Toaster = (message: string, type: 'success' | 'error' | 'info') => void;

export default function ConfiguracionPage() {
  return (
    <Suspense fallback={null}>
      <ConfiguracionContent />
    </Suspense>
  );
}

function ConfiguracionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabKey | null) ?? 'tipos';
  const [tab, setTab] = useState<TabKey>(
    (['tipos', 'ubicaciones', 'documentos', 'permisos', 'alertas'] as TabKey[]).includes(initialTab)
      ? initialTab
      : 'tipos',
  );

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  const showToast: Toaster = useCallback((message, type) => setToast({ message, type }), []);

  const handleTabChange = (key: TabKey) => {
    setTab(key);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', key);
    router.replace(`/operaciones/configuracion?${params.toString()}`, { scroll: false });
  };

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-6">
        <div className="ops-breadcrumb">Operaciones / Configuración</div>
        <h1
          className="text-[var(--text-primary)]"
          style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 600,
            fontSize: 28,
            letterSpacing: '-0.01em',
            margin: '0 0 8px',
          }}
        >
          Configuración del módulo
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-ibm-plex-mono), monospace',
            fontSize: 11,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
          }}
        >
          Gestiona tipos, ubicaciones y documentos
        </p>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 mb-6 p-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl"
        style={{ width: 'fit-content', maxWidth: '100%' }}
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              className={`relative flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-gray-100'
              }`}
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: isActive ? 600 : 500,
              }}
            >
              <Icon size={14} />
              {t.label}
              {isActive && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    left: '15%',
                    right: '15%',
                    height: 2,
                    background: '#60A5FA',
                    borderRadius: 2,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {tab === 'tipos' && <TiposTab toaster={showToast} />}
      {tab === 'ubicaciones' && <UbicacionesTab toaster={showToast} />}
      {tab === 'documentos' && <TiposDocumentoTab toaster={showToast} />}
      {tab === 'permisos' && <PermisosTabRouter toaster={showToast} />}
      {tab === 'alertas' && <AlertsConfigTab toaster={showToast} />}

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
        .config-section {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 24px;
        }
        .config-section__head {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .config-section__head h2 {
          font-family: var(--font-outfit), sans-serif;
          font-weight: 600;
          font-size: 16px;
          color: var(--text-primary);
          margin: 0 0 4px;
        }
        .config-section__head p {
          font-size: 13px;
          color: var(--text-secondary);
          margin: 0;
          max-width: 600px;
          line-height: 1.5;
        }
        .config-table {
          width: 100%;
          border-collapse: collapse;
        }
        .config-table th {
          text-align: left;
          padding: 10px 16px;
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-secondary);
          font-weight: 500;
          background: var(--input-bg);
          border-bottom: 1px solid var(--border-color);
        }
        .config-table td {
          padding: 10px 16px;
          border-bottom: 1px solid var(--border-color);
          font-size: 14px;
          color: var(--text-primary);
          vertical-align: middle;
        }
        .config-table tr:last-child td {
          border-bottom: none;
        }
        .config-table tr:hover td {
          background: var(--input-bg);
        }
        .config-empty {
          padding: 48px 24px;
          text-align: center;
          color: var(--text-secondary);
        }
        .config-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 999px;
          font-family: var(--font-jetbrains-mono), monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
      `}</style>
    </div>
  );
}

/* ============================================================ */
/*  TAB 1 — Asset Types + Asset Subtypes                        */
/* ============================================================ */

function TiposTab({ toaster }: { toaster: Toaster }) {
  const [types, setTypes] = useState<AssetTypeRow[]>([]);
  const [subtypes, setSubtypes] = useState<AssetSubtypeRow[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [loadingSubtypes, setLoadingSubtypes] = useState(true);
  const [subtypeFilter, setSubtypeFilter] = useState('');

  const [typeModal, setTypeModal] = useState<
    null | { mode: 'create' } | { mode: 'edit'; type: AssetTypeRow }
  >(null);
  const [subtypeModal, setSubtypeModal] = useState<
    null | { mode: 'create' } | { mode: 'edit'; subtype: AssetSubtypeRow }
  >(null);

  const loadTypes = useCallback(async () => {
    setLoadingTypes(true);
    try {
      const rows = await apiClient.get<AssetTypeRow[]>('/api/operations/asset-types');
      setTypes(rows);
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error cargando tipos', 'error');
    } finally {
      setLoadingTypes(false);
    }
  }, [toaster]);

  const loadSubtypes = useCallback(async () => {
    setLoadingSubtypes(true);
    try {
      const params = new URLSearchParams();
      if (subtypeFilter) params.set('assetTypeId', subtypeFilter);
      const rows = await apiClient.get<AssetSubtypeRow[]>(
        `/api/operations/asset-subtypes${params.toString() ? `?${params.toString()}` : ''}`,
      );
      setSubtypes(rows);
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error cargando subtipos', 'error');
    } finally {
      setLoadingSubtypes(false);
    }
  }, [subtypeFilter, toaster]);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);
  useEffect(() => {
    loadSubtypes();
  }, [loadSubtypes]);

  const handleTypeSave = async (dto: AssetTypeSubmit) => {
    if (typeModal?.mode === 'edit') {
      await apiClient.patch(`/api/operations/asset-types/${typeModal.type.id}`, dto);
      toaster('Tipo de activo actualizado', 'success');
    } else {
      await apiClient.post('/api/operations/asset-types', dto);
      toaster('Tipo de activo creado', 'success');
    }
    setTypeModal(null);
    loadTypes();
  };

  const handleTypeDelete = async (row: AssetTypeRow) => {
    if (!window.confirm(`¿Eliminar el tipo "${row.name}"?`)) return;
    try {
      await apiClient.delete(`/api/operations/asset-types/${row.id}`);
      toaster('Tipo de activo eliminado', 'success');
      loadTypes();
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error al eliminar', 'error');
    }
  };

  /* Triggers POST /asset-types/:id/apply-vehicle-defaults. The endpoint is
     idempotent — calling it on a type that already has all 4 documents linked
     just returns counts without creating duplicates. */
  const handleApplyVehiclePack = async (row: AssetTypeRow) => {
    try {
      const result = await apiClient.post<ApplyVehiclePackResponse>(
        `/api/operations/asset-types/${row.id}/apply-vehicle-defaults`,
      );
      const parts: string[] = [];
      if (result.created.length > 0) parts.push(`${result.created.length} documentos asociados`);
      if (result.skipped.length > 0) parts.push(`${result.skipped.length} ya existían`);
      if (result.missingDocumentTypes.length > 0) {
        toaster(
          `Faltan tipos de documento: ${result.missingDocumentTypes.join(', ')}. Ejecuta "Cargar tipos chilenos por defecto" en la pestaña Tipos de Documento.`,
          'error',
        );
      } else {
        toaster(
          parts.length > 0 ? parts.join(', ') : 'Pack documental ya estaba aplicado',
          'success',
        );
      }
      loadTypes();
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'No se pudo aplicar el pack', 'error');
    }
  };

  const handleSubtypeSave = async (dto: AssetSubtypeSubmit) => {
    if (subtypeModal?.mode === 'edit') {
      await apiClient.patch(`/api/operations/asset-subtypes/${subtypeModal.subtype.id}`, dto);
      toaster('Subtipo actualizado', 'success');
    } else {
      await apiClient.post('/api/operations/asset-subtypes', dto);
      toaster('Subtipo creado', 'success');
    }
    setSubtypeModal(null);
    loadSubtypes();
  };

  const handleSubtypeDelete = async (row: AssetSubtypeRow) => {
    if (!window.confirm(`¿Eliminar el subtipo "${row.name}"?`)) return;
    try {
      await apiClient.delete(`/api/operations/asset-subtypes/${row.id}`);
      toaster('Subtipo eliminado', 'success');
      loadSubtypes();
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error al eliminar', 'error');
    }
  };

  const typeOptionsForSubtypes = useMemo(
    () =>
      types
        .filter((t) => t.isActive)
        .map((t) => ({ id: t.id, name: t.name, category: t.category })),
    [types],
  );

  return (
    <>
      {/* Asset Types section */}
      <section className="config-section">
        <div className="config-section__head">
          <div>
            <h2>Tipos de Activo</h2>
            <p>
              Define las categorías generales de tus activos operacionales. Los tipos VEHÍCULO
              pueden recibir el pack documental Chile automáticamente (SOAP, Permiso de Circulación,
              RT, Padrón).
            </p>
          </div>
          <button
            onClick={() => setTypeModal({ mode: 'create' })}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            <Plus size={16} /> Nuevo tipo
          </button>
        </div>
        {loadingTypes ? (
          <SkeletonRows />
        ) : types.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No hay tipos de activo"
            description="Crea tu primer tipo para empezar a clasificar tus activos."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="config-table">
              <thead>
                <tr>
                  <th style={{ width: 56 }}> </th>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th>Subtipos</th>
                  <th>Pack documental</th>
                  <th>Estado</th>
                  <th style={{ width: 100, textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          background: t.color || '#94A3B8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: 11,
                          fontFamily: 'var(--font-jetbrains-mono), monospace',
                          fontWeight: 600,
                        }}
                        title={t.icon ?? undefined}
                      >
                        {t.icon
                          ? t.icon.slice(0, 2).toUpperCase()
                          : t.name.slice(0, 2).toUpperCase()}
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontFamily: 'var(--font-outfit), sans-serif',
                          fontWeight: 500,
                        }}
                      >
                        {t.name}
                      </span>
                      {t.description && (
                        <div className="text-xs text-[var(--text-muted)] mt-0.5">
                          {t.description}
                        </div>
                      )}
                    </td>
                    <td>{ASSET_CATEGORY_LABELS[t.category]}</td>
                    <td>
                      <span
                        className="config-chip"
                        style={{
                          background: 'rgba(37, 99, 235, 0.1)',
                          color: '#1d4ed8',
                        }}
                      >
                        {t.subtypes?.length ?? 0}
                      </span>
                    </td>
                    <td>
                      <VehiclePackCell type={t} onApply={() => handleApplyVehiclePack(t)} />
                    </td>
                    <td>
                      <ActiveBadge active={t.isActive} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => setTypeModal({ mode: 'edit', type: t })}
                        className="p-2 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleTypeDelete(t)}
                        className="p-2 rounded-md hover:bg-red-50 text-red-600 ml-1"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Asset Subtypes section */}
      <section className="config-section">
        <div className="config-section__head">
          <div>
            <h2>Subtipos de Activo</h2>
            <p>
              Define variantes específicas dentro de cada tipo (ejemplo: Generador 100kVA, Camioneta
              4x4).
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={subtypeFilter}
              onChange={(e) => setSubtypeFilter(e.target.value)}
              className="cp-input"
              style={{ width: 'auto', minWidth: 180 }}
            >
              <option value="">Todos los tipos</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setSubtypeModal({ mode: 'create' })}
              disabled={typeOptionsForSubtypes.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
              style={{
                background: '#1C1C1E',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Plus size={16} /> Nuevo subtipo
            </button>
          </div>
        </div>
        {loadingSubtypes ? (
          <SkeletonRows />
        ) : subtypes.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No hay subtipos"
            description={
              typeOptionsForSubtypes.length === 0
                ? 'Primero crea al menos un tipo de activo.'
                : 'Crea subtipos para diferenciar variantes específicas.'
            }
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="config-table">
              <thead>
                <tr>
                  <th>Tipo padre</th>
                  <th>Nombre</th>
                  <th>Especificaciones</th>
                  <th>Estado</th>
                  <th style={{ width: 100, textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {subtypes.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span
                        className="config-chip"
                        style={{ background: 'rgba(100, 116, 139, 0.14)', color: '#475569' }}
                      >
                        {s.assetType?.name ?? '—'}
                      </span>
                    </td>
                    <td
                      style={{
                        fontFamily: 'var(--font-outfit), sans-serif',
                        fontWeight: 500,
                      }}
                    >
                      {s.name}
                    </td>
                    <td>
                      <SpecsPreview specs={s.specifications} />
                    </td>
                    <td>
                      <ActiveBadge active={s.isActive} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => setSubtypeModal({ mode: 'edit', subtype: s })}
                        className="p-2 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleSubtypeDelete(s)}
                        className="p-2 rounded-md hover:bg-red-50 text-red-600 ml-1"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {typeModal && (
        <AssetTypeFormModal
          mode={typeModal.mode}
          assetType={typeModal.mode === 'edit' ? typeModal.type : null}
          onClose={() => setTypeModal(null)}
          onSave={handleTypeSave}
        />
      )}
      {subtypeModal && (
        <AssetSubtypeFormModal
          mode={subtypeModal.mode}
          subtype={subtypeModal.mode === 'edit' ? subtypeModal.subtype : null}
          assetTypes={typeOptionsForSubtypes}
          defaultAssetTypeId={subtypeFilter || undefined}
          onClose={() => setSubtypeModal(null)}
          onSave={handleSubtypeSave}
        />
      )}
    </>
  );
}

function SpecsPreview({ specs }: { specs?: Record<string, unknown> | null }) {
  if (!specs || typeof specs !== 'object')
    return <span className="text-[var(--text-muted)]">—</span>;
  const entries = Object.entries(specs);
  if (entries.length === 0) return <span className="text-[var(--text-muted)]">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.slice(0, 3).map(([k, v]) => (
        <span
          key={k}
          className="config-chip"
          style={{ background: 'rgba(100, 116, 139, 0.1)', color: 'var(--text-secondary)' }}
        >
          {k}: {typeof v === 'string' ? v : JSON.stringify(v)}
        </span>
      ))}
      {entries.length > 3 && (
        <span className="text-xs text-[var(--text-muted)]">+{entries.length - 3}</span>
      )}
    </div>
  );
}

/* ============================================================ */
/*  TAB 2 — Locations                                           */
/* ============================================================ */

function UbicacionesTab({ toaster }: { toaster: Toaster }) {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<
    null | { mode: 'create' } | { mode: 'edit'; location: LocationRow }
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiClient.get<LocationRow[]>('/api/operations/locations');
      setLocations(rows);
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error cargando ubicaciones', 'error');
    } finally {
      setLoading(false);
    }
  }, [toaster]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (dto: LocationSubmit) => {
    if (modal?.mode === 'edit') {
      await apiClient.patch(`/api/operations/locations/${modal.location.id}`, dto);
      toaster('Ubicación actualizada', 'success');
    } else {
      await apiClient.post('/api/operations/locations', dto);
      toaster('Ubicación creada', 'success');
    }
    setModal(null);
    load();
  };

  const handleDelete = async (row: LocationRow) => {
    if (!window.confirm(`¿Eliminar la ubicación "${row.name}"?`)) return;
    try {
      await apiClient.delete(`/api/operations/locations/${row.id}`);
      toaster('Ubicación eliminada', 'success');
      load();
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error al eliminar', 'error');
    }
  };

  /* Build a quick parent → name lookup for the table. */
  const parentNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of locations) m.set(l.id, l.name);
    return m;
  }, [locations]);

  /* Indent depth: walk up parent chain. Capped at 4 to avoid pathological cases. */
  const depthFor = useCallback(
    (row: LocationRow) => {
      let depth = 0;
      let current: string | null | undefined = row.parentLocationId;
      const seen = new Set<string>();
      while (current && depth < 4 && !seen.has(current)) {
        seen.add(current);
        depth += 1;
        const next = locations.find((l) => l.id === current);
        current = next?.parentLocationId ?? null;
      }
      return depth;
    },
    [locations],
  );

  return (
    <>
      <section className="config-section">
        <div className="config-section__head">
          <div>
            <h2>Ubicaciones</h2>
            <p>
              Sitios físicos donde se encuentran tus activos. Pueden tener jerarquía (faena → planta
              → área).
            </p>
          </div>
          <button
            onClick={() => setModal({ mode: 'create' })}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            <Plus size={16} /> Nueva ubicación
          </button>
        </div>
        {loading ? (
          <SkeletonRows />
        ) : locations.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No hay ubicaciones"
            description="Crea tu primera ubicación para asociarla a tus activos."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="config-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Código</th>
                  <th>Padre</th>
                  <th>Coordenadas</th>
                  <th>Estado</th>
                  <th style={{ width: 100, textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((l) => {
                  const depth = depthFor(l);
                  return (
                    <tr key={l.id}>
                      <td>
                        <span
                          style={{
                            paddingLeft: depth * 16,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontWeight: 500,
                          }}
                        >
                          {depth > 0 && <span style={{ color: 'var(--text-muted)' }}>↳</span>}
                          {l.name}
                        </span>
                      </td>
                      <td>
                        {l.code ? (
                          <span
                            style={{
                              fontFamily: 'var(--font-jetbrains-mono), monospace',
                              fontSize: 12,
                            }}
                          >
                            {l.code}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td>
                        {l.parentLocationId ? (
                          (parentNameById.get(l.parentLocationId) ?? '—')
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td>
                        {l.latitude != null && l.longitude != null ? (
                          <span
                            style={{
                              fontFamily: 'var(--font-jetbrains-mono), monospace',
                              fontSize: 11,
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {Number(l.latitude).toFixed(4)}, {Number(l.longitude).toFixed(4)}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td>
                        <ActiveBadge active={l.isActive} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => setModal({ mode: 'edit', location: l })}
                          className="p-2 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(l)}
                          className="p-2 rounded-md hover:bg-red-50 text-red-600 ml-1"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal && (
        <LocationFormModal
          mode={modal.mode}
          location={modal.mode === 'edit' ? modal.location : null}
          parentCandidates={locations.map((l) => ({ id: l.id, name: l.name }))}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </>
  );
}

/* ============================================================ */
/*  TAB 3 — Document Types                                      */
/* ============================================================ */

const CRITICALITY_COLORS: Record<DocumentCriticality, { bg: string; fg: string }> = {
  LOW: { bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
  MEDIUM: { bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8' },
  HIGH: { bg: 'rgba(234, 179, 8, 0.14)', fg: '#a16207' },
  CRITICAL: { bg: 'rgba(239, 68, 68, 0.12)', fg: '#b91c1c' },
};

function TiposDocumentoTab({ toaster }: { toaster: Toaster }) {
  const [types, setTypes] = useState<DocumentTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [modal, setModal] = useState<
    null | { mode: 'create' } | { mode: 'edit'; type: DocumentTypeRow }
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiClient.get<DocumentTypeRow[]>('/api/operations/document-types');
      setTypes(rows);
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error cargando tipos de documento', 'error');
    } finally {
      setLoading(false);
    }
  }, [toaster]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (dto: DocumentTypeSubmit) => {
    if (modal?.mode === 'edit') {
      await apiClient.patch(`/api/operations/document-types/${modal.type.id}`, dto);
      toaster('Tipo de documento actualizado', 'success');
    } else {
      await apiClient.post('/api/operations/document-types', dto);
      toaster('Tipo de documento creado', 'success');
    }
    setModal(null);
    load();
  };

  const handleDelete = async (row: DocumentTypeRow) => {
    if (!window.confirm(`¿Eliminar el tipo "${row.name}"?`)) return;
    try {
      await apiClient.delete(`/api/operations/document-types/${row.id}`);
      toaster('Tipo de documento eliminado', 'success');
      load();
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error al eliminar', 'error');
    }
  };

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      const result = await apiClient.post<{ createdCount: number; skippedCount: number }>(
        '/api/operations/document-types/seed-defaults',
      );
      toaster(
        `${result.createdCount} tipos de documento creados${
          result.skippedCount > 0 ? ` · ${result.skippedCount} omitidos (ya existían)` : ''
        }`,
        'success',
      );
      load();
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error al cargar tipos por defecto', 'error');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <>
      <section className="config-section">
        <div className="config-section__head">
          <div>
            <h2>Tipos de Documento</h2>
            <p>
              Define los documentos que pueden asociarse a tus activos (permisos, certificados,
              manuales, etc).
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSeedDefaults}
              disabled={seeding}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-full border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                color: 'var(--text-primary)',
              }}
            >
              <Settings size={14} />
              {seeding ? 'Cargando...' : 'Cargar tipos chilenos por defecto'}
            </button>
            <button
              onClick={() => setModal({ mode: 'create' })}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full"
              style={{
                background: '#1C1C1E',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Plus size={16} /> Nuevo tipo
            </button>
          </div>
        </div>
        {loading ? (
          <SkeletonRows />
        ) : types.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No hay tipos de documento"
            description="Carga el catálogo chileno por defecto o crea tipos personalizados."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="config-table">
              <thead>
                <tr>
                  <th style={{ width: 56 }}> </th>
                  <th>Nombre / Código</th>
                  <th>Categoría</th>
                  <th>Vigencia</th>
                  <th>Criticidad</th>
                  <th>Bloqueante</th>
                  <th>Estado</th>
                  <th style={{ width: 100, textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {types.map((dt) => {
                  const critMeta = CRITICALITY_COLORS[dt.criticality];
                  return (
                    <tr key={dt.id}>
                      <td>
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: dt.color || '#475569',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: 11,
                            fontFamily: 'var(--font-jetbrains-mono), monospace',
                            fontWeight: 600,
                          }}
                        >
                          {dt.code.slice(0, 3)}
                        </div>
                      </td>
                      <td>
                        <div
                          style={{
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontWeight: 500,
                          }}
                        >
                          {dt.name}
                        </div>
                        <div
                          className="text-[var(--text-muted)] mt-0.5"
                          style={{
                            fontFamily: 'var(--font-jetbrains-mono), monospace',
                            fontSize: 11,
                          }}
                        >
                          {dt.code}
                        </div>
                      </td>
                      <td>{DOCUMENT_CATEGORY_LABELS[dt.category]}</td>
                      <td>
                        {dt.hasExpiration && dt.defaultValidityDays ? (
                          <span
                            style={{
                              fontFamily: 'var(--font-jetbrains-mono), monospace',
                              fontSize: 12,
                            }}
                          >
                            {dt.defaultValidityDays} días
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td>
                        <span
                          className="config-chip"
                          style={{ background: critMeta.bg, color: critMeta.fg }}
                        >
                          {DOCUMENT_CRITICALITY_LABELS[dt.criticality]}
                        </span>
                      </td>
                      <td>
                        {dt.blocksOperation ? (
                          <span
                            className="config-chip"
                            style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#b91c1c' }}
                          >
                            Sí
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">No</span>
                        )}
                      </td>
                      <td>
                        <ActiveBadge active={dt.isActive} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => setModal({ mode: 'edit', type: dt })}
                          className="p-2 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(dt)}
                          className="p-2 rounded-md hover:bg-red-50 text-red-600 ml-1"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal && (
        <DocumentTypeFormModal
          mode={modal.mode}
          documentType={modal.mode === 'edit' ? modal.type : null}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </>
  );
}

/* ============================================================ */
/*  TAB 4 — Permits sub-router (Externos / De Trabajo)          */
/* ============================================================ */

type PermisosSubTab = 'externos' | 'trabajo';

function PermisosTabRouter({ toaster }: { toaster: Toaster }) {
  const [sub, setSub] = useState<PermisosSubTab>('externos');
  return (
    <div>
      <div
        className="flex gap-1 mb-4 p-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg"
        style={{ width: 'fit-content' }}
      >
        <SubTabButton active={sub === 'externos'} onClick={() => setSub('externos')}>
          Externos
        </SubTabButton>
        <SubTabButton active={sub === 'trabajo'} onClick={() => setSub('trabajo')}>
          De Trabajo
        </SubTabButton>
      </div>
      {sub === 'externos' && <TiposPermisoTab toaster={toaster} />}
      {sub === 'trabajo' && <TiposPermisoDeTrabajoTab toaster={toaster} />}
    </div>
  );
}

function SubTabButton({
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

const PERMIT_CRITICALITY_COLORS: Record<PermitCriticality, { bg: string; fg: string }> = {
  LOW: { bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
  MEDIUM: { bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8' },
  HIGH: { bg: 'rgba(234, 179, 8, 0.14)', fg: '#a16207' },
  CRITICAL: { bg: 'rgba(239, 68, 68, 0.12)', fg: '#b91c1c' },
};

function TiposPermisoTab({ toaster }: { toaster: Toaster }) {
  const [types, setTypes] = useState<PermitTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [modal, setModal] = useState<
    null | { mode: 'create' } | { mode: 'edit'; type: PermitTypeRow }
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiClient.get<PermitTypeRow[]>('/api/operations/permit-types');
      setTypes(rows);
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error cargando tipos de permiso', 'error');
    } finally {
      setLoading(false);
    }
  }, [toaster]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (dto: PermitTypeSubmit) => {
    if (modal?.mode === 'edit') {
      await apiClient.patch(`/api/operations/permit-types/${modal.type.id}`, dto);
      toaster('Tipo de permiso actualizado', 'success');
    } else {
      await apiClient.post('/api/operations/permit-types', dto);
      toaster('Tipo de permiso creado', 'success');
    }
    setModal(null);
    load();
  };

  const handleDelete = async (row: PermitTypeRow) => {
    if (!window.confirm(`¿Eliminar el tipo "${row.name}"?`)) return;
    try {
      await apiClient.delete(`/api/operations/permit-types/${row.id}`);
      toaster('Tipo de permiso eliminado', 'success');
      load();
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error al eliminar', 'error');
    }
  };

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      const result = await apiClient.post<{ createdCount: number; skippedCount: number }>(
        '/api/operations/permit-types/seed-defaults',
      );
      toaster(
        `${result.createdCount} tipos de permiso creados${
          result.skippedCount > 0 ? ` · ${result.skippedCount} omitidos (ya existían)` : ''
        }`,
        'success',
      );
      load();
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error al cargar tipos por defecto', 'error');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <>
      <section className="config-section">
        <div className="config-section__head">
          <div>
            <h2>Tipos de Permiso</h2>
            <p>
              Catálogo de permisos operacionales externos que pueden asociarse a activos o
              ubicaciones (Patente Municipal, Autorización Sanitaria, RCA, Permiso de Bomberos).
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSeedDefaults}
              disabled={seeding}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-full border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                color: 'var(--text-primary)',
              }}
            >
              <Settings size={14} />
              {seeding ? 'Cargando...' : 'Cargar tipos chilenos por defecto'}
            </button>
            <button
              onClick={() => setModal({ mode: 'create' })}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full"
              style={{
                background: '#1C1C1E',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Plus size={16} /> Nuevo tipo
            </button>
          </div>
        </div>
        {loading ? (
          <SkeletonRows />
        ) : types.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No hay tipos de permiso"
            description="Carga el catálogo chileno por defecto o crea tipos personalizados."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="config-table">
              <thead>
                <tr>
                  <th style={{ width: 56 }}> </th>
                  <th>Nombre / Código</th>
                  <th>Categoría</th>
                  <th>Autoridad</th>
                  <th>Vigencia</th>
                  <th>Criticidad</th>
                  <th>Bloqueante</th>
                  <th>Estado</th>
                  <th style={{ width: 100, textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {types.map((pt) => {
                  const critMeta = PERMIT_CRITICALITY_COLORS[pt.criticality];
                  return (
                    <tr key={pt.id}>
                      <td>
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: pt.color || '#475569',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: 11,
                            fontFamily: 'var(--font-jetbrains-mono), monospace',
                            fontWeight: 600,
                          }}
                        >
                          {pt.code.slice(0, 3)}
                        </div>
                      </td>
                      <td>
                        <div
                          style={{
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontWeight: 500,
                          }}
                        >
                          {pt.name}
                        </div>
                        <div
                          className="text-[var(--text-muted)] mt-0.5"
                          style={{
                            fontFamily: 'var(--font-jetbrains-mono), monospace',
                            fontSize: 11,
                          }}
                        >
                          {pt.code}
                        </div>
                      </td>
                      <td>{PERMIT_CATEGORY_LABELS[pt.category]}</td>
                      <td>
                        {pt.issuingAuthority ? (
                          <span style={{ fontSize: 13 }}>{pt.issuingAuthority}</span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td>
                        {pt.hasExpiration && pt.defaultValidityDays ? (
                          <span
                            style={{
                              fontFamily: 'var(--font-jetbrains-mono), monospace',
                              fontSize: 12,
                            }}
                          >
                            {pt.defaultValidityDays} días
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td>
                        <span
                          className="config-chip"
                          style={{ background: critMeta.bg, color: critMeta.fg }}
                        >
                          {PERMIT_CRITICALITY_LABELS[pt.criticality]}
                        </span>
                      </td>
                      <td>
                        {pt.blocksOperation ? (
                          <span
                            className="config-chip"
                            style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#b91c1c' }}
                          >
                            Sí
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">No</span>
                        )}
                      </td>
                      <td>
                        <ActiveBadge active={pt.isActive} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => setModal({ mode: 'edit', type: pt })}
                          className="p-2 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(pt)}
                          className="p-2 rounded-md hover:bg-red-50 text-red-600 ml-1"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal && (
        <PermitTypeFormModal
          mode={modal.mode}
          permitType={modal.mode === 'edit' ? modal.type : null}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </>
  );
}

/* ============================================================ */
/*  TAB 4b — Work Permit Types                                  */
/* ============================================================ */

function TiposPermisoDeTrabajoTab({ toaster }: { toaster: Toaster }) {
  const [types, setTypes] = useState<WorkPermitTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [modal, setModal] = useState<
    null | { mode: 'create' } | { mode: 'edit'; type: WorkPermitTypeRow }
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiClient.get<WorkPermitTypeRow[]>('/api/operations/work-permit-types');
      setTypes(rows);
    } catch (err) {
      toaster(
        err instanceof Error ? err.message : 'Error cargando tipos de permiso de trabajo',
        'error',
      );
    } finally {
      setLoading(false);
    }
  }, [toaster]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (dto: WorkPermitTypeSubmit) => {
    if (modal?.mode === 'edit') {
      await apiClient.patch(`/api/operations/work-permit-types/${modal.type.id}`, dto);
      toaster('Tipo de permiso de trabajo actualizado', 'success');
    } else {
      await apiClient.post('/api/operations/work-permit-types', dto);
      toaster('Tipo de permiso de trabajo creado', 'success');
    }
    setModal(null);
    load();
  };

  const handleDelete = async (row: WorkPermitTypeRow) => {
    if (!window.confirm(`¿Desactivar el tipo "${row.name}"?`)) return;
    try {
      await apiClient.delete(`/api/operations/work-permit-types/${row.id}`);
      toaster('Tipo desactivado', 'success');
      load();
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error al desactivar', 'error');
    }
  };

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      const result = await apiClient.post<{ createdCount: number; skippedCount: number }>(
        '/api/operations/work-permit-types/seed-defaults',
      );
      toaster(
        `${result.createdCount} tipos creados${
          result.skippedCount > 0 ? ` · ${result.skippedCount} omitidos (ya existían)` : ''
        }`,
        'success',
      );
      load();
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error al cargar tipos por defecto', 'error');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <>
      <section className="config-section">
        <div className="config-section__head">
          <div>
            <h2>Tipos de Permiso de Trabajo</h2>
            <p>
              Catálogo de instrumentos operacionales internos (Trabajo en Altura, en Caliente,
              Espacio Confinado, LOTO, etc). Los riesgos y medidas por defecto se pre-llenan al
              emitir un permiso de este tipo.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSeedDefaults}
              disabled={seeding}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-full border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                color: 'var(--text-primary)',
              }}
            >
              <Settings size={14} />
              {seeding ? 'Cargando...' : 'Cargar tipos chilenos por defecto'}
            </button>
            <button
              onClick={() => setModal({ mode: 'create' })}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full"
              style={{
                background: '#1C1C1E',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Plus size={16} /> Nuevo tipo
            </button>
          </div>
        </div>
        {loading ? (
          <SkeletonRows />
        ) : types.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No hay tipos de permiso de trabajo"
            description="Carga el catálogo chileno por defecto o crea tipos personalizados."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="config-table">
              <thead>
                <tr>
                  <th style={{ width: 56 }}> </th>
                  <th>Nombre / Código</th>
                  <th>Categoría</th>
                  <th>Duración máx.</th>
                  <th>Roles autorizadores</th>
                  <th>Requisitos</th>
                  <th>Estado</th>
                  <th style={{ width: 100, textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {types.map((wt) => (
                  <tr key={wt.id}>
                    <td>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          background: wt.color || '#475569',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: 11,
                          fontFamily: 'var(--font-jetbrains-mono), monospace',
                          fontWeight: 600,
                        }}
                      >
                        {wt.code.slice(0, 3)}
                      </div>
                    </td>
                    <td>
                      <div
                        style={{
                          fontFamily: 'var(--font-outfit), sans-serif',
                          fontWeight: 500,
                        }}
                      >
                        {wt.name}
                      </div>
                      <div
                        className="text-[var(--text-muted)] mt-0.5"
                        style={{
                          fontFamily: 'var(--font-jetbrains-mono), monospace',
                          fontSize: 11,
                        }}
                      >
                        {wt.code}
                      </div>
                    </td>
                    <td>{WORK_PERMIT_CATEGORY_LABELS[wt.category as WorkPermitCategory]}</td>
                    <td>
                      <span
                        style={{
                          fontFamily: 'var(--font-jetbrains-mono), monospace',
                          fontSize: 12,
                        }}
                      >
                        {wt.maxDurationHours}h
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {wt.requiredRoles.length === 0 ? (
                          <span className="text-[var(--text-muted)]">—</span>
                        ) : (
                          wt.requiredRoles.map((r) => (
                            <span
                              key={r}
                              className="config-chip"
                              style={{
                                background: 'rgba(37, 99, 235, 0.1)',
                                color: '#1d4ed8',
                              }}
                            >
                              {r}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {wt.requiresMedicalAptitude && (
                          <span
                            className="config-chip"
                            style={{
                              background: 'rgba(34, 197, 94, 0.12)',
                              color: '#15803d',
                            }}
                          >
                            Médica
                          </span>
                        )}
                        {wt.requiresSpecificTraining && (
                          <span
                            className="config-chip"
                            style={{
                              background: 'rgba(34, 197, 94, 0.12)',
                              color: '#15803d',
                            }}
                          >
                            Capac.
                          </span>
                        )}
                        {wt.requiresGasMeasurement && (
                          <span
                            className="config-chip"
                            style={{
                              background: 'rgba(124, 58, 237, 0.12)',
                              color: '#6d28d9',
                            }}
                          >
                            Gases
                          </span>
                        )}
                        {wt.requiresIsolation && (
                          <span
                            className="config-chip"
                            style={{
                              background: 'rgba(234, 179, 8, 0.14)',
                              color: '#a16207',
                            }}
                          >
                            LOTO
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <ActiveBadge active={wt.isActive} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => setModal({ mode: 'edit', type: wt })}
                        className="p-2 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(wt)}
                        className="p-2 rounded-md hover:bg-red-50 text-red-600 ml-1"
                        title="Desactivar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal && (
        <WorkPermitTypeFormModal
          mode={modal.mode}
          workPermitType={modal.mode === 'edit' ? modal.type : null}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </>
  );
}

/* ============================================================ */
/*  Shared bits                                                 */
/* ============================================================ */

function VehiclePackCell({ type, onApply }: { type: AssetTypeRow; onApply: () => void }) {
  if (type.category !== 'VEHICLE') {
    return <span className="text-[var(--text-muted)] text-xs">—</span>;
  }
  if (type.vehiclePackApplied) {
    return (
      <span
        className="config-chip"
        style={{ background: 'rgba(34, 197, 94, 0.12)', color: '#15803d' }}
        title="SOAP, Permiso de Circulación, Revisión Técnica y Padrón ya están asociados a este tipo."
      >
        <CheckCircle2 size={11} /> Pack documental aplicado
      </span>
    );
  }
  return (
    <button
      onClick={onApply}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs hover:bg-blue-100 transition"
      style={{
        background: 'rgba(37, 99, 235, 0.1)',
        color: '#1d4ed8',
        fontFamily: 'var(--font-outfit), sans-serif',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
      title="Asocia los 4 documentos legales obligatorios para vehículos en Chile."
    >
      <ShieldCheck size={12} /> Aplicar pack documental Chile
    </button>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <span
      className="config-chip"
      style={{ background: 'rgba(34, 197, 94, 0.12)', color: '#15803d' }}
    >
      <CheckCircle2 size={11} /> Activo
    </span>
  ) : (
    <span
      className="config-chip"
      style={{ background: 'rgba(100, 116, 139, 0.14)', color: '#475569' }}
    >
      <AlertCircle size={11} /> Inactivo
    </span>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Layers;
  title: string;
  description: string;
}) {
  return (
    <div className="config-empty">
      <Icon size={36} style={{ margin: '0 auto 12px', color: '#cbd5e1' }} />
      <p
        className="text-[var(--text-secondary)]"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
      >
        {title}
      </p>
      <p className="text-[var(--text-muted)] text-sm mt-1">{description}</p>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div style={{ padding: 8 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
          }}
        >
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,0,0,0.06)' }} />
          <div style={{ flex: 1 }}>
            <div
              style={{
                height: 12,
                width: '40%',
                background: 'rgba(0,0,0,0.06)',
                borderRadius: 4,
                marginBottom: 6,
              }}
            />
            <div
              style={{ height: 10, width: '25%', background: 'rgba(0,0,0,0.06)', borderRadius: 4 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
