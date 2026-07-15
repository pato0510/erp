'use client';

/* CAL-001 — shared placeholder shell for the Actividades sections. Each section
 * (Calendario, Áreas) renders this until its own ticket lands (CAL-005 Calendario,
 * CAL-002 Áreas). Tokens: accent #2563eb, Outfit headings, glassmorphism card
 * (var(--bg-card) + var(--border-color)) — the same language as the rest of the app. */
interface ActividadesPlaceholderProps {
  title: string;
  description: string;
}

export function ActividadesPlaceholder({ title, description }: ActividadesPlaceholderProps) {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <span
          style={{
            display: 'inline-block',
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#2563eb',
            marginBottom: 8,
          }}
        >
          Actividades
        </span>
        <h1
          style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 600,
            fontSize: 24,
            letterSpacing: '-0.01em',
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          {title}
        </h1>
      </div>

      <div
        className="card"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '48px 32px',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontSize: 15,
            color: 'var(--text-primary)',
            margin: '0 0 8px',
            fontWeight: 500,
          }}
        >
          {description}
        </p>
        <p
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            margin: 0,
          }}
        >
          En construcción
        </p>
      </div>
    </div>
  );
}

export default ActividadesPlaceholder;
