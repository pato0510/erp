/* COM-025 — an Enterprise's own Activa / Inactiva badge (its isActive flag). Empresas no
 * longer borrows the ACCOUNT status badge: that one reads «Cliente» for ACTIVA, and an
 * enterprise is never a «Cliente». Semantic green for active, neutral tokens otherwise. */
export function EnterpriseStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
        isActive
          ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200'
          : 'bg-subtle text-fg-secondary'
      }`}
    >
      {isActive ? 'Activa' : 'Inactiva'}
    </span>
  );
}

export default EnterpriseStatusBadge;
