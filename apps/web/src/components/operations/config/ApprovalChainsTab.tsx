'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Pencil, Plus, ShieldCheck } from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { ApprovalChainEditorModal, type ChainStepRow } from './ApprovalChainEditorModal';

type Toaster = (message: string, type: 'success' | 'error' | 'info') => void;

interface PermitTypeRef {
  id: string;
  code: string;
  name: string;
}

interface ApprovalStep {
  id: string;
  workPermitTypeId: string | null;
  permitTypeId: string | null;
  stepOrder: number;
  name: string;
  description: string | null;
  requiredRoles: string[];
  requiresSpecificUserId: string | null;
  mustBeDifferentFromRequester: boolean;
  mustBeDifferentFromPreviousApprovers: boolean;
  isOptional: boolean;
  workPermitType?: PermitTypeRef | null;
  permitType?: PermitTypeRef | null;
}

type EditorTarget =
  | { kind: 'work-permit'; type: PermitTypeRef }
  | { kind: 'external-permit'; type: PermitTypeRef };

/* OPS-026 — companion sub-tab for the existing Permisos config tab.
   Lists every PermitType / WorkPermitType in the company with their
   current chain. Operators edit one chain at a time via the
   ApprovalChainEditorModal. */
export function ApprovalChainsTab({ toaster }: { toaster: Toaster }) {
  const [steps, setSteps] = useState<ApprovalStep[]>([]);
  const [workTypes, setWorkTypes] = useState<PermitTypeRef[]>([]);
  const [externalTypes, setExternalTypes] = useState<PermitTypeRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [editor, setEditor] = useState<EditorTarget | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [allSteps, wpts, pts] = await Promise.all([
        apiClient.get<ApprovalStep[]>('/api/operations/approval-steps'),
        apiClient.get<PermitTypeRef[]>('/api/operations/work-permit-types'),
        apiClient.get<PermitTypeRef[]>('/api/operations/permit-types'),
      ]);
      setSteps(allSteps);
      setWorkTypes(wpts);
      setExternalTypes(pts);
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error cargando cadenas de aprobación', 'error');
    } finally {
      setLoading(false);
    }
  }, [toaster]);

  useEffect(() => {
    load();
  }, [load]);

  const stepsByTarget = useMemo(() => {
    const map = new Map<string, ApprovalStep[]>();
    for (const s of steps) {
      const key = s.workPermitTypeId
        ? `wp:${s.workPermitTypeId}`
        : s.permitTypeId
          ? `ep:${s.permitTypeId}`
          : '';
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(s);
      arr.sort((a, b) => a.stepOrder - b.stepOrder);
      map.set(key, arr);
    }
    return map;
  }, [steps]);

  const handleSeedDefaults = async (mode: 'work-permits' | 'external-permits' | 'both') => {
    setSeeding(true);
    try {
      const result = await apiClient.post<{ created: number; skipped: number }>(
        '/api/operations/approval-steps/apply-defaults',
        { mode },
      );
      toaster(
        `${result.created} pasos creados${
          result.skipped > 0 ? ` · ${result.skipped} omitidos` : ''
        }`,
        'success',
      );
      load();
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error aplicando cadenas', 'error');
    } finally {
      setSeeding(false);
    }
  };

  const initialStepsFor = (
    kind: 'work-permit' | 'external-permit',
    typeId: string,
  ): ChainStepRow[] => {
    const key = kind === 'work-permit' ? `wp:${typeId}` : `ep:${typeId}`;
    const list = stepsByTarget.get(key) ?? [];
    return list.map((s) => ({
      id: s.id,
      stepOrder: s.stepOrder,
      name: s.name,
      description: s.description,
      requiredRoles: s.requiredRoles,
      requiresSpecificUserId: s.requiresSpecificUserId,
      mustBeDifferentFromRequester: s.mustBeDifferentFromRequester,
      mustBeDifferentFromPreviousApprovers: s.mustBeDifferentFromPreviousApprovers,
      isOptional: s.isOptional,
    }));
  };

  return (
    <>
      <section className="config-section">
        <div className="config-section__head">
          <div>
            <h2>Cadenas de aprobación</h2>
            <p>
              Define los pasos secuenciales de autorización para cada tipo de permiso. Cada paso
              valida roles autorizadores, separación de funciones y deja firma digital con audit
              trail.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleSeedDefaults('both')}
              disabled={seeding}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-full border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                color: 'var(--text-primary)',
              }}
            >
              <ClipboardCheck size={14} />
              {seeding ? 'Aplicando...' : 'Cargar cadenas recomendadas'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-center text-[var(--text-secondary)]">Cargando...</div>
        ) : (
          <div className="p-4 space-y-4">
            <ChainGroup
              title="Permisos de trabajo"
              icon={ShieldCheck}
              types={workTypes}
              stepsByTarget={stepsByTarget}
              kind="work-permit"
              onEdit={(type) => setEditor({ kind: 'work-permit', type })}
            />
            <ChainGroup
              title="Permisos externos"
              icon={ClipboardCheck}
              types={externalTypes}
              stepsByTarget={stepsByTarget}
              kind="external-permit"
              onEdit={(type) => setEditor({ kind: 'external-permit', type })}
            />
          </div>
        )}
      </section>

      {editor && (
        <ApprovalChainEditorModal
          {...(editor.kind === 'work-permit'
            ? { workPermitTypeId: editor.type.id }
            : { permitTypeId: editor.type.id })}
          targetLabel={`${editor.type.code} · ${editor.type.name}`}
          initialSteps={initialStepsFor(editor.kind, editor.type.id)}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            load();
          }}
        />
      )}
    </>
  );
}

