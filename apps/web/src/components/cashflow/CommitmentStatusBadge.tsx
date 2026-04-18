const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  PENDING: { label: 'Pendiente', classes: 'bg-yellow-100 text-yellow-700' },
  PAID: { label: 'Pagado', classes: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'Cancelado', classes: 'bg-gray-100 text-gray-500' },
};

export function CommitmentStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.classes}`}
    >
      {config.label}
    </span>
  );
}
