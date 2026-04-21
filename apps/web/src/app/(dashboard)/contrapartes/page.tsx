'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Pencil,
  Power,
  PowerOff,
  Users,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { Toast } from '../../../components/shared/Toast';

type CounterpartyType = 'CLIENT' | 'SUPPLIER' | 'BANK' | 'GOVERNMENT' | 'OTHER';

interface Counterparty {
  id: string;
  name: string;
  type: CounterpartyType;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const TYPE_META: Record<CounterpartyType, { label: string; color: string; badgeCls: string }> = {
  CLIENT: { label: 'Cliente', color: '#2563EB', badgeCls: 'bg-blue-50 text-blue-700' },
  SUPPLIER: { label: 'Proveedor', color: '#64748B', badgeCls: 'bg-slate-100 text-slate-700' },
  BANK: { label: 'Banco', color: '#1E3A5F', badgeCls: 'bg-indigo-50 text-indigo-800' },
  GOVERNMENT: {
    label: 'Gobierno',
    color: '#475569',
    badgeCls: 'bg-gray-100 text-[var(--text-secondary)]',
  },
  OTHER: { label: 'Otro', color: '#94A3B8', badgeCls: 'bg-gray-50 text-[var(--text-secondary)]' },
};

const PAGE_SIZE = 20;

type ModalState = null | { mode: 'create' } | { mode: 'edit'; counterparty: Counterparty };

function initials(name: string) {
  const cleaned = name.trim();
  if (!cleaned) return '·';
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return cleaned.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function ContrapartesPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | CounterpartyType>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<Counterparty> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (typeFilter) params.set('type', typeFilter);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      // isActive is defaulted by the API to true — we want both active/inactive,
      // but the DTO doesn't support "all". Passing false returns only inactive,
      // so we accept the default (active only) and show a subtle disabled indicator
      // for inactive rows when they appear in single fetches.
      const res = await apiClient.get<Paginated<Counterparty>>(
        `/api/counterparties?${params.toString()}`,
      );
      setData(res);
    } catch {
      setToast({ message: 'Error cargando contrapartes', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [search, typeFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, typeFilter]);

  const handleSave = async (dto: {
    id?: string;
    name: string;
    type: CounterpartyType;
    taxId?: string;
    email?: string;
    phone?: string;
    address?: string;
    notes?: string;
  }) => {
    try {
      if (dto.id) {
        const { id, type: _type, ...body } = dto;
        void _type;
        await apiClient.patch(`/api/counterparties/${id}`, body);
        setToast({ message: 'Contraparte actualizada', type: 'success' });
      } else {
        const { id: _id, ...body } = dto;
        void _id;
        await apiClient.post('/api/counterparties', body);
        setToast({ message: 'Contraparte creada', type: 'success' });
      }
      setModal(null);
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error al guardar',
        type: 'error',
      });
    }
  };

