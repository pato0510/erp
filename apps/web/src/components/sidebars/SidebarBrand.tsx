'use client';

interface SidebarBrandProps {
  name: string;
}

export function SidebarBrand({ name }: SidebarBrandProps) {
  return (
    <div className="tn-sidebar__brand">
      <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <polygon
          points="16,4 30,28 2,28"
          fill="none"
          stroke="#60a5fa"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <polygon points="16,12 23,26 9,26" fill="#60a5fa" opacity="0.22" />
        <circle cx="16" cy="22" r="1.8" fill="#60a5fa" />
      </svg>
      <span className="tn-sidebar__brand-text">{name}</span>
    </div>
  );
}

export default SidebarBrand;
