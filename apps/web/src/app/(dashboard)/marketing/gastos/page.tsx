'use client';

import { useEffect, useState } from 'react';
import { DollarSign, Link2, Receipt, X } from 'lucide-react';
import { KpiCard } from '../../../../components/operations/dashboard/KpiCard';
import { apiClient } from '../../../../lib/api';
import { formatCLP, formatDate } from '../../../../lib/formatters';

/* ---- API shapes -------------------------------------------------- */

interface MarketingExpense {
  id: string;
  amount: string | number;
  date: string;
  description: string;
  channel: string | null;
  campaignId: string | null;
  campaignName: string | null;
  financeCategoryId: string | null;
  financeCategoryName: string | null;
}

interface Campaign {
  id: string;
  name: string;
  channel: string;
  status: string;
}

interface FinanceCategory {
  id: string;
  name: string;
  type: string;
}

interface CreateExpensePayload {
  amount: number;
  date: string;
  description: string;
  channel?: string;
  campaignId?: string;
  financeCategoryId?: string;
  financeCategoryName?: string;
}

/* ---- Helpers ----------------------------------------------------- */

/* Channel values are stored as human-readable strings (e.g. "Google Ads",
   "Meta", "LinkedIn", "Email", "SEO") — matched here for chip coloring. */
const CHANNEL_COLORS: Record<string, string> = {
  'Google Ads': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Meta: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  LinkedIn: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  Email: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  SEO: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  OTHER: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
};

