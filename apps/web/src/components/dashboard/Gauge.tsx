'use client';

interface GaugeProps {
  percentage: number;
  fillColor: string;
  centerText: string;
  ariaLabel?: string;
}

const ARC_LENGTH = 251;

export function Gauge({ percentage, fillColor, centerText, ariaLabel }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const dashLength = (clamped / 100) * ARC_LENGTH;

  return (
    <svg
      viewBox="0 0 200 130"
      className="w-full max-w-[260px]"
      role="img"
      aria-label={ariaLabel ?? 'Gauge'}
    >
      <path
        d="M 20 100 A 80 80 0 0 1 180 100"
        fill="none"
        stroke="#e8eaed"
        strokeWidth={14}
        strokeLinecap="round"
      />
      <path
        d="M 20 100 A 80 80 0 0 1 180 100"
        fill="none"
        stroke={fillColor}
        strokeWidth={14}
        strokeLinecap="round"
        strokeDasharray={`${dashLength} ${ARC_LENGTH}`}
      />
      <text
        x={100}
        y={90}
        textAnchor="middle"
        fontFamily="var(--font-outfit), sans-serif"
        fontWeight={600}
        fontSize={26}
        fill="var(--text-primary)"
      >
        {centerText}
      </text>
      <text
        x={20}
        y={120}
        textAnchor="middle"
        fontFamily="var(--font-outfit), sans-serif"
        fontSize={10}
        fill="var(--text-muted)"
      >
        0%
      </text>
      <text
        x={180}
        y={120}
        textAnchor="middle"
        fontFamily="var(--font-outfit), sans-serif"
        fontSize={10}
        fill="var(--text-muted)"
      >
        100%
      </text>
    </svg>
  );
}
