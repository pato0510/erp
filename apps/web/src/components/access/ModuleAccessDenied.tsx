'use client';

import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';
import { ACCESS_MODULE_LABELS, type AccessModule } from '../../lib/moduleAccess';

/* ACCESS-002 — rendered by the dashboard layout INSTEAD of the route's children when the
   member is blocked from the route's module: no child mounts, so no module api call is made.
   Quiet by design: this is a closed door, not an error. */
export function ModuleAccessDenied({ module }: { module: AccessModule }) {
  return (
    <section
      aria-labelledby="module-access-denied-title"
      className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center text-center"
    >
      <span
        aria-hidden="true"
        className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-subtle text-fg-muted"
      >
        <Lock size={18} strokeWidth={1.75} />
      </span>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-muted">
        {ACCESS_MODULE_LABELS[module]}
      </p>
      <h1
        id="module-access-denied-title"
        className="text-balance text-xl text-fg"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 600 }}
      >
        No tienes acceso a este módulo.
      </h1>
      <p
        className="mt-2 text-pretty text-sm text-fg-secondary"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 300 }}
      >
        Tu perfil de acceso no incluye este módulo. Si lo necesitas, pídele a un administrador que
        lo habilite.
      </p>
      <Link
        href="/modulos"
        className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card-solid px-5 text-sm text-fg transition-colors hover:bg-subtle-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Volver a módulos
      </Link>
    </section>
  );
}

export default ModuleAccessDenied;
