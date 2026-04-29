import Link from 'next/link';
import { ExcelsiaLogo } from '../../../../components/shared/ExcelsiaLogo';
import { ComplianceGauge } from '../../../../components/operations/ComplianceGauge';
import {
  DocumentStatusBadge,
  type DerivedDocumentStatus,
} from '../../../../components/operations/DocumentStatusBadge';

/* OPS-035 — public scan target. Lives outside the (dashboard)
   route group so it inherits only the root layout (fonts + theme),
   no sidebar, no auth gate, no topbar. The page is mobile-first;
   most scans come from a phone next to the asset.

   Server-rendered for two reasons:
   1. A printed sticker should resolve to readable HTML even without
      JavaScript (think: low-bandwidth field connectivity).
   2. The public view is intentionally cacheable per token at the CDN
      layer if we ever decide to. Server fetch keeps that door open. */

type StatusColor = 'green' | 'yellow' | 'red' | 'gray';

interface PublicDocument {
  typeName: string;
  typeCode: string;
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'VIGENTE' | 'POR_VENCER' | 'VENCIDO' | 'FALTANTE';
  expirationDate: string | null;
  daysRemaining: number | null;
}

interface PublicAssetView {
  code: string;
  name: string;
  status: string;
  statusLabel: string;
  statusColor: StatusColor;
  type: { name: string; icon: string | null };
  subtype: { name: string } | null;
  location: { name: string } | null;
  photo: { url: string } | null;
  documentCompliance: {
    totalRequired: number;
    valid: number;
    expiringSoon: number;
    expired: number;
    missing: number;
    compliancePercentage: number;
    documents: PublicDocument[];
  };
  activeAlerts: number;
  hasActiveException: boolean;
  exceptionExpiresAt: string | null;
  scannedAt: string;
  scanCount: number;
  meta: {
    publicView: true;
    canSeeMore: false;
    company: { name: string };
  };
}

const STATUS_BADGE: Record<StatusColor, { bg: string; fg: string; ring: string; dot: string }> = {
  green: {
    bg: 'rgba(34, 197, 94, 0.12)',
    fg: '#15803d',
    ring: 'rgba(34, 197, 94, 0.35)',
    dot: '#16a34a',
  },
  yellow: {
    bg: 'rgba(234, 179, 8, 0.14)',
    fg: '#a16207',
    ring: 'rgba(234, 179, 8, 0.4)',
    dot: '#ca8a04',
  },
  red: {
    bg: 'rgba(239, 68, 68, 0.12)',
    fg: '#b91c1c',
    ring: 'rgba(239, 68, 68, 0.4)',
    dot: '#dc2626',
  },
  gray: {
    bg: 'rgba(100, 116, 139, 0.14)',
    fg: '#475569',
    ring: 'rgba(100, 116, 139, 0.35)',
    dot: '#64748b',
  },
};

async function fetchPublicAsset(qrToken: string): Promise<PublicAssetView | null> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  try {
    const res = await fetch(
      `${apiBase}/api/operations/public/asset/${encodeURIComponent(qrToken)}`,
      { cache: 'no-store' },
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as PublicAssetView;
  } catch {
    return null;
  }
}

