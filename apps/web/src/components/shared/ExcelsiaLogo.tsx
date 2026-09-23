/* UI-003 — the Excelsia brand (isotype "EXCELSIA" arrow mark + wordmark), rendered from
 * the designer's SVGs in public/brand — never redrawn, recolored, filtered or stretched.
 * Plain <img> (the codebase has no next/image usage and no image-optimizer config).
 *   variant: 'horizontal' (1700×430) | 'vertical' (1254×960) | 'isotype' (740×740)
 *            | 'wordmark' (logotipo, 1300×330) | 'stacked' (BRAND-001: isotipo above
 *            logotipo, composed here — see STACKED below)
 *   tone:    'color'   → color asset (light backgrounds)
 *            'inverse' → "inverso" asset (steel blue + white, dark backgrounds)
 *            'white'   → monochrome white (isotype and wordmark; gradient/portal surfaces)
 *            'auto'    → color on light, inverse on html.dark — two renders, toggled by
 *                        CSS (`dark:hidden` / `dark:block`), no JS theme read, no flicker
 *   height:  the rendered height; width follows the file's aspect ratio (not 'stacked').
 *   width:   'stacked' only — the lockup width (= the wordmark image width).
 *   alt:     "Excelsia" for informative usages; '' when a visible label sits next to it.
 * Guide minimums (horizontal 240 px wide, vertical/stacked 200 px wide, isotype 32 px) are
 * the caller's responsibility. The 'vertical' files are no longer used in the app (BRAND-001);
 * do not reuse them on new surfaces without the designer. */

export type LogoVariant = 'horizontal' | 'vertical' | 'isotype' | 'wordmark' | 'stacked';
export type LogoTone = 'auto' | 'color' | 'inverse' | 'white';

type FileVariant = Exclude<LogoVariant, 'stacked'>;

interface ExcelsiaLogoProps {
  variant?: LogoVariant;
  tone?: LogoTone;
  height?: number;
  width?: number;
  alt?: string;
  className?: string;
}

const RATIO: Record<FileVariant, number> = {
  horizontal: 1700 / 430,
  vertical: 1254 / 960,
  isotype: 1,
  wordmark: 1300 / 330,
};

const FILE: Record<FileVariant, string> = {
  horizontal: 'excelsia_logo_horizontal',
  vertical: 'excelsia_logo_vertical',
  isotype: 'excelsia_isotipo',
  wordmark: 'excelsia_logotipo',
};

/* BRAND-001 — stacked lockup geometry. Measured in Chromium on the inverse files (element
 * bounding boxes at 1 unit = 1 px; a rendered-pixel scan agrees within 1 px), in file units.
 * Spacing is visible-to-visible and follows the DESIGNER'S horizontal lockup; the single
 * files' margins are standalone clear space, so inside the lockup the two images may overlap
 * ONLY in their transparent margins — nothing is cropped, stretched or edited. The lockup's
 * outer margins (isotipo top/sides, logotipo bottom/sides) remain its clear space. */
const STACKED = {
  /** excelsia_isotipo_*.svg: 740×740 viewBox; the symbol is visible from y 100 to 640. */
  isotypeBox: 740,
  isotypeVisibleHeight: 540,
  isotypeBottomMargin: 740 - (100 + 540),
  /** excelsia_logotipo_*.svg: 1300×330 viewBox; the letters are visible from x 90 (w 1120), y 91.43. */
  wordmarkBoxWidth: 1300,
  wordmarkBoxHeight: 330,
  wordmarkVisibleWidth: 1120,
  wordmarkTopMargin: 91.43,
  /** r_h — horizontal file: visible gap 85 (470 − 385) ÷ isotype visible height 318.66. */
  gapRatio: 85 / 318.66,
  /** k — vertical file: isotype visible height 541 ÷ wordmark visible width 1098. */
  isotypeToWordmark: 541 / 1098,
} as const;

/** Rendered geometry of the stacked lockup for a lockup (= wordmark image) width. */
export function stackedGeometry(width: number) {
  const wordmarkScale = width / STACKED.wordmarkBoxWidth;
  const isotypeVisibleHeight =
    STACKED.isotypeToWordmark * STACKED.wordmarkVisibleWidth * wordmarkScale;
  const isotypeScale = isotypeVisibleHeight / STACKED.isotypeVisibleHeight;
  const isotypeSize = STACKED.isotypeBox * isotypeScale;
  const wordmarkHeight = STACKED.wordmarkBoxHeight * wordmarkScale;
  const visibleGap = STACKED.gapRatio * isotypeVisibleHeight;
  // Negative at the measured values: the images overlap in their transparent margins only.
  const wordmarkOffset =
    visibleGap -
    STACKED.isotypeBottomMargin * isotypeScale -
    STACKED.wordmarkTopMargin * wordmarkScale;
  return {
    isotypeSize,
    wordmarkHeight,
    wordmarkOffset,
    visibleGap,
    height: isotypeSize + wordmarkOffset + wordmarkHeight,
  };
}

function src(variant: FileVariant, tone: Exclude<LogoTone, 'auto'>): string {
  // Monochrome white files exist for the isotype and the wordmark; the lockups fall back to
  // the inverse asset (steel blue + white), which the guide allows on dark surfaces.
  const suffix =
    tone === 'white'
      ? variant === 'isotype' || variant === 'wordmark'
        ? 'blanco'
        : 'inverso'
      : tone === 'inverse'
        ? 'inverso'
        : 'color';
  return `/brand/${FILE[variant]}_${suffix}.svg`;
}

function Stacked({
  tone,
  width,
  alt,
  className,
}: {
  tone: Exclude<LogoTone, 'auto'>;
  width: number;
  alt: string;
  className: string;
}) {
  const g = stackedGeometry(width);
  const img = { decoding: 'async' as const, draggable: false };
  // The wrapper box = the union of both images, sized up front (no layout shift). One
  // accessible name: the isotype carries alt, the wordmark is decorative.
  return (
    <span
      className={className}
      style={{ flexDirection: 'column', alignItems: 'center', width, height: g.height }}
    >
      <img
        src={src('isotype', tone)}
        alt={alt}
        width={Math.round(g.isotypeSize)}
        height={Math.round(g.isotypeSize)}
        style={{ width: g.isotypeSize, height: g.isotypeSize, flex: 'none' }}
        {...img}
      />
      <img
        src={src('wordmark', tone)}
        alt=""
        width={Math.round(width)}
        height={Math.round(g.wordmarkHeight)}
        style={{ width, height: g.wordmarkHeight, marginTop: g.wordmarkOffset, flex: 'none' }}
        {...img}
      />
    </span>
  );
}

export function ExcelsiaLogo({
  variant = 'horizontal',
  tone = 'auto',
  height = 32,
  width: stackedWidth = 220,
  alt = 'Excelsia',
  className,
}: ExcelsiaLogoProps) {
  if (variant === 'stacked') {
    const extra = className ? ` ${className}` : '';
    if (tone !== 'auto') {
      return <Stacked tone={tone} width={stackedWidth} alt={alt} className={`flex${extra}`} />;
    }
    return (
      <>
        <Stacked
          tone="color"
          width={stackedWidth}
          alt={alt}
          className={`flex dark:hidden${extra}`}
        />
        <Stacked
          tone="inverse"
          width={stackedWidth}
          alt={alt}
          className={`hidden dark:flex${extra}`}
        />
      </>
    );
  }

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
