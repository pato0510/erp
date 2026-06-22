'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FileText,
  Plus,
  Trash2,
  ChevronLeft,
  Printer,
  Package,
  AlertCircle,
  Check,
  X,
  ClipboardList,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { formatCLP, formatDate, formatRUT } from '../../../../lib/formatters';

/* ════════════════════════════════════════════════════════════
   TYPES
════════════════════════════════════════════════════════════ */

interface QuoteRow {
  id: string;
  opportunityId: string | null;
  opportunityTitle: string | null;
  counterpartyId: string;
  counterpartyName: string;
  status: string;
  validUntil: string | null;
  executionTerm: string | null;
  version: number;
  subtotal: number | string;
  ivaAmount: number | string;
  total: number | string;
  itemCount: number;
  createdAt: string;
}

interface QuoteItem {
  id: string;
  serviceId: string | null;
  serviceName: string | null;
  description: string;
  quantity: number | string;
  unit: string;
  unitPrice: number | string;
  discountPct: number | string;
  lineTotal: number | string;
}

interface Counterparty {
  name: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
}

interface QuoteDetail extends QuoteRow {
  items: QuoteItem[];
  counterparty: Counterparty;
  opportunity: { id: string; title: string } | null;
  commercialConditions: string | null;
  technicalNotes: string | null;
}

interface ServiceCatalogItem {
  id: string;
  name: string;
  category: string;
  description: string | null;
  billingUnit: string;
  basePrice: number | string;
  active: boolean;
}

interface Opportunity {
  id: string;
  title: string;
  counterpartyId: string;
  clientName: string;
}

/* ════════════════════════════════════════════════════════════
   ENUM LABEL MAPS
════════════════════════════════════════════════════════════ */

const QUOTE_STATUS_LABEL: Record<string, string> = {
  BORRADOR: 'Borrador',
  EN_REVISION: 'En revisión',
  ENVIADA: 'Enviada',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  VENCIDA: 'Vencida',
  REEMPLAZADA: 'Reemplazada',
};

const QUOTE_STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  BORRADOR: { bg: 'rgba(128,128,128,0.14)', text: 'var(--text-secondary)' },
  EN_REVISION: { bg: 'rgba(234,179,8,0.15)', text: '#ca8a04' },
  ENVIADA: { bg: 'rgba(37,99,235,0.14)', text: '#2563eb' },
  ACEPTADA: { bg: 'rgba(22,163,74,0.14)', text: '#16a34a' },
  RECHAZADA: { bg: 'rgba(220,38,38,0.14)', text: '#dc2626' },
  VENCIDA: { bg: 'rgba(220,38,38,0.10)', text: '#ef4444' },
  REEMPLAZADA: { bg: 'rgba(128,128,128,0.10)', text: 'var(--text-secondary)' },
};

const ALL_STATUSES = Object.keys(QUOTE_STATUS_LABEL);

const BILLING_UNIT_LABEL: Record<string, string> = {
  M2: 'm²',
  JORNADA: 'Jornada',
  HORA: 'Hora',
  EVENTO: 'Evento',
  PROYECTO: 'Proyecto',
  MENSUAL: 'Mensual',
};

const NEXT_STATUSES: Record<string, string[]> = {
  BORRADOR: ['EN_REVISION', 'ENVIADA'],
  EN_REVISION: ['ENVIADA', 'RECHAZADA'],
  ENVIADA: ['ACEPTADA', 'RECHAZADA', 'VENCIDA'],
  ACEPTADA: [],
  RECHAZADA: [],
  VENCIDA: [],
  REEMPLAZADA: [],
};