function formatDateEs(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTimeEs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface PageProps {
  params: Promise<{ qrToken: string }>;
}

export default async function PublicAssetPage({ params }: PageProps) {
  const { qrToken } = await params;
  const data = await fetchPublicAsset(qrToken);
  if (!data) {
    /* notFound() would render Next's generic 404. Render our own
       branded screen instead so the visitor sees Excelsia, not a
       framework default. */
    return <NotFoundScreen />;
  }

  const badge = STATUS_BADGE[data.statusColor];
  const isBlocked = data.status === 'BLOCKED_DOCUMENTAL' || data.status === 'BLOCKED_PERMIT';

  return (
    <main
      className="min-h-screen w-full"
      style={{
        background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 60%, #f8fafc 100%)',
        color: '#0f172a',
        fontFamily: 'var(--font-outfit), sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          margin: '0 auto',
          padding: '24px 16px 60px',
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <ExcelsiaLogo size={26} variant="dark" />
          <span
            style={{
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#64748b',
            }}
          >
            Verificación de activo
          </span>
        </header>

        {/* Identification card */}
        <section
          aria-label="Identificación del activo"
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: 18,
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 12,
              letterSpacing: '0.12em',
              color: '#64748b',
              marginBottom: 4,
            }}
          >
            {data.type.name.toUpperCase()}
            {data.subtype ? ` · ${data.subtype.name.toUpperCase()}` : ''}
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontWeight: 700,
              fontSize: 28,
              letterSpacing: '0.02em',
              color: '#0f172a',
              margin: '0 0 4px',
            }}
          >
            {data.code}
          </h1>
          <p
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: '#0f172a',
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            {data.name}
          </p>
          {data.location && (
            <p
              style={{
                marginTop: 10,
                fontSize: 13,
                color: '#475569',
              }}
            >
              📍 {data.location.name}
            </p>
          )}

          {/* Big status badge — the most important info at a glance */}
          <div
            role="status"
            aria-label={`Estado del activo: ${data.statusLabel}`}
            style={{
              marginTop: 14,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 18px',
              borderRadius: 999,
              background: badge.bg,
              color: badge.fg,
              border: `1.5px solid ${badge.ring}`,
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: '0.01em',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: badge.dot,
                boxShadow: `0 0 0 4px ${badge.bg}`,
              }}
            />
            {data.statusLabel}
          </div>
        </section>

        {/* Conditional banners */}
        {isBlocked && <BlockedBanner />}
        {data.hasActiveException && <ExceptionBanner expiresAt={data.exceptionExpiresAt} />}

        {/* Compliance gauge */}
        <section
          aria-label="Cumplimiento documental"
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: 16,
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          <ComplianceGauge
            percentage={data.documentCompliance.compliancePercentage}
            size={160}
            subtitle={`${data.documentCompliance.valid} de ${data.documentCompliance.totalRequired} documentos al día`}
          />
          <div
            style={{
              marginTop: 14,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
              width: '100%',
              fontSize: 11,
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              textAlign: 'center',
            }}
          >
            <ComplianceMiniStat
              label="Vigentes"
              value={data.documentCompliance.valid}
              fg="#15803d"
            />
            <ComplianceMiniStat
              label="Por vencer"
              value={data.documentCompliance.expiringSoon}
              fg="#a16207"
            />
            <ComplianceMiniStat
              label="Vencidos"
              value={data.documentCompliance.expired}
              fg="#b91c1c"
            />
            <ComplianceMiniStat
              label="Faltantes"
              value={data.documentCompliance.missing}
              fg="#b91c1c"
            />
          </div>
        </section>

        {/* Documents list */}
        <section
          aria-label="Documentos requeridos"
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: 4,
            marginBottom: 16,
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          {data.documentCompliance.documents.length === 0 ? (
            <p
              style={{
                padding: 20,
                textAlign: 'center',
                color: '#64748b',
                fontSize: 13,
              }}
            >
              Sin documentos requeridos.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.documentCompliance.documents.map((doc, idx) => (
                <li
                  key={`${doc.typeCode}-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderBottom:
                      idx === data.documentCompliance.documents.length - 1
                        ? 'none'
                        : '1px solid #f1f5f9',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-outfit), sans-serif',
                        fontWeight: 500,
                        fontSize: 14,
                        color: '#0f172a',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {doc.typeName}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-jetbrains-mono), monospace',
                        fontSize: 11,
                        color: '#64748b',
                        marginTop: 2,
                      }}
                    >
                      {doc.typeCode}
                      {doc.criticality === 'CRITICAL' ? ' · CRÍTICO' : ''}
                      {doc.expirationDate ? ` · vence ${formatDateEs(doc.expirationDate)}` : ''}
                    </div>
                  </div>
                  <DocumentStatusBadge
                    status={doc.status as DerivedDocumentStatus}
                    hint={
                      doc.daysRemaining !== null && doc.status === 'POR_VENCER'
                        ? `(${doc.daysRemaining} d)`
                        : doc.daysRemaining !== null && doc.status === 'VENCIDO'
                          ? `(${Math.abs(doc.daysRemaining)} d)`
                          : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Active alerts pill */}
        {data.activeAlerts > 0 && (
          <section
            aria-label={`${data.activeAlerts} alertas activas en este activo`}
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 14,
              color: '#b91c1c',
              fontWeight: 500,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span aria-hidden>⚠</span>
            {data.activeAlerts} alerta{data.activeAlerts === 1 ? '' : 's'} activa
            {data.activeAlerts === 1 ? '' : 's'}
          </section>
        )}

        {/* CTAs */}
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: 24,
          }}
        >
          <Link
            href={`/login?next=${encodeURIComponent('/operaciones/equipos')}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '12px 18px',
              borderRadius: 999,
              background: '#1C1C1E',
              color: '#ffffff',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Iniciar sesión para ver el detalle completo
          </Link>
        </section>

        {/* Footer */}
        <footer
          style={{
            textAlign: 'center',
            color: '#94a3b8',
            fontSize: 11,
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            lineHeight: 1.6,
          }}
        >
          {data.meta.company.name}
          <br />
          Escaneado {formatDateTimeEs(data.scannedAt)}
          <br />
          <span aria-label={`Este código ha sido escaneado ${data.scanCount} veces`}>
            Total de escaneos: {data.scanCount}
          </span>
          <br />
          <br />
          Powered by Excelsia ERP
        </footer>
      </div>
    </main>
  );
}

function ComplianceMiniStat({ label, value, fg }: { label: string; value: number; fg: string }) {
  return (
    <div
      style={{
        background: '#f8fafc',
        borderRadius: 8,
        padding: '8px 4px',
      }}
    >
      <div style={{ color: fg, fontWeight: 700, fontSize: 16 }}>{value}</div>
      <div
        style={{
          color: '#64748b',
          fontSize: 9,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function BlockedBanner() {
  return (
    <section
      role="alert"
      aria-label="Activo bloqueado"
      style={{
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1.5px solid rgba(239, 68, 68, 0.35)',
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 12,
        color: '#b91c1c',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 14,
          marginBottom: 2,
        }}
      >
        ⛔ Activo bloqueado
      </div>
      <div style={{ fontSize: 13, color: '#7f1d1d' }}>
        Este activo no puede ser operado hasta resolver los documentos / permisos pendientes.
      </div>
    </section>
  );
}

function ExceptionBanner({ expiresAt }: { expiresAt: string | null }) {
  return (
    <section
      role="status"
      aria-label="Excepción activa"
      style={{
        background: 'rgba(234, 179, 8, 0.10)',
        border: '1.5px solid rgba(234, 179, 8, 0.35)',
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 12,
        color: '#a16207',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
        🟡 Operando bajo excepción
      </div>
      <div style={{ fontSize: 13, color: '#854d0e' }}>
        Vigencia hasta {expiresAt ? formatDateEs(expiresAt) : '—'}
      </div>
    </section>
  );
}

function NotFoundScreen() {
  return (
    <main
      className="min-h-screen w-full flex flex-col items-center justify-center"
      style={{
        background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 60%, #f8fafc 100%)',
        color: '#0f172a',
        fontFamily: 'var(--font-outfit), sans-serif',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <ExcelsiaLogo size={32} variant="dark" />
      <h1
        style={{
          marginTop: 32,
          fontFamily: 'var(--font-outfit), sans-serif',
          fontSize: 22,
          fontWeight: 600,
          color: '#0f172a',
        }}
      >
        Código QR no válido
      </h1>
      <p
        style={{
          marginTop: 8,
          maxWidth: 360,
          fontSize: 14,
          color: '#475569',
          lineHeight: 1.5,
        }}
      >
        Este código QR no es válido o ha sido revocado. Si crees que es un error, contacta al
        administrador del activo.
      </p>
      <Link
        href="/login"
        style={{
          marginTop: 24,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 18px',
          borderRadius: 999,
          background: '#1C1C1E',
          color: '#ffffff',
          fontWeight: 500,
          fontSize: 14,
          textDecoration: 'none',
        }}
      >
        Ir a Excelsia
      </Link>
    </main>
  );
}
