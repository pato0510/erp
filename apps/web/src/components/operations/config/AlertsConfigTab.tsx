'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { apiClient } from '../../../lib/api';

type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'BLOCKING';
type Toaster = (message: string, type: 'success' | 'error' | 'info') => void;

interface DocumentTypeOption {
  id: string;
  name: string;
  code: string;
  category: string;
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  hasExpiration?: boolean;
}

interface AlertRuleRow {
  id: string;
  documentTypeId: string | null;
  name: string;
  isActive: boolean;
  daysBeforeExpiration: number;
  severity: AlertSeverity;
  channels: { inApp?: boolean; email?: boolean };
  targetRoles: string[];
  notifyAssignedUser: boolean;
  notifyOperationalSupervisor: boolean;
  escalateAfterDays: number | null;
  escalateToRoles: string[];
  description: string | null;
  documentType?: { id: string; name: string; code: string; category: string } | null;
}

interface AlertSettings {
  defaultDaysBefore: number;
  defaultCriticalDaysBefore: number;
  defaultBlockingDaysBefore: number;
  enableAutoBlocking: boolean;
  enableEmailNotifications: boolean;
  defaultEscalationDays: number;
}

const ROLES: Array<{ value: string; label: string }> = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'ACCOUNTANT', label: 'Contador' },
  { value: 'ANALYST', label: 'Analista' },
  { value: 'VIEWER', label: 'Visualizador' },
];

