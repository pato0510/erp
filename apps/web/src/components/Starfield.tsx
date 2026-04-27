'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

/* useLayoutEffect runs before the browser paint on the client, so the canvas
   shows stars in the same frame the DOM is committed instead of the next one.
   In SSR we fall back to useEffect to avoid the React warning. */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

type Star = {
  x: number;
  y: number;
  r: number;
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  color: string;
  bright: boolean;
};

interface StarfieldProps {
  className?: string;
  zIndex?: number;
  position?: 'fixed' | 'absolute';
  density?: number;
}

export function Starfield({
  className,
  zIndex = 1,
  position = 'fixed',
  density = 1400,
}: StarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const measure = () => {
      if (position === 'absolute') {
        const parent = canvas.parentElement;
        if (parent) {
          const rect = parent.getBoundingClientRect();
          return { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
        }
      }
      return { w: window.innerWidth, h: window.innerHeight };
    };

    let { w, h } = measure();
    let dpr = window.devicePixelRatio || 1;
    let stars: Star[] = [];

    const buildStars = () => {
      const count = Math.floor((w * h) / density);
      const next: Star[] = [];
      for (let i = 0; i < count; i++) {
        const layerRoll = Math.random();
        const layer = layerRoll < 0.55 ? 0 : layerRoll < 0.88 ? 1 : 2;
        const colorRoll = Math.random();
        let color = '#ffffff';
        if (colorRoll < 0.04) color = '#9bb8e8';
        else if (colorRoll < 0.1) color = '#ffb27a';

        const r =
          layer === 0
            ? 0.4 + Math.random() * 0.4
            : layer === 1
              ? 0.8 + Math.random() * 0.7
              : 1.4 + Math.random() * 1.1;
        const baseAlpha = layer === 0 ? 0.35 : layer === 1 ? 0.6 : 0.9;

        next.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r,
          baseAlpha,
          twinkleSpeed: 0.4 + Math.random() * 1.6,
          twinklePhase: Math.random() * Math.PI * 2,
          color,
          bright: layer === 2 && Math.random() < 0.35,
        });
      }
      stars = next;
    };

    const resize = () => {
      const m = measure();
      w = m.w;
      h = m.h;
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      buildStars();
    };

    resize();

    const start = performance.now();
    let raf = 0;
    let ro: ResizeObserver | null = null;
    if (position === 'absolute' && canvas.parentElement && 'ResizeObserver' in window) {
      ro = new ResizeObserver(() => resize());
      ro.observe(canvas.parentElement);
    }

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);

      const g1 = ctx.createRadialGradient(w * 0.85, h * 0.2, 0, w * 0.85, h * 0.2, w * 0.55);
      g1.addColorStop(0, 'rgba(60, 95, 170, 0.16)');
      g1.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);

      const g2 = ctx.createRadialGradient(w * 0.15, h * 0.85, 0, w * 0.15, h * 0.85, w * 0.55);
      g2.addColorStop(0, 'rgba(110, 60, 150, 0.13)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);

      for (const s of stars) {
        const tw = 0.5 + 0.5 * Math.sin(t * s.twinkleSpeed + s.twinklePhase);
        const a = s.baseAlpha * (0.55 + 0.45 * tw);

        ctx.globalAlpha = a;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();

        if (s.bright && tw > 0.78) {
          const flareLen = s.r * 6 * tw;
          ctx.globalAlpha = a * 0.55;
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(s.x - flareLen, s.y);
          ctx.lineTo(s.x + flareLen, s.y);
          ctx.moveTo(s.x, s.y - flareLen);
          ctx.lineTo(s.x, s.y + flareLen);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      if (ro) ro.disconnect();
    };
  }, [position, density]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{
        position,
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex,
        pointerEvents: 'none',
      }}
    />
  );
}

export default Starfield;
