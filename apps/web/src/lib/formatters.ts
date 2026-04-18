export function formatCLP(amount: number): string {
  return '$' + Math.round(amount).toLocaleString('es-CL');
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
