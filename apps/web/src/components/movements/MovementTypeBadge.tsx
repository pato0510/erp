export function MovementTypeBadge({ type }: { type: string }) {
  if (type === 'INCOME') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
        <span className="text-sm">↑</span> Ingreso
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
      <span className="text-sm">↓</span> Egreso
    </span>
  );
}
