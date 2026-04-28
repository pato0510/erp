'use client';

import Link from 'next/link';
import { ArrowRight, Bell, Settings } from 'lucide-react';

/* OPS-018 placeholder — until OPS-021 ships the actual instances list,
   this page just nudges admins toward the rule configuration tab. */
export default function AlertasPage() {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--font-ibm-plex-mono), var(--font-jetbrains-mono), monospace',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'rgba(0, 0, 0, 0.5)',
          marginBottom: 14,
        }}
      >
        Operaciones / Alertas
      </div>
      <h1
        className="text-[var(--text-primary)]"
        style={{
          fontFamily: 'var(--font-outfit), sans-serif',
          fontWeight: 600,
          fontSize: 28,
          letterSpacing: '-0.01em',
          margin: '0 0 8px',
        }}
      >
        Alertas y Vencimientos
      </h1>
      <p
        className="mb-6"
        style={{
          fontFamily: 'var(--font-ibm-plex-mono), monospace',
          fontSize: 11,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
        }}
      >
        Configuración + bandeja de alertas
      </p>

      <div
        className="p-4 rounded-xl flex items-start gap-3"
        style={{
          background: 'rgba(37, 99, 235, 0.06)',
          border: '1px solid rgba(37, 99, 235, 0.2)',
        }}
      >
        <Bell size={20} style={{ color: '#1d4ed8', flexShrink: 0, marginTop: 2 }} />
        <div className="flex-1">
          <p
            className="text-[var(--text-primary)]"
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Aún no hay alertas activas
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            La configuración de reglas se encuentra en{' '}
            <Link
              href="/operaciones/configuracion?tab=alertas"
              className="text-blue-600 hover:underline"
            >
              Configuración → tab Alertas
            </Link>
            . Allí puedes definir umbrales, severidades, destinatarios y aplicar el pack recomendado
            para Chile.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/operaciones/configuracion?tab=alertas"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-full text-white"
              style={{
                background: '#1C1C1E',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Settings size={13} /> Ir a configuración de alertas <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
