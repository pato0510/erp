'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, X, Plus, Calendar, List,
  CalendarDays, Megaphone, Send, FileText, Mail, Globe,
  Star, CheckSquare, Users, Filter, AlertCircle,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { formatDate } from '../../../../lib/formatters';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface CalendarItem {
  id: string;
  type: string;
  title: string;
  date: string;
  endDate?: string | null;
  channel?: string | null;
  status: string;
  ownerName?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
  targetSegment?: string | null;
  zone?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
}

interface Campaign {
  id: string;
  name: string;
  channel: string;
  startDate: string;
  endDate: string;
  status: string;
}

/* ------------------------------------------------------------------ */
/*  Enum labels                                                         */
/* ------------------------------------------------------------------ */

const TYPE_LABELS: Record<string, string> = {
  CAMPANA: 'Campaña',
  PUBLICACION: 'Publicación',
  CONTENIDO_SEO: 'Contenido SEO',
  EMAIL: 'Email',
  CAMPANA_PAGADA: 'Campaña pagada',
  EVENTO: 'Evento',
  TAREA: 'Tarea',
  ACCION_CRM: 'Acción CRM',
};

const STATUS_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROGRESO: 'En progreso',
  PROGRAMADO: 'Programado',
  PUBLICADO: 'Publicado',
  COMPLETADO: 'Completado',
  CANCELADO: 'Cancelado',
};

/* ------------------------------------------------------------------ */
/*  Type → color + icon (8 stable colors, design-system-safe)          */
/* ------------------------------------------------------------------ */

interface TypeStyle {
  bg: string;
  border: string;
  text: string;
  dot: string;
}

const TYPE_STYLES: Record<string, TypeStyle> = {
  CAMPANA:       { bg: 'rgba(37,99,235,0.15)',   border: '#2563eb', text: '#1d4ed8', dot: '#2563eb'   },
  PUBLICACION:   { bg: 'rgba(99,102,241,0.15)',   border: '#6366f1', text: '#4f46e5', dot: '#6366f1'   },
  CONTENIDO_SEO: { bg: 'rgba(34,197,94,0.15)',    border: '#16a34a', text: '#15803d', dot: '#22c55e'   },
  EMAIL:         { bg: 'rgba(234,179,8,0.15)',     border: '#ca8a04', text: '#a16207', dot: '#eab308'   },
  CAMPANA_PAGADA:{ bg: 'rgba(239,68,68,0.15)',    border: '#dc2626', text: '#b91c1c', dot: '#ef4444'   },
  EVENTO:        { bg: 'rgba(249,115,22,0.15)',   border: '#ea580c', text: '#c2410c', dot: '#f97316'   },
  TAREA:         { bg: 'rgba(148,163,184,0.15)',  border: '#94a3b8', text: '#475569', dot: '#94a3b8'   },
  ACCION_CRM:    { bg: 'rgba(168,85,247,0.15)',   border: '#9333ea', text: '#7e22ce', dot: '#a855f7'   },
};

const TYPE_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  CAMPANA:       Megaphone,
  PUBLICACION:   Send,
  CONTENIDO_SEO: Globe,
  EMAIL:         Mail,
  CAMPANA_PAGADA:Star,
  EVENTO:        CalendarDays,
  TAREA:         CheckSquare,
  ACCION_CRM:    Users,
};

function typeStyle(type: string): TypeStyle {
  return TYPE_STYLES[type] ?? { bg: 'rgba(148,163,184,0.12)', border: '#94a3b8', text: '#64748b', dot: '#94a3b8' };
}

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/* ------------------------------------------------------------------ */
/*  Date helpers (no external dep, Mon-based)                          */
/* ------------------------------------------------------------------ */

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

function isoWeekday(d: Date): number { return (d.getDay() + 6) % 7; }

