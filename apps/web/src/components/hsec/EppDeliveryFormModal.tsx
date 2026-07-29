'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import type { RosterEntry } from './incidentTypes';
import type { EppDeliveryDetail, EppItem } from './eppTypes';

/* HSEC-009 — create/edit a delivery (one form, two modes). On EDIT the empleado select is
 * DISABLED — pair-identity ruling: the person a delivery was handed to is its identity;
 * cambiar de persona = eliminar y recrear (the note renders under the select). The LINES
 * editor always sends the COMPLETE set on save: create → POST lines[]; edit → PATCH the FULL
 * lines[] (the HSEC-008 replace-set semantics — the backend deletes + recreates the set in
 * one transaction). DIRECTOR RULING (HSEC-006): response bodies are discarded — onSaved()
 * triggers the caller's refetch of the shaped GET (the id-for-navigation exception applies
 * on create). Backend 4xx verbatim. */

interface LineDraft {
  eppItemId: string;
  quantity: string; // free-typed; validated client-side, backend re-validates verbatim
  size: string;
}

const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

export function EppDeliveryFormModal({
  editing,
  roster,
  items,
  onClose,
  onSaved,
}: {
  editing: EppDeliveryDetail | null;
  roster: RosterEntry[];
  items: EppItem[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ?? '');
  const [date, setDate] = useState(editing ? editing.date.slice(0, 10) : '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [lines, setLines] = useState<LineDraft[]>(
    editing && editing.lines.length > 0
      ? editing.lines.map((l) => ({
          eppItemId: l.eppItemId,
          quantity: String(l.quantity),
          size: l.size ?? '',
        }))
      : [{ eppItemId: '', quantity: '1', size: '' }],
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // NEW lines only offer ACTIVE items; an inactive item already on an edited delivery keeps
  // its row rendering (the backend rejects re-submitting it — verbatim 400).
  const activeItems = items.filter((i) => i.active);
  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? '';

  const setLine = (idx: number, patch: Partial<LineDraft>) => {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const save = async () => {
    if (!editing && !employeeId) {
      setErr('Selecciona un trabajador.');
      return;
    }
    if (!date) {
      setErr('La fecha es obligatoria.');
      return;
    }
    if (lines.length === 0) {
      setErr('La entrega debe incluir al menos un elemento.');
      return;
    }
    for (const l of lines) {
      if (!l.eppItemId) {
        setErr('Selecciona el elemento en todas las líneas.');
        return;
      }
      if (!/^\d+$/.test(l.quantity) || Number(l.quantity) < 1) {
        setErr('La cantidad debe ser un número entero positivo.');
        return;
      }
    }
    setSaving(true);
    setErr(null);
    const linesBody = lines.map((l) => ({
      eppItemId: l.eppItemId,
      quantity: Number(l.quantity),
      size: l.size.trim() || undefined,
    }));
    try {
      if (editing) {
        // FULL set — replace-set semantics; response body DISCARDED (ruling).
        await apiClient.patch(`/api/hsec/epp-deliveries/${editing.id}`, {
          date,
          notes: notes.trim() || null,
          lines: linesBody,
        });
        onSaved(editing.id);
      } else {
        // Only the new id is read (navigation); the row state comes from the refetch.
        const created = await apiClient.post<{ id: string }>('/api/hsec/epp-deliveries', {
          employeeId,
          date,
          notes: notes.trim() || undefined,
          lines: linesBody,
        });
        onSaved(created.id);
      }
    } catch (e) {
      // Verbatim: inactive-item 400, membership 400, line rules, etc.
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar la entrega.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            {editing ? 'Editar entrega' : 'Nueva entrega de EPP'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <Field label="Trabajador">
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={!!editing}
              className={`${INPUT} disabled:opacity-60`}
            >
              <option value="">— Seleccionar —</option>
              {editing && !roster.some((r) => r.employeeId === editing.employeeId) && (
                <option value={editing.employeeId}>{editing.fullName ?? editing.employeeId}</option>
              )}
              {roster.map((r) => (
                <option key={r.employeeId} value={r.employeeId}>
                  {r.fullName}
                </option>
              ))}
            </select>
            {editing && (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                El trabajador no se puede cambiar: cambiar de persona = eliminar y recrear la
                entrega.
              </p>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>

          {/* LINES editor — always the complete set. */}
          <Field label="Elementos entregados">
            <div className="space-y-2">
              {lines.map((l, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={l.eppItemId}
                    onChange={(e) => setLine(idx, { eppItemId: e.target.value })}
                    className={`${INPUT} flex-1`}
                    aria-label="Elemento"
                  >
                    <option value="">— Elemento —</option>
                    {/* keep an inactive-but-selected item visible on edit */}
                    {l.eppItemId && !activeItems.some((i) => i.id === l.eppItemId) && (
                      <option value={l.eppItemId}>{itemName(l.eppItemId)} (inactivo)</option>
                    )}
                    {activeItems.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={l.quantity}
                    onChange={(e) => setLine(idx, { quantity: e.target.value })}
                    className={`${INPUT} w-20`}
                    aria-label="Cantidad"
                  />
                  <input
                    value={l.size}
                    onChange={(e) => setLine(idx, { size: e.target.value })}
                    placeholder="Talla"
                    className={`${INPUT} w-20`}
                    aria-label="Talla"
                  />
                  <button
                    onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}
                    disabled={lines.length === 1}
                    className="text-[var(--text-secondary)] hover:text-red-600 disabled:opacity-40"
                    aria-label="Quitar línea"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setLines((ls) => [...ls, { eppItemId: '', quantity: '1', size: '' }])
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-[#2563eb]"
              >
                <Plus size={13} /> Agregar línea
              </button>
            </div>
          </Field>

          <Field label="Notas (opcional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={INPUT}
              rows={2}
            />
          </Field>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)]"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: '#2563eb' }}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </label>
      {children}
    </div>
  );
}

export default EppDeliveryFormModal;
