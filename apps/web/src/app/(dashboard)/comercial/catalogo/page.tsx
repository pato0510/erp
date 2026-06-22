'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Package,
  Wrench,
  Shield,
  Plus,
  Pencil,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { KpiCard } from '../../../../components/operations/dashboard/KpiCard';
import { apiClient } from '../../../../lib/api';
import { formatCLP } from '../../../../lib/formatters';

/* ---- Types ---------------------------------------------------------- */

type ServiceCategory = 'DRONE' | 'LIMPIEZA' | 'INSPECCION' | 'AUDIOVISUAL' | 'INDUSTRIAL';
type BillingUnit = 'M2' | 'JORNADA' | 'HORA' | 'EVENTO' | 'PROYECTO' | 'MENSUAL';

interface ServiceItem {
  id: string;
  name: string;
  category: ServiceCategory;
  description: string | null;
  billingUnit: BillingUnit;
  basePrice: number | string;
  requiresEquipment: boolean;
  requiresCertifiedStaff: boolean;
  active: boolean;
}

interface FormState {
  name: string;
  category: ServiceCategory;
  description: string;
  billingUnit: BillingUnit;
  basePrice: string;
  requiresEquipment: boolean;
  requiresCertifiedStaff: boolean;
  active: boolean;
}

/* ---- Label maps ------------------------------------------------------ */

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  DRONE: 'Dron',
  LIMPIEZA: 'Limpieza',
  INSPECCION: 'Inspección',
  AUDIOVISUAL: 'Audiovisual',
  INDUSTRIAL: 'Industrial',
};

const BILLING_UNIT_LABELS: Record<BillingUnit, string> = {
  M2: 'm²',
  JORNADA: 'Jornada',
  HORA: 'Hora',
  EVENTO: 'Evento',
  PROYECTO: 'Proyecto',
  MENSUAL: 'Mensual',
};

const CATEGORY_OPTIONS = (
  Object.keys(CATEGORY_LABELS) as ServiceCategory[]
);

const BILLING_UNIT_OPTIONS = (
  Object.keys(BILLING_UNIT_LABELS) as BillingUnit[]
);

/* ---- Category colors ------------------------------------------------- */

const CATEGORY_COLORS: Record<ServiceCategory, { bg: string; text: string; border: string }> = {
  DRONE:      { bg: 'rgba(37,99,235,0.12)',   text: '#2563eb',  border: 'rgba(37,99,235,0.25)' },
  LIMPIEZA:   { bg: 'rgba(22,163,74,0.12)',   text: '#16a34a',  border: 'rgba(22,163,74,0.25)' },
  INSPECCION: { bg: 'rgba(217,119,6,0.12)',   text: '#d97706',  border: 'rgba(217,119,6,0.25)' },
  AUDIOVISUAL:{ bg: 'rgba(147,51,234,0.12)',  text: '#9333ea',  border: 'rgba(147,51,234,0.25)' },
  INDUSTRIAL: { bg: 'rgba(220,38,38,0.12)',   text: '#dc2626',  border: 'rgba(220,38,38,0.25)' },
};

/* ---- Helpers --------------------------------------------------------- */

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[rgba(128,128,128,0.12)] ${className}`} />;
}

function CategoryChip({
  category,
  size = 'sm',
}: {
  category: ServiceCategory;
  size?: 'sm' | 'xs';
}) {
  const colors = CATEGORY_COLORS[category];
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${
        size === 'xs' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
      }`}
      style={{
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
      }}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}

function Badge({
  icon: Icon,
  label,
  color,
}: {
  icon: React.ElementType;
  label: string;
  color: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
    >
      <Icon size={10} />
      {label}
    </span>
  );
}

/* ---- Default form state --------------------------------------------- */

function defaultForm(): FormState {
  return {
    name: '',
    category: 'DRONE',
    description: '',
    billingUnit: 'PROYECTO',
    basePrice: '',
    requiresEquipment: false,
    requiresCertifiedStaff: false,
    active: true,
  };
}

/* ---- Modal ----------------------------------------------------------- */

