import { redirect } from 'next/navigation';

/* MKT-001 — /marketing lands on its first section (Campañas). The module menu
   tile stays gated ("Próximamente") until MKT-010; this route is reachable by
   direct URL like the other modules were during development. */
export default function MarketingPage() {
  redirect('/marketing/campanas');
}
