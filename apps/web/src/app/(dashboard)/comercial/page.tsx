import { redirect } from 'next/navigation';

/* COM-004b — /comercial lands on its first section (Cuentas). The module menu
   tile stays gated ("Próximamente"); this route is reachable by direct URL like
   the other modules were during development. */
export default function ComercialPage() {
  redirect('/comercial/cuentas');
}
