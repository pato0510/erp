'use client';

import { ExcelsiaLogo } from '../shared/ExcelsiaLogo';

interface SidebarBrandProps {
  name: string;
}

/* UI-003 — the brand isotype (designer SVG, monochrome white) next to the module name.
   White because the light sidebar gradient (#3b5c8a → #284b75) is itself steel/navy and
   the inverse mark's steel blue would sit blue-on-blue; the guide allows the monochrome
   white mark on gradient surfaces. Decorative: the module name is the visible label. */
export function SidebarBrand({ name }: SidebarBrandProps) {
  return (
    <div className="tn-sidebar__brand">
      <ExcelsiaLogo variant="isotype" tone="white" height={22} alt="" />
      <span className="tn-sidebar__brand-text">{name}</span>
    </div>
  );
}

export default SidebarBrand;
