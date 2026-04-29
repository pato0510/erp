/* OPS-036 — applicable Chilean legal framework for the operations
   module. Surfaced both in the audit-package PDF (Marco Legal) and
   on the /operaciones/auditoria UI cards. The list is intentionally
   short: the laws below are the ones every operations audit /
   inspection actually checks against. Reports referenced by code
   are the ones the audit package generates (see REPORT_FILES). */

export interface LegalFrameworkEntry {
  /** Stable code used by the UI for keyed lists. */
  code: string;
  /** Short name shown in the card title. */
  name: string;
  /** Full title, displayed under the short name. */
  fullName: string;
  /** UI tone — drives the card icon background. */
  color: 'red' | 'orange' | 'blue' | 'green' | 'teal';
  /** Lucide icon name; the frontend maps it to a component. */
  icon: string;
  /** What the law requires. Bullet list. */
  requirements: string[];
  /** How Excelsia covers each requirement. Bullet list. */
  coverage: string[];
  /** Audit-package report file numbers ("01", "02", …) that
     evidence compliance with this law. */
  relatedReports: string[];
  /** Official source URL — typically Biblioteca Congreso Nacional. */
  officialSource: string;
}

export const LEGAL_FRAMEWORK_CHILE: LegalFrameworkEntry[] = [
  {
    code: 'LEY_16744',
    name: 'Ley 16.744',
    fullName: 'Sobre Accidentes del Trabajo y Enfermedades Profesionales',
    color: 'red',
    icon: 'ShieldAlert',
    requirements: [
      'Registro de capacitaciones de prevención',
      'Procedimientos de seguridad documentados',
      'Acuses de lectura firmados por trabajadores',
      'Gestión de riesgos identificados',
      'Reporte de accidentes y enfermedades',
    ],
    coverage: [
      'Módulo Procedimientos con acuses electrónicos firmados (SHA-256)',
      'Permisos de Trabajo con cadena de aprobación multi-paso',
      'Alertas automáticas de vencimiento de capacitaciones',
      'Audit trail completo de cambios de estado (PostgreSQL triggers)',
    ],
    relatedReports: ['02', '03', '04'],
    officialSource: 'https://www.bcn.cl/leychile/navegar?idNorma=28650',
  },
  {
    code: 'DS_594',
    name: 'DS 594',
    fullName:
      'Reglamento sobre Condiciones Sanitarias y Ambientales Básicas en los Lugares de Trabajo',
    color: 'orange',
    icon: 'Activity',
    requirements: [
      'Mediciones ambientales periódicas (ruido, iluminación, ventilación)',
      'Registros de mantenimiento de instalaciones sanitarias',
      'Documentación de exámenes ocupacionales',
      'Plan de emergencia y evacuación',
    ],
    coverage: [
      'Documentos requeridos por tipo de activo / ubicación',
      'Alertas de vencimiento de certificados ambientales',
      'Permisos de trabajo en altura, en caliente y espacios confinados',
      'Trazabilidad de cambios de estado en activos críticos',
    ],
    relatedReports: ['01', '03', '04'],
    officialSource: 'https://www.bcn.cl/leychile/navegar?idNorma=167766',
  },
  {
    code: 'DS_76',
    name: 'DS 76',
    fullName: 'Reglamento para la Aplicación del Artículo 66 bis de la Ley 16.744',
    color: 'blue',
    icon: 'Briefcase',
    requirements: [
      'Sistema de Gestión de la SST (SG-SST) documentado',
      'Coordinación entre empresa principal y contratistas',
      'Registro de instrumentos de prevención de riesgos',
      'Comité Paritario de Faena en obras de más de 50 trabajadores',
    ],
    coverage: [
      'Cadenas de aprobación multi-paso para permisos de trabajo',
      'Audit log de quién aprobó qué y cuándo',
      'Excepciones temporales con justificación y vigencia limitada',
      'Reportes de cumplimiento exportables para fiscalización',
    ],
    relatedReports: ['03', '05', '06'],
    officialSource: 'https://www.bcn.cl/leychile/navegar?idNorma=1006307',
  },
  {
    code: 'LEY_18290',
    name: 'Ley 18.290',
    fullName: 'Ley de Tránsito',
    color: 'green',
    icon: 'Truck',
    requirements: [
      'SOAP vigente para todo vehículo',
      'Permiso de Circulación al día',
      'Revisión Técnica vigente según calendario',
      'Padrón disponible en el vehículo',
    ],
    coverage: [
      'Pack documental Chile auto-asociado a tipos VEHÍCULO (SOAP / PERMCIRC / REVTEC / PADRON)',
      'Alertas configurables por tipo de documento (alertDaysBefore)',
      'Bloqueo automático del activo cuando un documento crítico vence',
      'QR público por vehículo para verificación en terreno',
    ],
    relatedReports: ['01', '07'],
    officialSource: 'https://www.bcn.cl/leychile/navegar?idNorma=29708',
  },
  {
    code: 'LEY_19300',
    name: 'Ley 19.300',
    fullName: 'Ley sobre Bases Generales del Medio Ambiente',
    color: 'teal',
    icon: 'Leaf',
    requirements: [
      'Resolución de Calificación Ambiental (RCA) cuando aplique',
      'Permisos sectoriales ambientales vigentes',
      'Reporte de no conformidades ambientales',
      'Trazabilidad de modificaciones del proyecto aprobado',
    ],
    coverage: [
      'Módulo de Permisos Externos con catálogo de permisos ambientales chilenos',
      'Alertas de vencimiento configurables por tipo de permiso',
      'Bloqueo del activo asociado cuando un permiso ambiental vence',
      'Audit log de aprobaciones, rechazos y revocaciones',
    ],
    relatedReports: ['01', '06'],
    officialSource: 'https://www.bcn.cl/leychile/navegar?idNorma=30667',
  },
];

/** Stable filenames used inside the audit package ZIP. The numeric
 *  prefix preserves a sensible order when the auditor unzips. */
export const REPORT_FILES = {
  COVER: '00-PORTADA.pdf',
  LEGAL: 'MARCO-LEGAL.pdf',
  MANIFEST: 'MANIFIESTO.json',
  REPORTS: [
    { code: '01', name: '01-cumplimiento-documental.xlsx', label: 'Cumplimiento documental' },
    { code: '02', name: '02-cobertura-acuses.xlsx', label: 'Cobertura de acuses' },
    { code: '03', name: '03-permisos-de-trabajo.xlsx', label: 'Permisos de trabajo' },
    { code: '04', name: '04-historico-de-alertas.xlsx', label: 'Histórico de alertas' },
    { code: '05', name: '05-excepciones-aprobadas.xlsx', label: 'Excepciones temporales' },
    { code: '06', name: '06-cambios-de-estado.xlsx', label: 'Cambios de estado de activos' },
    { code: '07', name: '07-inventario-qr.xlsx', label: 'Inventario QR para verificación' },
  ],
} as const;
