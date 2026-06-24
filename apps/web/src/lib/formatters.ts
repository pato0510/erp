export function formatCLP(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return '$0';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '$0';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatRelativeDate(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'hoy';
  if (diffDays === 1) return 'mañana';
  if (diffDays === -1) return 'ayer';
  if (diffDays > 0) return `en ${diffDays} días`;
  return `hace ${Math.abs(diffDays)} días`;
}

// HR-001 — Chilean RUT helpers. Canonical implementation lives in @erp/utils
// (shared with the api for DTO validation); surfaced here so the frontend keeps
// importing all formatters from one place.
export { formatRUT, validateRut, cleanRut, computeRutDv } from '@erp/utils';
