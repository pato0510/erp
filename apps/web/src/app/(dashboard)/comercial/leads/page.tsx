'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRightCircle,
  ChevronLeft,
  ChevronRight,
  Plus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { KpiCard } from '../../../../components/operations/dashboard/KpiCard';
import { apiClient } from '../../../../lib/api';
import { formatCLP, formatDate } from '../../../../lib/formatters';

/* ── Constants / maps ─────────────────────────────────────────────── */

const SOURCE_LABELS: Record<string, string> = {
  CAMPANA: 'Campaña',
  REFERIDO: 'Referido',
  WEB: 'Web',
  COLD_OUTREACH: 'Prospección fría',
  EVENTO: 'Evento',
  INBOUND: 'Inbound',
  OTRO: 'Otro',
};

const STATUS_LABELS: Record<string, string> = {
  NUEVO: 'Nuevo',
  CONTACTADO: 'Contactado',
  CALIFICADO: 'Calificado',
  DESCARTADO: 'Descartado',
  CONVERTIDO: 'Convertido',
};

const PRIORITY_LABELS: Record<string, string> = {
  ALTA: 'Alta',
  MEDIA: 'Media',
  BAJA: 'Baja',
};

const CATEGORY_LABELS: Record<string, string> = {
  DRONE: 'Dron',
  LIMPIEZA: 'Limpieza',
  INSPECCION: 'Inspección',
  AUDIOVISUAL: 'Audiovisual',
  INDUSTRIAL: 'Industrial',
};

/* ── Types ────────────────────────────────────────────────────────── */

interface Lead {
  id: string;
  contactName: string;
  company: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  serviceInterest: string | null;
  source: string;
  sourceCampaignId: string | null;
  status: string;
  ownerName: string | null;
  priority: string;
  discardReason: string | null;
  createdDate: string;
  nextAction: string | null;
}

interface Stage {
  id: string;
  name: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
}

interface Client {
  counterpartyId: string;
  name: string;
  taxId: string | null;
}

interface Service {
  id: string;
  name: string;
  category: string;
  billingUnit: string;
  basePrice: number | string;
}

interface ConvertForm {
  counterpartyId: string;
  serviceId: string;
  amount: string;
  stageId: string;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[rgba(128,128,128,0.12)] ${className}`} />;
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT =
  'w-full border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-[var(--text-secondary)]';

const SELECT =
  'w-full border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500';

/* ── Status badge ─────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    NUEVO: { bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
    CONTACTADO: { bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500' },
    CALIFICADO: { bg: 'bg-green-50 dark:bg-green-950/40', text: 'text-green-700 dark:text-green-300', dot: 'bg-green-500' },
    DESCARTADO: { bg: 'bg-gray-100 dark:bg-gray-800/60', text: 'text-gray-500 dark:text-gray-400', dot: 'bg-gray-400' },
    CONVERTIDO: { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  };
  const cfg = map[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} shrink-0`} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/* ── Priority chip ────────────────────────────────────────────────── */

function PriorityChip({ priority }: { priority: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    ALTA: { bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-600 dark:text-red-400' },
    MEDIA: { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-600 dark:text-amber-400' },
    BAJA: { bg: 'bg-gray-100 dark:bg-gray-800/60', text: 'text-gray-500 dark:text-gray-400' },
  };
  const cfg = map[priority] ?? { bg: 'bg-gray-100', text: 'text-gray-500' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {PRIORITY_LABELS[priority] ?? priority}
    </span>
  );
}

/* ── Toast ────────────────────────────────────────────────────────── */

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-green-300 bg-green-50 dark:bg-green-950/60 dark:border-green-700 px-4 py-3 shadow-xl text-sm text-green-800 dark:text-green-200">
      <Zap size={16} className="shrink-0 text-green-600" />
      {message}
      <button type="button" onClick={onClose} className="ml-1 text-green-600 hover:text-green-800 transition">
        <X size={14} />
      </button>
    </div>
  );
}

/* ── Create Lead Modal ────────────────────────────────────────────── */

