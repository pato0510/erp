'use client';

import type { ReactNode } from 'react';
import { HubIndicators } from './HubIndicators';

/* HUB-004 — the hub footer: brand/version on the left and the company identification on
 * the right EXACTLY as before (decorative, aria-hidden), plus the centred indicators
 * block. Layout is a `1fr auto 1fr` grid on `.mod-bottombar` (styles live in the hub
 * page's styled-jsx, allowlisted), so the centre stays centred on the page whatever the
 * side texts measure; under 640 px the centre wraps to its own row inside the same bar.
 * The bar keeps its existing container and positioning — nothing else moved. */
export function HubFooter({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="mod-bottombar">
      <span className="mod-bottombar__side" aria-hidden="true">
        {left}
      </span>
      <div className="mod-bottombar__center">
        <HubIndicators />
      </div>
      <span className="mod-bottombar__side mod-bottombar__side--right" aria-hidden="true">
        {right}
      </span>
    </div>
  );
}

export default HubFooter;
