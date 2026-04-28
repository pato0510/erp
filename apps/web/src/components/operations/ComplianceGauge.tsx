'use client';

interface Props {
  /* 0–100. Anything outside is clamped before rendering. */
  percentage: number;
  /* Diameter of the SVG in px. Defaults to 180 — large enough for the
     primary "carpeta" view, small enough for inline use. */
  size?: number;
  /* Optional sub-line under the percentage (e.g. "X de Y al día"). */
  subtitle?: string;
  /* Optional small caption shown below the subtitle (e.g. timestamp). */
  caption?: string;
}

/* OPS-017 — circular compliance gauge. Renders a 270° arc track with a
   colored fill that grows with `percentage`. The same color thresholds
   used by the central documents page (>=90% green, 70–90% yellow,
   <70% red) so the visual language is consistent across the module. */
export function ComplianceGauge({ percentage, size = 180, subtitle, caption }: Props) {
  const pct = Math.max(0, Math.min(100, percentage));
  const color = pct >= 90 ? '#15803d' : pct >= 70 ? '#a16207' : '#b91c1c';

  /* We draw a 270° arc (135° → 405°) so the bottom 90° is empty — leaves
     visual room for the subtitle without crowding. */
  const stroke = Math.max(8, Math.round(size * 0.09));
  const radius = size / 2 - stroke;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = 135;
  const totalSweep = 270;
  const fillSweep = (pct / 100) * totalSweep;

  const trackPath = describeArc(cx, cy, radius, startAngle, startAngle + totalSweep);
  const fillPath = describeArc(cx, cy, radius, startAngle, startAngle + Math.max(0.01, fillSweep));

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <path
            d={trackPath}
            fill="none"
            stroke="rgba(100, 116, 139, 0.18)"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          <path
            d={fillPath}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 600ms ease, d 600ms ease' }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: size * 0.05,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 700,
              fontSize: Math.round(size * 0.26),
              letterSpacing: '-0.02em',
              color,
              lineHeight: 1,
            }}
          >
            {pct.toFixed(pct % 1 === 0 ? 0 : 1)}%
          </span>
          <span
            className="text-[var(--text-secondary)]"
            style={{
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
              fontSize: Math.max(9, Math.round(size * 0.07)),
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              marginTop: 4,
            }}
          >
            cumplimiento
          </span>
        </div>
      </div>
      {subtitle && (
        <p
          className="text-[var(--text-primary)] text-center"
          style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontSize: 13,
            fontWeight: 500,
            margin: '6px 0 0',
          }}
        >
          {subtitle}
        </p>
      )}
      {caption && (
        <p
          className="text-[var(--text-muted)] text-center"
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 11,
            margin: 0,
          }}
        >
          {caption}
        </p>
      )}
    </div>
  );
}

/* SVG arc path utility — converts angle/radius into the d="M…A…" form
   that <path> expects. Angles are in degrees, measured clockwise from
   12 o'clock (CSS conventions adjusted to SVG's 3 o'clock origin). */
function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export default ComplianceGauge;
