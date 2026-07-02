/* COM-001 — Comercial (CRM) route namespace + placeholder landing.
 *
 * Skeleton only: no features until COM-002+. The module menu tile stays gated
 * ("Próximamente") until COM-015 — this page is reachable by direct URL during
 * development, mirroring how /rrhh was built before its menu un-gate. Matches the
 * current design system (Outfit headings via --font-display, #2563eb accent via
 * --color-accent, glassmorphism .card). DarkGradientBackground + sidebar come
 * from the (dashboard) layout. */
export default function ComercialPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 0' }}>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-accent)',
          margin: '0 0 12px',
        }}
      >
        Módulo Comercial
      </p>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 30,
          letterSpacing: '-0.01em',
          color: 'var(--text-primary)',
          margin: '0 0 12px',
        }}
      >
        Comercial (CRM)
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 15,
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
          margin: '0 0 28px',
        }}
      >
        Pipeline de ventas, cuentas y contactos, oportunidades, cotizaciones y catálogo de
        servicios. El módulo está en construcción.
      </p>

      <div
        className="card"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 22px',
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            color: 'var(--text-secondary)',
          }}
        >
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Próximamente.</span> El
          shell (COM-001) está listo; las funcionalidades llegan en los tickets COM-002 y
          siguientes.
        </p>
      </div>
    </div>
  );
}
