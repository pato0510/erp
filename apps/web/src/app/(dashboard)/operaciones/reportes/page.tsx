'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Bell,
  ChevronRight,
  ClipboardCheck,
  FileCheck,
  FolderOpen,
  HardHat,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  ReportFilterModal,
  type ReportKind,
} from '../../../../components/operations/reports/ReportFilterModal';

interface CardDef {
  /* `kind` opens the filter modal; cards without a kind are
     navigation-only (e.g. the carpeta documental shortcut). */
  kind?: ReportKind;
  href?: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  tags: string[];
  estimate?: string;
}

const CARDS: CardDef[] = [
  {
    kind: 'asset-compliance',
    icon: FileCheck,
    iconColor: '#1d4ed8',
    iconBg: 'rgba(37,99,235,0.12)',
    title: 'Cumplimiento documental',
    description:
      'Estado de todos los documentos requeridos por cada activo, con compliance %, vencimientos y bloqueos.',
    tags: ['Excel', 'Auditoría'],
    estimate: '~10 segundos',
  },
  {
    kind: 'activity',
    icon: Activity,
    iconColor: '#c2410c',
    iconBg: 'rgba(234,88,12,0.14)',
    title: 'Actividad del período',
    description:
      'Cronológico de eventos del módulo: documentos, permisos, alertas, procedimientos.',
    tags: ['Excel', 'Período'],
  },
  {
    kind: 'acknowledgment-coverage',
    icon: ClipboardCheck,
    iconColor: '#15803d',
    iconBg: 'rgba(34,197,94,0.14)',
    title: 'Cobertura de acuses',
    description: 'Estado de lectura de procedimientos por procedimiento y por usuario.',
    tags: ['Excel', 'Cumplimiento'],
  },
  {
    kind: 'alerts-history',
    icon: Bell,
    iconColor: '#b91c1c',
    iconBg: 'rgba(239,68,68,0.14)',
    title: 'Histórico de alertas',
    description:
      'Todas las alertas generadas con sus estados, resoluciones y tiempos de respuesta.',
    tags: ['Excel', 'Análisis'],
  },
  {
    kind: 'work-permits',
    icon: HardHat,
    iconColor: '#a16207',
    iconBg: 'rgba(234,179,8,0.18)',
    title: 'Permisos de trabajo',
    description: 'Reporte de PT con duraciones, incidentes, supervisores y aprobaciones.',
    tags: ['Excel', 'Operacional'],
  },
  {
    href: '/operaciones/equipos',
    icon: FolderOpen,
    iconColor: '#7c3aed',
    iconBg: 'rgba(124,58,237,0.14)',
    title: 'Carpeta documental por activo',
    description:
      'Reporte completo de un activo con PDF y todos sus documentos en ZIP. Selecciona el activo desde el listado.',
    tags: ['PDF', 'ZIP', 'Por activo'],
  },
];

export default function OperacionesReportesPage() {
  const [openKind, setOpenKind] = useState<ReportKind | null>(null);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-2 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
        Operaciones / Reportes
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
          Reportes operacionales
        </h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
          Generación de informes para auditorías y gestión
        </p>
      </div>

      {/* Catalog */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Catálogo de reportes
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map((card) => (
            <ReportCard
              key={card.title}
              card={card}
              onSelect={() => {
                if (card.kind) setOpenKind(card.kind);
              }}
            />
          ))}
        </div>
      </section>

      {/* Recent reports placeholder — V1 ships empty per spec. */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Reportes recientes generados
        </h2>
        <div className="rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center text-xs text-[var(--text-secondary)]">
          Tus últimos reportes generados aparecerán aquí.
        </div>
      </section>

      <ReportFilterModal reportKind={openKind} onClose={() => setOpenKind(null)} />
    </div>
  );
}

function ReportCard({ card, onSelect }: { card: CardDef; onSelect: () => void }) {
  const Icon = card.icon;
  const inner = (
    <article className="group flex h-full flex-col rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-sm transition-transform hover:-translate-y-0.5 hover:border-blue-400">
      <div className="mb-3 flex items-center justify-between">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-md"
          style={{ backgroundColor: card.iconBg, color: card.iconColor }}
        >
          <Icon size={18} />
        </span>
        <ChevronRight
          size={14}
          className="text-[var(--text-secondary)] transition-transform group-hover:translate-x-0.5"
        />
      </div>
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{card.title}</h3>
      <p className="mt-1 text-xs text-[var(--text-secondary)] flex-1">{card.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {card.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide"
            style={{ backgroundColor: card.iconBg, color: card.iconColor }}
          >
            {tag}
          </span>
        ))}
        {card.estimate && (
          <span className="ml-auto text-[10px] text-[var(--text-secondary)]">{card.estimate}</span>
        )}
      </div>
    </article>
  );
  if (card.href) {
    return (
      <Link
        href={card.href}
        className="block focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-xl"
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-xl"
    >
      {inner}
    </button>
  );
}
