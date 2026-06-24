'use client';

/* HR-001 — RRHH landing shell. Empty scaffold: sidebar (via the dashboard
 * layout's isRrhh branch) + a title. Real screens (empleados, contratos,
 * documentos, certificaciones, vacaciones, liquidaciones) arrive in later
 * tickets. Design tokens only: accent #2563eb, headings Outfit. */
export default function RrhhPage() {
  return (
    <div className="pt-2">
      <div className="flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full" style={{ background: '#2563eb' }} />
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
        >
          Recursos Humanos
        </h1>
      </div>
      <p className="mt-2 max-w-xl text-sm text-[var(--text-secondary)]">
        Estructura inicial del módulo RRHH (HR-001). Las pantallas de empleados, contratos,
        documentos, certificaciones, vacaciones y liquidaciones se construirán en los próximos
        tickets.
      </p>
    </div>
  );
}