function gridStart(year: number, month: number): Date {
  const first = new Date(year, month, 1);
  return new Date(year, month, 1 - isoWeekday(first));
}
function gridEnd(year: number, month: number): Date {
  const last = new Date(year, month + 1, 0);
  return new Date(year, month + 1, 0 + (6 - isoWeekday(last)));
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseLocalDate(iso: string): Date {
  const [y, m, dd] = iso.split('-').map(Number);
  return new Date(y, m - 1, dd);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfWeek(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - isoWeekday(d));
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                            */
/* ------------------------------------------------------------------ */

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[rgba(128,128,128,0.12)] ${className}`} />;
}

/* ------------------------------------------------------------------ */
/*  Item chip (used in both month + week + list views)                 */
/* ------------------------------------------------------------------ */

interface ItemChipProps {
  item: CalendarItem;
  showDate?: boolean;
  onClick: (item: CalendarItem) => void;
  onDragStart?: (e: React.DragEvent, item: CalendarItem) => void;
  isOverdue?: boolean;
  isContinuation?: boolean;
}

function ItemChip({ item, showDate, onClick, onDragStart, isOverdue, isContinuation }: ItemChipProps) {
  const s = typeStyle(item.type);
  const Icon = TYPE_ICONS[item.type];
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart ? (e) => onDragStart(e, item) : undefined}
      onClick={() => onClick(item)}
      title={`${item.title} — ${typeLabel(item.type)} — ${item.channel ?? ''}`}
      className={`group w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium hover:opacity-80 transition-opacity focus:outline-none focus:ring-1 focus:ring-[#2563eb] flex items-center gap-0.5 ${isOverdue ? 'ring-1 ring-red-500' : ''}`}
      style={{
        backgroundColor: s.bg,
        color: s.text,
        borderLeft: `2px solid ${s.border}`,
        opacity: isContinuation ? 0.75 : 1,
      }}
    >
      {Icon && !isContinuation && <Icon size={9} className="shrink-0" />}
      {isContinuation ? (
        <span className="text-[8px] opacity-60">···</span>
      ) : (
        <span className="truncate">
          {showDate ? `${parseLocalDate(item.date).getDate()} - ` : ''}
          {item.title}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Status badge                                                        */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    PENDIENTE:    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    EN_PROGRESO:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    PROGRAMADO:   'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    PUBLICADO:    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    COMPLETADO:   'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
    CANCELADO:    'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls[status] ?? cls['CANCELADO']}`}>
      {statusLabel(status)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail modal                                                        */
/* ------------------------------------------------------------------ */

interface DetailModalProps {
  item: CalendarItem;
  onClose: () => void;
  onEdit: (item: CalendarItem) => void;
  onDelete: (item: CalendarItem) => void;
}

function ItemDetailModal({ item, onClose, onEdit, onDelete }: DetailModalProps) {
  const s = typeStyle(item.type);
  const Icon = TYPE_ICONS[item.type] ?? Calendar;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div
        className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-2xl w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{ backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}` }}
              >
                <Icon size={11} />
                {typeLabel(item.type)}
              </span>
              <StatusBadge status={item.status} />
            </div>
            <h3
              className="text-base font-semibold text-[var(--text-primary)] leading-tight"
              style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}
            >
              {item.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 hover:bg-[rgba(128,128,128,0.12)] text-[var(--text-secondary)] transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2.5 border-t border-[var(--border-color)] pt-4 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--text-secondary)]">Fecha</span>
            <span className="font-medium text-[var(--text-primary)]">{formatDate(item.date)}</span>
          </div>
          {item.endDate && (
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Término</span>
              <span className="font-medium text-[var(--text-primary)]">{formatDate(item.endDate)}</span>
            </div>
          )}
          {item.channel && (
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Canal</span>
              <span className="font-medium text-[var(--text-primary)]">{item.channel}</span>
            </div>
          )}
          {item.ownerName && (
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Responsable</span>
              <span className="font-medium text-[var(--text-primary)]">{item.ownerName}</span>
            </div>
          )}
          {item.serviceName && (
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Servicio</span>
              <span className="font-medium text-[var(--text-primary)]">{item.serviceName}</span>
            </div>
          )}
          {item.targetSegment && (
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Segmento</span>
              <span className="font-medium text-[var(--text-primary)]">{item.targetSegment}</span>
            </div>
          )}
          {item.zone && (
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Zona</span>
              <span className="font-medium text-[var(--text-primary)]">{item.zone}</span>
            </div>
          )}
          {item.campaignName && (
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Campaña</span>
              <span className="font-medium text-[#2563eb]">{item.campaignName}</span>
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="flex-1 rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[rgba(37,99,235,0.06)] hover:border-[#2563eb] hover:text-[#2563eb] transition-colors"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="flex-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30 transition-colors"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Create / Edit modal                                                 */
/* ------------------------------------------------------------------ */

interface FormModalProps {
  initial?: CalendarItem;
  prefillDate?: string;
  campaigns: Campaign[];
  onClose: () => void;
  onSave: () => void;
}

const ITEM_TYPES = ['CAMPANA','PUBLICACION','CONTENIDO_SEO','EMAIL','CAMPANA_PAGADA','EVENTO','TAREA','ACCION_CRM'];
const ITEM_STATUSES = ['PENDIENTE','EN_PROGRESO','PROGRAMADO','PUBLICADO','COMPLETADO','CANCELADO'];
const CHANNELS = ['Google Ads','Meta','LinkedIn','Email','SEO','YouTube','Instagram','Directo','Otro'];

function FormModal({ initial, prefillDate, campaigns, onClose, onSave }: FormModalProps) {
  const isEdit = Boolean(initial);
  const [type, setType] = useState(initial?.type ?? 'TAREA');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.date ?? prefillDate ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [channel, setChannel] = useState(initial?.channel ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'PENDIENTE');
  const [ownerName, setOwnerName] = useState(initial?.ownerName ?? '');
  const [serviceName, setServiceName] = useState(initial?.serviceName ?? '');
  const [zone, setZone] = useState(initial?.zone ?? '');
  const [campaignId, setCampaignId] = useState(initial?.campaignId ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) { setErr('Título y fecha son obligatorios.'); return; }
    setSaving(true);
    setErr('');
    try {
      const body: Record<string, unknown> = {
        type, title: title.trim(), date, status,
        ...(endDate ? { endDate } : {}),
        ...(channel ? { channel } : {}),
        ...(ownerName.trim() ? { ownerName: ownerName.trim() } : {}),
        ...(serviceName.trim() ? { serviceName: serviceName.trim() } : {}),
        ...(zone.trim() ? { zone: zone.trim() } : {}),
        ...(campaignId ? { campaignId } : {}),
      };
      if (isEdit && initial) {
        await apiClient.patch(`/api/marketing/calendar-items/${initial.id}`, body);
      } else {
        await apiClient.post('/api/marketing/calendar-items', body);
      }
      onSave();
    } catch {
      setErr('No se pudo guardar el ítem. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 overflow-y-auto py-8" onClick={onClose}>
      <form
        className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-2xl w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}>
            {isEdit ? 'Editar ítem' : 'Nuevo ítem de calendario'}
          </h3>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-[rgba(128,128,128,0.12)] text-[var(--text-secondary)] transition-colors">
            <X size={16} />
          </button>
        </div>

        {err && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle size={13} /> {err}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Type */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Tipo *</label>
            <div className="grid grid-cols-4 gap-1.5">
              {ITEM_TYPES.map((t) => {
                const s = typeStyle(t);
                const Icon = TYPE_ICONS[t];
                const active = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className="flex flex-col items-center gap-0.5 rounded-lg border px-1 py-2 text-[9px] font-semibold transition-all"
                    style={{
                      backgroundColor: active ? s.bg : 'transparent',
                      borderColor: active ? s.border : 'var(--border-color)',
                      color: active ? s.text : 'var(--text-secondary)',
                    }}
                  >
                    <Icon size={14} />
                    {TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Título *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Campaña termografía Atacama"
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
            />
          </div>

          {/* Date */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Fecha inicio *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
            />
          </div>

          {/* End date */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Fecha término</label>
            <input
              type="date"
              value={endDate ?? ''}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
            />
          </div>

          {/* Channel */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Canal</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
            >
              <option value="">Sin canal</option>
              {CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Estado</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
            >
              {ITEM_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>

          {/* Owner */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Responsable</label>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Ej: María González"
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
            />
          </div>

          {/* Service */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Servicio</label>
            <input
              type="text"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="Ej: Inspección termográfica"
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
            />
          </div>

          {/* Zone */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Zona</label>
            <input
              type="text"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="Ej: Antofagasta, RM"
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
            />
          </div>

          {/* Campaign */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Campaña asociada</label>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
            >
              <option value="">Sin campaña</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[rgba(128,128,128,0.08)] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60 transition-colors"
          >
            {saving ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Crear ítem')}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Month grid view                                                     */
/* ------------------------------------------------------------------ */

interface MonthGridProps {
  year: number;
  month: number;
  items: CalendarItem[];
  todayKey: string;
  onItemClick: (item: CalendarItem) => void;
  onDayClick: (dateKey: string) => void;
  onDrop: (itemId: string, newDate: string) => void;
}

function MonthGrid({ year, month, items, todayKey, onItemClick, onDayClick, onDrop }: MonthGridProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const start = gridStart(year, month);
  const end = gridEnd(year, month);
  const cells: Date[] = [];
  {
    const cursor = new Date(start);
    while (cursor <= end) {
      cells.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  /* Build per-day item lists: range items appear on every day they cover */
  const dayItemsMap = new Map<string, CalendarItem[]>();
  for (const cell of cells) {
    const key = toKey(cell);
    const cellMs = cell.getTime();
    const matching = items.filter((item) => {
      const startMs = parseLocalDate(item.date).getTime();
      const endMs = item.endDate ? parseLocalDate(item.endDate).getTime() : startMs;
      return cellMs >= startMs && cellMs <= endMs;
    });
    dayItemsMap.set(key, matching);
  }

  const today = new Date();

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm select-none">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-[var(--border-color)] bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)]">
        {DAY_NAMES.map((d) => (
          <div key={d} className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            {d}
          </div>
        ))}
      </div>

      {/* Cells */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          const key = toKey(day);
          const inMonth = day.getMonth() === month;
          const isToday = key === todayKey;
          const weekend = isoWeekday(day) >= 5;
          const dayItems = dayItemsMap.get(key) ?? [];
          const visible = dayItems.slice(0, 3);
          const overflow = dayItems.length - visible.length;
          const isDragOver = dragOverKey === key;

          return (
            <div
              key={idx}
              className={`relative flex flex-col gap-0.5 border-b border-r border-[var(--border-color)] px-1.5 py-1.5 transition-colors cursor-pointer ${
                weekend && inMonth ? 'bg-[rgba(0,0,0,0.015)] dark:bg-[rgba(255,255,255,0.015)]' : ''
              } ${isDragOver ? 'bg-[rgba(37,99,235,0.08)]' : ''}`}
              style={{
                minHeight: 96,
                opacity: inMonth ? 1 : 0.4,
                outline: isToday ? '2px solid #2563eb' : undefined,
                outlineOffset: isToday ? '-2px' : undefined,
              }}
              onClick={() => onDayClick(key)}
              onDragOver={(e) => { e.preventDefault(); setDragOverKey(key); }}
              onDragLeave={() => setDragOverKey(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverKey(null);
                if (dragId) onDrop(dragId, key);
              }}
            >
              {/* Day number row */}
              <div className="flex items-center justify-between mb-0.5">
                <span className={`text-xs font-semibold ${isToday ? 'text-[#2563eb]' : 'text-[var(--text-primary)]'}`}>
                  {day.getDate()}
                </span>
                <div className="flex items-center gap-1">
                  {isToday && (
                    <span className="rounded bg-blue-100 px-1 text-[8px] font-semibold uppercase text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Hoy</span>
                  )}
                  {inMonth && (
                    <span
                      className="opacity-0 hover:opacity-100 rounded p-0.5 text-[var(--text-secondary)] hover:bg-[rgba(37,99,235,0.1)] hover:text-[#2563eb] transition-opacity"
                      title="Agregar ítem"
                      onClick={(e) => { e.stopPropagation(); onDayClick(key); }}
                    >
                      <Plus size={10} />
                    </span>
                  )}
                </div>
              </div>

              {/* Item chips */}
              {visible.map((item) => {
                const itemStart = toKey(parseLocalDate(item.date));
                const isContinuation = itemStart !== key;
                const isOverdue =
                  parseLocalDate(item.date) < today &&
                  (item.status === 'PENDIENTE' || item.status === 'EN_PROGRESO');
                return (
                  <ItemChip
                    key={item.id}
                    item={item}
                    isContinuation={isContinuation}
                    isOverdue={isOverdue}
                    onClick={(it) => { onItemClick(it); }}
                    onDragStart={(e, it) => {
                      setDragId(it.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                  />
                );
              })}
              {overflow > 0 && (
                <span className="text-[10px] text-[var(--text-secondary)] pl-0.5 cursor-default">
                  +{overflow} más
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Week view (single-week strip)                                       */
/* ------------------------------------------------------------------ */

interface WeekViewProps {
  weekStart: Date;
  items: CalendarItem[];
  todayKey: string;
  onItemClick: (item: CalendarItem) => void;
  onDayClick: (dateKey: string) => void;
}

function WeekView({ weekStart, items, todayKey, onItemClick, onDayClick }: WeekViewProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
      <div className="grid grid-cols-7 border-b border-[var(--border-color)] bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)]">
        {days.map((d) => {
          const key = toKey(d);
          const isToday = key === todayKey;
          return (
            <div key={key} className={`px-2 py-3 ${isToday ? 'bg-[rgba(37,99,235,0.06)]' : ''}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                {DAY_NAMES[isoWeekday(d)]}
              </p>
              <p className={`mt-0.5 text-xl font-semibold ${isToday ? 'text-[#2563eb]' : 'text-[var(--text-primary)]'}`}
                 style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}>
                {d.getDate()}
              </p>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7 divide-x divide-[var(--border-color)]">
        {days.map((d) => {
          const key = toKey(d);
          const dMs = d.getTime();
          const dayItems = items.filter((item) => {
            const startMs = parseLocalDate(item.date).getTime();
            const endMs = item.endDate ? parseLocalDate(item.endDate).getTime() : startMs;
            return dMs >= startMs && dMs <= endMs;
          });
          return (
            <div
              key={key}
              className="flex flex-col gap-1 p-2 cursor-pointer hover:bg-[rgba(37,99,235,0.03)] min-h-[200px]"
              onClick={() => onDayClick(key)}
            >
              {dayItems.map((item) => {
                const isOverdue = parseLocalDate(item.date) < today && (item.status === 'PENDIENTE' || item.status === 'EN_PROGRESO');
                return (
                  <ItemChip
                    key={item.id}
                    item={item}
                    isOverdue={isOverdue}
                    onClick={(it) => { onItemClick(it); }}
                  />
                );
              })}
              {dayItems.length === 0 && (
                <span className="text-[10px] text-[var(--text-secondary)] opacity-40 mt-2 ml-0.5">Sin ítems</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  List view                                                           */
/* ------------------------------------------------------------------ */

interface ListViewProps {
  items: CalendarItem[];
  todayKey: string;
  onItemClick: (item: CalendarItem) => void;
}

function ListView({ items, todayKey, onItemClick }: ListViewProps) {
  const today = new Date();

  /* Group by date (use item.date as key) */
  const grouped = new Map<string, CalendarItem[]>();
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  for (const item of sorted) {
    const k = item.date.slice(0, 10);
    const arr = grouped.get(k) ?? [];
    arr.push(item);
    grouped.set(k, arr);
  }
  const days = Array.from(grouped.keys()).sort();

  if (days.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <List size={36} className="text-[var(--text-secondary)] opacity-30" />
        <p className="text-sm text-[var(--text-secondary)]">Sin ítems en este período.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {days.map((dayKey) => {
        const dayItems = grouped.get(dayKey) ?? [];
        const d = parseLocalDate(dayKey);
        const isToday = dayKey === todayKey;
        return (
          <div key={dayKey} className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
            {/* Day header */}
            <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border-color)] ${isToday ? 'bg-[rgba(37,99,235,0.06)]' : 'bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)]'}`}>
              <span className={`text-sm font-semibold ${isToday ? 'text-[#2563eb]' : 'text-[var(--text-primary)]'}`}
                    style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}>
                {isToday && <span className="mr-2 text-[10px] font-bold uppercase bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded px-1 py-0.5">Hoy</span>}
                {DAY_NAMES[isoWeekday(d)]}, {d.getDate()} de {MONTH_NAMES[d.getMonth()]} {d.getFullYear()}
              </span>
              <span className="ml-auto text-xs text-[var(--text-secondary)]">{dayItems.length} {dayItems.length === 1 ? 'ítem' : 'ítems'}</span>
            </div>
            {/* Items */}
            <div className="divide-y divide-[var(--border-color)]">
              {dayItems.map((item) => {
                const s = typeStyle(item.type);
                const Icon = TYPE_ICONS[item.type] ?? Calendar;
                const isOverdue = parseLocalDate(item.date) < today && (item.status === 'PENDIENTE' || item.status === 'EN_PROGRESO');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onItemClick(item)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[rgba(37,99,235,0.04)] transition-colors ${isOverdue ? 'border-l-2 border-red-500' : ''}`}
                  >
                    <span
                      className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg"
                      style={{ backgroundColor: s.bg, color: s.text }}
                    >
                      <Icon size={14} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{item.title}</p>
                      <p className="text-xs text-[var(--text-secondary)] truncate">
                        {typeLabel(item.type)}
                        {item.channel ? ` · ${item.channel}` : ''}
                        {item.ownerName ? ` · ${item.ownerName}` : ''}
                        {item.serviceName ? ` · ${item.serviceName}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isOverdue && (
                        <span title="Vencido" className="text-red-500"><AlertCircle size={13} /></span>
                      )}
                      <StatusBadge status={item.status} />
                      {item.campaignName && (
                        <span className="hidden sm:inline text-[10px] text-[#2563eb] bg-[rgba(37,99,235,0.1)] rounded px-1.5 py-0.5 font-medium max-w-[120px] truncate">
                          {item.campaignName}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Filters bar                                                         */
/* ------------------------------------------------------------------ */

interface Filters {
  types: string[];
  channel: string;
  owner: string;
  status: string;
}

interface FiltersBarProps {
  filters: Filters;
  allOwners: string[];
  allChannels: string[];
  onChange: (f: Filters) => void;
  onReset: () => void;
}

function FiltersBar({ filters, allOwners, allChannels, onChange, onReset }: FiltersBarProps) {
  const [open, setOpen] = useState(false);
  const activeCount = filters.types.length + (filters.channel ? 1 : 0) + (filters.owner ? 1 : 0) + (filters.status ? 1 : 0);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
          activeCount > 0
            ? 'border-[#2563eb] bg-[rgba(37,99,235,0.08)] text-[#2563eb]'
            : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[rgba(128,128,128,0.08)]'
        }`}
      >
        <Filter size={13} />
        Filtros
        {activeCount > 0 && (
          <span className="flex items-center justify-center h-4 w-4 rounded-full bg-[#2563eb] text-[9px] text-white font-bold">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-2 z-30 w-80 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Filtros</span>
            {activeCount > 0 && (
              <button type="button" onClick={onReset} className="text-xs text-[#2563eb] hover:underline">Limpiar</button>
            )}
          </div>

          {/* Types */}
          <div className="mb-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Tipo</p>
            <div className="flex flex-wrap gap-1.5">
              {ITEM_TYPES.map((t) => {
                const s = typeStyle(t);
                const active = filters.types.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      const next = active ? filters.types.filter((x) => x !== t) : [...filters.types, t];
                      onChange({ ...filters, types: next });
                    }}
                    className="rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-all"
                    style={{
                      backgroundColor: active ? s.bg : 'transparent',
                      borderColor: active ? s.border : 'var(--border-color)',
                      color: active ? s.text : 'var(--text-secondary)',
                    }}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Channel */}
          {allChannels.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Canal</p>
              <select
                value={filters.channel}
                onChange={(e) => onChange({ ...filters, channel: e.target.value })}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#2563eb] focus:outline-none"
              >
                <option value="">Todos los canales</option>
                {allChannels.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
              </select>
            </div>
          )}

          {/* Owner */}
          {allOwners.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Responsable</p>
              <select
                value={filters.owner}
                onChange={(e) => onChange({ ...filters, owner: e.target.value })}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#2563eb] focus:outline-none"
              >
                <option value="">Todos</option>
                {allOwners.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          )}

          {/* Status */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Estado</p>
            <select
              value={filters.status}
              onChange={(e) => onChange({ ...filters, status: e.target.value })}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#2563eb] focus:outline-none"
            >
              <option value="">Todos los estados</option>
              {ITEM_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-4 w-full rounded-lg bg-[#2563eb] py-1.5 text-xs font-semibold text-white hover:bg-[#1d4ed8] transition-colors"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Legend row                                                          */
/* ------------------------------------------------------------------ */

function TypeLegend({ presentTypes }: { presentTypes: string[] }) {
  if (presentTypes.length === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {presentTypes.map((t) => {
        const s = typeStyle(t);
        const Icon = TYPE_ICONS[t];
        return (
          <span
            key={t}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold"
            style={{ backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}` }}
          >
            {Icon && <Icon size={10} />}
            {TYPE_LABELS[t]}
          </span>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

type ViewMode = 'mes' | 'semana' | 'lista';

export default function MarketingCampanasPage() {
  const router = useRouter();
  const today = new Date();
  const todayKey = toKey(today);

  /* Calendar nav state */
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [viewMode, setViewMode] = useState<ViewMode>('mes');

  /* Data */
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Filters */
  const [filters, setFilters] = useState<Filters>({ types: [], channel: '', owner: '', status: '' });

  /* Modals */
  const [detailItem, setDetailItem] = useState<CalendarItem | null>(null);
  const [editItem, setEditItem] = useState<CalendarItem | null>(null);
  const [createDate, setCreateDate] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  /* Drag optimistic */
  const [optimisticMove, setOptimisticMove] = useState<Record<string, string>>({});

  /* Fetch all items (fetch all, filter client-side for smooth UX) */
  const fetchItems = useCallback(() => {
    apiClient
      .get<CalendarItem[]>('/api/marketing/calendar-items')
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setError('No se pudieron cargar los ítems del calendario.'));
  }, []);

  const fetchCampaigns = useCallback(() => {
    apiClient
      .get<Campaign[]>('/api/marketing/campaigns')
      .then((data) => setCampaigns(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiClient.get<CalendarItem[]>('/api/marketing/calendar-items'),
      apiClient.get<Campaign[]>('/api/marketing/campaigns'),
    ])
      .then(([calItems, camps]) => {
        setItems(Array.isArray(calItems) ? calItems : []);
        setCampaigns(Array.isArray(camps) ? camps : []);
      })
      .catch(() => setError('No se pudo cargar el calendario de marketing.'))
      .finally(() => setLoading(false));
  }, []);

  /* Nav callbacks — primitive deps */
  const prevMonth = useCallback(() => {
    setMonth((m) => { if (m === 0) { setYear((y) => y - 1); return 11; } return m - 1; });
  }, []);
  const nextMonth = useCallback(() => {
    setMonth((m) => { if (m === 11) { setYear((y) => y + 1); return 0; } return m + 1; });
  }, []);
  const goToday = useCallback(() => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setWeekStart(startOfWeek(today));
  }, [today.getFullYear(), today.getMonth()]);

  const prevWeek = useCallback(() => setWeekStart((w) => addDays(w, -7)), []);
  const nextWeek = useCallback(() => setWeekStart((w) => addDays(w, 7)), []);

  /* Filtered items */
  const filteredItems = items
    .map((item) => {
      /* Apply optimistic reschedule */
      if (optimisticMove[item.id]) {
        return { ...item, date: optimisticMove[item.id] };
      }
      return item;
    })
    .filter((item) => {
      if (filters.types.length > 0 && !filters.types.includes(item.type)) return false;
      if (filters.channel && item.channel !== filters.channel) return false;
      if (filters.owner && item.ownerName !== filters.owner) return false;
      if (filters.status && item.status !== filters.status) return false;
      return true;
    });

  /* Items visible for current month/week */
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const weekEnd = addDays(weekStart, 6);

  const monthItems = filteredItems.filter((item) => {
    const s = parseLocalDate(item.date);
    const e = item.endDate ? parseLocalDate(item.endDate) : s;
    return s <= monthEnd && e >= monthStart;
  });

  const weekItems = filteredItems.filter((item) => {
    const s = parseLocalDate(item.date);
    const e = item.endDate ? parseLocalDate(item.endDate) : s;
    return s <= weekEnd && e >= weekStart;
  });

  /* Present types for legend */
  const presentTypes = Array.from(new Set(monthItems.map((i) => i.type)));

  /* Unique owners + channels for filter dropdowns */
  const allOwners = Array.from(new Set(items.filter((i) => i.ownerName).map((i) => i.ownerName!))).sort();
  const allChannels = Array.from(new Set(items.filter((i) => i.channel).map((i) => i.channel!))).sort();

  /* Drag-drop reschedule */
  const handleDrop = useCallback(async (itemId: string, newDate: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item || item.date === newDate) return;
    /* Optimistic update */
    setOptimisticMove((prev) => ({ ...prev, [itemId]: newDate }));
    try {
      await apiClient.patch(`/api/marketing/calendar-items/${itemId}/reschedule`, { date: newDate });
      fetchItems();
    } catch {
      /* Revert */
      setOptimisticMove((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
  }, [items, fetchItems]);

  /* Item click routing */
  const handleItemClick = useCallback((item: CalendarItem) => {
    if (item.type === 'CAMPANA' || item.campaignId) {
      const target = item.campaignId ?? item.id;
      router.push(`/marketing/campanas/${target}`);
    } else {
      setDetailItem(item);
    }
  }, [router]);

  /* Day click → open create modal with prefilled date */
  const handleDayClick = useCallback((dateKey: string) => {
    setCreateDate(dateKey);
    setShowCreate(true);
  }, []);

  /* After save */
  const handleSaved = useCallback(() => {
    setShowCreate(false);
    setEditItem(null);
    setCreateDate(null);
    setDetailItem(null);
    fetchItems();
  }, [fetchItems]);

  /* Delete */
  const handleDelete = useCallback(async (item: CalendarItem) => {
    if (!confirm(`¿Eliminar "${item.title}"?`)) return;
    try {
      await apiClient.delete(`/api/marketing/calendar-items/${item.id}`);
      setDetailItem(null);
      fetchItems();
    } catch {
      alert('No se pudo eliminar el ítem.');
    }
  }, [fetchItems]);

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  /* Active item count for header subtitle */
  const overdueCount = filteredItems.filter(
    (i) => parseLocalDate(i.date) < today && (i.status === 'PENDIENTE' || i.status === 'EN_PROGRESO')
  ).length;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* ── Page header ── */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1
            className="text-2xl font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}
          >
            Calendario de Marketing
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Vista multi-tipo · campañas · publicaciones · contenido · emails · eventos
            {overdueCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-red-700 dark:bg-red-900/30 dark:text-red-400 normal-case font-semibold">
                <AlertCircle size={10} /> {overdueCount} vencido{overdueCount !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>

        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden shadow-sm">
            {(['mes','semana','lista'] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setViewMode(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
                  viewMode === v
                    ? 'bg-[#2563eb] text-white'
                    : 'text-[var(--text-secondary)] hover:bg-[rgba(128,128,128,0.08)]'
                }`}
              >
                {v === 'mes' && <CalendarDays size={13} />}
                {v === 'semana' && <Calendar size={13} />}
                {v === 'lista' && <List size={13} />}
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {/* Nav: Hoy */}
          {!isCurrentMonth && viewMode !== 'lista' && (
            <button
              type="button"
              onClick={goToday}
              className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[rgba(37,99,235,0.06)] hover:border-[#2563eb] hover:text-[#2563eb] transition-colors"
            >
              Hoy
            </button>
          )}

          {/* Month/week nav */}
          {viewMode !== 'lista' && (
            <div className="flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={viewMode === 'mes' ? prevMonth : prevWeek}
                className="flex items-center justify-center px-3 py-2 hover:bg-[rgba(128,128,128,0.08)] text-[var(--text-secondary)] transition-colors"
                aria-label="Anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <span
                className="px-3 py-2 text-sm font-semibold text-[var(--text-primary)] min-w-[160px] text-center"
                style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}
              >
                {viewMode === 'mes'
                  ? `${MONTH_NAMES[month]} ${year}`
                  : `${DAY_NAMES[isoWeekday(weekStart)]} ${weekStart.getDate()} – ${DAY_NAMES[isoWeekday(weekEnd)]} ${weekEnd.getDate()} ${MONTH_NAMES[weekEnd.getMonth()]}`
                }
              </span>
              <button
                type="button"
                onClick={viewMode === 'mes' ? nextMonth : nextWeek}
                className="flex items-center justify-center px-3 py-2 hover:bg-[rgba(128,128,128,0.08)] text-[var(--text-secondary)] transition-colors"
                aria-label="Siguiente"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Filters */}
          <FiltersBar
            filters={filters}
            allOwners={allOwners}
            allChannels={allChannels}
            onChange={setFilters}
            onReset={() => setFilters({ types: [], channel: '', owner: '', status: '' })}
          />

          {/* New item */}
          <button
            type="button"
            onClick={() => { setCreateDate(todayKey); setShowCreate(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-[#2563eb] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#1d4ed8] transition-colors shadow-sm"
          >
            <Plus size={14} />
            Nuevo ítem
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* ── Legend ── */}
      {!loading && <TypeLegend presentTypes={presentTypes} />}

      {/* ── Loading skeleton ── */}
      {loading ? (
        <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
          <div className="grid grid-cols-7 border-b border-[var(--border-color)] bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)]">
            {DAY_NAMES.map((d) => (
              <div key={d} className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="border-b border-r border-[var(--border-color)] p-2" style={{ minHeight: 96 }}>
                <Skeleton className="mb-2 h-3 w-5" />
                <Skeleton className="mb-1 h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* ── Month view ── */}
          {viewMode === 'mes' && (
            <>
              <MonthGrid
                year={year}
                month={month}
                items={monthItems}
                todayKey={todayKey}
                onItemClick={handleItemClick}
                onDayClick={handleDayClick}
                onDrop={handleDrop}
              />
              {/* Empty month state */}
              {monthItems.length === 0 && !error && (
                <div className="mt-6 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-6 py-10 text-center shadow-sm">
                  <Calendar size={32} className="mx-auto mb-3 text-[var(--text-secondary)] opacity-30" />
                  <p className="text-sm text-[var(--text-secondary)]">
                    Sin ítems en {MONTH_NAMES[month]} {year}.
                  </p>
                  <button
                    type="button"
                    onClick={isCurrentMonth ? () => { setCreateDate(todayKey); setShowCreate(true); } : goToday}
                    className="mt-3 text-xs text-[#2563eb] hover:underline"
                  >
                    {isCurrentMonth ? 'Crear primer ítem' : 'Volver al mes actual'}
                  </button>
                </div>
              )}
              {/* Summary */}
              {monthItems.length > 0 && (
                <p className="mt-3 text-xs text-[var(--text-secondary)] text-right">
                  {monthItems.length} ítem{monthItems.length !== 1 ? 's' : ''} en {MONTH_NAMES[month]} {year}
                </p>
              )}
            </>
          )}

          {/* ── Week view ── */}
          {viewMode === 'semana' && (
            <WeekView
              weekStart={weekStart}
              items={weekItems}
              todayKey={todayKey}
              onItemClick={handleItemClick}
              onDayClick={handleDayClick}
            />
          )}

          {/* ── List view ── */}
          {viewMode === 'lista' && (
            <ListView
              items={filteredItems}
              todayKey={todayKey}
              onItemClick={handleItemClick}
            />
          )}
        </>
      )}

      {/* ── Modals ── */}

      {/* Detail modal */}
      {detailItem && !editItem && (
        <ItemDetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onEdit={(item) => { setDetailItem(null); setEditItem(item); }}
          onDelete={handleDelete}
        />
      )}

      {/* Edit modal */}
      {editItem && (
        <FormModal
          initial={editItem}
          campaigns={campaigns}
          onClose={() => setEditItem(null)}
          onSave={handleSaved}
        />
      )}

      {/* Create modal */}
      {showCreate && (
        <FormModal
          prefillDate={createDate ?? todayKey}
          campaigns={campaigns}
          onClose={() => { setShowCreate(false); setCreateDate(null); }}
          onSave={handleSaved}
        />
      )}
    </div>
  );
}