interface ModalProps {
  open: boolean;
  editing: ServiceItem | null;
  onClose: () => void;
  onSaved: () => void;
}

function ServiceModal({ open, editing, onClose, onSaved }: ModalProps) {
  const [form, setForm] = useState<FormState>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync form when editing item changes
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        category: editing.category,
        description: editing.description ?? '',
        billingUnit: editing.billingUnit,
        basePrice: String(Number(editing.basePrice)),
        requiresEquipment: editing.requiresEquipment,
        requiresCertifiedStaff: editing.requiresCertifiedStaff,
        active: editing.active,
      });
    } else {
      setForm(defaultForm());
    }
    setError(null);
  }, [open, editing?.id]); // primitive dep: editing?.id

  if (!open) return null;

  function field<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError('El nombre es obligatorio.'); return; }
    const price = Number(form.basePrice);
    if (!form.basePrice || isNaN(price) || price < 0) {
      setError('Ingrese un precio base válido (número ≥ 0).');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        category: form.category,
        description: form.description.trim() || null,
        billingUnit: form.billingUnit,
        basePrice: price,
        requiresEquipment: form.requiresEquipment,
        requiresCertifiedStaff: form.requiresCertifiedStaff,
        active: form.active,
      };
      if (editing) {
        await apiClient.patch(`/api/comercial/service-catalog/${editing.id}`, body);
      } else {
        await apiClient.post('/api/comercial/service-catalog', body);
      }
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar el servicio.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-[var(--border-color)] shadow-2xl"
        style={{ background: 'var(--bg-card)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-6 py-4">
          <div>
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: '#2563eb', fontFamily: 'var(--font-jetbrains-mono), monospace' }}
            >
              {editing ? 'Editar servicio' : 'Nuevo servicio'}
            </span>
            <h2
              className="mt-0.5 text-base font-semibold text-[var(--text-primary)]"
              style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
            >
              {editing ? editing.name : 'Catálogo de servicios'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[rgba(128,128,128,0.1)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
              <AlertCircle size={15} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">
              Nombre del servicio <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => field('name', e.target.value)}
              placeholder="ej. Inspección termográfica de paneles solares"
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 transition-all"
            />
          </div>

          {/* Category + Billing Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">
                Categoría
              </label>
              <div className="relative">
                <select
                  value={form.category}
                  onChange={(e) => field('category', e.target.value as ServiceCategory)}
                  className="w-full appearance-none rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-2 pr-8 text-sm text-[var(--text-primary)] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 transition-all"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">
                Unidad de cobro
              </label>
              <div className="relative">
                <select
                  value={form.billingUnit}
                  onChange={(e) => field('billingUnit', e.target.value as BillingUnit)}
                  className="w-full appearance-none rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-2 pr-8 text-sm text-[var(--text-primary)] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 transition-all"
                >
                  {BILLING_UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>{BILLING_UNIT_LABELS[u]}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">
              Descripción
            </label>
            <textarea
              value={form.description}
              onChange={(e) => field('description', e.target.value)}
              rows={2}
              placeholder="Descripción breve del servicio (opcional)"
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 resize-none transition-all"
            />
          </div>

          {/* Base price */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">
              Precio base (CLP) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.basePrice}
              onChange={(e) => field('basePrice', e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 transition-all"
            />
          </div>

          {/* Toggles */}
          <div className="flex flex-col gap-2.5 rounded-xl border border-[var(--border-color)] bg-[rgba(128,128,128,0.04)] px-4 py-3">
            {(
              [
                { key: 'requiresEquipment', label: 'Requiere equipo especializado', icon: Wrench, color: '#d97706' },
                { key: 'requiresCertifiedStaff', label: 'Requiere personal certificado', icon: Shield, color: '#2563eb' },
                { key: 'active', label: 'Servicio activo', icon: CheckCircle2, color: '#16a34a' },
              ] as const
            ).map(({ key, label, icon: Icon, color }) => (
              <label key={key} className="flex cursor-pointer items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                  <Icon size={14} style={{ color }} />
                  {label}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form[key] as boolean}
                  onClick={() => field(key, !(form[key] as boolean))}
                  className="relative h-5 w-9 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                  style={{ background: (form[key] as boolean) ? '#2563eb' : 'rgba(128,128,128,0.25)' }}
                >
                  <span
                    className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                    style={{ transform: (form[key] as boolean) ? 'translateX(16px)' : 'translateX(0)' }}
                  />
                </button>
              </label>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[rgba(128,128,128,0.1)] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-white transition-all disabled:opacity-60"
              style={{ background: '#2563eb' }}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editing ? 'Guardar cambios' : 'Crear servicio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---- Service card ---------------------------------------------------- */

function ServiceCard({
  service,
  onEdit,
}: {
  service: ServiceItem;
  onEdit: (s: ServiceItem) => void;
}) {
  const price = Number(service.basePrice);
  const colors = CATEGORY_COLORS[service.category];

  return (
    <article
      className={`relative flex flex-col rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md ${
        !service.active ? 'opacity-50 grayscale' : ''
      }`}
    >
      {/* Top accent bar */}
      <div className="h-[3px] w-full" style={{ background: colors.text }} />

      <div className="flex flex-col gap-3 p-5 flex-1">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CategoryChip category={service.category} size="xs" />
            <h3
              className="mt-1.5 text-[15px] font-semibold leading-snug text-[var(--text-primary)] line-clamp-2"
              style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
            >
              {service.name}
            </h3>
          </div>
          {!service.active && (
            <span className="shrink-0 rounded-full bg-[rgba(128,128,128,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--text-secondary)]">
              Inactivo
            </span>
          )}
        </div>

        {/* Description */}
        {service.description ? (
          <p className="text-xs text-[var(--text-secondary)] line-clamp-3 leading-relaxed">
            {service.description}
          </p>
        ) : (
          <p className="text-xs italic text-[rgba(128,128,128,0.5)]">Sin descripción.</p>
        )}

        {/* Badges */}
        {(service.requiresEquipment || service.requiresCertifiedStaff) && (
          <div className="flex flex-wrap gap-1.5">
            {service.requiresEquipment && (
              <Badge icon={Wrench} label="Requiere equipo" color="#d97706" />
            )}
            {service.requiresCertifiedStaff && (
              <Badge icon={Shield} label="Personal certificado" color="#2563eb" />
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t border-[var(--border-color)] px-5 py-3">
        <div>
          <span className="text-lg font-bold text-[var(--text-primary)]">
            {formatCLP(price)}
          </span>
          <span className="ml-1 text-[11px] text-[var(--text-secondary)]">
            / {BILLING_UNIT_LABELS[service.billingUnit]}
          </span>
        </div>
        <button
          onClick={() => onEdit(service)}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[rgba(37,99,235,0.06)] transition-all"
        >
          <Pencil size={12} />
          Editar
        </button>
      </div>
    </article>
  );
}

/* ---- Filter chip ---------------------------------------------------- */

type FilterValue = ServiceCategory | 'ALL';

function FilterChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1 text-xs font-semibold transition-all"
      style={
        active
          ? {
              background: color ? `${color}20` : 'rgba(37,99,235,0.15)',
              color: color ?? '#2563eb',
              border: `1.5px solid ${color ?? '#2563eb'}50`,
            }
          : {
              background: 'rgba(128,128,128,0.08)',
              color: 'var(--text-secondary)',
              border: '1.5px solid rgba(128,128,128,0.15)',
            }
      }
    >
      {label}
    </button>
  );
}

/* ---- Page ----------------------------------------------------------- */

export default function ComercialCatalogoPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<ServiceItem[]>('/api/comercial/service-catalog');
      setServices(data);
    } catch {
      setError('No se pudo cargar el catálogo de servicios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  function openCreate() {
    setEditingService(null);
    setModalOpen(true);
  }

  function openEdit(service: ServiceItem) {
    setEditingService(service);
    setModalOpen(true);
  }

  function handleModalClose() {
    setModalOpen(false);
    setEditingService(null);
  }

  async function handleSaved() {
    setModalOpen(false);
    setEditingService(null);
    await fetchServices();
  }

  /* Derived data */
  const filtered =
    filter === 'ALL' ? services : services.filter((s) => s.category === filter);

  const countByCategory = (cat: ServiceCategory) =>
    services.filter((s) => s.category === cat).length;

  const totalActive = services.filter((s) => s.active).length;
  const withEquipment = services.filter((s) => s.requiresEquipment).length;
  const withCertified = services.filter((s) => s.requiresCertifiedStaff).length;

  const dominantCategory = CATEGORY_OPTIONS.reduce<ServiceCategory | null>((best, cat) => {
    if (!best) return cat;
    return countByCategory(cat) > countByCategory(best) ? cat : best;
  }, null);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: '#2563eb', fontFamily: 'var(--font-jetbrains-mono), monospace' }}
          >
            Comercial · CRM
          </span>
          <h1
            className="mt-1 text-2xl font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
          >
            Catálogo de servicios
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Servicios de dron e industriales — precios y requisitos operacionales
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md active:scale-95"
          style={{ background: '#2563eb' }}
        >
          <Plus size={16} />
          Nuevo servicio
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <KpiCard
              label="Total servicios"
              value={String(services.length)}
              subtitle={`${totalActive} activos`}
              icon={Package}
            />
            <KpiCard
              label="Categoría principal"
              value={dominantCategory ? CATEGORY_LABELS[dominantCategory] : '—'}
              subtitle={dominantCategory ? `${countByCategory(dominantCategory)} servicios` : ''}
              icon={Package}
              valueColor={dominantCategory ? CATEGORY_COLORS[dominantCategory].text : undefined}
            />
            <KpiCard
              label="Requieren equipo"
              value={String(withEquipment)}
              subtitle="Activos con equipamiento"
              icon={Wrench}
              valueColor="#d97706"
            />
            <KpiCard
              label="Personal certificado"
              value={String(withCertified)}
              subtitle="Requieren certificación"
              icon={Shield}
              valueColor="#2563eb"
            />
          </>
        )}
      </div>

      {/* Category filter chips */}
      {!loading && services.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <FilterChip
            label={`Todos (${services.length})`}
            active={filter === 'ALL'}
            onClick={() => setFilter('ALL')}
          />
          {CATEGORY_OPTIONS.filter((c) => countByCategory(c) > 0).map((cat) => (
            <FilterChip
              key={cat}
              label={`${CATEGORY_LABELS[cat]} (${countByCategory(cat)})`}
              active={filter === cat}
              color={CATEGORY_COLORS[cat].text}
              onClick={() => setFilter(filter === cat ? 'ALL' : cat)}
            />
          ))}
        </div>
      )}

      {/* Service cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] py-16 text-center shadow-sm">
          <Package size={36} className="mb-3 text-[var(--text-secondary)] opacity-40" />
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {filter === 'ALL'
              ? 'No hay servicios en el catálogo aún.'
              : `No hay servicios en la categoría ${CATEGORY_LABELS[filter as ServiceCategory]}.`}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {filter === 'ALL'
              ? 'Crea el primer servicio con el botón "Nuevo servicio".'
              : 'Cambia el filtro o crea un servicio en esta categoría.'}
          </p>
          {filter === 'ALL' && (
            <button
              onClick={openCreate}
              className="mt-4 flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white"
              style={{ background: '#2563eb' }}
            >
              <Plus size={15} />
              Nuevo servicio
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((service) => (
            <ServiceCard key={service.id} service={service} onEdit={openEdit} />
          ))}
        </div>
      )}

      {/* Inactive note */}
      {!loading && services.some((s) => !s.active) && (
        <p className="mt-4 text-center text-[11px] text-[var(--text-secondary)]">
          Los servicios inactivos aparecen atenuados y no están disponibles en cotizaciones.
        </p>
      )}

      {/* Modal */}
      <ServiceModal
        open={modalOpen}
        editing={editingService}
        onClose={handleModalClose}
        onSaved={handleSaved}
      />
    </div>
  );
}
