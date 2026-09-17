/* UI-003 — the Excelsia brand (isotype "EXCELSIA" arrow mark + wordmark), rendered from
 * the designer's SVGs in public/brand — never redrawn, recolored, filtered or stretched.
 * Plain <img> (the codebase has no next/image usage and no image-optimizer config).
 *   variant: 'horizontal' (1700×430) | 'vertical' (1254×960) | 'isotype' (740×740)
 *   tone:    'color'   → color asset (light backgrounds)
 *            'inverse' → "inverso" asset (steel blue + white, dark backgrounds)
 *            'white'   → monochrome white (isotype only; gradient/portal surfaces)
 *            'auto'    → color on light, inverse on html.dark — two <img>, toggled by
 *                        CSS (`dark:hidden` / `dark:block`), no JS theme read, no flicker
 *   height:  the rendered height; width follows the file's aspect ratio.
 *   alt:     "Excelsia" for informative usages; '' when a visible label sits next to it.
 * Guide minimums (horizontal 240 px wide, isotype 32 px) are the caller's responsibility. */

export type LogoVariant = 'horizontal' | 'vertical' | 'isotype';
export type LogoTone = 'auto' | 'color' | 'inverse' | 'white';

interface ExcelsiaLogoProps {
  variant?: LogoVariant;
  tone?: LogoTone;
  height?: number;
  alt?: string;
  className?: string;
}

const RATIO: Record<LogoVariant, number> = {
  horizontal: 1700 / 430,
  vertical: 1254 / 960,
  isotype: 1,
};

const FILE: Record<LogoVariant, string> = {
  horizontal: 'excelsia_logo_horizontal',
  vertical: 'excelsia_logo_vertical',
  isotype: 'excelsia_isotipo',
};

function src(variant: LogoVariant, tone: Exclude<LogoTone, 'auto'>): string {
  // The monochrome white file exists only for the isotype; other variants fall back to
  // the inverse asset (steel blue + white), which the guide allows on dark surfaces.
  const suffix =
    tone === 'white'
      ? variant === 'isotype'
        ? 'blanco'
        : 'inverso'
      : tone === 'inverse'
        ? 'inverso'
        : 'color';
  return `/brand/${FILE[variant]}_${suffix}.svg`;
}

export function ExcelsiaLogo({
  variant = 'horizontal',
  tone = 'auto',
  height = 32,
  alt = 'Excelsia',
  className,
}: ExcelsiaLogoProps) {
  const width = Math.round(height * RATIO[variant]);
  const common = {
    width,
    height,
    alt,
    decoding: 'async' as const,
    draggable: false,
    style: { height, width: 'auto' as const },
  };

  if (tone !== 'auto') {
    return <img src={src(variant, tone)} className={className} {...common} />;
  }
  return (
    <>
      <img
        src={src(variant, 'color')}
        className={`dark:hidden${className ? ` ${className}` : ''}`}
        {...common}
      />
      <img
        src={src(variant, 'inverse')}
        className={`hidden dark:block${className ? ` ${className}` : ''}`}
        {...common}
      />
    </>
  );
}

export default ExcelsiaLogo;
