import { redirect } from 'next/navigation';

/* CAL-001 — /actividades lands on its first section (Calendario). The module menu tile
   stays gated ("Próximamente") until CAL-007; this route is reachable by direct URL like
   the other modules were during development. NOTE: this redirect page may occasionally
   trip the known dev-only Next/Turbopack "negative time stamp" overlay (see CLAUDE.md
   known issues) — cosmetic, dev-only, resolved by the post-module dependency bump. */
export default function ActividadesPage() {
  redirect('/actividades/calendario');
}
