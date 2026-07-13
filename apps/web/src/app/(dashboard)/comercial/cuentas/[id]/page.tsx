'use client';

/* COM-004b — Account ficha. Tabbed from day one (mirrors the RRHH worker ficha):
 * header + a config-driven TABS array. "Datos generales" (inline, pure display +
 * counterparty link section) and "Contactos" (self-loading). Future tabs
 * (Oportunidades, Actividad) append to TABS with one line each. Write controls are
 * role-gated via useCanWrite (ACCOUNTANT sees everything read-only). Tokens:
 * accent #2563eb, Outfit headings, glassmorphism cards. */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Link2, Pencil, Unlink } from 'lucide-react';
import { apiClient, ApiError } from '../../../../../lib/api';
import { useCanWrite } from '../../../../../hooks/useCanWrite';
import {
  PRIORITY_LABELS,
  StatusBadge,
  STATUS_LABELS,
} from '../../../../../components/comercial/accountLabels';
import { AccountFormModal } from '../../../../../components/comercial/AccountFormModal';
import AccountContactsTab from '../../../../../components/comercial/AccountContactsTab';
import { ActivityTimeline } from '../../../../../components/comercial/ActivityTimeline';

interface Account {
  id: string;
  name: string;
  status: string;
  priority: string;
  industry: string | null;
  commercialRisk: string | null;
  paymentTermDays: number;
  ownerId: string | null;
  counterpartyId: string | null;
  sourceCampaignId: string | null;
  // MKT-006 — enriched by the accounts service via the Marketing-exported lookup.
  sourceCampaign: { id: string; name: string } | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const TABS = [
  { key: 'datos', label: 'Datos generales' },
  { key: 'contactos', label: 'Contactos' },
  { key: 'actividad', label: 'Actividad' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function AccountFichaPage() {
  const params = useParams();
  const id = String(params.id);
  const canWrite = useCanWrite();

  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<TabKey>('datos');

  const load = useCallback(() => {
    apiClient
      .get<Account>(`/api/comercial/accounts/${id}`)
      .then((data) => {
        setAccount(data);
        setForbidden(false);
        setNotFound(false);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setForbidden(true);
        else setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading)
    return <div className="pt-6 text-sm text-[var(--text-secondary)]">Cargando ficha…</div>;

  if (forbidden)
    return (
      <div className="pt-6">
        <p className="text-sm text-[var(--text-secondary)]">
          No tienes permiso para ver esta cuenta.
        </p>
        <BackLink />
      </div>
    );

  if (notFound || !account)
    return (
      <div className="pt-6">
        <p className="text-sm text-[var(--text-secondary)]">Cuenta no encontrada.</p>
        <BackLink />
      </div>
    );

  return (
    <div className="pt-2">
      <Link
        href="/comercial/cuentas"
        className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={13} /> Cuentas
      </Link>

      {/* Header */}
      <div className="mb-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="h-7 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
            <div>
              <h1
                className="text-xl font-semibold text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
              >
                {account.name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
                <StatusBadge status={account.status} />
                <span>·</span>
                <span>Prioridad {PRIORITY_LABELS[account.priority] ?? account.priority}</span>
                {account.industry && (
                  <>
                    <span>·</span>
                    <span>{account.industry}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          {canWrite && <EditButton account={account} onChanged={load} />}
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-[var(--border-color)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="relative px-3 py-2 text-sm"
            style={{
              color: tab === t.key ? '#2563eb' : 'var(--text-secondary)',
              fontWeight: tab === t.key ? 600 : 400,
              borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab body */}
      {tab === 'datos' && (
        <AccountDatosTab account={account} canWrite={canWrite} onChanged={load} />
      )}
      {tab === 'contactos' && <AccountContactsTab accountId={id} canWrite={canWrite} />}
      {tab === 'actividad' && <ActivityTimeline scope="account" scopeId={id} canWrite={canWrite} />}
    </div>
  );
}

/* ───────────────────────── Datos generales (inline) ───────────────────────── */

interface CounterpartyOption {
  id: string;
  name: string;
  taxId: string | null;
  type?: string;
}

function AccountDatosTab({
  account,
  canWrite,
  onChanged,
}: {
  account: Account;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [counterparties, setCounterparties] = useState<CounterpartyOption[]>([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiClient
      .get<{ data: CounterpartyOption[] }>('/api/counterparties?limit=200')
      .then((r) => setCounterparties(r.data))
      .catch(() => undefined);
  }, []);

  const linked = account.counterpartyId
    ? counterparties.find((c) => c.id === account.counterpartyId)
    : null;

  const link = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      await apiClient.patch(`/api/comercial/accounts/${account.id}`, { counterpartyId: pick });
      setPick('');
      onChanged();
    } catch {
      window.alert('No se pudo vincular la contraparte.');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!window.confirm('¿Desvincular la contraparte de esta cuenta?')) return;
    setBusy(true);
    try {
      await apiClient.patch(`/api/comercial/accounts/${account.id}`, { counterpartyId: null });
      onChanged();
    } catch {
      window.alert('No se pudo desvincular la contraparte.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KV label="Estado" value={STATUS_LABELS[account.status] ?? account.status} />
          <KV label="Prioridad" value={PRIORITY_LABELS[account.priority] ?? account.priority} />
          <KV label="Industria" value={account.industry ?? '—'} />
          <KV label="Riesgo comercial" value={account.commercialRisk ?? '—'} />
          {/* COM-014 — payment term drives the projected-income commitment at handoff */}
          <KV label="Plazo de pago" value={`${account.paymentTermDays} días`} />
          {/* MKT-006 — attributed campaign as a link (every role that reads accounts also
              reads Campaign, so the link is permission-safe). "Sin campaña" otherwise. */}
          <div>
            <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Campaña de origen
            </p>
            {account.sourceCampaign ? (
              <Link
                href={`/marketing/campanas/${account.sourceCampaign.id}`}
                className="text-sm"
                style={{ color: '#2563eb' }}
              >
                {account.sourceCampaign.name}
              </Link>
            ) : (
              <p className="text-sm text-[var(--text-primary)]">Sin campaña</p>
            )}
          </div>
        </div>
        {account.notes && (
          <div className="mt-4 border-t border-[var(--border-color)] pt-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Notas
            </p>
            <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
              {account.notes}
            </p>
          </div>
        )}
      </Card>

      {/* Counterparty link (facturación) */}
      <Card>
        <div className="flex items-center gap-2">
          <Link2 size={15} style={{ color: '#2563eb' }} />
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Contraparte (facturación)
          </p>
        </div>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Vincula la cuenta a un tercero de Finanzas para facturar. No se crean contrapartes desde
          Comercial.
        </p>

        <div className="mt-3">
          {account.counterpartyId ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2">
              <div className="text-sm">
                <span className="font-medium text-[var(--text-primary)]">
                  {linked?.name ?? 'Contraparte vinculada'}
                </span>
                {linked?.taxId && (
                  <span className="ml-2 font-mono text-xs text-[var(--text-secondary)]">
                    {linked.taxId}
                  </span>
                )}
              </div>
              {canWrite && (
                <button
                  onClick={unlink}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  <Unlink size={12} /> Desvincular
                </button>
              )}
            </div>
          ) : canWrite ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                className="min-w-[240px] flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                <option value="">Seleccionar contraparte…</option>
                {counterparties.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.taxId ? ` — ${c.taxId}` : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={link}
                disabled={busy || !pick}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                style={{ background: '#2563eb' }}
              >
                <Link2 size={14} /> Vincular
              </button>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">Sin contraparte vinculada.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function EditButton({ account, onChanged }: { account: Account; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <Pencil size={14} /> Editar
      </button>
      {open && (
        <AccountFormModal
          editing={account}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      {children}
    </div>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </p>
      <p className={`text-sm text-[var(--text-primary)]${mono ? ' font-mono text-xs' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/comercial/cuentas"
      className="mt-2 inline-block text-sm"
      style={{ color: '#2563eb' }}
    >
      ← Volver a cuentas
    </Link>
  );
}
