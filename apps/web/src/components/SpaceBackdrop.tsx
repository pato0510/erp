'use client';

import { useEffect, useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Starfield } from './Starfield';

/* HUB-006 — the routes that share the "space" backdrop. The blocking theme script
   (lib/theme.tsx) interpolates this list, so first paint and client navigation read
   ONE source. Later tickets add paths here. */
export const SPACE_PATHS = ['/login', '/cambiar-clave', '/modulos'];

/* Layout effect on the client (the html class flips before paint on navigation);
   useEffect on the server, where neither runs. Same idiom as Starfield. */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * HUB-006 — one shared backdrop for the space routes, rendered from the ROOT layout.
 * The root layout persists across client navigations, so the canvas (and its random
 * stars) survives login → hub untouched; leaving the space routes unmounts it and
 * Starfield's cleanup cancels the rAF loop. Theme colours live in global.css
 * (.space-backdrop / .space-vignette, keyed on html.dark) — no theme state here, so
 * the SSR markup is theme-agnostic and the first paint is decided by CSS alone.
 */
export function SpaceBackdrop() {
  const pathname = usePathname();
  const isSpace = pathname !== null && SPACE_PATHS.includes(pathname);

  // The blocking script covers the first paint; this keeps html.starfield-page in
  // sync on client navigation (added entering a space route, removed leaving it).
  useIsomorphicLayoutEffect(() => {
    document.documentElement.classList.toggle('starfield-page', isSpace);
  }, [isSpace]);

  if (!isSpace) return null;

  return (
    <div className="space-backdrop" aria-hidden="true">
      <Starfield zIndex={0} />
      <div className="space-vignette" />
    </div>
  );
}

export default SpaceBackdrop;
