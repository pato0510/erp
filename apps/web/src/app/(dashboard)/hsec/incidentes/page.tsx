/* HSEC-001 — placeholder for /hsec/incidentes. Replaced by HSEC-005 (incidents list, create/
   edit modal, status machine, afectados, adjuntos). Reachable by direct URL only while the
   module card stays gated ("Próximamente"). */
export default function HsecIncidentesPage() {
  return (
    <div className="pt-2">
      <div className="mb-5 flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Incidentes
        </h1>
      </div>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Registro de incidentes HSEC (accidentes, casi incidentes, daños materiales y eventos
        ambientales). Módulo en construcción.
      </p>
    </div>
  );
}
