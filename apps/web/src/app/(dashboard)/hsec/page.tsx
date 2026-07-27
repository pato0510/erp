/* HSEC-001 — placeholder for the HSEC dashboard landing. Replaced by HSEC-010 (live-derived
   month counts). Reachable by direct URL only while the module card stays gated
   ("Próximamente") — the COM-015/MKT-010/CAL-007 pattern, step 1. */
export default function HsecDashboardPage() {
  return (
    <div className="pt-2">
      <div className="mb-5 flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          HSEC
        </h1>
      </div>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Salud, seguridad, medio ambiente y comunidades. Módulo en construcción — el dashboard con
        indicadores del mes llega en un ticket posterior.
      </p>
    </div>
  );
}