const SEVERITY_META: Record<AlertSeverity, { label: string; bg: string; fg: string }> = {
  INFO: { label: 'Info', bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8' },
  WARNING: { label: 'Warning', bg: 'rgba(234, 179, 8, 0.14)', fg: '#a16207' },
  CRITICAL: { label: 'Crítica', bg: 'rgba(249, 115, 22, 0.14)', fg: '#c2410c' },
  BLOCKING: { label: 'Bloqueante', bg: 'rgba(239, 68, 68, 0.14)', fg: '#b91c1c' },
};

const SEVERITIES: AlertSeverity[] = ['INFO', 'WARNING', 'CRITICAL', 'BLOCKING'];

export function AlertsConfigTab({ toaster }: { toaster: Toaster }) {
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [rules, setRules] = useState<AlertRuleRow[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [applyingPreset, setApplyingPreset] = useState(false);
  const [ruleModal, setRuleModal] = useState<
    { mode: 'create' } | { mode: 'edit'; rule: AlertRuleRow } | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState<AlertRuleRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r, dt] = await Promise.all([
        apiClient.get<AlertSettings>('/api/operations/alert-settings'),
        apiClient.get<AlertRuleRow[]>('/api/operations/alert-rules'),
        apiClient.get<DocumentTypeOption[]>('/api/operations/document-types'),
      ]);
      setSettings(s);
      setRules(r);
      setDocumentTypes(dt);
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error cargando alertas', 'error');
    } finally {
      setLoading(false);
    }
  }, [toaster]);

  useEffect(() => {
    load();
  }, [load]);

  const saveSettings = async (next: AlertSettings) => {
    setSavingSettings(true);
    try {
      const updated = await apiClient.patch<AlertSettings>('/api/operations/alert-settings', next);
      setSettings(updated);
      toaster('Configuración guardada', 'success');
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'No se pudo guardar la configuración.', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const applyPreset = async () => {
    if (applyingPreset) return;
    setApplyingPreset(true);
    try {
      const res = await apiClient.post<{
        created: number;
        skipped: number;
        missingTypes: string[];
      }>('/api/operations/alert-rules/apply-recommended-chile');
      const parts = [`${res.created} creadas`, `${res.skipped} omitidas (ya existían)`];
      if (res.missingTypes.length > 0) {
        parts.push(`Tipos no encontrados: ${res.missingTypes.join(', ')}`);
      }
      toaster(`Reglas recomendadas aplicadas. ${parts.join(' · ')}`, 'success');
      load();
    } catch (err) {
      toaster(
        err instanceof Error ? err.message : 'No se pudieron aplicar las reglas recomendadas.',
        'error',
      );
    } finally {
      setApplyingPreset(false);
    }
  };

  const performDelete = async () => {
    if (!confirmDelete) return;
    try {
      await apiClient.delete(`/api/operations/alert-rules/${confirmDelete.id}`);
      toaster('Regla eliminada', 'success');
      setConfirmDelete(null);
      load();
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'No se pudo eliminar la regla.', 'error');
      setConfirmDelete(null);
    }
  };

  if (loading || !settings) {
    return (
      <div className="space-y-3">
        <div
          className="animate-pulse"
          style={{ height: 220, background: 'rgba(0,0,0,0.04)', borderRadius: 12 }}
        />
        <div
          className="animate-pulse"
          style={{ height: 280, background: 'rgba(0,0,0,0.04)', borderRadius: 12 }}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Section 1 — Global settings */}
      <SettingsSection settings={settings} saving={savingSettings} onSave={saveSettings} />

      {/* Section 2 — Custom rules */}
      <div className="config-section">
        <div className="config-section__head">
          <div>
            <h2
              className="text-[var(--text-primary)] flex items-center gap-2"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
                fontSize: 16,
              }}
            >
              <Bell size={16} /> Reglas específicas por tipo de documento
            </h2>
            <p
              className="text-sm text-[var(--text-secondary)] mt-1"
              style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
            >
              Por defecto, todos los tipos usan las reglas globales. Aquí puedes crear excepciones
              para tipos específicos.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={applyPreset}
              disabled={applyingPreset}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                color: 'var(--text-primary)',
              }}
              title="Crea las reglas recomendadas para SOAP, Permiso de Circulación, Revisión Técnica y procedimientos de seguridad"
            >
              <Sparkles size={14} />
              {applyingPreset ? 'Aplicando...' : 'Cargar reglas recomendadas Chile'}
            </button>
            <button
              onClick={() => setRuleModal({ mode: 'create' })}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-full text-white"
              style={{
                background: '#1C1C1E',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Plus size={14} /> Nueva regla
            </button>
          </div>
        </div>
        {rules.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Bell size={28} style={{ margin: '0 auto 8px', color: '#cbd5e1' }} />
            <p className="text-sm">
              Aún no hay reglas personalizadas. Las alertas funcionan con la configuración global.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cfg-table">
              <thead>
                <tr>
                  <th>Tipo de documento</th>
                  <th>Día disparador</th>
                  <th>Severidad</th>
                  <th>Roles</th>
                  <th>Estado</th>
                  <th style={{ width: 110, textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.documentType ? (
                        <>
                          <div
                            style={{
                              fontFamily: 'var(--font-outfit), sans-serif',
                              fontWeight: 500,
                              fontSize: 13,
                            }}
                          >
                            {r.documentType.name}
                          </div>
                          <div
                            className="text-[var(--text-muted)] mt-0.5"
                            style={{
                              fontFamily: 'var(--font-jetbrains-mono), monospace',
                              fontSize: 11,
                            }}
                          >
                            {r.documentType.code}
                          </div>
                        </>
                      ) : (
                        <span
                          className="cfg-chip"
                          style={{ background: 'rgba(100, 116, 139, 0.12)', color: '#475569' }}
                        >
                          Global
                        </span>
                      )}
                      <div
                        className="text-[var(--text-muted)] mt-1"
                        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: 12 }}
                      >
                        {r.name}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
                        {r.daysBeforeExpiration === 0
                          ? 'Día del vencimiento'
                          : `${r.daysBeforeExpiration} días antes`}
                      </span>
                    </td>
                    <td>
                      <span
                        className="cfg-chip"
                        style={{
                          background: SEVERITY_META[r.severity].bg,
                          color: SEVERITY_META[r.severity].fg,
                        }}
                      >
                        {SEVERITY_META[r.severity].label}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {r.targetRoles.length === 0 ? (
                          <span className="text-xs text-[var(--text-muted)]">—</span>
                        ) : (
                          r.targetRoles.map((role) => (
                            <span
                              key={role}
                              className="cfg-chip"
                              style={{
                                background: 'rgba(37, 99, 235, 0.08)',
                                color: '#1d4ed8',
                              }}
                            >
                              {ROLES.find((x) => x.value === role)?.label ?? role}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td>
                      {r.isActive ? (
                        <span
                          className="cfg-chip"
                          style={{ background: 'rgba(34, 197, 94, 0.12)', color: '#15803d' }}
                        >
                          Activa
                        </span>
                      ) : (
                        <span
                          className="cfg-chip"
                          style={{ background: 'rgba(100, 116, 139, 0.14)', color: '#475569' }}
                        >
                          Pausada
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => setRuleModal({ mode: 'edit', rule: r })}
                        className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--text-secondary)] mr-1"
                        title="Editar"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(r)}
                        className="p-1.5 rounded-md hover:bg-red-50 text-red-600"
                        title="Eliminar"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {ruleModal && (
        <AlertRuleModal
          mode={ruleModal.mode}
          rule={ruleModal.mode === 'edit' ? ruleModal.rule : null}
          documentTypes={documentTypes}
          onClose={() => setRuleModal(null)}
          onSaved={() => {
            toaster(ruleModal.mode === 'edit' ? 'Regla actualizada' : 'Regla creada', 'success');
            setRuleModal(null);
            load();
          }}
          onError={(msg) => toaster(msg, 'error')}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          title="Eliminar regla"
          confirmLabel="Eliminar"
          tone="danger"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={performDelete}
        >
          <p className="text-sm text-[var(--text-secondary)]">
            ¿Confirmas eliminar la regla{' '}
            <strong className="text-[var(--text-primary)]">{confirmDelete.name}</strong>? La acción
            es irreversible — los activos ya alertados seguirán mostrando sus avisos previos.
          </p>
        </ConfirmModal>
      )}

      <style jsx global>{`
        .cfg-table {
          width: 100%;
          border-collapse: collapse;
        }
        .cfg-table th {
          text-align: left;
          padding: 10px 16px;
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-secondary);
          font-weight: 500;
          border-bottom: 1px solid var(--border-color);
          background: var(--input-bg);
        }
        .cfg-table td {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color);
          font-size: 14px;
          color: var(--text-primary);
          vertical-align: top;
        }
        .cfg-table tr:last-child td {
          border-bottom: none;
        }
        .cfg-chip {
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
    </div>
  );
}

/* --------------------------------------------------------------------- */

function SettingsSection({
  settings,
  saving,
  onSave,
}: {
  settings: AlertSettings;
  saving: boolean;
  onSave: (next: AlertSettings) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AlertSettings>(settings);
  /* Re-sync local draft when the parent gets a fresh server snapshot. */
  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const dirty = useMemo(
    () =>
      draft.defaultDaysBefore !== settings.defaultDaysBefore ||
      draft.defaultCriticalDaysBefore !== settings.defaultCriticalDaysBefore ||
      draft.defaultBlockingDaysBefore !== settings.defaultBlockingDaysBefore ||
      draft.enableAutoBlocking !== settings.enableAutoBlocking ||
      draft.enableEmailNotifications !== settings.enableEmailNotifications ||
      draft.defaultEscalationDays !== settings.defaultEscalationDays,
    [draft, settings],
  );

  return (
    <div className="config-section">
      <div className="config-section__head">
        <div>
          <h2
            className="text-[var(--text-primary)] flex items-center gap-2"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 600, fontSize: 16 }}
          >
            <Bell size={16} /> Configuración general de alertas
          </h2>
          <p
            className="text-sm text-[var(--text-secondary)] mt-1"
            style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
          >
            Valores por defecto que aplican a todos los tipos de documento que no tengan reglas
            específicas.
          </p>
        </div>
      </div>
      <div style={{ padding: 20 }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumField
            label="Días por defecto antes de vencer (alerta normal)"
            tooltip="Cuántos días antes del vencimiento generar alerta WARNING para todos los tipos de documento"
            value={draft.defaultDaysBefore}
            onChange={(v) => setDraft({ ...draft, defaultDaysBefore: v })}
          />
          <NumField
            label="Días por defecto para alerta crítica"
            tooltip="Días antes del vencimiento para escalar a CRITICAL"
            value={draft.defaultCriticalDaysBefore}
            onChange={(v) => setDraft({ ...draft, defaultCriticalDaysBefore: v })}
          />
          <NumField
            label="Días para alerta de bloqueo"
            tooltip="0 significa el día del vencimiento. Solo aplica a documentos que bloquean operación."
            value={draft.defaultBlockingDaysBefore}
            onChange={(v) => setDraft({ ...draft, defaultBlockingDaysBefore: v })}
          />
          <NumField
            label="Días para escalamiento"
            tooltip="Si una alerta CRITICAL no es resuelta en X días se escala a roles superiores"
            value={draft.defaultEscalationDays}
            onChange={(v) => setDraft({ ...draft, defaultEscalationDays: v })}
          />
        </div>
        <div className="mt-4 space-y-3">
          <ToggleField
            label="Bloqueo automático de activos por documentos vencidos"
            description="Si está activado, los activos con documentos CRÍTICOS+BLOQUEANTES vencidos pasarán a estado BLOQUEADO automáticamente."
            value={draft.enableAutoBlocking}
            onChange={(v) => setDraft({ ...draft, enableAutoBlocking: v })}
          />
          <ToggleField
            label="Notificaciones por email"
            description="Próximamente — por ahora todas las alertas son in-app."
            value={draft.enableEmailNotifications}
            onChange={(v) => setDraft({ ...draft, enableEmailNotifications: v })}
            disabled
            badge="Próximamente"
          />
        </div>
        <div className="mt-5 flex justify-end">
          <button
            onClick={() => onSave(draft)}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-full text-white disabled:opacity-50"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            <Save size={14} /> {saving ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NumField({
  label,
  tooltip,
  value,
  onChange,
}: {
  label: string;
  tooltip?: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label
        className="block mb-1.5 text-[var(--text-secondary)]"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500, fontSize: 13 }}
        title={tooltip}
      >
        {label}
      </label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 0) onChange(n);
        }}
        className="cp-input"
        style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
      />
      {tooltip && <p className="text-xs text-[var(--text-muted)] mt-1">{tooltip}</p>}
    </div>
  );
}

function ToggleField({
  label,
  description,
  value,
  onChange,
  disabled,
  badge,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <label
      className="flex items-start gap-3 cursor-pointer"
      style={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        disabled={disabled}
        style={{ accentColor: '#2563eb', marginTop: 3 }}
      />
      <div>
        <div className="flex items-center gap-2">
          <span
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
              fontSize: 13,
              color: 'var(--text-primary)',
            }}
          >
            {label}
          </span>
          {badge && (
            <span
              className="cfg-chip"
              style={{ background: 'rgba(100, 116, 139, 0.14)', color: '#475569' }}
            >
              {badge}
            </span>
          )}
        </div>
        {description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

/* --------------------------------------------------------------------- */

function AlertRuleModal({
  mode,
  rule,
  documentTypes,
  onClose,
  onSaved,
  onError,
}: {
  mode: 'create' | 'edit';
  rule: AlertRuleRow | null;
  documentTypes: DocumentTypeOption[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(rule?.name ?? '');
  const [documentTypeId, setDocumentTypeId] = useState<string>(rule?.documentTypeId ?? '');
  const [daysBeforeExpiration, setDaysBeforeExpiration] = useState<number>(
    rule?.daysBeforeExpiration ?? 30,
  );
  const [severity, setSeverity] = useState<AlertSeverity>(rule?.severity ?? 'WARNING');
  const [inApp, setInApp] = useState<boolean>(rule?.channels?.inApp ?? true);
  const [email, setEmail] = useState<boolean>(rule?.channels?.email ?? false);
  const [targetRoles, setTargetRoles] = useState<string[]>(
    rule?.targetRoles ?? ['ADMIN', 'MANAGER'],
  );
  const [notifyAssignedUser, setNotifyAssignedUser] = useState<boolean>(
    rule?.notifyAssignedUser ?? true,
  );
  const [notifyOperationalSupervisor, setNotifyOperationalSupervisor] = useState<boolean>(
    rule?.notifyOperationalSupervisor ?? false,
  );
  const [escalateAfterDays, setEscalateAfterDays] = useState<number | ''>(
    rule?.escalateAfterDays ?? '',
  );
  const [escalateToRoles, setEscalateToRoles] = useState<string[]>(rule?.escalateToRoles ?? []);
  const [description, setDescription] = useState<string>(rule?.description ?? '');
  const [isActive, setIsActive] = useState<boolean>(rule?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);

  const toggleRole = (list: string[], setter: (v: string[]) => void, role: string) => {
    setter(list.includes(role) ? list.filter((r) => r !== role) : [...list, role]);
  };

  const submit = async () => {
    if (!name.trim()) {
      onError('Indica el nombre de la regla.');
      return;
    }
    if (!Number.isFinite(daysBeforeExpiration) || daysBeforeExpiration < 0) {
      onError('Los días antes de vencer deben ser >= 0.');
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        documentTypeId: documentTypeId || undefined,
        daysBeforeExpiration,
        severity,
        channels: { inApp, email },
        targetRoles,
        notifyAssignedUser,
        notifyOperationalSupervisor,
        escalateAfterDays: escalateAfterDays === '' ? undefined : Number(escalateAfterDays),
        escalateToRoles,
        description: description.trim() || undefined,
        isActive,
      };
      if (mode === 'edit' && rule) {
        await apiClient.patch(`/api/operations/alert-rules/${rule.id}`, body);
      } else {
        await apiClient.post('/api/operations/alert-rules', body);
      }
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo guardar la regla.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-card)] z-10">
          <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Bell size={16} /> {mode === 'edit' ? 'Editar regla' : 'Nueva regla de alerta'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <Section title="Aplicación">
            <Field label="Tipo de documento">
              <select
                value={documentTypeId}
                onChange={(e) => setDocumentTypeId(e.target.value)}
                className="cp-input"
              >
                <option value="">Global (todos los tipos)</option>
                {documentTypes.map((dt) => (
                  <option key={dt.id} value={dt.id}>
                    {dt.code} · {dt.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Si dejas "Global", la regla se aplica a todos los tipos al mismo umbral. Selecciona
                un tipo para crear una excepción específica.
              </p>
            </Field>
            <Field label="Nombre" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Alerta crítica SOAP"
                className="cp-input"
              />
            </Field>
          </Section>

          <Section title="Disparador">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Días antes de vencer" required>
                <input
                  type="number"
                  min={0}
                  value={daysBeforeExpiration}
                  onChange={(e) => setDaysBeforeExpiration(Number(e.target.value))}
                  className="cp-input"
                  style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                />
              </Field>
              <Field label="Severidad" required>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as AlertSeverity)}
                  className="cp-input"
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {SEVERITY_META[s].label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>

          <Section title="Canales">
            <ToggleField
              label="In-app"
              description="Aparece en la pantalla de alertas y en el badge del sidebar."
              value={inApp}
              onChange={setInApp}
            />
            <ToggleField
              label="Email"
              description="Próximamente — el toggle queda guardado para cuando esté disponible."
              value={email}
              onChange={setEmail}
              disabled
              badge="Próximamente"
            />
          </Section>

          <Section title="Destinatarios">
            <Field label="Roles a notificar">
              <RoleMultiSelect
                value={targetRoles}
                onChange={(role) => toggleRole(targetRoles, setTargetRoles, role)}
              />
            </Field>
            <ToggleField
              label="Notificar al usuario asignado al activo"
              value={notifyAssignedUser}
              onChange={setNotifyAssignedUser}
            />
            <ToggleField
              label="Notificar al supervisor operacional"
              value={notifyOperationalSupervisor}
              onChange={setNotifyOperationalSupervisor}
            />
          </Section>

          <Section title="Escalamiento (opcional)">
            <Field
              label="Días sin acción para escalar"
              hint="Si se deja vacío, la regla no escala automáticamente."
            >
              <input
                type="number"
                min={0}
                value={escalateAfterDays}
                onChange={(e) =>
                  setEscalateAfterDays(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="cp-input"
                style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
              />
            </Field>
            <Field label="Roles a escalar">
              <RoleMultiSelect
                value={escalateToRoles}
                onChange={(role) => toggleRole(escalateToRoles, setEscalateToRoles, role)}
              />
            </Field>
          </Section>

          <Section title="Descripción (opcional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Notas internas, motivación de la regla, etc."
              className="cp-input"
            />
          </Section>

          <ToggleField
            label="Regla activa"
            description="Desactiva temporalmente sin perder la configuración."
            value={isActive}
            onChange={setIsActive}
          />
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
            disabled={submitting}
            className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50 inline-flex items-center gap-1.5"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            <Save size={14} />
            {submitting ? 'Guardando...' : mode === 'edit' ? 'Actualizar' : 'Crear regla'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (role: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ROLES.map((r) => {
        const active = value.includes(r.value);
        return (
          <button
            key={r.value}
            type="button"
            onClick={() => onChange(r.value)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition"
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
              background: active ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
              borderColor: active ? '#2563eb' : 'var(--border-color)',
              color: active ? '#1d4ed8' : 'var(--text-secondary)',
            }}
          >
            {active ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4
        className="text-[var(--text-secondary)] mb-2"
        style={{
          fontFamily: 'var(--font-ibm-plex-mono), monospace',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </h4>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
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
      {hint && <p className="text-xs text-[var(--text-muted)] mt-1">{hint}</p>}
    </div>
  );
}

function ConfirmModal({
  title,
  confirmLabel,
  tone,
  onCancel,
  onConfirm,
  children,
}: {
  title: string;
  confirmLabel: string;
  tone: 'danger' | 'warning';
  onCancel: () => void;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  const bg = tone === 'danger' ? '#DC2626' : '#D97706';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-[var(--border-color)]">
          <h3
            className="text-[var(--text-primary)] flex items-center gap-2"
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
              fontSize: 16,
            }}
          >
            <AlertTriangle size={16} /> {title}
          </h3>
        </div>
        <div className="px-5 py-4">{children}</div>
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
              background: bg,
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

export default AlertsConfigTab;