interface CreateLeadModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function CreateLeadModal({ onClose, onSaved }: CreateLeadModalProps) {
  const [contactName, setContactName] = useState('');
  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [serviceInterest, setServiceInterest] = useState('');
  const [source, setSource] = useState('INBOUND');
  const [priority, setPriority] = useState('MEDIA');
  const [nextAction, setNextAction] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim()) {
      setError('El nombre del contacto es requerido.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        contactName: contactName.trim(),
        source,
        priority,
        status: 'NUEVO',
      };
      if (company.trim()) body['company'] = company.trim();
      if (position.trim()) body['position'] = position.trim();
      if (phone.trim()) body['phone'] = phone.trim();
      if (email.trim()) body['email'] = email.trim();
      if (serviceInterest.trim()) body['serviceInterest'] = serviceInterest.trim();
      if (nextAction.trim()) body['nextAction'] = nextAction.trim();
      await apiClient.post('/api/comercial/leads', body);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el lead.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Nuevo lead</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[rgba(0,0,0,0.06)] text-[var(--text-secondary)] transition">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Field label="Nombre del contacto" required>
                <input className={INPUT} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Ej: Pedro Soto" />
              </Field>
            </div>
            <Field label="Empresa">
              <input className={INPUT} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Ej: Minera Escondida" />
            </Field>
            <Field label="Cargo">
              <input className={INPUT} value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Ej: Jefe de Mantención" />
            </Field>
            <Field label="Teléfono">
              <input className={INPUT} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+56 9 1234 5678" />
            </Field>
            <Field label="Email">
              <input className={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pedro@empresa.cl" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Servicio de interés">
                <input className={INPUT} value={serviceInterest} onChange={(e) => setServiceInterest(e.target.value)} placeholder="Ej: Inspección termográfica paneles solares" />
              </Field>
            </div>
            <Field label="Fuente">
              <select className={SELECT} value={source} onChange={(e) => setSource(e.target.value)}>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Prioridad">
              <select className={SELECT} value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="ALTA">Alta</option>
                <option value="MEDIA">Media</option>
                <option value="BAJA">Baja</option>
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Próxima acción">
                <input className={INPUT} value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Ej: Enviar propuesta técnica el lunes" />
              </Field>
            </div>
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)]">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[rgba(0,0,0,0.04)] transition">
            Cancelar
          </button>
          <button
            type="button"
            onClick={(e) => {
              const modal = (e.currentTarget as HTMLElement).closest('.flex.flex-col') as HTMLElement;
              modal?.querySelector('form')?.requestSubmit();
            }}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#2563eb] text-white font-medium hover:bg-[#1d4ed8] transition disabled:opacity-50"
          >
            <Plus size={15} />
            {submitting ? 'Creando...' : 'Crear lead'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Convert Modal ────────────────────────────────────────────────── */

interface ConvertModalProps {
  lead: Lead;
  onClose: () => void;
  onConverted: () => void;
  onToast: (msg: string) => void;
}

function ConvertModal({ lead, onClose, onConverted, onToast }: ConvertModalProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [form, setForm] = useState<ConvertForm>({
    counterpartyId: '',
    serviceId: '',
    amount: '',
    stageId: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingData(true);
    Promise.all([
      apiClient.get<Client[]>('/api/comercial/clients'),
      apiClient.get<Service[]>('/api/comercial/service-catalog'),
      apiClient.get<Stage[]>('/api/comercial/stages'),
    ])
      .then(([c, s, st]) => {
        setClients(c);
        setServices(s);
        const sorted = [...st].sort((a, b) => a.order - b.order);
        setStages(sorted);
        setForm((prev) => ({ ...prev, stageId: sorted[0]?.id ?? '' }));
      })
      .catch(() => setError('No se pudieron cargar los datos necesarios.'))
      .finally(() => setLoadingData(false));
  }, []);

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.counterpartyId) {
      setError('Selecciona un cliente.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        counterpartyId: form.counterpartyId,
        stageId: form.stageId || undefined,
      };
      if (form.serviceId) body['serviceId'] = form.serviceId;
      if (form.amount && !isNaN(Number(form.amount)) && Number(form.amount) > 0) {
        body['amount'] = Number(form.amount);
      }
      await apiClient.post(`/api/comercial/leads/${lead.id}/convert`, body);
      onToast('Lead convertido a oportunidad exitosamente.');
      onConverted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al convertir el lead.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-2xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Convertir a oportunidad</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate max-w-[280px]">
              {lead.contactName}{lead.company ? ` · ${lead.company}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[rgba(0,0,0,0.06)] text-[var(--text-secondary)] transition">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleConvert} className="px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              {error}
            </div>
          )}

          {loadingData ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (
            <>
              <Field label="Cliente" required>
                <select
                  className={SELECT}
                  value={form.counterpartyId}
                  onChange={(e) => setForm((prev) => ({ ...prev, counterpartyId: e.target.value }))}
                >
                  <option value="">— Seleccionar cliente —</option>
                  {clients.map((c) => (
                    <option key={c.counterpartyId} value={c.counterpartyId}>
                      {c.name}{c.taxId ? ` (${c.taxId})` : ''}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Servicio">
                <select
                  className={SELECT}
                  value={form.serviceId}
                  onChange={(e) => setForm((prev) => ({ ...prev, serviceId: e.target.value }))}
                >
                  <option value="">— Sin especificar —</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {CATEGORY_LABELS[s.category] ?? s.category}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Monto estimado (CLP)">
                <input
                  className={INPUT}
                  type="number"
                  min={0}
                  value={form.amount}
                  onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                  placeholder="Ej: 5000000"
                />
              </Field>

              <Field label="Etapa inicial">
                <select
                  className={SELECT}
                  value={form.stageId}
                  onChange={(e) => setForm((prev) => ({ ...prev, stageId: e.target.value }))}
                >
                  {stages.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)]">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[rgba(0,0,0,0.04)] transition">
            Cancelar
          </button>
          <button
            type="button"
            disabled={submitting || loadingData}
            onClick={(e) => {
              const modal = (e.currentTarget as HTMLElement).closest('.flex.flex-col') as HTMLElement;
              modal?.querySelector('form')?.requestSubmit();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#2563eb] text-white font-medium hover:bg-[#1d4ed8] transition disabled:opacity-50"
          >
            <ArrowRightCircle size={15} />
            {submitting ? 'Convirtiendo...' : 'Convertir'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────── */

const PAGE_SIZE = 15;

export default function ComercialLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Filters */
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterOwner, setFilterOwner] = useState('');

  /* Pagination */
  const [page, setPage] = useState(1);

  /* Modals */
  const [showCreate, setShowCreate] = useState(false);
  const [convertLead, setConvertLead] = useState<Lead | null>(null);

  /* Toast */
  const [toast, setToast] = useState<string | null>(null);

  /* ── Fetch ────────────────────────────────────────────────────── */

  const fetchLeads = useCallback(
    (status: string, source: string, priority: string, owner: string) => {
      setLoading(true);
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (source) params.set('source', source);
      if (priority) params.set('priority', priority);
      if (owner) params.set('owner', owner);
      const qs = params.toString();
      apiClient
        .get<Lead[]>(`/api/comercial/leads${qs ? `?${qs}` : ''}`)
        .then(setLeads)
        .catch(() => setError('No se pudieron cargar los leads.'))
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    fetchLeads(filterStatus, filterSource, filterPriority, filterOwner);
  }, [fetchLeads, filterStatus, filterSource, filterPriority, filterOwner]);

  /* Reset page when filters change */
  useEffect(() => {
    setPage(1);
  }, [filterStatus, filterSource, filterPriority, filterOwner]);

  /* ── Derived stats ────────────────────────────────────────────── */

  const total = leads.length;
  const nuevos = leads.filter((l) => l.status === 'NUEVO').length;
  const calificados = leads.filter((l) => l.status === 'CALIFICADO').length;
  const convertidos = leads.filter((l) => l.status === 'CONVERTIDO').length;

  /* Unique owners for filter */
  const owners = Array.from(
    new Set(leads.map((l) => l.ownerName).filter(Boolean) as string[]),
  ).sort();

  /* Pagination */
  const totalPages = Math.max(1, Math.ceil(leads.length / PAGE_SIZE));
  const paginated = leads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeFilters = [filterStatus, filterSource, filterPriority, filterOwner].filter(Boolean).length;

  const clearFilters = () => {
    setFilterStatus('');
    setFilterSource('');
    setFilterPriority('');
    setFilterOwner('');
    setPage(1);
  };

  /* ── Render ───────────────────────────────────────────────────── */

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-6">
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
            Leads
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Bandeja de prospectos comerciales
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#2563eb] text-white font-medium hover:bg-[#1d4ed8] transition self-start sm:self-auto"
        >
          <Plus size={16} />
          Nuevo lead
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-5 rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <KpiCard
              label="Total leads"
              value={String(total)}
              subtitle="En el período activo"
              icon={Users}
            />
            <KpiCard
              label="Nuevos"
              value={String(nuevos)}
              subtitle="Pendientes de contacto"
              icon={Zap}
              valueColor="#2563eb"
            />
            <KpiCard
              label="Calificados"
              value={String(calificados)}
              subtitle="Listos para convertir"
              valueColor="#16a34a"
            />
            <KpiCard
              label="Convertidos"
              value={String(convertidos)}
              subtitle="Pasaron a oportunidad"
              valueColor="#ca8a04"
            />
          </>
        )}
      </div>

      {/* Filters */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Estado */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Estado</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Fuente */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Fuente</label>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas</option>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Prioridad */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Prioridad</label>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Media</option>
              <option value="BAJA">Baja</option>
            </select>
          </div>

          {/* Ejecutivo */}
          {owners.length > 0 && (
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Ejecutivo</label>
              <select
                value={filterOwner}
                onChange={(e) => setFilterOwner(e.target.value)}
                className="border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos</option>
                {owners.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          )}

          {activeFilters > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-[#2563eb] hover:underline px-2 py-2 flex items-center gap-1"
            >
              <X size={13} />
              Limpiar ({activeFilters})
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[rgba(0,0,0,0.03)] border-b border-[var(--border-color)]">
              <tr>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold whitespace-nowrap">
                  Contacto
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold whitespace-nowrap">
                  Empresa
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold whitespace-nowrap">
                  Servicio de interés
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold whitespace-nowrap">
                  Fuente
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold whitespace-nowrap">
                  Prioridad
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold whitespace-nowrap">
                  Estado
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold whitespace-nowrap">
                  Ejecutivo
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold whitespace-nowrap">
                  Próxima acción
                </th>
                <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold whitespace-nowrap">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-[rgba(0,0,0,0.06)] rounded w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-14 text-center text-sm text-[var(--text-secondary)]">
                    <Users size={32} className="mx-auto mb-2 opacity-30" />
                    {leads.length === 0
                      ? 'No hay leads registrados aún.'
                      : 'No hay leads con los filtros seleccionados.'}
                  </td>
                </tr>
              ) : (
                paginated.map((lead) => {
                  const canConvert = lead.status !== 'CONVERTIDO' && lead.status !== 'DESCARTADO';
                  return (
                    <tr key={lead.id} className="hover:bg-[rgba(0,0,0,0.02)] transition-colors group">
                      {/* Contacto */}
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-[var(--text-primary)]">{lead.contactName}</p>
                          {lead.position && (
                            <p className="text-xs text-[var(--text-secondary)] truncate max-w-[140px]">
                              {lead.position}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Empresa */}
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {lead.company ?? '—'}
                      </td>

                      {/* Servicio de interés */}
                      <td className="px-4 py-3">
                        {lead.serviceInterest ? (
                          <span className="text-xs text-[var(--text-secondary)] line-clamp-2 max-w-[180px] block">
                            {lead.serviceInterest}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--text-secondary)] opacity-40">—</span>
                        )}
                      </td>

                      {/* Fuente */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-[var(--text-secondary)]">
                          {SOURCE_LABELS[lead.source] ?? lead.source}
                        </span>
                      </td>

                      {/* Prioridad */}
                      <td className="px-4 py-3">
                        <PriorityChip priority={lead.priority} />
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3">
                        <StatusBadge status={lead.status} />
                      </td>

                      {/* Ejecutivo */}
                      <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                        {lead.ownerName ?? '—'}
                      </td>

                      {/* Próxima acción */}
                      <td className="px-4 py-3">
                        {lead.nextAction ? (
                          <span className="text-xs text-[var(--text-secondary)] line-clamp-2 max-w-[180px] block">
                            {lead.nextAction}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--text-secondary)] opacity-40">—</span>
                        )}
                      </td>

                      {/* Acción */}
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={!canConvert}
                          onClick={() => canConvert && setConvertLead(lead)}
                          title={
                            canConvert
                              ? 'Convertir a oportunidad'
                              : `Lead ${STATUS_LABELS[lead.status]?.toLowerCase() ?? lead.status.toLowerCase()}`
                          }
                          className={`
                            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition
                            ${canConvert
                              ? 'border-[#2563eb] text-[#2563eb] hover:bg-[rgba(37,99,235,0.08)] group-hover:opacity-100 opacity-0 sm:opacity-100'
                              : 'border-[var(--border-color)] text-[var(--text-secondary)] opacity-40 cursor-default'
                            }
                          `}
                        >
                          <ArrowRightCircle size={13} />
                          {canConvert ? 'Convertir' : STATUS_LABELS[lead.status] ?? lead.status}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && (totalPages > 1 || leads.length > 0) && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)] bg-[rgba(0,0,0,0.02)]">
            <p className="text-xs text-[var(--text-secondary)]">
              {leads.length} lead{leads.length !== 1 ? 's' : ''} · página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-2 rounded border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--bg-card)] transition"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-2 rounded border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--bg-card)] transition"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateLeadModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            fetchLeads(filterStatus, filterSource, filterPriority, filterOwner);
          }}
        />
      )}

      {/* Convert modal */}
      {convertLead && (
        <ConvertModal
          lead={convertLead}
          onClose={() => setConvertLead(null)}
          onConverted={() => {
            setConvertLead(null);
            fetchLeads(filterStatus, filterSource, filterPriority, filterOwner);
          }}
          onToast={(msg) => setToast(msg)}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
