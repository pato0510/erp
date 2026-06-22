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

/**
 * Formats a Chilean RUT for display: thousands dots on the body + '-DV'.
 * Accepts already-formatted, hyphen-only, or raw digit strings and is tolerant
 * of dots/spaces. e.g. '123456789' or '12345678-9' → '12.345.678-9'.
 */
export function formatRUT(rut: string): string {
  if (!rut) return '';
  const clean = rut.replace(/[.\s]/g, '').toUpperCase();
  const match = clean.match(/^(\d+)-?([0-9K])?$/);
  if (!match) return rut;
  let body = match[1];
  let dv = match[2];
  // If no explicit DV separator, treat the last char as the check digit.
  if (dv === undefined && body.length > 1) {
    dv = body.slice(-1);
    body = body.slice(0, -1);
  }
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dv !== undefined ? `${withDots}-${dv}` : withDots;
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
