'use client';

import { useState, type ReactNode } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { StyleRegistry, createStyleRegistry } from 'styled-jsx';

/* UI-004 — styled-jsx server registry for the App Router. Forty-odd files still use
 * `<style jsx>` (login, the hub, the dashboard layout/sidebars, modals). Without a
 * registry their rules are injected on the CLIENT after hydration, so a hard refresh
 * paints raw markup for ~1 s (verified: the server HTML of /login, /modulos and
 * /comercial/cuentas carried zero `.sw-root` / `.mod-root` / `.tn-sidebar` rules).
 * This is the documented Next.js recipe: one registry per request, flushed into the
 * server-rendered <head> via useServerInsertedHTML. styled-jsx ships with Next — no new
 * dependency. Styles are unchanged; only WHERE they are emitted moves. */
export function StyledJsxRegistry({ children }: { children: ReactNode }) {
  // Lazy initializer: one registry per request on the server, one per app on the client.
  const [registry] = useState(() => createStyleRegistry());

  useServerInsertedHTML(() => {
    const styles = registry.styles();
    registry.flush();
    return <>{styles}</>;
  });

  return <StyleRegistry registry={registry}>{children}</StyleRegistry>;
}

export default StyledJsxRegistry;
