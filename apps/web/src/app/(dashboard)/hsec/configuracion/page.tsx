/* HSEC-001 — placeholder for /hsec/configuracion. Replaced by HSEC-009 (EPP catalog CRUD +
   "Cargar catálogo chileno" seed button). Reachable by direct URL only while the module card
   stays gated ("Próximamente"). */
export default function HsecConfiguracionPage() {
  return (
    <div className="pt-2">
      <div className="mb-5 flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Configuración
        </h1>
      </div>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Catálogo de elementos de protección personal y ajustes del módulo HSEC. Módulo en
        construcción.
      </p>
    </div>
  );
}
