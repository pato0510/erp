'use client';

interface PlaceholderPageProps {
  title: string;
  description: string;
  breadcrumb?: string;
}

export function PlaceholderPage({ title, description, breadcrumb }: PlaceholderPageProps) {
  return (
    <div className="ops-placeholder">
      {breadcrumb && <div className="ops-breadcrumb">{breadcrumb}</div>}
      <h1 className="ops-title">{title}</h1>
      <p className="ops-subtitle">PRÓXIMAMENTE</p>
      <div className="ops-card">
        <p>{description}</p>
      </div>
      <style jsx global>{`
        .ops-placeholder {
          max-width: 720px;
        }
        .ops-breadcrumb {
          font-family: var(--font-ibm-plex-mono), var(--font-jetbrains-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.5);
          margin-bottom: 18px;
        }
        html.dark .ops-breadcrumb {
          color: rgba(255, 255, 255, 0.5);
        }
        .ops-title {
          font-family: var(--font-outfit), sans-serif;
          font-weight: 600;
          font-size: 32px;
          letter-spacing: -0.01em;
          color: var(--text-primary);
          margin: 0 0 10px;
        }
        .ops-subtitle {
          font-family: var(--font-ibm-plex-mono), var(--font-jetbrains-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--text-secondary);
          margin: 0 0 32px;
        }
        .ops-card {
          padding: 24px 28px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
        }
        html.dark .ops-card {
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .ops-card p {
          margin: 0;
          font-family: var(--font-outfit), sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}

export default PlaceholderPage;