  const handleToggle = async (c: Counterparty) => {
    try {
      if (c.isActive) {
        await apiClient.delete(`/api/counterparties/${c.id}`);
        setToast({ message: 'Contraparte desactivada', type: 'success' });
      } else {
        await apiClient.patch(`/api/counterparties/${c.id}`, { isActive: true });
        setToast({ message: 'Contraparte reactivada', type: 'success' });
      }
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error',
        type: 'error',
      });
    }
  };

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl text-[var(--text-primary)]">Contrapartes</h1>
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full"
          style={{
            background: '#1C1C1E',
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 500,
          }}
        >
          <Plus size={16} /> Nueva Contraparte
        </button>
      </div>

      {/* Filters */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="text"
            placeholder="Buscar por nombre o RUT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="cp-input pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-1">
          {(
            [
              { v: '', label: 'Todos' },
              { v: 'CLIENT', label: 'Cliente' },
              { v: 'SUPPLIER', label: 'Proveedor' },
              { v: 'BANK', label: 'Banco' },
              { v: 'GOVERNMENT', label: 'Gobierno' },
              { v: 'OTHER', label: 'Otro' },
            ] as const
          ).map((t) => (
            <button
              key={t.v || 'all'}
              onClick={() => setTypeFilter(t.v as typeof typeFilter)}
              className={`px-3 py-1.5 text-xs rounded-md transition ${
                typeFilter === t.v
                  ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-[var(--border-color)]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-5 py-4 animate-pulse flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-48" />
                  <div className="h-3 bg-gray-200 rounded w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : !data || data.data.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[var(--text-secondary)] font-medium">
              No se encontraron contrapartes
            </p>
            <p className="text-[var(--text-muted)] text-sm mt-1">
              {search || typeFilter
                ? 'Ajusta los filtros o crea una nueva.'
                : 'Crea tu primera contraparte.'}
            </p>
            <button
              onClick={() => setModal({ mode: 'create' })}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full"
              style={{
                background: '#1C1C1E',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Plus size={16} /> Nueva Contraparte
            </button>
          </div>
        ) : (
          <>
            <div className="divide-y divide-[var(--border-color)]">
              {data.data.map((c) => {
                const meta = TYPE_META[c.type];
                return (
                  <div
                    key={c.id}
                    className={`px-5 py-3 flex items-center gap-4 ${!c.isActive ? 'opacity-50' : ''}`}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0"
                      style={{
                        background: meta.color,
                        fontFamily: 'var(--font-outfit), sans-serif',
                        fontWeight: 600,
                        fontSize: 13,
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {initials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p
                          className="truncate text-[var(--text-primary)]"
                          style={{
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontWeight: 500,
                            fontSize: 14,
                          }}
                        >
                          {c.name}
                        </p>
                        <span
                          className={`badge text-[10px] px-2 py-0.5 rounded-full ${meta.badgeCls}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {c.taxId && (
                          <span className="mono text-xs text-[var(--text-muted)]">{c.taxId}</span>
                        )}
                        {c.email && (
                          <span className="text-xs text-[var(--text-muted)]">{c.email}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setModal({ mode: 'edit', counterparty: c })}
                      className="p-2 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleToggle(c)}
                      className="p-2 rounded-md hover:bg-gray-100"
                      title={c.isActive ? 'Desactivar' : 'Activar'}
                      style={{ color: c.isActive ? '#64748B' : '#16A34A' }}
                    >
                      {c.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                    </button>
                  </div>
                );
              })}
            </div>

            {data.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)] bg-gray-50">
                <p className="text-xs text-[var(--text-secondary)]">
                  {data.total} contrapartes · Página {data.page} de {data.totalPages}
                </p>
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
              </div>
            )}
          </>
        )}
      </div>

      {modal && (
        <CounterpartyModal modal={modal} onClose={() => setModal(null)} onSave={handleSave} />
      )}

      <style jsx global>{`
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

function CounterpartyModal({
  modal,
  onClose,
  onSave,
}: {
  modal: Exclude<ModalState, null>;
  onClose: () => void;
  onSave: (dto: {
    id?: string;
    name: string;
    type: CounterpartyType;
    taxId?: string;
    email?: string;
    phone?: string;
    address?: string;
    notes?: string;
  }) => void;
}) {
  const initial = modal.mode === 'edit' ? modal.counterparty : null;

  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<CounterpartyType>(initial?.type ?? 'CLIENT');
  const [taxId, setTaxId] = useState(initial?.taxId ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSave({
        id: initial?.id,
        name: name.trim(),
        type,
        taxId: taxId.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-card)]">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {modal.mode === 'create' ? 'Nueva contraparte' : 'Editar contraparte'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme S.A."
                className="cp-input"
              />
            </Field>
            <Field label="Tipo" required>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CounterpartyType)}
                className="cp-input"
              >
                {(Object.keys(TYPE_META) as CounterpartyType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_META[t].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="RUT / Tax ID">
              <input
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="76.123.456-7"
                className="cp-input mono"
                style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contacto@empresa.cl"
                className="cp-input"
              />
            </Field>
            <Field label="Teléfono">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+56 9 1234 5678"
                className="cp-input"
              />
            </Field>
          </div>

          <Field label="Dirección">
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className="cp-input"
            />
          </Field>

          <Field label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="cp-input"
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)] sticky bottom-0 bg-[var(--bg-card)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || submitting}
            className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            {submitting ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
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
      <label
        className="block mb-1.5 text-[var(--text-secondary)]"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500, fontSize: 13 }}
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