function ChainGroup({
  title,
  icon: Icon,
  types,
  stepsByTarget,
  kind,
  onEdit,
}: {
  title: string;
  icon: typeof ShieldCheck;
  types: PermitTypeRef[];
  stepsByTarget: Map<string, ApprovalStep[]>;
  kind: 'work-permit' | 'external-permit';
  onEdit: (type: PermitTypeRef) => void;
}) {
  return (
    <div>
      <h3
        className="flex items-center gap-1.5 text-sm mb-2"
        style={{
          fontFamily: 'var(--font-outfit), sans-serif',
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        <Icon size={14} /> {title}
      </h3>
      {types.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No hay tipos definidos.</p>
      ) : (
        <div
          className="rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--border-color)' }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    fontSize: 10,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                    background: 'var(--input-bg)',
                  }}
                >
                  Tipo
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    fontSize: 10,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                    background: 'var(--input-bg)',
                  }}
                >
                  Pasos
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '8px 12px',
                    width: 80,
                    background: 'var(--input-bg)',
                  }}
                >
                  &nbsp;
                </th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => {
                const key = kind === 'work-permit' ? `wp:${t.id}` : `ep:${t.id}`;
                const chain = stepsByTarget.get(key) ?? [];
                return (
                  <tr key={t.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <div
                        className="text-sm"
                        style={{
                          fontFamily: 'var(--font-outfit), sans-serif',
                          fontWeight: 500,
                        }}
                      >
                        {t.name}
                      </div>
                      <div
                        className="text-[var(--text-muted)]"
                        style={{
                          fontFamily: 'var(--font-jetbrains-mono), monospace',
                          fontSize: 11,
                        }}
                      >
                        {t.code}
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {chain.length === 0 ? (
                        <span className="text-xs text-[var(--text-muted)]">
                          Sin cadena (se autorizará en 1 paso por defecto)
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {chain.map((s) => (
                            <span
                              key={s.id}
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                              style={{
                                background: 'rgba(37, 99, 235, 0.10)',
                                color: '#1d4ed8',
                                fontFamily: 'var(--font-outfit), sans-serif',
                                fontWeight: 500,
                              }}
                              title={`Roles: ${s.requiredRoles.join(', ') || '—'}`}
                            >
                              {s.stepOrder}. {s.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      <button
                        onClick={() => onEdit(t)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-gray-100 text-[var(--text-secondary)] text-xs"
                        title={chain.length > 0 ? 'Editar cadena' : 'Crear cadena'}
                      >
                        {chain.length > 0 ? <Pencil size={12} /> : <Plus size={12} />}
                        {chain.length > 0 ? 'Editar' : 'Crear'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ApprovalChainsTab;
