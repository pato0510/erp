'use client';

import Link from 'next/link';
import { KeyRound } from 'lucide-react';

/* AUTH-002 — voluntary entry to /cambiar-clave, rendered right before «Cerrar sesión» in
   every module sidebar. Same tn-logout voice (styles in the dashboard layout). */
export function SidebarChangePassword() {
  return (
    <Link
      href="/cambiar-clave"
      className="tn-logout"
      style={{ marginBottom: 8, textDecoration: 'none' }}
    >
      <KeyRound size={14} aria-hidden="true" />
      Cambiar contraseña
    </Link>
  );
}

export default SidebarChangePassword;