function ChannelChip({ channel }: { channel: string | null }) {
  if (!channel) return <span className="text-[var(--text-secondary)]">—</span>;
  const cls = CHANNEL_COLORS[channel] ?? CHANNEL_COLORS.OTHER;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {channel}
    </span>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-[rgba(128,128,128,0.12)] ${className}`} />
  );
}

/* ---- Create Modal ------------------------------------------------ */

interface CreateModalProps {
  campaigns: Campaign[];
  categories: FinanceCategory[];
  onClose: () => void;
  onCreated: () => void;
}

const CHANNEL_OPTIONS = [
  { value: 'Google Ads', label: 'Google Ads' },
  { value: 'Meta', label: 'Meta' },
  { value: 'LinkedIn', label: 'LinkedIn' },
  { value: 'Email', label: 'Email' },
  { value: 'SEO', label: 'SEO' },
  { value: 'Otro', label: 'Otro' },
];

function CreateExpenseModal({ campaigns, categories, onClose, onCreated }: CreateModalProps) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [channel, setChannel] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [financeCategoryId, setFinanceCategoryId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCategory = categories.find((c) => c.id === financeCategoryId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError('Ingresa un monto válido mayor a 0.');
      return;
    }
    if (!date) {
      setError('La fecha es obligatoria.');
      return;
    }
    if (!description.trim()) {
      setError('La descripción es obligatoria.');
      return;
    }

    const payload: CreateExpensePayload = {
      amount: parsedAmount,
      date,
      description: description.trim(),
    };
    if (channel) payload.channel = channel;
    if (campaignId) payload.campaignId = campaignId;
    if (financeCategoryId && selectedCategory) {
      payload.financeCategoryId = financeCategoryId;
      payload.financeCategoryName = selectedCategory.name;
    }

    setSaving(true);
    try {
      await apiClient.post('/api/marketing/expenses', payload);
      onCreated();
    } catch {
      setError('No se pudo guardar el gasto. Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full rounded-lg border border-[var(--border-color)] bg-[rgba(128,128,128,0.06)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent transition-all';
  const labelCls = 'block mb-1.5 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <h2
            className="text-base font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
          >
            Nuevo gasto
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[rgba(128,128,128,0.1)] transition-colors"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Amount */}
          <div>
            <label className={labelCls}>Monto (CLP)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="ej. 150000"
              className={inputCls}
              required
            />
          </div>

          {/* Date */}
          <div>
            <label className={labelCls}>Fecha</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Descripción</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ej. Pauta Google Ads — mayo"
              className={inputCls}
              required
            />
          </div>

          {/* Channel */}
          <div>
            <label className={labelCls}>Canal (opcional)</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className={inputCls}
            >
              <option value="">Sin canal</option>
              {CHANNEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Campaign */}
          <div>
            <label className={labelCls}>Campaña (opcional)</label>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className={inputCls}
            >
              <option value="">Sin campaña</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Finance Category — reference only */}
          <div>
            <label className={labelCls}>Categoría financiera (referencia, opcional)</label>
            <select
              value={financeCategoryId}
              onChange={(e) => setFinanceCategoryId(e.target.value)}
              className={inputCls}
            >
              <option value="">Sin categoría</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {financeCategoryId && (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Solo referencia — no crea movimiento en Finanzas.
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2 border-t border-[var(--border-color)] mt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[rgba(128,128,128,0.08)] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Guardando…' : 'Guardar gasto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---- Page -------------------------------------------------------- */

export default function MarketingGastosPage() {
  const [expenses, setExpenses] = useState<MarketingExpense[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterChannel, setFilterChannel] = useState('');
  const [showModal, setShowModal] = useState(false);

  /* Fetch expenses */
  function loadExpenses() {
    setLoading(true);
    apiClient
      .get<MarketingExpense[]>('/api/marketing/expenses')
      .then((data) => setExpenses(data))
      .catch(() => setError('No se pudieron cargar los gastos de marketing.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadExpenses();
  }, []);

  /* Fetch campaigns for modal */
  useEffect(() => {
    apiClient
      .get<Campaign[]>('/api/marketing/campaigns')
      .then((data) => setCampaigns(data))
      .catch(() => {/* non-fatal */});
  }, []);

  /* Fetch finance categories for modal */
  useEffect(() => {
    apiClient
      .get<FinanceCategory[]>('/api/marketing/finance-categories')
      .then((data) => setCategories(data))
      .catch(() => {/* non-fatal */});
  }, []);

  /* Derived values */
  const filteredExpenses = filterChannel
    ? expenses.filter((e) => e.channel === filterChannel)
    : expenses;

  const totalAmount = filteredExpenses.reduce(
    (acc, e) => acc + Number(e.amount),
    0,
  );
  const linkedCount = filteredExpenses.filter((e) => e.campaignId !== null).length;

  /* Unique channels for filter chips */
  const availableChannels = Array.from(
    new Set(expenses.map((e) => e.channel).filter(Boolean)),
  ) as string[];

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
          >
            Gastos de Marketing
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Registro y seguimiento de inversión por canal y campaña
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#2563eb] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1d4ed8] transition-colors shadow-sm shrink-0"
        >
          <Receipt size={15} aria-hidden />
          Nuevo gasto
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))
        ) : (
          <>
            <KpiCard
              label="Gasto total"
              value={formatCLP(totalAmount)}
              subtitle={filterChannel ? `Filtrado por ${filterChannel}` : 'Todos los canales'}
              icon={DollarSign}
            />
            <KpiCard
              label="N° de gastos"
              value={String(filteredExpenses.length)}
              subtitle="Registros en el período"
              icon={Receipt}
            />
            <KpiCard
              label="Vinculados a campaña"
              value={String(linkedCount)}
              subtitle={`${filteredExpenses.length > 0 ? Math.round((linkedCount / filteredExpenses.length) * 100) : 0}% del total`}
              icon={Link2}
              valueColor={linkedCount > 0 ? '#2563eb' : undefined}
            />
          </>
        )}
      </div>

      {/* Filter chips by canal */}
      {!loading && availableChannels.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => setFilterChannel('')}
            className={[
              'rounded-full px-3 py-1 text-xs font-semibold transition-colors border',
              filterChannel === ''
                ? 'bg-[#2563eb] text-white border-[#2563eb]'
                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[#2563eb] hover:text-[#2563eb]',
            ].join(' ')}
          >
            Todos
          </button>
          {availableChannels.map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setFilterChannel(ch === filterChannel ? '' : ch)}
              className={[
                'rounded-full px-3 py-1 text-xs font-semibold transition-colors border',
                filterChannel === ch
                  ? 'bg-[#2563eb] text-white border-[#2563eb]'
                  : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[#2563eb] hover:text-[#2563eb]',
              ].join(' ')}
            >
              {ch}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="py-16 text-center">
            <Receipt size={40} className="mx-auto mb-3 text-[var(--text-secondary)] opacity-40" />
            <p className="text-sm font-medium text-[var(--text-secondary)]">
              {filterChannel ? 'No hay gastos para este canal.' : 'No hay gastos registrados.'}
            </p>
            {!filterChannel && (
              <p className="mt-1 text-xs text-[var(--text-secondary)] opacity-70">
                Usa "Nuevo gasto" para registrar tu primer gasto de marketing.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-color)] bg-[rgba(128,128,128,0.04)]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Descripción
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Canal
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Campaña
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Categoría
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Monto
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((expense) => (
                  <tr
                    key={expense.id}
                    className="border-b border-[var(--border-color)] last:border-0 hover:bg-[rgba(128,128,128,0.04)] transition-colors"
                  >
                    <td className="px-4 py-3 text-[var(--text-secondary)] whitespace-nowrap">
                      {formatDate(expense.date)}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)] max-w-[280px] truncate">
                      {expense.description}
                    </td>
                    <td className="px-4 py-3">
                      <ChannelChip channel={expense.channel} />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] max-w-[180px] truncate">
                      {expense.campaignName ?? <span className="opacity-40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] max-w-[180px] truncate">
                      {expense.financeCategoryName ?? <span className="opacity-40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--text-primary)] whitespace-nowrap">
                      {formatCLP(Number(expense.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Total row */}
              {filteredExpenses.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-[var(--border-color)] bg-[rgba(37,99,235,0.04)]">
                    <td colSpan={5} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                      Total ({filteredExpenses.length} gastos)
                    </td>
                    <td className="px-4 py-3 text-right text-base font-bold text-[#2563eb] whitespace-nowrap">
                      {formatCLP(totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <CreateExpenseModal
          campaigns={campaigns}
          categories={categories}
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            loadExpenses();
          }}
        />
      )}
    </div>
  );
}