/* ════════════════════════════════════════════════════════════
   HELPERS / SUB-COMPONENTS
════════════════════════════════════════════════════════════ */

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[rgba(128,128,128,0.12)] ${className}`} />;
}

function EmptyHint({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-[var(--text-secondary)]">{text}</p>;
}

function StatusChip({ status }: { status: string }) {
  const label = QUOTE_STATUS_LABEL[status] ?? status;
  const colors = QUOTE_STATUS_COLOR[status] ?? { bg: 'rgba(128,128,128,0.12)', text: 'var(--text-secondary)' };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ background: colors.bg, color: colors.text }}
    >
      {label}
    </span>
  );
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════
   SERVICE PICKER MODAL
════════════════════════════════════════════════════════════ */

interface ServicePickerProps {
  onSelect: (svc: ServiceCatalogItem) => void;
  onClose: () => void;
}

function ServicePickerModal({ onSelect, onClose }: ServicePickerProps) {
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiClient
      .get<ServiceCatalogItem[]>('/api/comercial/service-catalog')
      .then((data) => setServices(data.filter((s) => s.active)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return services;
    const q = search.trim().toLowerCase();
    return services.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q),
    );
  }, [services, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--border-color)] shadow-2xl flex flex-col"
        style={{ background: 'rgba(18,18,26,0.97)', maxHeight: '80vh' }}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[var(--border-color)]">
          <h3 className="text-base font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-outfit), sans-serif' }}>
            Seleccionar servicio
          </h3>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-3 border-b border-[var(--border-color)]">
          <input
            autoFocus
            type="text"
            placeholder="Buscar servicio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
          ) : filtered.length === 0 ? (
            <EmptyHint text="Sin servicios disponibles." />
          ) : (
            filtered.map((svc) => (
              <button
                key={svc.id}
                onClick={() => onSelect(svc)}
                className="w-full text-left rounded-lg border border-[var(--border-color)] px-3.5 py-2.5 hover:border-[#2563eb] hover:bg-[rgba(37,99,235,0.06)] transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[#2563eb] transition-colors truncate">
                      {svc.name}
                    </p>
                    {svc.description && (
                      <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{svc.description}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">{formatCLP(Number(svc.basePrice))}</p>
                    <p className="text-[10px] text-[var(--text-secondary)]">{BILLING_UNIT_LABEL[svc.billingUnit] ?? svc.billingUnit}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   NEW QUOTE MODAL (select client/opportunity if none provided)
════════════════════════════════════════════════════════════ */

interface NewQuoteModalProps {
  onCreated: (quoteId: string) => void;
  onClose: () => void;
}

function NewQuoteModal({ onCreated, onClose }: NewQuoteModalProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedOppId, setSelectedOppId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<Opportunity[]>('/api/comercial/opportunities')
      .then((data) => setOpportunities(data))
      .catch(() => setError('No se pudieron cargar las oportunidades.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    setError(null);
    const opp = opportunities.find((o) => o.id === selectedOppId);
    if (!opp) {
      setError('Selecciona una oportunidad.');
      return;
    }
    setCreating(true);
    try {
      const quote = await apiClient.post<QuoteDetail>('/api/comercial/quotes', {
        opportunityId: opp.id,
        counterpartyId: opp.counterpartyId,
      });
      onCreated(quote.id);
    } catch {
      setError('No se pudo crear la cotización. Intenta de nuevo.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border-color)] shadow-2xl p-6"
        style={{ background: 'rgba(18,18,26,0.97)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-outfit), sans-serif' }}>
            Nueva cotización
          </h3>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <X size={18} />
          </button>
        </div>
        {error && (
          <div className="mb-4 rounded-lg border border-red-300/40 bg-red-950/30 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}
        <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">
          Oportunidad asociada
        </label>
        {loading ? (
          <Skeleton className="h-10 rounded-lg" />
        ) : (
          <select
            value={selectedOppId}
            onChange={(e) => setSelectedOppId(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[rgba(255,255,255,0.04)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
          >
            <option value="">Seleccionar...</option>
            {opportunities.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} — {o.clientName}
              </option>
            ))}
          </select>
        )}
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          La cotización se crea como borrador y quedará vinculada a la oportunidad seleccionada.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !selectedOppId}
            className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? 'Creando...' : 'Crear cotización'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   DOCUMENT PREVIEW (right column)
════════════════════════════════════════════════════════════ */

function QuotePreview({ quote }: { quote: QuoteDetail }) {
  const subtotal = Number(quote.subtotal);
  const iva = Number(quote.ivaAmount);
  const total = Number(quote.total);

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden print:shadow-none print:border-none font-sans text-gray-900">
      {/* Header */}
      <div className="bg-[#1e3a5f] px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className="text-xl font-bold text-white tracking-tight"
              style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
            >
              EXCELSIA.
            </p>
            <p className="text-xs text-blue-200 mt-0.5">Empresa Demo SpA</p>
            <p className="text-[10px] text-blue-300">RUT 76.123.456-7</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-blue-200 uppercase tracking-widest">Cotización</p>
            <p className="text-2xl font-bold text-white mt-0.5">N°&nbsp;{quote.version}</p>
            <p className="text-[10px] text-blue-300 mt-1">
              Fecha: {formatDate(quote.createdAt)}
            </p>
          </div>
        </div>
      </div>

      {/* Client block */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-1">
          Cliente
        </p>
        <p className="text-sm font-semibold text-gray-900">{quote.counterparty?.name ?? quote.counterpartyName}</p>
        {quote.counterparty?.taxId && (
          <p className="text-xs text-gray-600">RUT: {formatRUT(quote.counterparty.taxId)}</p>
        )}
        {quote.counterparty?.email && (
          <p className="text-xs text-gray-500">{quote.counterparty.email}</p>
        )}
        {quote.opportunity && (
          <p className="mt-1 text-[11px] text-[#2563eb] font-medium">
            Oportunidad: {quote.opportunity.title}
          </p>
        )}
      </div>

      {/* Items table */}
      <div className="px-6 py-4">
        {quote.items.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-6">Sin ítems agregados.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200">
                {['Descripción', 'Cant.', 'Unidad', 'P. Unit.', 'Desc. %', 'Total'].map((h) => (
                  <th
                    key={h}
                    className={`pb-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px] ${h === 'Descripción' ? 'text-left' : 'text-right'}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quote.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 pr-2 text-gray-800 font-medium leading-snug">
                    {item.description}
                    {item.serviceName && item.serviceName !== item.description && (
                      <p className="text-[10px] text-gray-400 font-normal">{item.serviceName}</p>
                    )}
                  </td>
                  <td className="py-2 text-right text-gray-700">{Number(item.quantity)}</td>
                  <td className="py-2 text-right text-gray-500">{BILLING_UNIT_LABEL[item.unit] ?? item.unit}</td>
                  <td className="py-2 text-right text-gray-700">{formatCLP(Number(item.unitPrice))}</td>
                  <td className="py-2 text-right text-gray-500">
                    {Number(item.discountPct) > 0 ? `${Number(item.discountPct)}%` : '—'}
                  </td>
                  <td className="py-2 text-right font-semibold text-gray-900">{formatCLP(Number(item.lineTotal))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Totals */}
        <div className="mt-4 flex flex-col items-end gap-1 border-t border-gray-200 pt-4">
          <div className="flex gap-8 text-xs text-gray-600">
            <span>Subtotal</span>
            <span className="w-24 text-right font-medium text-gray-800">{formatCLP(subtotal)}</span>
          </div>
          <div className="flex gap-8 text-xs text-gray-600">
            <span>IVA 19%</span>
            <span className="w-24 text-right font-medium text-gray-800">{formatCLP(iva)}</span>
          </div>
          <div className="flex gap-8 mt-1">
            <span className="text-sm font-bold text-gray-900">TOTAL</span>
            <span
              className="w-24 text-right text-sm font-bold"
              style={{ color: '#2563eb' }}
            >
              {formatCLP(total)}
            </span>
          </div>
        </div>
      </div>

      {/* Conditions / notes */}
      {(quote.validUntil || quote.executionTerm || quote.commercialConditions || quote.technicalNotes) && (
        <div className="px-6 pb-5 border-t border-gray-100 pt-4 space-y-3">
          {quote.validUntil && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Validez</p>
              <p className="text-xs text-gray-700">{formatDate(quote.validUntil)}</p>
            </div>
          )}
          {quote.executionTerm && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Plazo de ejecución</p>
              <p className="text-xs text-gray-700">{quote.executionTerm}</p>
            </div>
          )}
          {quote.commercialConditions && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Condiciones comerciales</p>
              <p className="text-xs text-gray-700 whitespace-pre-wrap">{quote.commercialConditions}</p>
            </div>
          )}
          {quote.technicalNotes && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Notas técnicas</p>
              <p className="text-xs text-gray-700 whitespace-pre-wrap">{quote.technicalNotes}</p>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        <p className="text-[10px] text-gray-400">Generado por Excelsia ERP · excelsia.cl</p>
        <StatusChip status={quote.status} />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   BUILDER (left + right panes)
════════════════════════════════════════════════════════════ */

interface BuilderProps {
  quoteId: string;
  onBack: () => void;
}

function QuoteBuilder({ quoteId, onBack }: BuilderProps) {
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  /* Meta form state */
  const [validUntil, setValidUntil] = useState('');
  const [executionTerm, setExecutionTerm] = useState('');
  const [commercialConditions, setCommercialConditions] = useState('');
  const [technicalNotes, setTechnicalNotes] = useState('');

  /* Add-item form state */
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [newQty, setNewQty] = useState('1');
  const [newUnit, setNewUnit] = useState('PROYECTO');
  const [newUnitPrice, setNewUnitPrice] = useState('');
  const [newDiscountPct, setNewDiscountPct] = useState('0');
  const [addingItem, setAddingItem] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

  /* Status transition */
  const [statusChanging, setStatusChanging] = useState(false);

  /* Delete items */
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  /* Load quote */
  const loadQuote = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<QuoteDetail>(`/api/comercial/quotes/${quoteId}`);
      setQuote(data);
      setValidUntil(data.validUntil ? data.validUntil.slice(0, 10) : '');
      setExecutionTerm(data.executionTerm ?? '');
      setCommercialConditions(data.commercialConditions ?? '');
      setTechnicalNotes(data.technicalNotes ?? '');
    } catch {
      setError('No se pudo cargar la cotización.');
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    loadQuote();
  }, [loadQuote]);

  /* Save meta */
  async function handleSaveMeta() {
    if (!quote) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await apiClient.patch<QuoteDetail>(`/api/comercial/quotes/${quoteId}`, {
        validUntil: validUntil || null,
        executionTerm: executionTerm || null,
        commercialConditions: commercialConditions || null,
        technicalNotes: technicalNotes || null,
      });
      setQuote(updated);
      setSaveMsg('Guardado');
      setTimeout(() => setSaveMsg(null), 2500);
    } catch {
      setSaveMsg('Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  /* Handle service selected from picker */
  function handleServiceSelected(svc: ServiceCatalogItem) {
    setNewDescription(svc.name);
    setNewUnit(svc.billingUnit);
    setNewUnitPrice(String(Number(svc.basePrice)));
    setShowServicePicker(false);
  }

  /* Add item */
  async function handleAddItem() {
    if (!newDescription.trim()) {
      setItemError('La descripción es obligatoria.');
      return;
    }
    if (!newUnitPrice || isNaN(Number(newUnitPrice))) {
      setItemError('El precio unitario debe ser un número válido.');
      return;
    }
    setItemError(null);
    setAddingItem(true);
    try {
      const updated = await apiClient.post<QuoteDetail>(`/api/comercial/quotes/${quoteId}/items`, {
        description: newDescription.trim(),
        quantity: Number(newQty) || 1,
        unit: newUnit,
        unitPrice: Number(newUnitPrice),
        discountPct: Number(newDiscountPct) || 0,
      });
      setQuote(updated);
      /* Reset form */
      setNewDescription('');
      setNewQty('1');
      setNewUnit('PROYECTO');
      setNewUnitPrice('');
      setNewDiscountPct('0');
    } catch {
      setItemError('No se pudo agregar el ítem.');
    } finally {
      setAddingItem(false);
    }
  }

  /* Delete item */
  async function handleDeleteItem(itemId: string) {
    setDeletingItemId(itemId);
    try {
      const updated = await apiClient.delete<QuoteDetail>(
        `/api/comercial/quotes/${quoteId}/items/${itemId}`,
      );
      setQuote(updated);
    } catch {
      /* Silently ignore or show toast */
    } finally {
      setDeletingItemId(null);
    }
  }

  /* Status change */
  async function handleStatusChange(newStatus: string) {
    if (!quote) return;
    setStatusChanging(true);
    try {
      const updated = await apiClient.patch<QuoteDetail>(`/api/comercial/quotes/${quoteId}/status`, {
        status: newStatus,
      });
      setQuote(updated);
    } catch {
      /* ignore */
    } finally {
      setStatusChanging(false);
    }
  }

  if (loading) {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
        <Skeleton className="h-8 w-48 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
          <Skeleton className="h-[600px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[#2563eb] hover:underline">
            <ChevronLeft size={16} /> Volver a cotizaciones
          </button>
        </div>
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error ?? 'Cotización no encontrada.'}
        </div>
      </div>
    );
  }

  const nextStatuses = NEXT_STATUSES[quote.status] ?? [];
  const isReadOnly = ['ACEPTADA', 'RECHAZADA', 'VENCIDA', 'REEMPLAZADA'].includes(quote.status);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* Top bar */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-[#2563eb] hover:underline mb-2"
          >
            <ChevronLeft size={16} /> Volver a cotizaciones
          </button>
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: '#2563eb', fontFamily: 'var(--font-jetbrains-mono), monospace' }}
          >
            Comercial · Cotización
          </span>
          <h1
            className="mt-1 text-xl font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
          >
            {quote.counterpartyName}{' '}
            <span className="text-[var(--text-secondary)] font-normal text-base">
              — N°&nbsp;{quote.version}
            </span>
          </h1>
          {quote.opportunityTitle && (
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{quote.opportunityTitle}</p>
          )}
        </div>

        {/* Status + actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <StatusChip status={quote.status} />
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
          >
            <Printer size={14} />
            Imprimir / Descargar (demo)
          </button>
        </div>
      </div>

      {/* Two pane layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ── LEFT: EDITOR ── */}
        <div className="flex flex-col gap-5">
          {/* Meta fields */}
          <SectionCard title="Datos de la cotización">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-1.5">
                  Válida hasta
                </label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  disabled={isReadOnly}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb] disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-1.5">
                  Plazo de ejecución
                </label>
                <input
                  type="text"
                  placeholder="Ej: 15 días hábiles"
                  value={executionTerm}
                  onChange={(e) => setExecutionTerm(e.target.value)}
                  disabled={isReadOnly}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb] disabled:opacity-50"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-1.5">
                  Condiciones comerciales
                </label>
                <textarea
                  rows={2}
                  placeholder="Forma de pago, garantías, etc."
                  value={commercialConditions}
                  onChange={(e) => setCommercialConditions(e.target.value)}
                  disabled={isReadOnly}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb] resize-none disabled:opacity-50"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-1.5">
                  Notas técnicas
                </label>
                <textarea
                  rows={2}
                  placeholder="Requisitos técnicos, equipos, certificaciones..."
                  value={technicalNotes}
                  onChange={(e) => setTechnicalNotes(e.target.value)}
                  disabled={isReadOnly}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb] resize-none disabled:opacity-50"
                />
              </div>
            </div>
            {!isReadOnly && (
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={handleSaveMeta}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Check size={14} />
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                {saveMsg && (
                  <span
                    className={`text-xs font-medium ${saveMsg === 'Guardado' ? 'text-green-500' : 'text-red-400'}`}
                  >
                    {saveMsg}
                  </span>
                )}
              </div>
            )}
          </SectionCard>

          {/* Items list */}
          <SectionCard
            title={`Ítems (${quote.items.length})`}
            action={
              !isReadOnly ? (
                <button
                  onClick={() => setShowServicePicker(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-[#2563eb] px-2.5 py-1.5 text-xs font-semibold text-[#2563eb] hover:bg-[rgba(37,99,235,0.08)] transition-colors"
                >
                  <Package size={13} />
                  Desde catálogo
                </button>
              ) : undefined
            }
          >
            {quote.items.length === 0 ? (
              <EmptyHint text="Aún no hay ítems. Agrega uno abajo o usa el catálogo." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-color)]">
                      {['Descripción', 'Cant.', 'Unidad', 'P. Unit.', 'Desc.%', 'Total', ''].map((h) => (
                        <th
                          key={h}
                          className={`pb-2 font-semibold text-[var(--text-secondary)] uppercase tracking-wide text-[10px] ${h === 'Descripción' ? 'text-left' : 'text-right'}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]">
                    {quote.items.map((item) => (
                      <tr key={item.id} className="group">
                        <td className="py-2 pr-2 font-medium text-[var(--text-primary)] max-w-[160px]">
                          <p className="truncate">{item.description}</p>
                        </td>
                        <td className="py-2 text-right text-[var(--text-secondary)]">{Number(item.quantity)}</td>
                        <td className="py-2 text-right text-[var(--text-secondary)]">{BILLING_UNIT_LABEL[item.unit] ?? item.unit}</td>
                        <td className="py-2 text-right text-[var(--text-primary)]">{formatCLP(Number(item.unitPrice))}</td>
                        <td className="py-2 text-right text-[var(--text-secondary)]">
                          {Number(item.discountPct) > 0 ? `${Number(item.discountPct)}%` : '—'}
                        </td>
                        <td className="py-2 text-right font-semibold text-[var(--text-primary)]">
                          {formatCLP(Number(item.lineTotal))}
                        </td>
                        <td className="py-2 pl-2 text-right">
                          {!isReadOnly && (
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              disabled={deletingItemId === item.id}
                              className="text-[var(--text-secondary)] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add item inline form */}
            {!isReadOnly && (
              <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-3">
                  Agregar ítem manual
                </p>
                {itemError && (
                  <div className="mb-3 rounded-lg border border-red-300/40 bg-red-950/30 px-3 py-2 text-xs text-red-400 flex items-center gap-2">
                    <AlertCircle size={13} className="shrink-0" />
                    {itemError}
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-2.5">
                  <div className="col-span-2 sm:col-span-3">
                    <input
                      type="text"
                      placeholder="Descripción del servicio o ítem"
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--text-secondary)] mb-1">Cantidad</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={newQty}
                      onChange={(e) => setNewQty(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#2563eb] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--text-secondary)] mb-1">Unidad</label>
                    <select
                      value={newUnit}
                      onChange={(e) => setNewUnit(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[rgba(18,18,26,0.95)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#2563eb] focus:outline-none"
                    >
                      {Object.entries(BILLING_UNIT_LABEL).map(([val, lbl]) => (
                        <option key={val} value={val}>{lbl}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--text-secondary)] mb-1">P. Unitario (CLP)</label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      placeholder="0"
                      value={newUnitPrice}
                      onChange={(e) => setNewUnitPrice(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:border-[#2563eb] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--text-secondary)] mb-1">Descuento %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={newDiscountPct}
                      onChange={(e) => setNewDiscountPct(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#2563eb] focus:outline-none"
                    />
                  </div>
                </div>
                <button
                  onClick={handleAddItem}
                  disabled={addingItem}
                  className="flex items-center gap-1.5 rounded-lg bg-[rgba(37,99,235,0.12)] border border-[rgba(37,99,235,0.3)] px-4 py-2 text-sm font-semibold text-[#2563eb] hover:bg-[rgba(37,99,235,0.18)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={14} />
                  {addingItem ? 'Agregando...' : 'Agregar ítem'}
                </button>
              </div>
            )}
          </SectionCard>

          {/* Totals summary (editor side) */}
          <SectionCard title="Resumen de valores">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Subtotal neto</span>
                <span className="font-medium text-[var(--text-primary)]">{formatCLP(Number(quote.subtotal))}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">IVA 19%</span>
                <span className="font-medium text-[var(--text-primary)]">{formatCLP(Number(quote.ivaAmount))}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-[var(--border-color)] pt-2 mt-1">
                <span style={{ color: '#2563eb' }}>TOTAL</span>
                <span style={{ color: '#2563eb' }}>{formatCLP(Number(quote.total))}</span>
              </div>
            </div>
          </SectionCard>

          {/* Status flow */}
          {nextStatuses.length > 0 && !isReadOnly && (
            <SectionCard title="Cambiar estado">
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map((s) => {
                  const colors = QUOTE_STATUS_COLOR[s] ?? { bg: 'rgba(128,128,128,0.12)', text: 'var(--text-secondary)' };
                  return (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      disabled={statusChanging}
                      className="rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-80"
                      style={{
                        background: colors.bg,
                        color: colors.text,
                        borderColor: colors.text + '55',
                      }}
                    >
                      → {QUOTE_STATUS_LABEL[s]}
                    </button>
                  );
                })}
              </div>
            </SectionCard>
          )}
        </div>

        {/* ── RIGHT: PREVIEW ── */}
        <div className="lg:sticky lg:top-6">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            Vista previa del documento
          </p>
          <QuotePreview quote={quote} />
        </div>
      </div>

      {/* Service picker modal */}
      {showServicePicker && (
        <ServicePickerModal
          onSelect={handleServiceSelected}
          onClose={() => setShowServicePicker(false)}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   QUOTES LIST
════════════════════════════════════════════════════════════ */

interface QuotesListProps {
  onOpenBuilder: (quoteId: string) => void;
  onNewQuote: () => void;
}

function QuotesList({ onOpenBuilder, onNewQuote }: QuotesListProps) {
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    apiClient
      .get<QuoteRow[]>('/api/comercial/quotes')
      .then((data) => setQuotes(data))
      .catch(() => setError('No se pudieron cargar las cotizaciones.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!statusFilter) return quotes;
    return quotes.filter((q) => q.status === statusFilter);
  }, [quotes, statusFilter]);

  /* KPI aggregates */
  const totalValor = quotes.reduce((s, q) => s + Number(q.total), 0);
  const aceptadas = quotes.filter((q) => q.status === 'ACEPTADA').length;
  const pendientes = quotes.filter((q) => ['BORRADOR', 'EN_REVISION', 'ENVIADA'].includes(q.status)).length;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
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
            Cotizaciones
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Constructor de cotizaciones y vista previa del documento
          </p>
        </div>
        <button
          onClick={onNewQuote}
          className="flex items-center gap-2 rounded-lg bg-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4ed8] transition-colors shadow-md flex-shrink-0"
        >
          <Plus size={16} />
          Nueva cotización
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* KPI bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : (
          <>
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Total</p>
              <p className="mt-1.5 text-2xl font-bold text-[var(--text-primary)]">{quotes.length}</p>
              <p className="text-[11px] text-[var(--text-secondary)]">cotizaciones</p>
            </div>
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Valor total</p>
              <p className="mt-1.5 text-xl font-bold text-[#2563eb]">{formatCLP(totalValor)}</p>
              <p className="text-[11px] text-[var(--text-secondary)]">todas las cotizaciones</p>
            </div>
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Aceptadas</p>
              <p className="mt-1.5 text-2xl font-bold text-green-500">{aceptadas}</p>
              <p className="text-[11px] text-[var(--text-secondary)]">cotizaciones ganadas</p>
            </div>
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">En proceso</p>
              <p className="mt-1.5 text-2xl font-bold text-[#ca8a04]">{pendientes}</p>
              <p className="text-[11px] text-[var(--text-secondary)]">borradores y enviadas</p>
            </div>
          </>
        )}
      </div>

      {/* Filter row */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setStatusFilter('')}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors border ${!statusFilter ? 'bg-[#2563eb] text-white border-[#2563eb]' : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#2563eb] hover:text-[#2563eb]'}`}
          >
            Todos
          </button>
          {ALL_STATUSES.map((s) => {
            const colors = QUOTE_STATUS_COLOR[s];
            const active = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="rounded-full px-3 py-1 text-xs font-semibold transition-colors border"
                style={{
                  background: active ? colors.bg : 'transparent',
                  color: active ? colors.text : 'var(--text-secondary)',
                  borderColor: active ? colors.text + '80' : 'var(--border-color)',
                }}
              >
                {QUOTE_STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>
        {!loading && (
          <span className="text-xs text-[var(--text-secondary)] ml-auto">
            {filtered.length} de {quotes.length}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border-color)] bg-[rgba(128,128,128,0.04)]">
              <tr>
                {['N° / Ver.', 'Cliente', 'Oportunidad', 'Estado', 'Validez', 'Ítems', 'Total'].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-[rgba(128,128,128,0.12)] w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    {quotes.length === 0 ? (
                      <div className="py-16 flex flex-col items-center gap-3">
                        <ClipboardList size={40} className="text-[var(--text-secondary)] opacity-30" />
                        <p className="text-sm text-[var(--text-secondary)]">No hay cotizaciones aún.</p>
                        <button
                          onClick={onNewQuote}
                          className="flex items-center gap-1.5 rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] transition-colors"
                        >
                          <Plus size={15} />
                          Crear primera cotización
                        </button>
                      </div>
                    ) : (
                      <EmptyHint text={`Sin cotizaciones con estado "${QUOTE_STATUS_LABEL[statusFilter] ?? statusFilter}".`} />
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((quote) => (
                  <tr
                    key={quote.id}
                    onClick={() => onOpenBuilder(quote.id)}
                    className="cursor-pointer transition-colors hover:bg-[rgba(37,99,235,0.04)] group"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-[var(--text-secondary)] shrink-0" />
                        <span className="font-mono text-xs text-[var(--text-secondary)]">
                          v{quote.version}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)] group-hover:text-[#2563eb] transition-colors">
                      {quote.counterpartyName}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] max-w-[200px]">
                      <span className="truncate block">{quote.opportunityTitle ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={quote.status} />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {quote.validUntil ? formatDate(quote.validUntil) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center rounded-full bg-[rgba(37,99,235,0.1)] px-2 py-0.5 text-xs font-semibold text-[#2563eb]">
                        {quote.itemCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">
                      {formatCLP(Number(quote.total))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ROOT PAGE — reads ?opportunityId and orchestrates views
════════════════════════════════════════════════════════════ */

function CotizacionesPageInner() {
  const searchParams = useSearchParams();
  const opportunityIdParam = searchParams.get('opportunityId');

  const [view, setView] = useState<'list' | 'builder'>('list');
  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  /* Auto-open builder when opportunityId is in URL */
  useEffect(() => {
    if (!opportunityIdParam) return;
    let cancelled = false;

    async function createFromOpp() {
      try {
        const opp = await apiClient.get<Opportunity>(`/api/comercial/opportunities/${opportunityIdParam}`);
        const quote = await apiClient.post<QuoteDetail>('/api/comercial/quotes', {
          opportunityId: opp.id,
          counterpartyId: opp.counterpartyId,
        });
        if (!cancelled) {
          setActiveQuoteId(quote.id);
          setView('builder');
        }
      } catch {
        /* Fall through to list view on error */
      }
    }

    createFromOpp();
    return () => { cancelled = true; };
  }, [opportunityIdParam]);

  function openBuilder(quoteId: string) {
    setActiveQuoteId(quoteId);
    setView('builder');
  }

  function goToList() {
    setActiveQuoteId(null);
    setView('list');
    /* Remove opportunityId from URL without reloading */
    const url = new URL(window.location.href);
    url.searchParams.delete('opportunityId');
    window.history.replaceState({}, '', url.toString());
  }

  function handleNewQuote() {
    setShowNewModal(true);
  }

  function handleQuoteCreated(quoteId: string) {
    setShowNewModal(false);
    openBuilder(quoteId);
  }

  return (
    <>
      {view === 'list' ? (
        <QuotesList onOpenBuilder={openBuilder} onNewQuote={handleNewQuote} />
      ) : activeQuoteId ? (
        <QuoteBuilder quoteId={activeQuoteId} onBack={goToList} />
      ) : null}

      {showNewModal && (
        <NewQuoteModal
          onCreated={handleQuoteCreated}
          onClose={() => setShowNewModal(false)}
        />
      )}
    </>
  );
}

export default function ComercialCotizacionesPage() {
  return (
    <Suspense
      fallback={
        <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 rounded bg-[rgba(128,128,128,0.12)]" />
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-[rgba(128,128,128,0.12)]" />
              ))}
            </div>
            <div className="h-64 rounded-xl bg-[rgba(128,128,128,0.12)]" />
          </div>
        </div>
      }
    >
      <CotizacionesPageInner />
    </Suspense>
  );
}
