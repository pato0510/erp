'use client';

/* COM-029 — the Lead ficha (founder L2: leads are created from the pipeline table's
 * «+ Vincular lead» and edited here; no leads page in the menu yet). Header with the name
 * and a small «Lead» label, the fields (Cuenta → its ficha, Contacto with role / email /
 * phone, Creado with the author's name from the members directory — never an id), and
 * «Oportunidades (N)» with stage, value and expected close. «Editar» (lead.update) =
 * Nombre + Contacto from the lead's account → PATCH of what changed. «Eliminar»
 * (lead.delete) only with no linked opportunity (founder L4; the reason is shown next to
 * the disabled button); the api's 409 shows inside the confirm, and success returns to
 * the pipeline with the existing flash toast. All rules live in the api (COM-024). */
import { useCallback, useEffect, useId, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { apiClient, ApiError } from '../../../../../lib/api';
import { formatCLP } from '../../../../../lib/formatters';
import { formatDbDate, formatSantiagoDate } from '../../../../../lib/dates';
import { useComercialPermissions } from '../../../../../hooks/useCanWrite';
import { useMembers } from '../../../../../hooks/useMembers';
import { StageBadge } from '../../../../../components/comercial/stageLabels';
import { stageErrText } from '../../../../../components/comercial/StageEntryDialog';
import {
  DIALOG_GHOST,
  DIALOG_INPUT,
  DIALOG_LABEL,
  DIALOG_PRIMARY,
  DialogShell,
} from '../../../../../components/comercial/DialogShell';
import { LeadContactSelect, contactName } from '../../../../../components/comercial/leadShared';

interface LeadDetail {
  id: string;
  name: string;
  accountId: string;
  account: { id: string; name: string };
  contactId: string | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    role: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  opportunities: {
    id: string;
    name: string;
    stage: string;
    estimatedValue: string | null;
    expectedCloseDate: string | null;
    ownerId: string | null;
    closedAt: string | null;
    createdAt: string;
  }[];
}

const TITLE_ID = 'lead-title';
const EDIT_ID = 'lead-edit';
const DELETE_ID = 'lead-delete';

const HEADING = { fontFamily: "var(--font-display, 'Outfit'), sans-serif" };
const BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-fg-secondary hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-fg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

export default function LeadFichaPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const perms = useComercialPermissions();
  const canUpdate = perms?.lead?.update ?? false;
  const canDelete = perms?.lead?.delete ?? false;
  const { nameOf } = useMembers('all');

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'notFound'>('loading');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(
    () =>
      apiClient
        .get<LeadDetail>(`/api/comercial/leads/${id}`)
        .then((data) => {
          setLead(data);
          setState('ok');
        })
        .catch((e) => {
          setState(e instanceof ApiError && e.status === 403 ? 'forbidden' : 'notFound');
        }),
    [id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (state === 'loading') return <FichaSkeleton />;
  if (state === 'forbidden') return <FichaMessage text="No tienes permiso para ver este lead." />;
  if (state === 'notFound' || !lead) return <FichaMessage text="Lead no encontrado." />;

  const count = lead.opportunities.length;
  const deleteBlocked = count > 0;
  const creator = nameOf(lead.createdBy) ?? 'Usuario desconocido';

  return (
    <div className="pt-2">
      <BackLink />

      {/* Header */}
      <div className="mb-4 rounded-xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 h-7 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h1
                  id={TITLE_ID}
                  tabIndex={-1}
                  className="min-w-0 break-words rounded text-xl font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  style={HEADING}
                >
                  {lead.name}
                </h1>
                <span className="inline-flex shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-fg-secondary">
                  Lead
                </span>
              </div>
              <p className="mt-1 text-sm text-fg-secondary">
                {count === 0
                  ? 'Aún no origina oportunidades'
                  : `Origina ${count} ${count === 1 ? 'oportunidad' : 'oportunidades'}`}
              </p>
            </div>
          </div>

          {(canUpdate || canDelete) && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canUpdate && (
                <button
                  id={EDIT_ID}
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className={BUTTON}
                >
                  <Pencil size={14} aria-hidden="true" /> Editar
                </button>
              )}
              {canDelete && (
                <button
                  id={DELETE_ID}
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  disabled={deleteBlocked}
                  aria-describedby={deleteBlocked ? 'lead-delete-reason' : undefined}
                  className={BUTTON}
                >
                  <Trash2 size={14} aria-hidden="true" /> Eliminar
                </button>
              )}
            </div>
          )}
        </div>
        {canDelete && deleteBlocked && (
          <p id="lead-delete-reason" className="mt-3 text-right text-xs text-fg-secondary">
            Desvincula sus oportunidades para poder eliminarlo.
          </p>
        )}
      </div>

      {/* Fields */}
      <div className="rounded-xl border border-line bg-card p-5">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Field label="Cuenta">
            <Link
              href={`/comercial/cuentas/${lead.account.id}`}
              className="break-words rounded font-medium text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {lead.account.name}
            </Link>
          </Field>
          <Field label="Contacto">
            {lead.contact ? (
              <>
                <span className="block font-medium text-fg">{contactName(lead.contact)}</span>
                {lead.contact.role && (
                  <span className="block text-fg-secondary">{lead.contact.role}</span>
                )}
                {lead.contact.email && (
                  <a
                    href={`mailto:${lead.contact.email}`}
                    className="block break-all rounded text-fg-secondary hover:text-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {lead.contact.email}
                  </a>
                )}
                {lead.contact.phone && (
                  <a
                    href={`tel:${lead.contact.phone.replace(/\s+/g, '')}`}
                    className="block rounded tabular-nums text-fg-secondary hover:text-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {lead.contact.phone}
                  </a>
                )}
              </>
            ) : (
              <span className="text-fg-secondary">Sin contacto</span>
            )}
          </Field>
          <Field label="Creado">
            <span className="block tabular-nums text-fg">{formatSantiagoDate(lead.createdAt)}</span>
            <span className="block text-fg-secondary">por {creator}</span>
          </Field>
        </dl>
      </div>

      {/* Opportunities */}
      <section className="mt-4" aria-labelledby="lead-opportunities-title">
        <h2
          id="lead-opportunities-title"
          className="mb-3 text-sm font-semibold text-fg"
          style={HEADING}
        >
          Oportunidades ({count})
        </h2>
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          {count === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-fg-secondary">
              Este lead aún no origina oportunidades.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm text-fg">
                <caption className="sr-only">Oportunidades originadas por {lead.name}</caption>
                <thead>
                  <tr className="border-b border-line bg-subtle text-left text-xs font-medium text-fg-secondary">
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Oportunidad
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Etapa
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      Valor estimado
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Cierre estimado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lead.opportunities.map((o) => (
                    <tr key={o.id} className="border-b border-line last:border-b-0 hover:bg-subtle">
                      <td className="max-w-[280px] px-4 py-2.5">
                        <Link
                          href={`/comercial/pipeline/${o.id}`}
                          title={o.name}
                          className="block truncate rounded font-medium text-fg hover:text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          {o.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <StageBadge stage={o.stage} />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {o.estimatedValue != null ? formatCLP(o.estimatedValue) : '—'}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-fg-secondary">
                        {o.expectedCloseDate ? formatDbDate(o.expectedCloseDate) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {editOpen && (
        <EditLeadDialog
          lead={lead}
          onCancel={() => setEditOpen(false)}
          onDone={async () => {
            await load();
            setEditOpen(false);
          }}
        />
      )}

      {deleteOpen && (
        <DeleteLeadDialog
          lead={lead}
          onCancel={() => setDeleteOpen(false)}
          onDeleted={() => {
            try {
              sessionStorage.setItem('comercial.flash', 'Lead eliminado.');
            } catch {
              /* sessionStorage unavailable — navigate without the flash */
            }
            router.push('/comercial/pipeline');
          }}
        />
      )}
    </div>
  );
}

/* ── pieces ── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-0.5 text-xs font-medium uppercase tracking-wide text-fg-secondary">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/comercial/pipeline"
      className="mb-3 inline-flex items-center gap-1 rounded text-sm text-fg-secondary hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <ArrowLeft size={13} aria-hidden="true" /> Pipeline
    </Link>
  );
}

function FichaMessage({ text }: { text: string }) {
  return (
    <div className="pt-2">
      <BackLink />
      <div className="rounded-xl border border-line bg-card px-6 py-10 text-center">
        <p className="text-sm text-fg-secondary">{text}</p>
      </div>
    </div>
  );
}

function FichaSkeleton() {
  return (
    <div className="pt-2" aria-busy="true">
      <span className="sr-only">Cargando lead…</span>
      <div className="mb-3 h-4 w-20 animate-pulse rounded bg-subtle-hover" />
      <div className="mb-4 rounded-xl border border-line bg-card p-5">
        <div className="h-6 w-64 max-w-full animate-pulse rounded bg-subtle-hover" />
        <div className="mt-2 h-4 w-40 animate-pulse rounded bg-subtle-hover" />
      </div>
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-line bg-card p-5 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <div className="h-3 w-16 animate-pulse rounded bg-subtle-hover" />
            <div className="mt-2 h-4 w-32 animate-pulse rounded bg-subtle-hover" />
          </div>
        ))}
      </div>
      <div className="mt-4 h-32 animate-pulse rounded-xl border border-line bg-card" />
    </div>
  );
}

/** «Editar»: Nombre + Contacto (the lead's account's contacts) → PATCH of what changed. */
function EditLeadDialog({
  lead,
  onDone,
  onCancel,
}: {
  lead: LeadDetail;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const uid = useId();
  const [name, setName] = useState(lead.name);
  const [contactId, setContactId] = useState(lead.contactId ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const body: { name?: string; contactId?: string | null } = {};
    const trimmed = name.trim();
    if (trimmed !== lead.name) body.name = trimmed;
    if (contactId !== (lead.contactId ?? '')) body.contactId = contactId || null;
    if (Object.keys(body).length === 0) {
      onCancel();
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await apiClient.patch(`/api/comercial/leads/${lead.id}`, body);
    } catch (e) {
      setErr(stageErrText(e, 'No se pudo guardar el lead.'));
      setSaving(false);
      return;
    }
    await onDone();
  };

  return (
    <DialogShell
      title="Editar lead"
      onCancel={onCancel}
      returnFocusId={EDIT_ID}
      fallbackFocusId={TITLE_ID}
      footer={
        <>
          <button type="button" onClick={onCancel} className={DIALOG_GHOST}>
            Cancelar
          </button>
          <button
            type="submit"
            form={`${uid}-form`}
            disabled={saving || name.trim() === ''}
            className={DIALOG_PRIMARY}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form
        id={`${uid}-form`}
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() !== '') void submit();
        }}
      >
        <p className="text-sm text-fg-secondary">
          Cuenta: <span className="font-medium text-fg">{lead.account.name}</span>
        </p>
        <div>
          <label htmlFor={`${uid}-name`} className={DIALOG_LABEL}>
            Nombre (obligatorio)
          </label>
          <input
            id={`${uid}-name`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-required="true"
            autoComplete="off"
            className={DIALOG_INPUT}
          />
        </div>
        <LeadContactSelect
          id={`${uid}-contact`}
          accountId={lead.accountId}
          value={contactId}
          onChange={setContactId}
        />
        {err && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {err}
          </p>
        )}
      </form>
    </DialogShell>
  );
}

/** «Eliminar»: one DELETE; the api's 409 (linked opportunities) shows inside. */
function DeleteLeadDialog({
  lead,
  onDeleted,
  onCancel,
}: {
  lead: LeadDetail;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    setSaving(true);
    setErr(null);
    try {
      await apiClient.delete(`/api/comercial/leads/${lead.id}`);
      onDeleted();
    } catch (e) {
      setErr(stageErrText(e, 'No se pudo eliminar el lead.'));
      setSaving(false);
    }
  };

  return (
    <DialogShell
      title="Eliminar lead"
      onCancel={onCancel}
      returnFocusId={DELETE_ID}
      fallbackFocusId={TITLE_ID}
      footer={
        <>
          <button type="button" data-autofocus onClick={onCancel} className={DIALOG_GHOST}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={saving}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            {saving ? 'Eliminando…' : 'Eliminar'}
          </button>
        </>
      }
    >
      <p className="text-sm text-fg">¿Eliminar el lead «{lead.name}»? Esto no se puede deshacer.</p>
      {err && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
          {err}
        </p>
      )}
    </DialogShell>
  );
}
