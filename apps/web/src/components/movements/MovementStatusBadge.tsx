const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  DRAFT: { label: 'Borrador', classes: 'bg-gray-100 text-gray-700' },
  CONFIRMED: { label: 'Confirmado', classes: 'bg-green-100 text-green-700' },
  RECONCILED: { label: 'Conciliado', classes: 'bg-blue-100 text-blue-700' },
  CANCELLED: { label: 'Cancelado', classes: 'bg-red-100 text-red-700' },
};

export function MovementStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.DRAFT;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.classes}`}
    >
      {config.label}
    </span>
  );
}
