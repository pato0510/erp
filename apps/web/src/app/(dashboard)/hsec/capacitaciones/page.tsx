/* HSEC-001 — placeholder for /hsec/capacitaciones. Replaced by HSEC-007 (trainings list,
   asistentes, planilla firmada). Reachable by direct URL only while the module card stays
   gated ("Próximamente"). */
export default function HsecCapacitacionesPage() {
  return (
    <div className="pt-2">
      <div className="mb-5 flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Capacitaciones
        </h1>
      </div>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Charlas, inducciones y capacitaciones con sus asistentes. Módulo en construcción.
      </p>
    </div>
  );
}
