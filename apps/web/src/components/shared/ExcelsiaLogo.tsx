'use client';

type LogoVariant = 'light' | 'dark';

interface ExcelsiaLogoProps {
  size?: number;
  variant?: LogoVariant;
  className?: string;
}

export function ExcelsiaLogo({ size = 28, variant = 'light', className }: ExcelsiaLogoProps) {
  const accent = '#2563EB';
  const triangleStroke = variant === 'light' ? accent : '#1C1C1E';
  const wordmarkColor = variant === 'light' ? '#ffffff' : '#1C1C1E';

  return (
    <div className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <polygon
          points="16,4 30,28 2,28"
          fill="none"
          stroke={triangleStroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <polygon points="16,12 23,26 9,26" fill={accent} opacity="0.18" />
        <circle cx="16" cy="22" r="1.8" fill={accent} />
      </svg>
      <span
        style={{
          fontFamily: 'var(--font-jetbrains-mono), var(--font-mono), monospace',
          fontWeight: 700,
          fontSize: Math.round(size * 0.52),
          letterSpacing: '0.14em',
          color: wordmarkColor,
        }}
      >
        EXCELSIA.
      </span>
    </div>
  );
}

export default ExcelsiaLogo;
