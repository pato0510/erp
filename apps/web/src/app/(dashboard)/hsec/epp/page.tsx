/* HSEC-001 — placeholder for /hsec/epp. Replaced by HSEC-009 (deliveries list + create/edit
   with item lines + acuse). Reachable by direct URL only while the module card stays gated
   ("Próximamente"). */
export default function HsecEppPage() {
  return (
    <div className="pt-2">
      <div className="mb-5 flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Entregas de EPP
        </h1>
      </div>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Registro de entregas de elementos de protección personal por trabajador. Módulo en
        construcción.
      </p>
    </div>
  );
}
