'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '../../../../lib/api';

const schema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: z.number().min(1, 'Monto debe ser mayor a 0'),
  dueDate: z.string().min(1, 'Fecha de vencimiento es requerida'),
  description: z.string().min(1, 'Descripción es requerida').max(500),
  counterpartyId: z.string().optional(),
  categoryId: z.string().optional(),
  fiscalPeriodId: z.string().uuid('Período fiscal es requerido'),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface SelectOption {
  id: string;
  name: string;
}

export default function NuevoCompromisoPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [counterparties, setCounterparties] = useState<SelectOption[]>([]);
  const [periods, setPeriods] = useState<SelectOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'EXPENSE' },
  });

  const selectedType = watch('type');

  useEffect(() => {
    const typeFilter = selectedType === 'INCOME' ? '?type=INCOME' : '?type=EXPENSE';
    apiClient
      .get<SelectOption[]>(`/api/categories${typeFilter}`)
      .then(setCategories)
      .catch(() => undefined);
  }, [selectedType]);

  useEffect(() => {
    Promise.all([
      apiClient
        .get<{ data: SelectOption[] }>('/api/counterparties?limit=100')
        .then((r) => setCounterparties(r.data)),
      apiClient.get<SelectOption[]>('/api/fiscal-periods?year=2026').then(setPeriods),
    ]).catch(() => undefined);
  }, []);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    setError('');
    try {
      await apiClient.post('/api/cashflow/commitments', {
        ...data,
        counterpartyId: data.counterpartyId || undefined,
        categoryId: data.categoryId || undefined,
      });
      router.push('/caja');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear compromiso');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nuevo Compromiso</h1>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white border border-gray-200 rounded-xl p-6 space-y-5"
      >
        {/* Type toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
          <div className="flex gap-2">
            {(['EXPENSE', 'INCOME'] as const).map((t) => (
              <label
                key={t}
                className={`flex-1 text-center py-3 rounded-lg border-2 cursor-pointer transition font-medium text-sm ${
                  selectedType === t
                    ? t === 'INCOME'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <input type="radio" value={t} {...register('type')} className="sr-only" />
                {t === 'INCOME' ? '↑ Ingreso comprometido' : '↓ Egreso comprometido'}
              </label>
            ))}
          </div>
        </div>

        {/* Amount + Due Date */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Monto (CLP)</label>
            <input
              type="number"
              step="1"
              {...register('amount', { valueAsNumber: true })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="1000000"
            />
            {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de vencimiento
            </label>
            <input
              type="date"
              {...register('dueDate')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            {errors.dueDate && (
              <p className="text-red-500 text-xs mt-1">{errors.dueDate.message}</p>
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
          <input
            type="text"
            {...register('description')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Descripción del compromiso"
          />
          {errors.description && (
            <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>
          )}
        </div>

        {/* Category + Period */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categoría <span className="text-gray-400">(opcional)</span>
            </label>
            <select
              {...register('categoryId')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Período Fiscal</label>
            <select
              {...register('fiscalPeriodId')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">Seleccionar...</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {errors.fiscalPeriodId && (
              <p className="text-red-500 text-xs mt-1">{errors.fiscalPeriodId.message}</p>
            )}
          </div>
        </div>

        {/* Counterparty + Notes */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contraparte <span className="text-gray-400">(opcional)</span>
            </label>
            <select
              {...register('counterpartyId')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">Sin contraparte</option>
              {counterparties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas <span className="text-gray-400">(opcional)</span>
            </label>
            <input
              type="text"
              {...register('notes')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {isSubmitting ? 'Guardando...' : 'Crear Compromiso'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/caja')}
            className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
