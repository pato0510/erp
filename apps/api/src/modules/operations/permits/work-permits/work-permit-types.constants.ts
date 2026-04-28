import { WorkPermitCategory } from '@prisma/client';

/* OPS-025 — Default Chilean work-permit catalog. Seeded via
   POST /api/operations/work-permit-types/seed-defaults. The
   seeder is idempotent against the (companyId, code) unique
   index, so re-running adds whatever's missing without touching
   existing rows. */
export interface DefaultWorkPermitType {
  code: string;
  name: string;
  category: WorkPermitCategory;
  description: string;
  maxDurationHours: number;
  requiredRoles: string[];
  requiresMedicalAptitude?: boolean;
  requiresSpecificTraining?: boolean;
  requiresGasMeasurement?: boolean;
  requiresIsolation?: boolean;
  defaultRisks: string[];
  defaultControls: string[];
  icon?: string;
  color?: string;
}

export const DEFAULT_WORK_PERMIT_TYPES: DefaultWorkPermitType[] = [
  {
    code: 'PT-ALT',
    name: 'Permiso de Trabajo en Altura',
    category: 'HEIGHT_WORK',
    description: 'Trabajos sobre 1.8m de altura sin protección colectiva',
    maxDurationHours: 8,
    requiredRoles: ['MANAGER'],
    requiresMedicalAptitude: true,
    requiresSpecificTraining: true,
    defaultRisks: [
      'Caída de personas a distinto nivel',
      'Caída de objetos sobre personas',
      'Golpes con estructuras',
      'Condiciones climáticas adversas',
    ],
    defaultControls: [
      'Uso de arnés de seguridad certificado',
      'Línea de vida y punto de anclaje verificado',
      'Inspección previa de equipos de protección',
      'Delimitación del área inferior',
      'Comunicación constante con observador',
    ],
    icon: 'ArrowUp',
    color: '#F97316',
  },
  {
    code: 'PT-CAL',
    name: 'Permiso de Trabajo en Caliente',
    category: 'HOT_WORK',
    description: 'Soldadura, oxicorte, esmerilado, llamas abiertas',
    maxDurationHours: 8,
    requiredRoles: ['MANAGER'],
    requiresSpecificTraining: true,
    defaultRisks: [
      'Incendio por chispas',
      'Quemaduras',
      'Inhalación de humos metálicos',
      'Radiación UV',
      'Electrocución',
    ],
    defaultControls: [
      'Extintores disponibles a 5m',
      'Retiro de material combustible 10m radio',
      'Vigilante de fuego designado',
      'EPP completo (careta, mangas largas, guantes)',
      'Ventilación forzada si aplica',
    ],
    icon: 'Flame',
    color: '#EF4444',
  },
  {
    code: 'PT-EC',
    name: 'Permiso de Trabajo en Espacio Confinado',
    category: 'CONFINED_SPACE',
    description: 'Estanques, silos, cámaras subterráneas, ductos',
    maxDurationHours: 4,
    requiredRoles: ['MANAGER', 'SUPER_ADMIN'],
    requiresMedicalAptitude: true,
    requiresSpecificTraining: true,
    requiresGasMeasurement: true,
    defaultRisks: [
      'Atmósfera deficiente de oxígeno',
      'Atmósfera tóxica o explosiva',
      'Ahogamiento por ingreso de líquidos',
      'Atrapamiento por configuración del espacio',
      'Estrés térmico',
    ],
    defaultControls: [
      'Medición de gases pre-ingreso',
      'Ventilación forzada continua',
      'Vigilante externo permanente',
      'Equipo de rescate disponible',
      'Comunicación radial con vigilante',
      'Líneas de vida para extracción',
    ],
    icon: 'Box',
    color: '#7C3AED',
  },
  {
    code: 'PT-LOTO',
    name: 'Permiso de Bloqueo y Tarjeteo (LOTO)',
    category: 'LOCKOUT_TAGOUT',
    description: 'Aislación de energías peligrosas en mantenimiento',
    maxDurationHours: 12,
    requiredRoles: ['MANAGER'],
    requiresSpecificTraining: true,
    requiresIsolation: true,
    defaultRisks: [
      'Liberación inesperada de energía eléctrica',
      'Energía hidráulica/neumática residual',
      'Energía mecánica almacenada',
      'Energía térmica',
    ],
    defaultControls: [
      'Identificación de TODAS las fuentes de energía',
      'Bloqueo físico con candado individual',
      'Tarjeta de identificación visible',
      'Verificación de energía cero',
      'Lista de candados firmada',
    ],
    icon: 'Lock',
    color: '#EAB308',
  },
  {
    code: 'PT-EXC',
    name: 'Permiso de Excavación',
    category: 'EXCAVATION',
    description: 'Excavaciones de profundidad mayor a 1.2m',
    maxDurationHours: 8,
    requiredRoles: ['MANAGER'],
    defaultRisks: [
      'Derrumbe de paredes',
      'Caída de personas o equipos',
      'Contacto con servicios subterráneos',
      'Acumulación de gases en zanjas',
    ],
    defaultControls: [
      'Mapa de servicios subterráneos verificado',
      'Entibación o talud según profundidad',
      'Escaleras de acceso cada 8m',
      'Señalización y barreras perimetrales',
      'Inspección diaria de paredes',
    ],
    icon: 'Pickaxe',
    color: '#92400E',
  },
  {
    code: 'PT-IZJ',
    name: 'Permiso de Izaje de Cargas',
    category: 'LIFTING',
    description: 'Operaciones con grúa o equipos de elevación',
    maxDurationHours: 8,
    requiredRoles: ['MANAGER'],
    requiresSpecificTraining: true,
    defaultRisks: [
      'Caída de la carga',
      'Volcamiento del equipo',
      'Atrapamiento por giro de carga',
      'Contacto con líneas eléctricas aéreas',
    ],
    defaultControls: [
      'Plan de izaje validado',
      'Verificación de capacidad y radio',
      'Eslingas y estrobos certificados',
      'Área delimitada bajo la carga',
      'Operador y rigger certificados',
      'Vientos verificados (max 40km/h)',
    ],
    icon: 'Construction',
    color: '#0EA5E9',
  },
];
