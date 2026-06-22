/**
 * RRHH (DEMO) seed — runnable with:
 *   npx ts-node apps/api/prisma/demo-seed.ts
 *
 * Idempotent (upsert by stable keys). Structured so later prompts can extend it:
 * each domain has a named `seedXxx(prisma, companyId)` export and `main()`
 * resolves the demo company then calls them.
 *
 * This file is SEPARATE from prisma/seed.ts (which must not be touched).
 */
import {
  AvailabilityStatus,
  BillingUnit,
  CalendarItemStatus,
  CalendarItemType,
  CampaignStatus,
  CampaignTaskType,
  CertificationStatus,
  CertificationType,
  ContractType,
  CrmActivityType,
  CrmLeadPriority,
  CrmLeadSource,
  CrmLeadStatus,
  CrmQuoteStatus,
  EmployeeStatus,
  LicenseStatus,
  LicenseType,
  PrismaClient,
  ServiceCategory,
} from '@prisma/client';

const prisma = new PrismaClient();

/* ── Chilean RUT generator (Módulo 11) ──────────────────────────────────── */

/**
 * Computes the Módulo 11 check digit for a RUT body. Multiplies the body digits
 * right-to-left by the repeating cycle 2,3,4,5,6,7; 11 - (sum % 11); 11→'0',
 * 10→'K'.
 */
export function computeDv(body: number): string {
  const digits = String(body).split('').reverse().map(Number);
  const cycle = [2, 3, 4, 5, 6, 7];
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += digits[i] * cycle[i % cycle.length];
  }
  const resto = 11 - (sum % 11);
  if (resto === 11) return '0';
  if (resto === 10) return 'K';
  return String(resto);
}

/** Formats a RUT body+DV with thousands dots, e.g. 12345678 -> '12.345.678-9'. */
export function formatRut(body: number): string {
  const dv = computeDv(body);
  const withDots = String(body).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots}-${dv}`;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

function dateYearsAgo(years: number, monthOffset = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setFullYear(d.getFullYear() - years);
  d.setMonth(d.getMonth() - monthOffset);
  d.setDate(1);
  return d;
}

function monthsBetween(from: Date, to = new Date()): number {
  return (
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  );
}

const AFP_NAMES = ['Capital', 'Cuprum', 'Habitat', 'Modelo', 'PlanVital', 'ProVida', 'Uno'];

/* ── 2026 DIRECTIONAL payroll parameters ────────────────────────────────── */

export async function seedPayrollParameters(p: PrismaClient, companyId: string) {
  const afpRates: Record<string, number> = {
    Capital: 0.0144,
    Cuprum: 0.0144,
    Habitat: 0.0127,
    Modelo: 0.0058,
    PlanVital: 0.0116,
    ProVida: 0.0145,
    Uno: 0.0049,
  };

  const taxBrackets = [
    { desdeUtm: 0, hastaUtm: 13.5, factor: 0, rebajaUtm: 0 },
    { desdeUtm: 13.5, hastaUtm: 30, factor: 0.04, rebajaUtm: 0.54 },
    { desdeUtm: 30, hastaUtm: 50, factor: 0.08, rebajaUtm: 1.74 },
    { desdeUtm: 50, hastaUtm: 70, factor: 0.135, rebajaUtm: 4.49 },
    { desdeUtm: 70, hastaUtm: 90, factor: 0.23, rebajaUtm: 11.14 },
    { desdeUtm: 90, hastaUtm: 120, factor: 0.304, rebajaUtm: 17.8 },
    { desdeUtm: 120, hastaUtm: 310, factor: 0.35, rebajaUtm: 23.32 },
    { desdeUtm: 310, hastaUtm: null, factor: 0.4, rebajaUtm: 38.82 },
  ];

  const data = {
    ufValue: 39000,
    utmValue: 68000,
    topeImponibleUf: 87.8,
    topeCesantiaUf: 131.8,
    afpRates,
    saludRate: 0.07,
    cesantiaRateTrabajador: 0.006,
    taxBrackets,
    isActive: true,
  };

  const param = await prisma.payrollParameter.upsert({
    where: { companyId_periodo: { companyId, periodo: '2026' } },
    update: data,
    create: { companyId, periodo: '2026', ...data },
  });
  console.log(`  PayrollParameter 2026: ${param.id}`);
  return param;
}

/* ── Employees + contracts + documents + vacations ──────────────────────── */

interface EmpSpec {
  rutBody: number;
  nombres: string;
  apellidos: string;
  area: string;
  cargo: string;
  base: string;
  tipoContrato: ContractType;
  sueldoBruto: number;
  jornada: string;
  afp: string;
  salud: string;
  yearsAgo: number;
  monthOffset: number;
  estado: EmployeeStatus;
}

// B2B DRONE & INDUSTRIAL SERVICES dotación. Field cargos reflect the domain:
// ≥4 Piloto de Drone, plus Operador de Cámara, Inspector Técnico, Supervisor /
// Auxiliar de Limpieza, Técnico de Terreno, Ejecutivo Comercial. `base` is the
// home faena/city used for availability filtering.
const EMPLOYEES: EmpSpec[] = [
  { rutBody: 12345678, nombres: 'María José', apellidos: 'González Pérez', area: 'Operaciones', cargo: 'Piloto de Drone', base: 'Antofagasta', tipoContrato: 'INDEFINIDO', sueldoBruto: 1850000, jornada: '45h', afp: 'Cuprum', salud: 'ISAPRE - Cruz Blanca', yearsAgo: 8, monthOffset: 3, estado: 'ACTIVO' },
  { rutBody: 9876543, nombres: 'Juan Carlos', apellidos: 'Muñoz Rojas', area: 'Operaciones', cargo: 'Piloto de Drone', base: 'Calama', tipoContrato: 'INDEFINIDO', sueldoBruto: 1780000, jornada: '45h', afp: 'Habitat', salud: 'FONASA', yearsAgo: 6, monthOffset: 0, estado: 'ACTIVO' },
  { rutBody: 15234876, nombres: 'Camila Andrea', apellidos: 'Soto Vega', area: 'Operaciones', cargo: 'Piloto de Drone', base: 'Santiago', tipoContrato: 'INDEFINIDO', sueldoBruto: 1720000, jornada: '45h', afp: 'Modelo', salud: 'ISAPRE - Banmédica', yearsAgo: 4, monthOffset: 6, estado: 'ACTIVO' },
  { rutBody: 18456321, nombres: 'Diego Ignacio', apellidos: 'Fuentes Castro', area: 'Operaciones', cargo: 'Piloto de Drone', base: 'Concepción', tipoContrato: 'PLAZO_FIJO', sueldoBruto: 1450000, jornada: '45h', afp: 'PlanVital', salud: 'FONASA', yearsAgo: 1, monthOffset: 2, estado: 'ACTIVO' },
  { rutBody: 16789234, nombres: 'Francisca Paz', apellidos: 'Rivera Morales', area: 'Comercial', cargo: 'Ejecutivo Comercial', base: 'Santiago', tipoContrato: 'INDEFINIDO', sueldoBruto: 1280000, jornada: '45h', afp: 'Capital', salud: 'ISAPRE - Consalud', yearsAgo: 3, monthOffset: 1, estado: 'ACTIVO' },
  { rutBody: 13654987, nombres: 'Sebastián Alonso', apellidos: 'Torres Díaz', area: 'Operaciones', cargo: 'Operador de Cámara', base: 'Antofagasta', tipoContrato: 'INDEFINIDO', sueldoBruto: 1150000, jornada: '45h', afp: 'Uno', salud: 'FONASA', yearsAgo: 5, monthOffset: 4, estado: 'ACTIVO' },
  { rutBody: 19345672, nombres: 'Valentina Isidora', apellidos: 'Araya Núñez', area: 'Operaciones', cargo: 'Inspector Técnico', base: 'Calama', tipoContrato: 'INDEFINIDO', sueldoBruto: 1320000, jornada: '45h', afp: 'Modelo', salud: 'FONASA', yearsAgo: 2, monthOffset: 8, estado: 'ACTIVO' },
  { rutBody: 14098765, nombres: 'Matías Esteban', apellidos: 'Herrera Lagos', area: 'Operaciones', cargo: 'Técnico de Terreno', base: 'Concepción', tipoContrato: 'INDEFINIDO', sueldoBruto: 1080000, jornada: '45h', afp: 'ProVida', salud: 'ISAPRE - Vida Tres', yearsAgo: 7, monthOffset: 2, estado: 'ACTIVO' },
  { rutBody: 20123456, nombres: 'Antonia Belén', apellidos: 'Carrasco Pino', area: 'Comercial', cargo: 'Ejecutivo Comercial', base: 'Santiago', tipoContrato: 'PLAZO_FIJO', sueldoBruto: 980000, jornada: '45h', afp: 'PlanVital', salud: 'FONASA', yearsAgo: 0, monthOffset: 7, estado: 'ACTIVO' },
  { rutBody: 11876234, nombres: 'Rodrigo Andrés', apellidos: 'Vargas Espinoza', area: 'Operaciones', cargo: 'Supervisor de Limpieza', base: 'Antofagasta', tipoContrato: 'POR_OBRA', sueldoBruto: 1120000, jornada: '45h', afp: 'Habitat', salud: 'FONASA', yearsAgo: 2, monthOffset: 0, estado: 'ACTIVO' },
  { rutBody: 17456789, nombres: 'Javiera Constanza', apellidos: 'Reyes Tapia', area: 'Administración', cargo: 'Analista Administrativa', base: 'Santiago', tipoContrato: 'INDEFINIDO', sueldoBruto: 1180000, jornada: '45h', afp: 'Capital', salud: 'ISAPRE - Colmena', yearsAgo: 3, monthOffset: 9, estado: 'ACTIVO' },
  { rutBody: 10567432, nombres: 'Cristián Eduardo', apellidos: 'Bravo Sandoval', area: 'Prevención de Riesgos', cargo: 'Prevencionista de Riesgos', base: 'Calama', tipoContrato: 'INDEFINIDO', sueldoBruto: 1450000, jornada: '45h', afp: 'Cuprum', salud: 'FONASA', yearsAgo: 9, monthOffset: 5, estado: 'ACTIVO' },
  { rutBody: 21345678, nombres: 'Catalina Ignacia', apellidos: 'Salazar Fuentes', area: 'Operaciones', cargo: 'Auxiliar de Limpieza', base: 'Concepción', tipoContrato: 'PLAZO_FIJO', sueldoBruto: 650000, jornada: '45h', afp: 'Modelo', salud: 'FONASA', yearsAgo: 0, monthOffset: 3, estado: 'ACTIVO' },
  { rutBody: 12987654, nombres: 'Felipe Andrés', apellidos: 'Cáceres Mella', area: 'Operaciones', cargo: 'Técnico de Terreno', base: 'Antofagasta', tipoContrato: 'INDEFINIDO', sueldoBruto: 980000, jornada: '45h', afp: 'Uno', salud: 'FONASA', yearsAgo: 4, monthOffset: 11, estado: 'ACTIVO' },
];

interface DocSpec {
  tipoDocumento: string;
  nombre: string;
  // expiry expressed as days from now; null = no expiry
  vencEnDias: number | null;
}

// Rotated per employee so several docs expire within 30 days and a couple are
// already vencidos — this lights up the dashboard alert center.
const DOC_TEMPLATES: DocSpec[][] = [
  [
    { tipoDocumento: 'Contrato', nombre: 'Contrato de trabajo', vencEnDias: null },
    { tipoDocumento: 'Certificado AFP', nombre: 'Certificado de afiliación AFP', vencEnDias: 18 },
    { tipoDocumento: 'Examen ocupacional', nombre: 'Examen preocupacional', vencEnDias: -12 },
  ],
  [
    { tipoDocumento: 'Contrato', nombre: 'Contrato de trabajo', vencEnDias: null },
    { tipoDocumento: 'Licencia de conducir', nombre: 'Licencia de conducir clase D', vencEnDias: 9 },
    { tipoDocumento: 'Examen ocupacional', nombre: 'Examen de altura geográfica', vencEnDias: 240 },
    { tipoDocumento: 'Certificado AFP', nombre: 'Certificado AFP', vencEnDias: 120 },
  ],
  [
    { tipoDocumento: 'Contrato', nombre: 'Contrato de trabajo', vencEnDias: null },
    { tipoDocumento: 'Examen ocupacional', nombre: 'Examen ocupacional anual', vencEnDias: 27 },
    { tipoDocumento: 'Certificado AFP', nombre: 'Certificado de cotizaciones', vencEnDias: -3 },
  ],
  [
    { tipoDocumento: 'Contrato', nombre: 'Contrato a plazo fijo', vencEnDias: 60 },
    { tipoDocumento: 'Licencia de conducir', nombre: 'Licencia de conducir clase B', vencEnDias: 5 },
    { tipoDocumento: 'Examen ocupacional', nombre: 'Examen preocupacional', vencEnDias: 400 },
  ],
];

export async function seedEmployees(p: PrismaClient, companyId: string) {
  let empCount = 0;
  let contractCount = 0;
  let docCount = 0;
  let vacCount = 0;
  const created: { id: string; idx: number }[] = [];

  for (let i = 0; i < EMPLOYEES.length; i++) {
    const spec = EMPLOYEES[i];
    const rut = formatRut(spec.rutBody);
    const fechaIngreso = dateYearsAgo(spec.yearsAgo, spec.monthOffset);

    const employee = await prisma.employee.upsert({
      where: { companyId_rut: { companyId, rut } },
      update: {
        nombres: spec.nombres,
        apellidos: spec.apellidos,
        area: spec.area,
        cargo: spec.cargo,
        base: spec.base,
        estado: spec.estado,
        fechaIngreso,
      },
      create: {
        companyId,
        rut,
        nombres: spec.nombres,
        apellidos: spec.apellidos,
        email: `${spec.nombres.split(' ')[0].toLowerCase()}.${spec.apellidos.split(' ')[0].toLowerCase()}@empresademo.cl`,
        telefono: `+569${String(40000000 + spec.rutBody).slice(0, 8)}`,
        comuna: spec.base,
        ciudad: spec.base,
        fechaIngreso,
        area: spec.area,
        cargo: spec.cargo,
        base: spec.base,
        estado: spec.estado,
      },
    });
    empCount++;
    created.push({ id: employee.id, idx: i });

    // Active contract — recreate idempotently (delete + create keeps it simple).
    await prisma.employeeContract.deleteMany({ where: { employeeId: employee.id, companyId } });
    await prisma.employeeContract.create({
      data: {
        companyId,
        employeeId: employee.id,
        tipoContrato: spec.tipoContrato,
        sueldoBruto: spec.sueldoBruto,
        jornada: spec.jornada,
        cargo: spec.cargo,
        fechaInicio: fechaIngreso,
        fechaFin: spec.tipoContrato === 'PLAZO_FIJO' ? daysFromNow(90) : null,
        afp: spec.afp,
        salud: spec.salud,
        activo: true,
      },
    });
    contractCount++;

    // Documents — rotate template by index.
    await prisma.employeeDocument.deleteMany({ where: { employeeId: employee.id, companyId } });
    const docs = DOC_TEMPLATES[i % DOC_TEMPLATES.length];
    for (const d of docs) {
      const fechaVencimiento = d.vencEnDias === null ? null : daysFromNow(d.vencEnDias);
      let estado: 'VIGENTE' | 'POR_VENCER' | 'VENCIDO' = 'VIGENTE';
      if (fechaVencimiento) {
        if (d.vencEnDias! < 0) estado = 'VENCIDO';
        else if (d.vencEnDias! <= 30) estado = 'POR_VENCER';
      }
      await prisma.employeeDocument.create({
        data: {
          companyId,
          employeeId: employee.id,
          tipoDocumento: d.tipoDocumento,
          nombre: d.nombre,
          fechaEmision: fechaVencimiento ? daysFromNow((d.vencEnDias ?? 0) - 365) : fechaIngreso,
          fechaVencimiento,
          estado,
          fileName: `${d.tipoDocumento.toLowerCase().replace(/\s+/g, '_')}.pdf`,
          mimeType: 'application/pdf',
        },
      });
      docCount++;
    }

    // Vacation record — saldo = mesesTrabajados * 1.25 − diasTomados.
    const meses = Math.max(0, monthsBetween(fechaIngreso));
    const diasTomados = [0, 5, 10, 7.5, 12, 3][i % 6];
    await prisma.vacationRecord.deleteMany({ where: { employeeId: employee.id, companyId } });
    await prisma.vacationRecord.create({
      data: {
        companyId,
        employeeId: employee.id,
        mesesTrabajados: meses,
        diasTomados,
        fechaCorte: daysFromNow(0),
      },
    });
    vacCount++;
  }

  console.log(
    `  Employees: ${empCount} · Contracts: ${contractCount} · Documents: ${docCount} · Vacations: ${vacCount}`,
  );
  return created;
}

/* ── Licencias médicas (3–5 across employees) ───────────────────────────── */

export async function seedLicenses(
  p: PrismaClient,
  companyId: string,
  employees: { id: string; idx: number }[],
) {
  const specs: {
    empIdx: number;
    tipo: LicenseType;
    inicioDias: number;
    dias: number;
    estado: LicenseStatus;
    folio: string;
  }[] = [
    { empIdx: 1, tipo: 'ENFERMEDAD_COMUN', inicioDias: -8, dias: 7, estado: 'VIGENTE', folio: 'LM-2026-00481' },
    { empIdx: 3, tipo: 'ACCIDENTE', inicioDias: -20, dias: 30, estado: 'VIGENTE', folio: 'LM-2026-00512' },
    { empIdx: 6, tipo: 'MATERNAL', inicioDias: -45, dias: 126, estado: 'VIGENTE', folio: 'LM-2026-00377' },
    { empIdx: 9, tipo: 'ENFERMEDAD_COMUN', inicioDias: -60, dias: 5, estado: 'FINALIZADA', folio: 'LM-2026-00298' },
    { empIdx: 11, tipo: 'OTRO', inicioDias: -3, dias: 3, estado: 'VIGENTE', folio: 'LM-2026-00533' },
  ];

  let count = 0;
  for (const s of specs) {
    const emp = employees.find((e) => e.idx === s.empIdx);
    if (!emp) continue;
    const fechaInicio = daysFromNow(s.inicioDias);
    const fechaFin = daysFromNow(s.inicioDias + s.dias);
    // Idempotent by folio: clear prior license with same folio for this company.
    await prisma.license.deleteMany({ where: { companyId, folio: s.folio } });
    await prisma.license.create({
      data: {
        companyId,
        employeeId: emp.id,
        tipo: s.tipo,
        fechaInicio,
        fechaFin,
        dias: s.dias,
        folio: s.folio,
        estado: s.estado,
      },
    });
    count++;
  }
  console.log(`  Licenses: ${count}`);
  return count;
}

/* ── Certifications (habilitaciones del personal) ───────────────────────── */

interface CertSpec {
  empIdx: number;
  name: string;
  type: CertificationType;
  // expiry expressed as days from now; null = no expiry (permanently VIGENTE)
  vencEnDias: number | null;
  issuedHaceDias?: number;
}

// Engineered so the PILOTO_DRONE pool fires the alert center: of the 4 pilots
// (idx 0–3), 3 hold a VIGENTE RPAS cert, 1 (idx 1) has a POR_VENCER one, and the
// 4th (idx 3) is VENCIDA. Other roles carry SSOMA / técnica / faena / cliente
// certs (~2–3 per employee).
const CERT_SPECS: CertSpec[] = [
  // ── Pilotos de Drone (idx 0–3) ──────────────────────────────────────
  { empIdx: 0, name: 'Certificación de Piloto RPAS (DGAC)', type: 'PILOTO_DRONE', vencEnDias: 420, issuedHaceDias: 300 },
  { empIdx: 0, name: 'Curso SSOMA — Operaciones en faena minera', type: 'SEGURIDAD', vencEnDias: 180, issuedHaceDias: 185 },
  { empIdx: 0, name: 'Acreditación de Acceso — Minera Cordillera Blanca', type: 'CLIENTE', vencEnDias: 95, issuedHaceDias: 270 },

  { empIdx: 1, name: 'Certificación de Piloto RPAS (DGAC)', type: 'PILOTO_DRONE', vencEnDias: 360, issuedHaceDias: 365 },
  { empIdx: 1, name: 'Curso SSOMA — Trabajo en altura geográfica', type: 'SEGURIDAD', vencEnDias: 26, issuedHaceDias: 339 }, // POR_VENCER (alert)

  { empIdx: 2, name: 'Certificación de Piloto RPAS (DGAC)', type: 'PILOTO_DRONE', vencEnDias: 510, issuedHaceDias: 220 },
  { empIdx: 2, name: 'Curso SSOMA — Operaciones en faena minera', type: 'SEGURIDAD', vencEnDias: 140, issuedHaceDias: 225 },
  { empIdx: 2, name: 'Inducción Hombre Nuevo — Faena Norte', type: 'INDUCCION', vencEnDias: 200, issuedHaceDias: 160 },

  { empIdx: 3, name: 'Certificación de Piloto RPAS (DGAC)', type: 'PILOTO_DRONE', vencEnDias: -18, issuedHaceDias: 740 }, // VENCIDA
  { empIdx: 3, name: 'Curso SSOMA — Conducción a la defensiva', type: 'SEGURIDAD', vencEnDias: 260, issuedHaceDias: 100 },

  // ── Operador de Cámara (idx 5) ──────────────────────────────────────
  { empIdx: 5, name: 'Curso técnico — Captura termográfica aérea', type: 'TECNICA', vencEnDias: 365, issuedHaceDias: 30 },
  { empIdx: 5, name: 'Curso SSOMA — Operaciones en faena minera', type: 'SEGURIDAD', vencEnDias: 28, issuedHaceDias: 337 }, // POR_VENCER

  // ── Inspector Técnico (idx 6) ───────────────────────────────────────
  { empIdx: 6, name: 'Certificación de Inspección estructural ND', type: 'TECNICA', vencEnDias: 280, issuedHaceDias: 85 },
  { empIdx: 6, name: 'Acreditación Faena — Energía Solar Atacama', type: 'FAENA', vencEnDias: 150, issuedHaceDias: 200 },
  { empIdx: 6, name: 'Curso SSOMA — Riesgos eléctricos', type: 'SEGURIDAD', vencEnDias: 410, issuedHaceDias: 20 },

  // ── Técnico de Terreno (idx 7 y 13) ─────────────────────────────────
  { empIdx: 7, name: 'Curso técnico — Operación de equipos de limpieza industrial', type: 'TECNICA', vencEnDias: 330, issuedHaceDias: 60 },
  { empIdx: 7, name: 'Inducción Hombre Nuevo — Puerto Coronel', type: 'INDUCCION', vencEnDias: 110, issuedHaceDias: 255 },

  { empIdx: 13, name: 'Curso técnico — Operación de equipos de limpieza industrial', type: 'TECNICA', vencEnDias: 19, issuedHaceDias: 346 }, // POR_VENCER
  { empIdx: 13, name: 'Acreditación Faena — Minera Quebrada Verde', type: 'FAENA', vencEnDias: 240, issuedHaceDias: 120 },

  // ── Supervisor de Limpieza (idx 9) ──────────────────────────────────
  { empIdx: 9, name: 'Curso SSOMA — Manejo de sustancias peligrosas', type: 'SEGURIDAD', vencEnDias: 300, issuedHaceDias: 65 },
  { empIdx: 9, name: 'Acreditación Faena — Parque Solar Copiapó', type: 'FAENA', vencEnDias: 175, issuedHaceDias: 190 },

  // ── Prevencionista (idx 11) ─────────────────────────────────────────
  { empIdx: 11, name: 'Registro SEREMI — Experto Prevención de Riesgos', type: 'TECNICA', vencEnDias: null, issuedHaceDias: 1200 },
  { empIdx: 11, name: 'Curso SSOMA — Investigación de incidentes', type: 'SEGURIDAD', vencEnDias: 360, issuedHaceDias: 40 },

  // ── Auxiliar de Limpieza (idx 12) ───────────────────────────────────
  { empIdx: 12, name: 'Inducción Hombre Nuevo — Faena Norte', type: 'INDUCCION', vencEnDias: 90, issuedHaceDias: 80 },
];

export async function seedCertifications(
  p: PrismaClient,
  companyId: string,
  employees: { id: string; idx: number }[],
) {
  await prisma.certification.deleteMany({ where: { companyId } });
  let count = 0;
  for (const s of CERT_SPECS) {
    const emp = employees.find((e) => e.idx === s.empIdx);
    if (!emp) continue;
    const expiryDate = s.vencEnDias === null ? null : daysFromNow(s.vencEnDias);
    let status: CertificationStatus = 'VIGENTE';
    if (expiryDate) {
      if (s.vencEnDias! < 0) status = 'VENCIDA';
      else if (s.vencEnDias! <= 30) status = 'POR_VENCER';
    }
    await prisma.certification.create({
      data: {
        companyId,
        employeeId: emp.id,
        name: s.name,
        type: s.type,
        issuedDate: s.issuedHaceDias != null ? daysFromNow(-s.issuedHaceDias) : null,
        expiryDate,
        status,
        documentRef: `${s.type.toLowerCase()}_${s.empIdx}.pdf`,
      },
    });
    count++;
  }
  const byStatus = { VIGENTE: 0, POR_VENCER: 0, VENCIDA: 0 };
  for (const s of CERT_SPECS) {
    if (s.vencEnDias === null) byStatus.VIGENTE++;
    else if (s.vencEnDias < 0) byStatus.VENCIDA++;
    else if (s.vencEnDias <= 30) byStatus.POR_VENCER++;
    else byStatus.VIGENTE++;
  }
  console.log(
    `  Certifications: ${count} (VIGENTE ${byStatus.VIGENTE} · POR_VENCER ${byStatus.POR_VENCER} · VENCIDA ${byStatus.VENCIDA})`,
  );
  return count;
}

/* ── Service requirements (servicio Comercial → certificación) ──────────── */

interface ServiceReqSpec {
  serviceName: string; // MUST match a CRM_SERVICES name
  requiredCertType: CertificationType | null;
  requiresDrone: boolean;
  notes?: string;
}

// serviceName values match the seeded ServiceCatalog (CRM_SERVICES) EXACTLY.
// DRONE services → PILOTO_DRONE + requiresDrone; cleaning/inspection → TECNICA
// or null; audiovisual → null.
const SERVICE_REQUIREMENTS: ServiceReqSpec[] = [
  { serviceName: 'Inspección con dron', requiredCertType: 'PILOTO_DRONE', requiresDrone: true, notes: 'Requiere piloto RPAS certificado DGAC vigente.' },
  { serviceName: 'Termografía aérea', requiredCertType: 'PILOTO_DRONE', requiresDrone: true, notes: 'Piloto RPAS + cámara termográfica.' },
  { serviceName: 'Fotogrametría / ortofoto', requiredCertType: 'PILOTO_DRONE', requiresDrone: true, notes: 'Piloto RPAS + procesamiento fotogramétrico.' },
  { serviceName: 'Levantamiento topográfico con dron', requiredCertType: 'PILOTO_DRONE', requiresDrone: true, notes: 'Piloto RPAS + dron RTK.' },
  { serviceName: 'Monitoreo de avance de obra', requiredCertType: 'PILOTO_DRONE', requiresDrone: true, notes: 'Vuelos periódicos con piloto RPAS.' },
  { serviceName: 'Captura audiovisual', requiredCertType: null, requiresDrone: false, notes: 'Sin certificación específica requerida.' },
  { serviceName: 'Inspección estructural', requiredCertType: 'TECNICA', requiresDrone: false, notes: 'Inspector con certificación de ND estructural.' },
  { serviceName: 'Inspección de techumbre', requiredCertType: 'TECNICA', requiresDrone: false, notes: 'Inspector técnico de cubiertas.' },
  { serviceName: 'Inspección de caminos y faena', requiredCertType: null, requiresDrone: false },
  { serviceName: 'Limpieza industrial', requiredCertType: 'TECNICA', requiresDrone: false, notes: 'Operador de equipos de limpieza industrial.' },
  { serviceName: 'Limpieza de paneles solares', requiredCertType: 'TECNICA', requiresDrone: false, notes: 'Técnico de limpieza con acreditación de faena solar.' },
  { serviceName: 'Mantención preventiva industrial', requiredCertType: 'TECNICA', requiresDrone: false, notes: 'Técnico de mantención certificado.' },
];

export async function seedServiceRequirements(p: PrismaClient, companyId: string) {
  await prisma.serviceRequirement.deleteMany({ where: { companyId } });
  let count = 0;
  for (const s of SERVICE_REQUIREMENTS) {
    await prisma.serviceRequirement.create({
      data: {
        companyId,
        serviceName: s.serviceName,
        requiredCertType: s.requiredCertType,
        requiresDrone: s.requiresDrone,
        notes: s.notes ?? null,
      },
    });
    count++;
  }
  console.log(`  ServiceRequirements: ${count}`);
  return count;
}

/* ── Availability (disponibilidad del personal — mes actual) ────────────── */

// Per-employee day-of-month → status plan for the CURRENT month. Days NOT listed
// = no row = DISPONIBLE. Engineered for the golden thread: of the 3 pilots with
// a VIGENTE RPAS cert (idx 0, 2; idx 1 is POR_VENCER, idx 3 VENCIDA), exactly
// ~2 are DISPONIBLE TODAY. Pilot idx 0 → DISPONIBLE today; idx 1 (POR_VENCER,
// still counts as not-VIGENTE so not "qualified") ASIGNADO; idx 2 → DISPONIBLE;
// idx 3 → VACACIONES. → qualified ≈ 2 (idx 0, 2), available = 2, canStaff=true.
interface AvailDay {
  day: number; // day-of-month (1..28); we clamp to month length
  status: AvailabilityStatus;
  notes?: string;
}

const AVAILABILITY_PLAN: Record<number, AvailDay[]> = {
  // Pilotos
  0: [
    { day: 4, status: 'ASIGNADO', notes: 'Inspección rajo — Minera Cordillera Blanca' },
    { day: 5, status: 'ASIGNADO' },
    { day: 12, status: 'CAPACITACION', notes: 'Recurrent RPAS' },
    { day: 21, status: 'DIA_LIBRE' },
  ],
  1: [
    { day: 2, status: 'ASIGNADO' },
    { day: 9, status: 'ASIGNADO' },
    { day: 16, status: 'VACACIONES' },
    { day: 17, status: 'VACACIONES' },
  ],
  2: [
    { day: 3, status: 'CAPACITACION' },
    { day: 14, status: 'ASIGNADO', notes: 'Termografía planta solar' },
    { day: 24, status: 'DIA_LIBRE' },
  ],
  3: [
    { day: 6, status: 'VACACIONES' },
    { day: 7, status: 'VACACIONES' },
    { day: 22, status: 'LICENCIA', notes: 'Licencia médica' },
  ],
  // Comercial
  4: [
    { day: 10, status: 'ASIGNADO', notes: 'Visita cliente' },
    { day: 18, status: 'DIA_LIBRE' },
  ],
  // Operador de Cámara
  5: [
    { day: 8, status: 'ASIGNADO' },
    { day: 14, status: 'ASIGNADO', notes: 'Termografía planta solar' },
    { day: 25, status: 'CAPACITACION' },
  ],
  // Inspector Técnico
  6: [
    { day: 5, status: 'ASIGNADO', notes: 'Inspección estructural silos' },
    { day: 11, status: 'ASIGNADO' },
    { day: 19, status: 'DIA_LIBRE' },
  ],
  // Técnico de Terreno
  7: [
    { day: 7, status: 'ASIGNADO' },
    { day: 13, status: 'CAPACITACION' },
    { day: 20, status: 'VACACIONES' },
  ],
  // Comercial
  8: [{ day: 15, status: 'DIA_LIBRE' }],
  // Supervisor de Limpieza
  9: [
    { day: 6, status: 'ASIGNADO', notes: 'Limpieza paneles solares' },
    { day: 7, status: 'ASIGNADO' },
    { day: 23, status: 'DIA_LIBRE' },
  ],
  // Analista Administrativa
  10: [{ day: 17, status: 'CAPACITACION' }],
  // Prevencionista
  11: [
    { day: 9, status: 'ASIGNADO', notes: 'Auditoría SSOMA faena' },
    { day: 26, status: 'DIA_LIBRE' },
  ],
  // Auxiliar de Limpieza
  12: [
    { day: 6, status: 'ASIGNADO' },
    { day: 12, status: 'LICENCIA' },
  ],
  // Técnico de Terreno
  13: [
    { day: 8, status: 'ASIGNADO' },
    { day: 16, status: 'CAPACITACION' },
    { day: 27, status: 'DIA_LIBRE' },
  ],
};

/**
 * Builds a UTC-midnight Date for `day` of the CURRENT month, clamped to the last
 * day of the month so the plan stays valid in February etc.
 */
function dayOfCurrentMonth(day: number): Date {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const d = Math.min(day, lastDay);
  return new Date(Date.UTC(year, month, d));
}

export async function seedAvailability(
  p: PrismaClient,
  companyId: string,
  employees: { id: string; idx: number }[],
) {
  await prisma.employeeAvailability.deleteMany({ where: { companyId } });

  // Golden thread (engineered, date-robust). Of the 3 VIGENTE-cert pilots (idx
  // 0, 1, 2 — idx 3 is VENCIDA so never "qualified"), pin TODAY so exactly 2 are
  // DISPONIBLE: idx 0 & 2 DISPONIBLE (no today row), idx 1 ASIGNADO, idx 3
  // VACACIONES. → qualified=3, available=2, canStaff=true.
  const today = new Date().getDate();
  const TODAY_PIN: Record<number, AvailabilityStatus> = {
    0: 'DISPONIBLE',
    1: 'ASIGNADO',
    2: 'DISPONIBLE',
    3: 'VACACIONES',
  };
  let rowCount = 0;
  let currentMonthCount = 0;
  const todayDate = dayOfCurrentMonth(today);

  for (const emp of employees) {
    const plan = AVAILABILITY_PLAN[emp.idx] ?? [];
    const pin = TODAY_PIN[emp.idx];

    for (const item of plan) {
      // For pinned pilots, the explicit today-pin (below) wins over any plan row
      // that lands on today.
      if (pin !== undefined && item.day === today) continue;
      const date = dayOfCurrentMonth(item.day);
      await prisma.employeeAvailability.create({
        data: {
          companyId,
          employeeId: emp.id,
          date,
          status: item.status,
          notes: item.notes ?? null,
        },
      });
      rowCount++;
      currentMonthCount++;
    }

    // Insert the today-pin (skip DISPONIBLE — absence of a row already means it).
    if (pin !== undefined && pin !== 'DISPONIBLE') {
      await prisma.employeeAvailability.create({
        data: {
          companyId,
          employeeId: emp.id,
          date: todayDate,
          status: pin,
          notes: pin === 'ASIGNADO' ? 'Asignado a faena (hoy)' : 'Vacaciones (hoy)',
        },
      });
      rowCount++;
      currentMonthCount++;
    }
  }
  console.log(`  Availability rows: ${rowCount} (current-month: ${currentMonthCount})`);
  return rowCount;
}

/* ── Aggregate RRHH seeder (extensible entry point) ─────────────────────── */

export async function seedRrhh(p: PrismaClient, companyId: string) {
  console.log('› Seeding RRHH demo data…');
  await seedPayrollParameters(p, companyId);
  const employees = await seedEmployees(p, companyId);
  await seedLicenses(p, companyId, employees);
  await seedCertifications(p, companyId, employees);
  await seedServiceRequirements(p, companyId);
  await seedAvailability(p, companyId, employees);
  await reportForServiceGoldenThread(p, companyId, 'Inspección con dron');
}

/**
 * Replays the /rrhh/availability/for-service resolution against the just-seeded
 * data so the seed log confirms the golden thread (certified pilots + ≥1
 * DISPONIBLE today → canStaff=true). Pure read; mirrors AvailabilityService.
 */
async function reportForServiceGoldenThread(
  p: PrismaClient,
  companyId: string,
  service: string,
) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  const requirement = await prisma.serviceRequirement.findFirst({
    where: { companyId, serviceName: { equals: service, mode: 'insensitive' } },
  });
  const reqType = requirement?.requiredCertType ?? null;

  const employees = await prisma.employee.findMany({
    where: { companyId, estado: 'ACTIVO' },
    select: {
      nombres: true,
      apellidos: true,
      cargo: true,
      certifications: reqType
        ? { where: { type: reqType }, select: { expiryDate: true } }
        : false,
      availability: { where: { date: today }, select: { status: true } },
    },
  });

  const diasRest = (d: Date | null) => {
    if (!d) return null;
    const a = new Date(d);
    a.setUTCHours(0, 0, 0, 0);
    return Math.round((a.getTime() - today.getTime()) / 86_400_000);
  };

  let qualified = 0;
  let available = 0;
  const staff: string[] = [];
  for (const e of employees) {
    let qualifies = true;
    if (reqType) {
      const certs = (e.certifications ?? []) as { expiryDate: Date | null }[];
      qualifies = certs.some((c) => {
        if (!c.expiryDate) return true;
        const d = diasRest(c.expiryDate);
        return d !== null && d > 30; // VIGENTE
      });
    }
    if (!qualifies) continue;
    qualified++;
    const status = e.availability[0]?.status ?? 'DISPONIBLE';
    const isAvail = status === 'DISPONIBLE';
    if (isAvail) available++;
    staff.push(`${e.nombres} ${e.apellidos} (${e.cargo}) → ${status}${isAvail ? ' ✓' : ''}`);
  }

  console.log(
    `  [for-service] "${service}" reqType=${reqType ?? 'null'} requiresDrone=${
      requirement?.requiresDrone ?? false
    } → qualified=${qualified} available=${available} canStaff=${available > 0}`,
  );
  for (const s of staff) console.log(`      · ${s}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   MARKETING (DEMO) seed
   Idempotent: clears this company's marketing rows, then inserts a fresh,
   date-relative dataset. Campaign spend uses marketing_expenses as the spend
   source (campaign.cost is the planned budget). Some expenses carry a READ-ONLY
   Finance category reference (id + name) looked up from the existing Finance
   categories — never a real Finance movement.
   ═══════════════════════════════════════════════════════════════════════════ */

const MARKETING_CHANNELS = ['Google Ads', 'Meta', 'LinkedIn', 'Email', 'SEO'] as const;
type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

interface CampaignSpec {
  name: string;
  channel: MarketingChannel;
  startOffsetDays: number; // relative to today
  durationDays: number;
  cost: number;
  status: CampaignStatus;
  // Commercial brief (calendar upgrade). serviceAssociated is a B2B drone /
  // industrial service; targetSegment ∈ Minería / Construcción / Energía /
  // Inmobiliaria / Industrial; ctaType ∈ Cotización / Agendar visita / Demo /
  // Descarga.
  objective: string;
  serviceAssociated: string;
  targetSegment: string;
  zone: string;
  ownerName: string;
  ctaType: string;
  kpiTarget: string;
}

// 12 campaigns. NAMES + cost are STABLE (seedComercial links CRM leads/opps by
// campaign NAME — incl. the GOLDEN THREAD campaign "Generación de Leads B2B").
// Statuses now span all 8 CampaignStatus values; several campaigns span the
// CURRENT month (startOffset negative, ends in the future) and a couple are
// FINALIZADA (fully in the past). startDate/endDate are derived from offsets.
const CAMPAIGNS: CampaignSpec[] = [
  { name: 'Lanzamiento Servicios 2026 — Google', channel: 'Google Ads', startOffsetDays: -180, durationDays: 60, cost: 2400000, status: 'FINALIZADA',
    objective: 'Dar a conocer el portafolio de inspección con dron a faenas mineras del norte.', serviceAssociated: 'Inspección con dron', targetSegment: 'Minería', zone: 'Región de Antofagasta', ownerName: 'Camila Rojas', ctaType: 'Cotización', kpiTarget: '40 leads / 8 oportunidades' },
  { name: 'Remarketing Verano', channel: 'Meta', startOffsetDays: -150, durationDays: 45, cost: 1350000, status: 'ANALIZADA',
    objective: 'Reimpactar visitantes interesados en limpieza de paneles solares.', serviceAssociated: 'Limpieza de paneles solares', targetSegment: 'Energía', zone: 'Región de Atacama', ownerName: 'Andrés Soto', ctaType: 'Agendar visita', kpiTarget: '25 leads / 5 oportunidades' },
  { name: 'Generación de Leads B2B', channel: 'LinkedIn', startOffsetDays: -28, durationDays: 90, cost: 3200000, status: 'ACTIVA',
    objective: 'Generar leads calificados B2B de servicios aéreos para minería y construcción.', serviceAssociated: 'Fotogrametría / ortofoto', targetSegment: 'Construcción', zone: 'Región Metropolitana', ownerName: 'Camila Rojas', ctaType: 'Demo', kpiTarget: '60 leads / 12 oportunidades' },
  { name: 'Newsletter Clientes Q1', channel: 'Email', startOffsetDays: -90, durationDays: 30, cost: 320000, status: 'FINALIZADA',
    objective: 'Reactivar cartera con casos de termografía aérea.', serviceAssociated: 'Termografía aérea', targetSegment: 'Industrial', zone: 'Región del Biobío', ownerName: 'Valentina Muñoz', ctaType: 'Descarga', kpiTarget: '15 leads / 3 oportunidades' },
  { name: 'Posicionamiento Orgánico Servicios', channel: 'SEO', startOffsetDays: -75, durationDays: 120, cost: 1800000, status: 'ACTIVA',
    objective: 'Posicionar contenidos de fotogrametría y avance de obra en buscadores.', serviceAssociated: 'Monitoreo de avance de obra', targetSegment: 'Construcción', zone: 'Nacional', ownerName: 'Felipe Carrasco', ctaType: 'Cotización', kpiTarget: '30 leads / 6 oportunidades' },
  { name: 'Campaña Marca — Search', channel: 'Google Ads', startOffsetDays: -18, durationDays: 50, cost: 2750000, status: 'EN_PRODUCCION',
    objective: 'Capturar demanda de marca y términos de inspección de caminos en faena.', serviceAssociated: 'Inspección de caminos y faena', targetSegment: 'Minería', zone: 'Región de Tarapacá', ownerName: 'Andrés Soto', ctaType: 'Cotización', kpiTarget: '45 leads / 9 oportunidades' },
  { name: 'Captación Pymes — Meta Ads', channel: 'Meta', startOffsetDays: -12, durationDays: 40, cost: 1650000, status: 'ACTIVA',
    objective: 'Captar pymes constructoras con video aéreo de obras.', serviceAssociated: 'Captura audiovisual', targetSegment: 'Inmobiliaria', zone: 'Región Metropolitana', ownerName: 'Valentina Muñoz', ctaType: 'Agendar visita', kpiTarget: '35 leads / 7 oportunidades' },
  { name: 'Webinar Gestión Operacional', channel: 'LinkedIn', startOffsetDays: -3, durationDays: 21, cost: 980000, status: 'PROGRAMADA',
    objective: 'Atraer jefaturas de mantenimiento a un webinar sobre inspección estructural.', serviceAssociated: 'Inspección estructural', targetSegment: 'Industrial', zone: 'Nacional', ownerName: 'Felipe Carrasco', ctaType: 'Descarga', kpiTarget: '50 inscritos / 10 leads' },
  { name: 'Promo Otoño Servicios', channel: 'Google Ads', startOffsetDays: 12, durationDays: 30, cost: 2100000, status: 'PROGRAMADA',
    objective: 'Promoción de limpieza industrial para cierre de temporada.', serviceAssociated: 'Limpieza industrial', targetSegment: 'Industrial', zone: 'Región del Maule', ownerName: 'Camila Rojas', ctaType: 'Cotización', kpiTarget: '28 leads / 6 oportunidades' },
  { name: 'Lanzamiento Módulo RRHH', channel: 'Meta', startOffsetDays: 25, durationDays: 45, cost: 1450000, status: 'BORRADOR',
    objective: 'Anticipar interés en topografía con dron para nuevos proyectos.', serviceAssociated: 'Levantamiento topográfico con dron', targetSegment: 'Construcción', zone: 'Región de Valparaíso', ownerName: 'Andrés Soto', ctaType: 'Demo', kpiTarget: '20 leads / 4 oportunidades' },
  { name: 'Campaña Fidelización Email', channel: 'Email', startOffsetDays: 5, durationDays: 60, cost: 280000, status: 'PAUSADA',
    objective: 'Fidelizar clientes con contratos anuales de monitoreo aéreo.', serviceAssociated: 'Monitoreo de avance de obra', targetSegment: 'Energía', zone: 'Región de Magallanes', ownerName: 'Valentina Muñoz', ctaType: 'Agendar visita', kpiTarget: '18 leads / 4 oportunidades' },
  { name: 'Expansión Regiones — LinkedIn', channel: 'LinkedIn', startOffsetDays: 8, durationDays: 90, cost: 3500000, status: 'PLANIFICADA',
    objective: 'Abrir nuevos mercados regionales de inspección con dron en faenas.', serviceAssociated: 'Inspección con dron', targetSegment: 'Minería', zone: 'Región de Coquimbo', ownerName: 'Felipe Carrasco', ctaType: 'Cotización', kpiTarget: '40 leads / 8 oportunidades' },
];

// Expense rows. campaignIdx links to CAMPAIGNS by index (null = unattached).
// finance flag = tag this expense with a Finance category (display only).
interface ExpenseSpec {
  campaignIdx: number | null;
  channel: MarketingChannel;
  amount: number;
  dateOffsetDays: number;
  description: string;
  finance: boolean;
}

const EXPENSES: ExpenseSpec[] = [
  { campaignIdx: 0, channel: 'Google Ads', amount: 1200000, dateOffsetDays: -175, description: 'Inversión Google Ads — primera quincena', finance: true },
  { campaignIdx: 0, channel: 'Google Ads', amount: 1180000, dateOffsetDays: -160, description: 'Inversión Google Ads — segunda quincena', finance: true },
  { campaignIdx: 1, channel: 'Meta', amount: 680000, dateOffsetDays: -148, description: 'Meta Ads — remarketing dinámico', finance: true },
  { campaignIdx: 1, channel: 'Meta', amount: 640000, dateOffsetDays: -130, description: 'Meta Ads — audiencias similares', finance: false },
  { campaignIdx: 2, channel: 'LinkedIn', amount: 1600000, dateOffsetDays: -118, description: 'LinkedIn — InMail patrocinado', finance: true },
  { campaignIdx: 2, channel: 'LinkedIn', amount: 1500000, dateOffsetDays: -90, description: 'LinkedIn — contenido patrocinado', finance: true },
  { campaignIdx: 3, channel: 'Email', amount: 180000, dateOffsetDays: -88, description: 'Plataforma de email marketing — plan mensual', finance: true },
  { campaignIdx: 3, channel: 'Email', amount: 120000, dateOffsetDays: -70, description: 'Diseño de plantilla newsletter', finance: false },
  { campaignIdx: 4, channel: 'SEO', amount: 450000, dateOffsetDays: -70, description: 'Consultoría SEO — auditoría técnica', finance: true },
  { campaignIdx: 4, channel: 'SEO', amount: 420000, dateOffsetDays: -40, description: 'SEO — creación de contenidos', finance: false },
  { campaignIdx: 4, channel: 'SEO', amount: 400000, dateOffsetDays: -12, description: 'SEO — linkbuilding', finance: false },
  { campaignIdx: 5, channel: 'Google Ads', amount: 950000, dateOffsetDays: -18, description: 'Google Ads — campaña de marca', finance: true },
  { campaignIdx: 5, channel: 'Google Ads', amount: 880000, dateOffsetDays: -6, description: 'Google Ads — términos de servicio', finance: true },
  { campaignIdx: 6, channel: 'Meta', amount: 720000, dateOffsetDays: -8, description: 'Meta Ads — captación pymes', finance: false },
  { campaignIdx: 6, channel: 'Meta', amount: 540000, dateOffsetDays: -2, description: 'Meta Ads — creatividades video', finance: false },
  { campaignIdx: 7, channel: 'LinkedIn', amount: 380000, dateOffsetDays: -4, description: 'LinkedIn — promoción webinar', finance: true },
  { campaignIdx: 7, channel: 'LinkedIn', amount: 260000, dateOffsetDays: -1, description: 'Herramienta de webinar — licencia', finance: false },
  { campaignIdx: null, channel: 'Google Ads', amount: 320000, dateOffsetDays: -30, description: 'Producción de banners display', finance: false },
  { campaignIdx: null, channel: 'Meta', amount: 290000, dateOffsetDays: -22, description: 'Agencia creativa — set de piezas', finance: true },
  { campaignIdx: null, channel: 'Email', amount: 95000, dateOffsetDays: -15, description: 'Compra de base de datos depurada', finance: false },
  { campaignIdx: null, channel: 'SEO', amount: 150000, dateOffsetDays: -9, description: 'Herramienta de keywords — suscripción', finance: true },
  { campaignIdx: null, channel: 'LinkedIn', amount: 210000, dateOffsetDays: -5, description: 'Sesión de fotografía corporativa', finance: false },
  { campaignIdx: 5, channel: 'Google Ads', amount: 760000, dateOffsetDays: -1, description: 'Google Ads — ajuste de pujas', finance: false },
  { campaignIdx: 4, channel: 'SEO', amount: 380000, dateOffsetDays: 0, description: 'SEO — optimización on-page', finance: true },
];

/* ── Current-month anchor helper (calendar upgrade) ──────────────────────────
   Returns a date pinned to day `day` of the CURRENT month (clamped to the
   month's length), so calendar items reliably land in the visible board month
   regardless of when the seed runs. */
function dayThisMonth(day: number): Date {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const d = new Date(now.getFullYear(), now.getMonth(), Math.min(Math.max(day, 1), lastDay));
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Calendar items (multi-type operational board) ────────────────────────────
// anchor 'month' → day-of-CURRENT-month via dayThisMonth(day); anchor 'offset'
// → daysFromNow(day). campaignIdx links to CAMPAIGNS by index (null = standalone).
// Drone / industrial domain titles. Statuses span the board's lifecycle; a few
// are OVERDUE (past date + PENDIENTE/EN_PROGRESO) and several are
// COMPLETADO/PUBLICADO. A good number land in the CURRENT month.
interface CalendarItemSpec {
  type: CalendarItemType;
  title: string;
  anchor: 'month' | 'offset';
  day: number; // day-of-month (anchor 'month') OR offset-in-days (anchor 'offset')
  spanDays?: number; // optional endDate = start + spanDays
  channel: string | null;
  status: CalendarItemStatus;
  ownerName: string;
  serviceName: string | null;
  targetSegment: string | null;
  zone: string | null;
  campaignIdx: number | null;
}

const CALENDAR_ITEMS: CalendarItemSpec[] = [
  // ── CURRENT MONTH — campaign milestones ──
  { type: 'CAMPANA', title: 'Inicio campaña Generación de Leads B2B', anchor: 'month', day: 2, channel: 'LinkedIn', status: 'EN_PROGRESO', ownerName: 'Camila Rojas', serviceName: 'Fotogrametría / ortofoto', targetSegment: 'Construcción', zone: 'Región Metropolitana', campaignIdx: 2 },
  { type: 'CAMPANA', title: 'Hito campaña Marca — Search', anchor: 'month', day: 6, channel: 'Google Ads', status: 'EN_PROGRESO', ownerName: 'Andrés Soto', serviceName: 'Inspección de caminos y faena', targetSegment: 'Minería', zone: 'Región de Tarapacá', campaignIdx: 5 },
  // ── CURRENT MONTH — organic posts ──
  { type: 'PUBLICACION', title: 'Post LinkedIn: inspección termográfica de techumbres', anchor: 'month', day: 4, channel: 'LinkedIn', status: 'PUBLICADO', ownerName: 'Valentina Muñoz', serviceName: 'Termografía aérea', targetSegment: 'Industrial', zone: 'Región del Biobío', campaignIdx: 3 },
  { type: 'PUBLICACION', title: 'Reel: limpieza de paneles solares en el desierto', anchor: 'month', day: 7, channel: 'Instagram', status: 'PROGRAMADO', ownerName: 'Valentina Muñoz', serviceName: 'Limpieza de paneles solares', targetSegment: 'Energía', zone: 'Región de Atacama', campaignIdx: 1 },
  { type: 'PUBLICACION', title: 'Post LinkedIn: caso de inspección de aerogeneradores', anchor: 'month', day: 11, channel: 'LinkedIn', status: 'PENDIENTE', ownerName: 'Camila Rojas', serviceName: 'Inspección con dron', targetSegment: 'Energía', zone: 'Región de Magallanes', campaignIdx: null },
  { type: 'PUBLICACION', title: 'Reel: avance de obra con dron en faena minera', anchor: 'month', day: 16, channel: 'Instagram', status: 'PENDIENTE', ownerName: 'Felipe Carrasco', serviceName: 'Monitoreo de avance de obra', targetSegment: 'Construcción', zone: 'Región Metropolitana', campaignIdx: 4 },
  { type: 'PUBLICACION', title: 'Post: orto­foto georreferenciada de proyecto inmobiliario', anchor: 'month', day: 23, channel: 'LinkedIn', status: 'PENDIENTE', ownerName: 'Valentina Muñoz', serviceName: 'Fotogrametría / ortofoto', targetSegment: 'Inmobiliaria', zone: 'Región de Valparaíso', campaignIdx: null },
  // ── CURRENT MONTH — SEO content ──
  { type: 'CONTENIDO_SEO', title: 'Blog: fotogrametría para control de avance de obra', anchor: 'month', day: 5, channel: 'SEO', status: 'PUBLICADO', ownerName: 'Felipe Carrasco', serviceName: 'Monitoreo de avance de obra', targetSegment: 'Construcción', zone: 'Nacional', campaignIdx: 4 },
  { type: 'CONTENIDO_SEO', title: 'Blog: cómo la termografía aérea detecta puntos calientes', anchor: 'month', day: 13, channel: 'SEO', status: 'EN_PROGRESO', ownerName: 'Felipe Carrasco', serviceName: 'Termografía aérea', targetSegment: 'Energía', zone: 'Nacional', campaignIdx: 4 },
  { type: 'CONTENIDO_SEO', title: 'Guía: inspección de caminos de faena con dron', anchor: 'month', day: 20, channel: 'SEO', status: 'PENDIENTE', ownerName: 'Felipe Carrasco', serviceName: 'Inspección de caminos y faena', targetSegment: 'Minería', zone: 'Nacional', campaignIdx: null },
  // ── CURRENT MONTH — email sends ──
  { type: 'EMAIL', title: 'Email leads inmobiliaria — ortofoto de proyectos', anchor: 'month', day: 8, channel: 'Email', status: 'PROGRAMADO', ownerName: 'Valentina Muñoz', serviceName: 'Fotogrametría / ortofoto', targetSegment: 'Inmobiliaria', zone: 'Región Metropolitana', campaignIdx: 6 },
  { type: 'EMAIL', title: 'Newsletter clientes minería — inspección de rajo', anchor: 'month', day: 15, channel: 'Email', status: 'PENDIENTE', ownerName: 'Camila Rojas', serviceName: 'Inspección con dron', targetSegment: 'Minería', zone: 'Región de Antofagasta', campaignIdx: null },
  { type: 'EMAIL', title: 'Email reactivación cartera — limpieza industrial', anchor: 'month', day: 26, channel: 'Email', status: 'PENDIENTE', ownerName: 'Andrés Soto', serviceName: 'Limpieza industrial', targetSegment: 'Industrial', zone: 'Región del Maule', campaignIdx: null },
  // ── CURRENT MONTH — paid ad flights ──
  { type: 'CAMPANA_PAGADA', title: 'Google Ads: inspección de caminos en faena minera', anchor: 'month', day: 3, spanDays: 14, channel: 'Google Ads', status: 'EN_PROGRESO', ownerName: 'Andrés Soto', serviceName: 'Inspección de caminos y faena', targetSegment: 'Minería', zone: 'Región de Tarapacá', campaignIdx: 5 },
  { type: 'CAMPANA_PAGADA', title: 'Meta Ads: captación pymes constructoras', anchor: 'month', day: 9, spanDays: 12, channel: 'Meta', status: 'EN_PROGRESO', ownerName: 'Valentina Muñoz', serviceName: 'Captura audiovisual', targetSegment: 'Inmobiliaria', zone: 'Región Metropolitana', campaignIdx: 6 },
  { type: 'CAMPANA_PAGADA', title: 'LinkedIn Ads: leads B2B servicios aéreos', anchor: 'month', day: 14, spanDays: 10, channel: 'LinkedIn', status: 'PROGRAMADO', ownerName: 'Camila Rojas', serviceName: 'Fotogrametría / ortofoto', targetSegment: 'Construcción', zone: 'Región Metropolitana', campaignIdx: 2 },
  // ── CURRENT MONTH — events ──
  { type: 'EVENTO', title: 'Feria ExpoMIN — stand de servicios con dron', anchor: 'month', day: 18, spanDays: 3, channel: 'Evento', status: 'PROGRAMADO', ownerName: 'Camila Rojas', serviceName: 'Inspección con dron', targetSegment: 'Minería', zone: 'Región Metropolitana', campaignIdx: null },
  { type: 'EVENTO', title: 'Webinar gestión operacional — inspección estructural', anchor: 'month', day: 24, channel: 'LinkedIn', status: 'PROGRAMADO', ownerName: 'Felipe Carrasco', serviceName: 'Inspección estructural', targetSegment: 'Industrial', zone: 'Nacional', campaignIdx: 7 },
  // ── CURRENT MONTH — tasks ──
  { type: 'TAREA', title: 'Aprobar arte campaña minería', anchor: 'month', day: 1, channel: null, status: 'COMPLETADO', ownerName: 'Camila Rojas', serviceName: null, targetSegment: 'Minería', zone: 'Región de Antofagasta', campaignIdx: 0 },
  { type: 'TAREA', title: 'Preparar guion de reel de paneles solares', anchor: 'month', day: 6, channel: null, status: 'EN_PROGRESO', ownerName: 'Valentina Muñoz', serviceName: 'Limpieza de paneles solares', targetSegment: 'Energía', zone: 'Región de Atacama', campaignIdx: 1 },
  { type: 'TAREA', title: 'Revisar copy de email a leads inmobiliaria', anchor: 'month', day: 7, channel: null, status: 'PENDIENTE', ownerName: 'Valentina Muñoz', serviceName: null, targetSegment: 'Inmobiliaria', zone: 'Región Metropolitana', campaignIdx: 6 },
  { type: 'TAREA', title: 'Coordinar logística del stand ExpoMIN', anchor: 'month', day: 12, channel: null, status: 'PENDIENTE', ownerName: 'Andrés Soto', serviceName: null, targetSegment: 'Minería', zone: 'Región Metropolitana', campaignIdx: null },
  // ── CURRENT MONTH — CRM actions ──
  { type: 'ACCION_CRM', title: 'Llamar leads calificados de termografía solar', anchor: 'month', day: 10, channel: null, status: 'PENDIENTE', ownerName: 'Andrés Soto', serviceName: 'Termografía aérea', targetSegment: 'Energía', zone: 'Región de Atacama', campaignIdx: 2 },
  { type: 'ACCION_CRM', title: 'Seguimiento oportunidad contrato anual — Energía Solar', anchor: 'month', day: 19, channel: null, status: 'PENDIENTE', ownerName: 'Camila Rojas', serviceName: 'Monitoreo de avance de obra', targetSegment: 'Energía', zone: 'Región de Atacama', campaignIdx: 6 },
  { type: 'ACCION_CRM', title: 'Calificar leads de feria de obra inmobiliaria', anchor: 'month', day: 25, channel: null, status: 'PENDIENTE', ownerName: 'Valentina Muñoz', serviceName: null, targetSegment: 'Inmobiliaria', zone: 'Región Metropolitana', campaignIdx: null },

  // ── PAST WEEKS (OVERDUE — past date + PENDIENTE/EN_PROGRESO) ──
  { type: 'PUBLICACION', title: 'Post LinkedIn: inspección estructural de silos', anchor: 'offset', day: -16, channel: 'LinkedIn', status: 'PENDIENTE', ownerName: 'Felipe Carrasco', serviceName: 'Inspección estructural', targetSegment: 'Industrial', zone: 'Región del Biobío', campaignIdx: null },
  { type: 'TAREA', title: 'Editar video de limpieza industrial portuaria', anchor: 'offset', day: -12, channel: null, status: 'EN_PROGRESO', ownerName: 'Valentina Muñoz', serviceName: 'Limpieza industrial', targetSegment: 'Industrial', zone: 'Región del Biobío', campaignIdx: null },
  { type: 'ACCION_CRM', title: 'Recontactar lead de inspección de aerogeneradores', anchor: 'offset', day: -9, channel: null, status: 'PENDIENTE', ownerName: 'Felipe Carrasco', serviceName: 'Inspección con dron', targetSegment: 'Energía', zone: 'Región de Magallanes', campaignIdx: 2 },
  { type: 'EMAIL', title: 'Email pendiente — caso de fotogrametría de tronadura', anchor: 'offset', day: -7, channel: 'Email', status: 'PENDIENTE', ownerName: 'Camila Rojas', serviceName: 'Fotogrametría / ortofoto', targetSegment: 'Minería', zone: 'Región de Antofagasta', campaignIdx: null },

  // ── PAST WEEKS (DONE — COMPLETADO / PUBLICADO) ──
  { type: 'PUBLICACION', title: 'Post: caso de éxito inspección de rajo minero', anchor: 'offset', day: -20, channel: 'LinkedIn', status: 'PUBLICADO', ownerName: 'Camila Rojas', serviceName: 'Inspección con dron', targetSegment: 'Minería', zone: 'Región de Antofagasta', campaignIdx: 0 },
  { type: 'CONTENIDO_SEO', title: 'Blog publicado: topografía con dron RTK', anchor: 'offset', day: -18, channel: 'SEO', status: 'PUBLICADO', ownerName: 'Felipe Carrasco', serviceName: 'Levantamiento topográfico con dron', targetSegment: 'Construcción', zone: 'Nacional', campaignIdx: 4 },
  { type: 'EMAIL', title: 'Newsletter Q1 enviado — termografía aérea', anchor: 'offset', day: -14, channel: 'Email', status: 'COMPLETADO', ownerName: 'Valentina Muñoz', serviceName: 'Termografía aérea', targetSegment: 'Industrial', zone: 'Región del Biobío', campaignIdx: 3 },
  { type: 'TAREA', title: 'Cerrar reporte de campaña de remarketing verano', anchor: 'offset', day: -10, channel: null, status: 'COMPLETADO', ownerName: 'Andrés Soto', serviceName: 'Limpieza de paneles solares', targetSegment: 'Energía', zone: 'Región de Atacama', campaignIdx: 1 },

  // ── FUTURE WEEKS (next ±3 weeks) ──
  { type: 'CAMPANA', title: 'Lanzamiento Promo Otoño Servicios', anchor: 'offset', day: 12, channel: 'Google Ads', status: 'PROGRAMADO', ownerName: 'Camila Rojas', serviceName: 'Limpieza industrial', targetSegment: 'Industrial', zone: 'Región del Maule', campaignIdx: 8 },
  { type: 'PUBLICACION', title: 'Post programado: expansión a nuevas regiones', anchor: 'offset', day: 9, channel: 'LinkedIn', status: 'PROGRAMADO', ownerName: 'Felipe Carrasco', serviceName: 'Inspección con dron', targetSegment: 'Minería', zone: 'Región de Coquimbo', campaignIdx: 11 },
  { type: 'EVENTO', title: 'Demo en terreno — inspección con dron a cliente minero', anchor: 'offset', day: 16, channel: 'Evento', status: 'PROGRAMADO', ownerName: 'Andrés Soto', serviceName: 'Inspección con dron', targetSegment: 'Minería', zone: 'Región de Antofagasta', campaignIdx: null },
  { type: 'TAREA', title: 'Brief de creatividades para lanzamiento topografía', anchor: 'offset', day: 18, channel: null, status: 'PENDIENTE', ownerName: 'Valentina Muñoz', serviceName: 'Levantamiento topográfico con dron', targetSegment: 'Construcción', zone: 'Región de Valparaíso', campaignIdx: 9 },
];

// ── Campaign tasks (per ACTIVA / EN_PRODUCCION campaign) ─────────────────────
// dueOffsetDays relative to today; a few OVERDUE (negative + done:false) and a
// few done:true. campaignIdx → CAMPAIGNS index.
interface CampaignTaskSpec {
  campaignIdx: number;
  title: string;
  type: CampaignTaskType;
  dueOffsetDays: number;
  done: boolean;
  ownerName: string;
}

const CAMPAIGN_TASKS: CampaignTaskSpec[] = [
  // idx 2 — Generación de Leads B2B (ACTIVA, golden thread)
  { campaignIdx: 2, title: 'Redactar contenidos del flujo de leads B2B', type: 'CONTENIDO', dueOffsetDays: -6, done: true, ownerName: 'Camila Rojas' },
  { campaignIdx: 2, title: 'Diseñar piezas para LinkedIn Ads', type: 'DISENO', dueOffsetDays: -2, done: true, ownerName: 'Valentina Muñoz' },
  { campaignIdx: 2, title: 'Aprobar segmentación y presupuesto', type: 'APROBACION', dueOffsetDays: 1, done: false, ownerName: 'Felipe Carrasco' },
  { campaignIdx: 2, title: 'Configurar formularios y seguimiento UTM', type: 'CONFIGURACION', dueOffsetDays: 3, done: false, ownerName: 'Andrés Soto' },
  { campaignIdx: 2, title: 'Publicar flight de anuncios', type: 'PUBLICACION', dueOffsetDays: 5, done: false, ownerName: 'Camila Rojas' },
  { campaignIdx: 2, title: 'Contactar primeros leads calificados', type: 'CONTACTO_LEADS', dueOffsetDays: 8, done: false, ownerName: 'Andrés Soto' },
  // idx 4 — Posicionamiento Orgánico Servicios (ACTIVA)
  { campaignIdx: 4, title: 'Redactar 3 blogs de fotogrametría y obra', type: 'CONTENIDO', dueOffsetDays: -4, done: true, ownerName: 'Felipe Carrasco' },
  { campaignIdx: 4, title: 'Diseñar infografía de avance de obra', type: 'DISENO', dueOffsetDays: 2, done: false, ownerName: 'Valentina Muñoz' },
  { campaignIdx: 4, title: 'Revisar on-page y enlaces internos', type: 'REVISION', dueOffsetDays: 6, done: false, ownerName: 'Felipe Carrasco' },
  { campaignIdx: 4, title: 'Publicar nuevos contenidos optimizados', type: 'PUBLICACION', dueOffsetDays: -1, done: false, ownerName: 'Felipe Carrasco' },
  // idx 5 — Campaña Marca — Search (EN_PRODUCCION)
  { campaignIdx: 5, title: 'Configurar campañas de marca y servicio', type: 'CONFIGURACION', dueOffsetDays: -3, done: true, ownerName: 'Andrés Soto' },
  { campaignIdx: 5, title: 'Aprobar copies de anuncios de búsqueda', type: 'APROBACION', dueOffsetDays: 1, done: false, ownerName: 'Camila Rojas' },
  { campaignIdx: 5, title: 'Diseñar extensiones y assets de imagen', type: 'DISENO', dueOffsetDays: 4, done: false, ownerName: 'Valentina Muñoz' },
  { campaignIdx: 5, title: 'Revisar términos negativos y pujas', type: 'REVISION', dueOffsetDays: 7, done: false, ownerName: 'Andrés Soto' },
  // idx 6 — Captación Pymes — Meta Ads (ACTIVA)
  { campaignIdx: 6, title: 'Producir video aéreo de obra para anuncios', type: 'CONTENIDO', dueOffsetDays: -5, done: true, ownerName: 'Valentina Muñoz' },
  { campaignIdx: 6, title: 'Configurar audiencias y catálogo en Meta', type: 'CONFIGURACION', dueOffsetDays: -1, done: false, ownerName: 'Andrés Soto' },
  { campaignIdx: 6, title: 'Aprobar creatividades de captación pymes', type: 'APROBACION', dueOffsetDays: 2, done: false, ownerName: 'Camila Rojas' },
  { campaignIdx: 6, title: 'Contactar leads entrantes de Meta', type: 'CONTACTO_LEADS', dueOffsetDays: 6, done: false, ownerName: 'Valentina Muñoz' },
];

// ── Campaign metrics (one per campaign) ──────────────────────────────────────
// Directional funnel snapshot, roughly coherent with the campaign cost. Backend
// overlays LIVE CRM counts on top of these at query time.
interface CampaignMetricSpec {
  leadsGenerated: number;
  leadsQualified: number;
  meetingsBooked: number;
  quotesIssued: number;
  opportunitiesCreated: number;
  salesClosed: number;
  costPerLead: number;
  attributedRevenue: number;
}

// Indexed by CAMPAIGNS index (12 entries). attributedRevenue in CLP.
const CAMPAIGN_METRICS: CampaignMetricSpec[] = [
  { leadsGenerated: 38, leadsQualified: 19, meetingsBooked: 11, quotesIssued: 7, opportunitiesCreated: 8, salesClosed: 3, costPerLead: 63000, attributedRevenue: 14800000 }, // 0
  { leadsGenerated: 24, leadsQualified: 12, meetingsBooked: 6, quotesIssued: 4, opportunitiesCreated: 5, salesClosed: 2, costPerLead: 56000, attributedRevenue: 9200000 }, // 1
  { leadsGenerated: 52, leadsQualified: 28, meetingsBooked: 16, quotesIssued: 11, opportunitiesCreated: 12, salesClosed: 4, costPerLead: 61000, attributedRevenue: 24300000 }, // 2 golden
  { leadsGenerated: 14, leadsQualified: 6, meetingsBooked: 3, quotesIssued: 2, opportunitiesCreated: 2, salesClosed: 1, costPerLead: 23000, attributedRevenue: 3100000 }, // 3
  { leadsGenerated: 31, leadsQualified: 17, meetingsBooked: 9, quotesIssued: 6, opportunitiesCreated: 7, salesClosed: 2, costPerLead: 58000, attributedRevenue: 11600000 }, // 4
  { leadsGenerated: 27, leadsQualified: 14, meetingsBooked: 8, quotesIssued: 5, opportunitiesCreated: 6, salesClosed: 1, costPerLead: 102000, attributedRevenue: 6400000 }, // 5
  { leadsGenerated: 33, leadsQualified: 16, meetingsBooked: 9, quotesIssued: 5, opportunitiesCreated: 7, salesClosed: 2, costPerLead: 50000, attributedRevenue: 10800000 }, // 6
  { leadsGenerated: 9, leadsQualified: 4, meetingsBooked: 2, quotesIssued: 1, opportunitiesCreated: 1, salesClosed: 0, costPerLead: 109000, attributedRevenue: 0 }, // 7
  { leadsGenerated: 0, leadsQualified: 0, meetingsBooked: 0, quotesIssued: 0, opportunitiesCreated: 0, salesClosed: 0, costPerLead: 0, attributedRevenue: 0 }, // 8 programada
  { leadsGenerated: 0, leadsQualified: 0, meetingsBooked: 0, quotesIssued: 0, opportunitiesCreated: 0, salesClosed: 0, costPerLead: 0, attributedRevenue: 0 }, // 9 borrador
  { leadsGenerated: 6, leadsQualified: 2, meetingsBooked: 1, quotesIssued: 1, opportunitiesCreated: 1, salesClosed: 0, costPerLead: 47000, attributedRevenue: 0 }, // 10 pausada
  { leadsGenerated: 0, leadsQualified: 0, meetingsBooked: 0, quotesIssued: 0, opportunitiesCreated: 0, salesClosed: 0, costPerLead: 0, attributedRevenue: 0 }, // 11 planificada
];

interface SeoSpec {
  keyword: string;
  currentPosition: number;
  previousPosition: number;
  monthlyTraffic: number;
  url: string;
}

const SEO_KEYWORDS: SeoSpec[] = [
  { keyword: 'software gestión operacional pymes', currentPosition: 3, previousPosition: 7, monthlyTraffic: 1900, url: '/servicios/gestion-operacional' },
  { keyword: 'erp para empresas chilenas', currentPosition: 5, previousPosition: 4, monthlyTraffic: 3200, url: '/' },
  { keyword: 'control documental flota', currentPosition: 2, previousPosition: 6, monthlyTraffic: 880, url: '/operaciones/control-documental' },
  { keyword: 'sistema liquidación de sueldos', currentPosition: 8, previousPosition: 12, monthlyTraffic: 2600, url: '/rrhh/liquidaciones' },
  { keyword: 'calculadora finiquito chile', currentPosition: 4, previousPosition: 3, monthlyTraffic: 4000, url: '/rrhh/finiquitos' },
  { keyword: 'software prevención de riesgos', currentPosition: 11, previousPosition: 18, monthlyTraffic: 720, url: '/servicios/hsec' },
  { keyword: 'gestión de activos operacionales', currentPosition: 6, previousPosition: 9, monthlyTraffic: 540, url: '/operaciones' },
  { keyword: 'facturación electrónica sii', currentPosition: 14, previousPosition: 10, monthlyTraffic: 3500, url: '/finanzas/sii' },
  { keyword: 'control de vencimientos documentos', currentPosition: 7, previousPosition: 15, monthlyTraffic: 460, url: '/operaciones/alertas' },
  { keyword: 'software rrhh pymes chile', currentPosition: 9, previousPosition: 9, monthlyTraffic: 1700, url: '/rrhh' },
  { keyword: 'flujo de caja empresa', currentPosition: 18, previousPosition: 25, monthlyTraffic: 2100, url: '/finanzas/caja' },
  { keyword: 'mantenimiento preventivo maquinaria', currentPosition: 22, previousPosition: 16, monthlyTraffic: 380, url: '/operaciones/equipos' },
  { keyword: 'control de permisos de trabajo', currentPosition: 5, previousPosition: 11, monthlyTraffic: 290, url: '/operaciones/permisos' },
  { keyword: 'reportes financieros automáticos', currentPosition: 31, previousPosition: 42, monthlyTraffic: 150, url: '/finanzas/reportes' },
  { keyword: 'plataforma multiempresa saas', currentPosition: 27, previousPosition: 20, monthlyTraffic: 90, url: '/modulos' },
];

export async function seedMarketing(p: PrismaClient, companyId: string) {
  console.log('› Seeding Marketing demo data…');

  // Idempotent reset (FK SetNull/Cascade means children go first, and a full
  // wipe-then-insert keeps the dataset deterministic per run). calendar_items,
  // campaign_tasks and campaign_metrics are wiped explicitly even though
  // tasks/metrics would cascade with the campaigns — explicit is clearer and
  // also clears any standalone (campaign-less) calendar items.
  await prisma.calendarItem.deleteMany({ where: { companyId } });
  await prisma.campaignTask.deleteMany({ where: { companyId } });
  await prisma.campaignMetric.deleteMany({ where: { companyId } });
  await prisma.marketingExpense.deleteMany({ where: { companyId } });
  await prisma.marketingCampaign.deleteMany({ where: { companyId } });
  await prisma.seoKeyword.deleteMany({ where: { companyId } });

  // Campaigns (with commercial-brief fields).
  const campaignIds: string[] = [];
  for (const c of CAMPAIGNS) {
    const startDate = daysFromNow(c.startOffsetDays);
    const endDate = daysFromNow(c.startOffsetDays + c.durationDays);
    const created = await prisma.marketingCampaign.create({
      data: {
        companyId,
        name: c.name,
        channel: c.channel,
        startDate,
        endDate,
        cost: c.cost,
        status: c.status,
        objective: c.objective,
        serviceAssociated: c.serviceAssociated,
        targetSegment: c.targetSegment,
        zone: c.zone,
        ownerName: c.ownerName,
        ctaType: c.ctaType,
        kpiTarget: c.kpiTarget,
      },
    });
    campaignIds.push(created.id);
  }

  // READ-ONLY Finance category reference — prefer an EXPENSE category, else any.
  const financeCategory =
    (await prisma.category.findFirst({
      where: { companyId, type: 'EXPENSE', isActive: true },
      orderBy: { name: 'asc' },
    })) ??
    (await prisma.category.findFirst({ where: { companyId }, orderBy: { name: 'asc' } }));

  // Expenses.
  let financeTagged = 0;
  for (const e of EXPENSES) {
    const campaignId = e.campaignIdx === null ? null : campaignIds[e.campaignIdx] ?? null;
    const tagFinance = e.finance && financeCategory !== null;
    if (tagFinance) financeTagged++;
    await prisma.marketingExpense.create({
      data: {
        companyId,
        amount: e.amount,
        date: daysFromNow(e.dateOffsetDays),
        description: e.description,
        channel: e.channel,
        campaignId,
        financeCategoryId: tagFinance ? financeCategory!.id : null,
        financeCategoryName: tagFinance ? financeCategory!.name : null,
      },
    });
  }

  // SEO keywords.
  for (const k of SEO_KEYWORDS) {
    await prisma.seoKeyword.create({
      data: {
        companyId,
        keyword: k.keyword,
        currentPosition: k.currentPosition,
        previousPosition: k.previousPosition,
        monthlyTraffic: k.monthlyTraffic,
        url: k.url,
      },
    });
  }

  // ── Calendar items (multi-type operational board) ──
  const nowMonth = new Date().getMonth();
  const nowYear = new Date().getFullYear();
  const calendarByType = new Map<CalendarItemType, number>();
  let currentMonthCount = 0;
  for (const item of CALENDAR_ITEMS) {
    const date = item.anchor === 'month' ? dayThisMonth(item.day) : daysFromNow(item.day);
    const endDate =
      item.spanDays !== undefined
        ? item.anchor === 'month'
          ? dayThisMonth(item.day + item.spanDays)
          : daysFromNow(item.day + item.spanDays)
        : null;
    const campaignId = item.campaignIdx === null ? null : campaignIds[item.campaignIdx] ?? null;
    await prisma.calendarItem.create({
      data: {
        companyId,
        type: item.type,
        title: item.title,
        date,
        endDate,
        channel: item.channel,
        status: item.status,
        ownerName: item.ownerName,
        serviceName: item.serviceName,
        targetSegment: item.targetSegment,
        zone: item.zone,
        campaignId,
      },
    });
    calendarByType.set(item.type, (calendarByType.get(item.type) ?? 0) + 1);
    if (date.getMonth() === nowMonth && date.getFullYear() === nowYear) currentMonthCount++;
  }

  // ── Campaign tasks ──
  let tasksDone = 0;
  let tasksOverdue = 0;
  const todayMidnight = daysFromNow(0);
  for (const t of CAMPAIGN_TASKS) {
    const campaignId = campaignIds[t.campaignIdx];
    if (!campaignId) continue;
    const dueDate = daysFromNow(t.dueOffsetDays);
    if (t.done) tasksDone++;
    if (!t.done && dueDate < todayMidnight) tasksOverdue++;
    await prisma.campaignTask.create({
      data: {
        companyId,
        campaignId,
        title: t.title,
        type: t.type,
        dueDate,
        done: t.done,
        ownerName: t.ownerName,
      },
    });
  }

  // ── Campaign metrics (one per campaign) ──
  for (let i = 0; i < campaignIds.length; i++) {
    const m = CAMPAIGN_METRICS[i];
    if (!m) continue;
    await prisma.campaignMetric.create({
      data: {
        companyId,
        campaignId: campaignIds[i],
        leadsGenerated: m.leadsGenerated,
        leadsQualified: m.leadsQualified,
        meetingsBooked: m.meetingsBooked,
        quotesIssued: m.quotesIssued,
        opportunitiesCreated: m.opportunitiesCreated,
        salesClosed: m.salesClosed,
        costPerLead: m.costPerLead,
        attributedRevenue: m.attributedRevenue,
      },
    });
  }

  // Status breakdown for the log.
  const statusCount = new Map<CampaignStatus, number>();
  for (const c of CAMPAIGNS) statusCount.set(c.status, (statusCount.get(c.status) ?? 0) + 1);

  console.log(
    `  Campaigns: ${CAMPAIGNS.length} · Expenses: ${EXPENSES.length} (finance-tagged: ${financeTagged}) · SEO keywords: ${SEO_KEYWORDS.length}` +
      (financeCategory ? ` · Finance category ref: "${financeCategory.name}"` : ' · (no Finance category found)'),
  );
  console.log(
    `  Calendar items: ${CALENDAR_ITEMS.length} (current month: ${currentMonthCount}) · by type: ` +
      [...calendarByType.entries()].map(([t, n]) => `${t}=${n}`).join(', '),
  );
  console.log(
    `  Campaign tasks: ${CAMPAIGN_TASKS.length} (done: ${tasksDone}, overdue: ${tasksOverdue}) · Campaign metrics: ${campaignIds.length}`,
  );
  console.log(
    `  Campaigns by status: ` +
      [...statusCount.entries()].map(([s, n]) => `${s}=${n}`).join(', '),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMERCIAL / CRM (DEMO) seed
   Idempotent (upsert by stable keys). Reads Finance (Counterparty, TaxDocument)
   and Marketing (MarketingCampaign); SIMULATES the won-opportunity → Finanzas
   commitment by writing generatedCommitment* on the opportunity ROW (no real
   Commitment, no domain event).

   GOLDEN THREAD: one specific MarketingCampaign C is the lead source of a WON
   opportunity O with amount > C.cost, so /api/comercial/campaign-roi shows C
   with a POSITIVE roi (the "Marketing ROI" tile lights up). The campaign and
   opportunity names are logged at the end for the demo operator.
   ═══════════════════════════════════════════════════════════════════════════ */

const CRM_OWNERS = ['Camila Rojas', 'Andrés Soto', 'Valentina Muñoz', 'Felipe Carrasco'];

// ─────────────────────────────────────────────────────────────────────────────
// B2B DRONE & INDUSTRIAL SERVICES domain. Empresa Demo SpA sells aerial/drone
// inspection, roof (techumbre) inspection, thermography, photogrammetry,
// audiovisual capture, road/faena inspection and industrial / solar-panel
// cleaning to mining, construction, real-estate, energy and industrial clients.
// All seeded data (services, clients, opportunities, leads, quotes) reflects
// THIS domain with Chilean company names and coherent CLP amounts.
// ─────────────────────────────────────────────────────────────────────────────

// ── Service catalogue ────────────────────────────────────────────────────────
interface ServiceSpec {
  name: string;
  category: ServiceCategory;
  description: string;
  billingUnit: BillingUnit;
  basePrice: number;
  requiresEquipment: boolean;
  requiresCertifiedStaff: boolean;
}

// 12 services. DRONE services require equipment + certified pilots (Ley DGAC).
const CRM_SERVICES: ServiceSpec[] = [
  { name: 'Inspección con dron', category: 'DRONE', description: 'Inspección aérea de estructuras y activos con RPAS de alta resolución.', billingUnit: 'JORNADA', basePrice: 850000, requiresEquipment: true, requiresCertifiedStaff: true },
  { name: 'Inspección de techumbre', category: 'INSPECCION', description: 'Levantamiento del estado de techumbres y cubiertas, detección de filtraciones.', billingUnit: 'M2', basePrice: 1200, requiresEquipment: false, requiresCertifiedStaff: false },
  { name: 'Termografía aérea', category: 'DRONE', description: 'Termografía infrarroja con dron para puntos calientes en paneles e instalaciones.', billingUnit: 'JORNADA', basePrice: 1100000, requiresEquipment: true, requiresCertifiedStaff: true },
  { name: 'Fotogrametría / ortofoto', category: 'DRONE', description: 'Generación de ortofoto georreferenciada y modelo 3D del terreno o faena.', billingUnit: 'PROYECTO', basePrice: 3200000, requiresEquipment: true, requiresCertifiedStaff: true },
  { name: 'Captura audiovisual', category: 'AUDIOVISUAL', description: 'Registro audiovisual aéreo y terrestre para obras, eventos y marketing.', billingUnit: 'EVENTO', basePrice: 650000, requiresEquipment: true, requiresCertifiedStaff: false },
  { name: 'Inspección de caminos y faena', category: 'INSPECCION', description: 'Inspección del estado de caminos, accesos y rutas internas de faena minera.', billingUnit: 'JORNADA', basePrice: 920000, requiresEquipment: false, requiresCertifiedStaff: false },
  { name: 'Limpieza industrial', category: 'LIMPIEZA', description: 'Limpieza técnica de superficies, estructuras y equipos industriales.', billingUnit: 'M2', basePrice: 2800, requiresEquipment: true, requiresCertifiedStaff: false },
  { name: 'Limpieza de paneles solares', category: 'LIMPIEZA', description: 'Lavado y mantención de plantas fotovoltaicas para recuperar eficiencia.', billingUnit: 'M2', basePrice: 950, requiresEquipment: true, requiresCertifiedStaff: false },
  { name: 'Inspección estructural', category: 'INSPECCION', description: 'Evaluación de integridad estructural de naves, puentes y silos.', billingUnit: 'PROYECTO', basePrice: 4500000, requiresEquipment: false, requiresCertifiedStaff: true },
  { name: 'Monitoreo de avance de obra', category: 'DRONE', description: 'Seguimiento mensual del avance de obra con vuelos periódicos y reportería.', billingUnit: 'MENSUAL', basePrice: 1450000, requiresEquipment: true, requiresCertifiedStaff: true },
  { name: 'Levantamiento topográfico con dron', category: 'DRONE', description: 'Topografía de precisión con dron RTK y entrega de curvas de nivel.', billingUnit: 'PROYECTO', basePrice: 3800000, requiresEquipment: true, requiresCertifiedStaff: true },
  { name: 'Mantención preventiva industrial', category: 'INDUSTRIAL', description: 'Rutinas de mantención preventiva sobre equipos y líneas de proceso.', billingUnit: 'JORNADA', basePrice: 780000, requiresEquipment: true, requiresCertifiedStaff: true },
];

// Helper: index → service category to drive opportunity requires* flags.
const serviceByIdx = (idx: number) => CRM_SERVICES[idx];

// ── Clients (Finance Counterparty type=CLIENT) ───────────────────────────────
// Deterministic CLIENT counterparties. RUT bodies are run through Módulo-11
// (formatRut) so the check digit is always valid; folioBase keys the client's
// tax-document folios so re-runs stay idempotent on @@unique([companyId,type,
// folio,direction]). Mining / construction / real-estate / energy / industrial.
interface ClientSpec {
  rutBody: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  folioBase: number; // base folio for this client's emitted invoices
  taxDocs: number; // how many EMITIDO facturas to seed (0 = none)
}

const CRM_CLIENTS: ClientSpec[] = [
  { rutBody: 76453221, name: 'Minera Cordillera Blanca S.A.', email: 'compras@cordillerablanca.cl', phone: '+56 55 234 7700', address: 'Av. Angamos 1200, Antofagasta', folioBase: 10200, taxDocs: 3 },
  { rutBody: 77881234, name: 'Constructora Andes Sur SpA', email: 'contacto@andessur.cl', phone: '+56 2 2890 1100', address: 'Av. Apoquindo 4500, Las Condes', folioBase: 10230, taxDocs: 3 },
  { rutBody: 78112987, name: 'Energía Solar Atacama SpA', email: 'operaciones@solaratacama.cl', phone: '+56 52 233 8800', address: 'Parque Solar Ruta 5 Norte Km 1450, Copiapó', folioBase: 10260, taxDocs: 3 },
  { rutBody: 76998445, name: 'Inmobiliaria Pacífico Ltda.', email: 'proyectos@inmopacifico.cl', phone: '+56 2 2456 1200', address: 'Isidora Goyenechea 3200, Las Condes', folioBase: 10290, taxDocs: 2 },
  { rutBody: 77554120, name: 'Minera Quebrada Verde S.A.', email: 'abastecimiento@quebradaverde.cl', phone: '+56 51 220 3300', address: 'Av. del Mar 2200, La Serena', folioBase: 10320, taxDocs: 3 },
  { rutBody: 76330987, name: 'Agrícola Valle Verde SpA', email: 'gerencia@valleverde.cl', phone: '+56 75 241 8800', address: 'Ruta 5 Sur Km 180, Curicó', folioBase: 10350, taxDocs: 2 },
  { rutBody: 78445660, name: 'Forestal Biobío S.A.', email: 'contacto@forestalbiobio.cl', phone: '+56 41 286 7700', address: 'Camino a Coronel Km 12, Concepción', folioBase: 10380, taxDocs: 2 },
  { rutBody: 77220556, name: 'Constructora Río Maipo Ltda.', email: 'obras@riomaipo.cl', phone: '+56 2 2638 9900', address: 'Av. Eduardo Frei 5500, San Bernardo', folioBase: 10410, taxDocs: 2 },
  { rutBody: 76887330, name: 'Energía Eólica Magallanes SpA', email: 'mantenimiento@eolicamagallanes.cl', phone: '+56 61 224 5500', address: 'Parque Eólico Cabo Negro, Punta Arenas', folioBase: 10440, taxDocs: 0 },
  { rutBody: 77665443, name: 'Inmobiliaria Cumbre Andina S.A.', email: 'desarrollo@cumbreandina.cl', phone: '+56 2 2745 6620', address: 'Av. Las Condes 11000, Las Condes', folioBase: 10470, taxDocs: 0 },
  { rutBody: 78990112, name: 'Industrias Metalúrgicas del Maule SpA', email: 'planta@metalmaule.cl', phone: '+56 71 241 6600', address: 'Camino Industrial 2400, Talca', folioBase: 10500, taxDocs: 0 },
  { rutBody: 76110889, name: 'Puerto Logístico Coronel S.A.', email: 'operaciones@puertocoronel.cl', phone: '+56 41 275 4400', address: 'Av. Costanera 100, Coronel', folioBase: 10530, taxDocs: 0 },
];

// Stage definitions (idempotent by name). 11-stage Salesforce/Monday pipeline.
// isWon/isLost flags drive pipeline, conversion and simulated-commitment logic.
const CRM_STAGES = [
  { name: 'Nuevo requerimiento', order: 1, isWon: false, isLost: false },
  { name: 'Contacto realizado', order: 2, isWon: false, isLost: false },
  { name: 'Necesidad levantada', order: 3, isWon: false, isLost: false },
  { name: 'Visita técnica agendada', order: 4, isWon: false, isLost: false },
  { name: 'En evaluación técnica', order: 5, isWon: false, isLost: false },
  { name: 'Cotización en preparación', order: 6, isWon: false, isLost: false },
  { name: 'Cotización enviada', order: 7, isWon: false, isLost: false },
  { name: 'Negociación', order: 8, isWon: false, isLost: false },
  { name: 'Ganada', order: 9, isWon: true, isLost: false },
  { name: 'Perdida', order: 10, isWon: false, isLost: true },
  { name: 'Congelada', order: 11, isWon: false, isLost: false },
];

// ── Opportunity specs ────────────────────────────────────────────────────────
// stageName resolves to a seeded stage; clientIdx → CRM_CLIENTS; serviceIdx →
// CRM_SERVICES; campaignIdx → seeded MarketingCampaign by index (null = none).
// expectedOffsetDays is relative to today (null = no expected close date).
interface OppSpec {
  title: string;
  clientIdx: number;
  serviceIdx: number;
  stageName: string;
  amount: number;
  probability: number;
  ownerIdx: number;
  expectedOffsetDays: number | null;
  campaignIdx: number | null;
  serviceZone: string;
  needDetected: string;
  lossReason?: string;
  tags: string[];
}

// 22 opportunities across the 11 stages. The GOLDEN THREAD opp is the first
// 'Ganada' below (campaignIdx 2 = 'Generación de Leads B2B', cost 3.2M, amount
// 18.5M ≫ cost → strongly positive ROI). ≥8 opps are campaign-sourced.
const CRM_OPPS: OppSpec[] = [
  // Nuevo requerimiento
  { title: 'Inspección con dron de rajo — Minera Cordillera Blanca', clientIdx: 0, serviceIdx: 0, stageName: 'Nuevo requerimiento', amount: 9500000, probability: 10, ownerIdx: 0, expectedOffsetDays: 75, campaignIdx: 2, serviceZone: 'Faena Norte, Antofagasta', needDetected: 'Requieren inspección periódica de taludes del rajo sin detener operación.', tags: ['dron', 'mineria'] },
  { title: 'Termografía de planta fotovoltaica — Energía Solar Atacama', clientIdx: 2, serviceIdx: 2, stageName: 'Nuevo requerimiento', amount: 6800000, probability: 15, ownerIdx: 1, expectedOffsetDays: 60, campaignIdx: 6, serviceZone: 'Parque Solar, Copiapó', needDetected: 'Detección de paneles con puntos calientes que bajan la generación.', tags: ['termografia', 'solar'] },
  { title: 'Inspección de techumbre bodega — Industrias del Maule', clientIdx: 10, serviceIdx: 1, stageName: 'Nuevo requerimiento', amount: 2400000, probability: 10, ownerIdx: 2, expectedOffsetDays: 90, campaignIdx: null, serviceZone: 'Planta Talca', needDetected: 'Filtraciones en techumbre de nave de producción.', tags: ['techumbre'] },
  { title: 'Captura audiovisual lanzamiento — Inmobiliaria Pacífico', clientIdx: 3, serviceIdx: 4, stageName: 'Nuevo requerimiento', amount: 1850000, probability: 5, ownerIdx: 3, expectedOffsetDays: 110, campaignIdx: 7, serviceZone: 'Proyecto Mirador, Las Condes', needDetected: 'Material aéreo para campaña de venta del proyecto.', tags: ['audiovisual', 'inmobiliaria'] },
  // Contacto realizado
  { title: 'Fotogrametría de avance — Constructora Andes Sur', clientIdx: 1, serviceIdx: 3, stageName: 'Contacto realizado', amount: 12500000, probability: 25, ownerIdx: 0, expectedOffsetDays: 50, campaignIdx: 2, serviceZone: 'Obra Ruta 68, Valparaíso', needDetected: 'Ortofoto mensual para control de movimiento de tierras.', tags: ['fotogrametria', 'construccion'] },
  { title: 'Limpieza de paneles solares — Energía Solar Atacama', clientIdx: 2, serviceIdx: 7, stageName: 'Contacto realizado', amount: 8900000, probability: 30, ownerIdx: 1, expectedOffsetDays: 45, campaignIdx: null, serviceZone: 'Parque Solar, Copiapó', needDetected: 'Pérdida de eficiencia por acumulación de polvo en desierto.', tags: ['limpieza', 'solar'] },
  { title: 'Monitoreo de avance de obra — Constructora Río Maipo', clientIdx: 7, serviceIdx: 9, stageName: 'Contacto realizado', amount: 7400000, probability: 20, ownerIdx: 2, expectedOffsetDays: 70, campaignIdx: 5, serviceZone: 'Obra San Bernardo', needDetected: 'Reportería mensual de avance para mandante.', tags: ['dron', 'monitoreo'] },
  { title: 'Inspección de caminos de faena — Minera Quebrada Verde', clientIdx: 4, serviceIdx: 5, stageName: 'Contacto realizado', amount: 5100000, probability: 35, ownerIdx: 3, expectedOffsetDays: 40, campaignIdx: null, serviceZone: 'Faena La Serena', needDetected: 'Evaluación de estado de rutas internas tras temporada de lluvias.', tags: ['inspeccion', 'caminos'] },
  // Necesidad levantada
  { title: 'Inspección estructural de silos — Forestal Biobío', clientIdx: 6, serviceIdx: 8, stageName: 'Necesidad levantada', amount: 6200000, probability: 40, ownerIdx: 0, expectedOffsetDays: 38, campaignIdx: 2, serviceZone: 'Planta Coronel', needDetected: 'Evaluar integridad de silos de astillas antes de certificación.', tags: ['estructural'] },
  { title: 'Levantamiento topográfico predio — Agrícola Valle Verde', clientIdx: 5, serviceIdx: 10, stageName: 'Necesidad levantada', amount: 4600000, probability: 45, ownerIdx: 1, expectedOffsetDays: 30, campaignIdx: null, serviceZone: 'Predio Curicó', needDetected: 'Topografía con dron para proyecto de riego tecnificado.', tags: ['topografia'] },
  // Visita técnica agendada
  { title: 'Inspección con dron de aerogeneradores — Eólica Magallanes', clientIdx: 8, serviceIdx: 0, stageName: 'Visita técnica agendada', amount: 11200000, probability: 50, ownerIdx: 2, expectedOffsetDays: 28, campaignIdx: 2, serviceZone: 'Parque Eólico Cabo Negro', needDetected: 'Inspección de palas de aerogeneradores sin escalamiento manual.', tags: ['dron', 'eolica'] },
  { title: 'Inspección de techumbre torres — Inmobiliaria Cumbre Andina', clientIdx: 9, serviceIdx: 1, stageName: 'Visita técnica agendada', amount: 3300000, probability: 45, ownerIdx: 3, expectedOffsetDays: 22, campaignIdx: null, serviceZone: 'Torres Las Condes', needDetected: 'Catastro de cubiertas de 4 torres residenciales.', tags: ['techumbre'] },
  // En evaluación técnica
  { title: 'Mantención preventiva línea de proceso — Industrias del Maule', clientIdx: 10, serviceIdx: 11, stageName: 'En evaluación técnica', amount: 9800000, probability: 55, ownerIdx: 0, expectedOffsetDays: 25, campaignIdx: 5, serviceZone: 'Planta Talca', needDetected: 'Plan de mantención preventiva trimestral de línea metalúrgica.', tags: ['industrial', 'mantencion'] },
  { title: 'Limpieza industrial de naves — Puerto Logístico Coronel', clientIdx: 11, serviceIdx: 6, stageName: 'En evaluación técnica', amount: 7600000, probability: 50, ownerIdx: 1, expectedOffsetDays: 20, campaignIdx: null, serviceZone: 'Puerto Coronel', needDetected: 'Limpieza técnica de estructuras de bodegas portuarias.', tags: ['limpieza', 'industrial'] },
  // Cotización en preparación
  { title: 'Fotogrametría de tronadura — Minera Cordillera Blanca', clientIdx: 0, serviceIdx: 3, stageName: 'Cotización en preparación', amount: 14500000, probability: 60, ownerIdx: 2, expectedOffsetDays: 18, campaignIdx: 2, serviceZone: 'Faena Norte, Antofagasta', needDetected: 'Modelo 3D post-tronadura para control de fragmentación.', tags: ['fotogrametria', 'mineria'] },
  // Cotización enviada
  { title: 'Termografía aérea subestación — Minera Quebrada Verde', clientIdx: 4, serviceIdx: 2, stageName: 'Cotización enviada', amount: 5400000, probability: 65, ownerIdx: 3, expectedOffsetDays: 14, campaignIdx: 6, serviceZone: 'Subestación La Serena', needDetected: 'Termografía de subestación eléctrica para detectar fallas.', tags: ['termografia'] },
  // Negociación
  { title: 'Contrato anual de inspección con dron — Energía Solar Atacama', clientIdx: 2, serviceIdx: 9, stageName: 'Negociación', amount: 22000000, probability: 75, ownerIdx: 0, expectedOffsetDays: 12, campaignIdx: 2, serviceZone: 'Parque Solar, Copiapó', needDetected: 'Contrato anual de monitoreo y termografía de la planta.', tags: ['contrato', 'dron', 'enterprise'] },
  // Ganada (GOLDEN THREAD first)
  { title: 'Inspección con dron y fotogrametría rajo — Minera Cordillera Blanca', clientIdx: 0, serviceIdx: 0, stageName: 'Ganada', amount: 18500000, probability: 100, ownerIdx: 0, expectedOffsetDays: -8, campaignIdx: 2, serviceZone: 'Faena Norte, Antofagasta', needDetected: 'Inspección integral del rajo con entrega de ortofoto.', tags: ['ganada', 'dron', 'golden-thread'] },
  { title: 'Limpieza de paneles solares campaña verano — Energía Solar Atacama', clientIdx: 2, serviceIdx: 7, stageName: 'Ganada', amount: 9200000, probability: 100, ownerIdx: 1, expectedOffsetDays: -3, campaignIdx: 6, serviceZone: 'Parque Solar, Copiapó', needDetected: 'Lavado completo del parque para recuperar generación.', tags: ['ganada', 'limpieza'] },
  { title: 'Fotogrametría de avance trimestral — Constructora Andes Sur', clientIdx: 1, serviceIdx: 3, stageName: 'Ganada', amount: 6800000, probability: 100, ownerIdx: 2, expectedOffsetDays: -20, campaignIdx: null, serviceZone: 'Obra Ruta 68, Valparaíso', needDetected: 'Ortofoto trimestral para control de obra.', tags: ['ganada', 'fotogrametria'] },
  { title: 'Inspección estructural de naves — Forestal Biobío', clientIdx: 6, serviceIdx: 8, stageName: 'Ganada', amount: 5300000, probability: 100, ownerIdx: 3, expectedOffsetDays: -1, campaignIdx: 5, serviceZone: 'Planta Coronel', needDetected: 'Certificación estructural de naves de proceso.', tags: ['ganada', 'estructural'] },
  // Perdida
  { title: 'Inspección de techumbre bodega — Constructora Río Maipo', clientIdx: 7, serviceIdx: 1, stageName: 'Perdida', amount: 3100000, probability: 0, ownerIdx: 0, expectedOffsetDays: -30, campaignIdx: null, serviceZone: 'Obra San Bernardo', needDetected: 'Inspección de cubierta de bodega de obra.', lossReason: 'Cliente optó por proveedor local de menor costo.', tags: ['perdida', 'precio'] },
  { title: 'Captura audiovisual de obra — Inmobiliaria Cumbre Andina', clientIdx: 9, serviceIdx: 4, stageName: 'Perdida', amount: 2200000, probability: 0, ownerIdx: 1, expectedOffsetDays: -45, campaignIdx: 5, serviceZone: 'Torres Las Condes', needDetected: 'Video aéreo del avance de obra para inversionistas.', lossReason: 'Proyecto pospuesto por reevaluación de presupuesto.', tags: ['perdida', 'presupuesto'] },
];

// ── Lead specs ───────────────────────────────────────────────────────────────
// Top-of-funnel prospects across statuses and sources. campaignIdx links to a
// seeded MarketingCampaign (null = no lead source). The GOLDEN THREAD lead is
// the first one below (CONVERTIDO, campaignIdx 2).
interface LeadSpec {
  contactName: string;
  company: string;
  position: string;
  phone: string;
  email: string;
  serviceInterest: string;
  source: CrmLeadSource;
  campaignIdx: number | null;
  status: CrmLeadStatus;
  ownerIdx: number;
  priority: CrmLeadPriority;
  discardReason?: string;
  createdOffsetDays: number;
  nextAction?: string;
}

const CRM_LEADS: LeadSpec[] = [
  // GOLDEN THREAD lead (CONVERTIDO, from campaign 'Generación de Leads B2B').
  { contactName: 'Rodrigo Fuenzalida', company: 'Minera Cordillera Blanca S.A.', position: 'Jefe de Mantenimiento', phone: '+56 9 6123 4455', email: 'rfuenzalida@cordillerablanca.cl', serviceInterest: 'Inspección con dron y fotogrametría rajo', source: 'CAMPANA', campaignIdx: 2, status: 'CONVERTIDO', ownerIdx: 0, priority: 'ALTA', createdOffsetDays: -40, nextAction: 'Convertido a oportunidad ganada.' },
  { contactName: 'Daniela Pizarro', company: 'Energía Solar Atacama SpA', position: 'Gerente de Operaciones', phone: '+56 9 7234 5566', email: 'dpizarro@solaratacama.cl', serviceInterest: 'Termografía de planta fotovoltaica', source: 'LINKEDIN', campaignIdx: 2, status: 'CALIFICADO', ownerIdx: 1, priority: 'ALTA', createdOffsetDays: -18, nextAction: 'Agendar visita técnica a la planta.' },
  { contactName: 'Matías Herrera', company: 'Constructora Andes Sur SpA', position: 'Administrador de Obra', phone: '+56 9 8345 6677', email: 'mherrera@andessur.cl', serviceInterest: 'Monitoreo de avance de obra con dron', source: 'WEB', campaignIdx: 5, status: 'CONTACTADO', ownerIdx: 2, priority: 'MEDIA', createdOffsetDays: -12, nextAction: 'Enviar propuesta de monitoreo mensual.' },
  { contactName: 'Carolina Vega', company: 'Inmobiliaria Pacífico Ltda.', position: 'Jefa de Marketing', phone: '+56 9 9456 7788', email: 'cvega@inmopacifico.cl', serviceInterest: 'Captura audiovisual aérea de proyecto', source: 'REFERIDO', campaignIdx: null, status: 'NUEVO', ownerIdx: 3, priority: 'BAJA', createdOffsetDays: -3, nextAction: 'Llamar para calificar el requerimiento.' },
  { contactName: 'Sebastián Lagos', company: 'Minera Quebrada Verde S.A.', position: 'Superintendente de Planta', phone: '+56 9 6567 8899', email: 'slagos@quebradaverde.cl', serviceInterest: 'Inspección de caminos de faena', source: 'FERIA', campaignIdx: null, status: 'CALIFICADO', ownerIdx: 0, priority: 'ALTA', createdOffsetDays: -22, nextAction: 'Coordinar inspección piloto.' },
  { contactName: 'Francisca Torres', company: 'Forestal Biobío S.A.', position: 'Ingeniera de Proyectos', phone: '+56 9 7678 9900', email: 'ftorres@forestalbiobio.cl', serviceInterest: 'Inspección estructural de silos', source: 'CAMPANA', campaignIdx: 2, status: 'CONTACTADO', ownerIdx: 1, priority: 'MEDIA', createdOffsetDays: -15, nextAction: 'Coordinar visita a planta Coronel.' },
  { contactName: 'Ignacio Bravo', company: 'Constructora Río Maipo Ltda.', position: 'Gerente Técnico', phone: '+56 9 8789 0011', email: 'ibravo@riomaipo.cl', serviceInterest: 'Fotogrametría de obra', source: 'SEO', campaignIdx: 4, status: 'NUEVO', ownerIdx: 2, priority: 'MEDIA', createdOffsetDays: -2, nextAction: 'Responder consulta de cobertura.' },
  { contactName: 'Antonia Reyes', company: 'Energía Eólica Magallanes SpA', position: 'Jefa de Mantenimiento', phone: '+56 9 9890 1122', email: 'areyes@eolicamagallanes.cl', serviceInterest: 'Inspección con dron de aerogeneradores', source: 'LINKEDIN', campaignIdx: 2, status: 'CALIFICADO', ownerIdx: 3, priority: 'ALTA', createdOffsetDays: -25, nextAction: 'Enviar propuesta técnica.' },
  { contactName: 'Pablo Cárcamo', company: 'Industrias Metalúrgicas del Maule SpA', position: 'Jefe de Operaciones', phone: '+56 9 6901 2233', email: 'pcarcamo@metalmaule.cl', serviceInterest: 'Mantención preventiva industrial', source: 'LLAMADA', campaignIdx: null, status: 'CONTACTADO', ownerIdx: 0, priority: 'MEDIA', createdOffsetDays: -9, nextAction: 'Agendar evaluación en planta.' },
  { contactName: 'Javiera Núñez', company: 'Puerto Logístico Coronel S.A.', position: 'Encargada de Mantenimiento', phone: '+56 9 7012 3344', email: 'jnunez@puertocoronel.cl', serviceInterest: 'Limpieza industrial de bodegas', source: 'WEB', campaignIdx: null, status: 'NUEVO', ownerIdx: 1, priority: 'BAJA', createdOffsetDays: -1, nextAction: 'Llamar para levantar requerimiento.' },
  { contactName: 'Cristóbal Soto', company: 'Agrícola Valle Verde SpA', position: 'Jefe de Riego', phone: '+56 9 8123 4455', email: 'csoto@valleverde.cl', serviceInterest: 'Levantamiento topográfico con dron', source: 'REFERIDO', campaignIdx: null, status: 'CALIFICADO', ownerIdx: 2, priority: 'MEDIA', createdOffsetDays: -19, nextAction: 'Cotizar proyecto de topografía.' },
  { contactName: 'Valentina Riquelme', company: 'Inmobiliaria Cumbre Andina S.A.', position: 'Coordinadora de Proyectos', phone: '+56 9 9234 5566', email: 'vriquelme@cumbreandina.cl', serviceInterest: 'Inspección de techumbre de torres', source: 'SEO', campaignIdx: 4, status: 'CONTACTADO', ownerIdx: 3, priority: 'MEDIA', createdOffsetDays: -8, nextAction: 'Enviar alcance de inspección.' },
  { contactName: 'Gonzalo Maturana', company: 'Comercializadora Norte Grande Ltda.', position: 'Gerente General', phone: '+56 9 6345 6677', email: 'gmaturana@nortegrande.cl', serviceInterest: 'Captura audiovisual corporativa', source: 'FERIA', campaignIdx: null, status: 'DESCARTADO', ownerIdx: 0, priority: 'BAJA', discardReason: 'Presupuesto fuera de rango para este año.', createdOffsetDays: -35, nextAction: 'Retomar en el próximo período.' },
  { contactName: 'María José Aravena', company: 'Transportes del Desierto SpA', position: 'Jefa de Flota', phone: '+56 9 7456 7788', email: 'mjaravena@transdesierto.cl', serviceInterest: 'Inspección con dron de instalaciones', source: 'LLAMADA', campaignIdx: null, status: 'DESCARTADO', ownerIdx: 1, priority: 'BAJA', discardReason: 'No tiene faenas en altura; no aplica el servicio.', createdOffsetDays: -28, nextAction: 'Sin acción.' },
  { contactName: 'Felipe Donoso', company: 'Salmonera Canal Sur S.A.', position: 'Encargado de Operaciones', phone: '+56 9 8567 8899', email: 'fdonoso@canalsur.cl', serviceInterest: 'Termografía aérea de instalaciones', source: 'LINKEDIN', campaignIdx: 7, status: 'NUEVO', ownerIdx: 2, priority: 'ALTA', createdOffsetDays: -4, nextAction: 'Calificar y agendar reunión.' },
];

// ── Quote specs ──────────────────────────────────────────────────────────────
// oppIdx → CRM_OPPS (also fixes the counterparty). itemServiceIdx → CRM_SERVICES.
// Itemized quotes drive subtotal / iva / total recomputation server-side here.
interface QuoteItemSpec {
  serviceIdx: number | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPct: number;
}
interface QuoteSpec {
  oppIdx: number;
  status: CrmQuoteStatus;
  validUntilOffsetDays: number | null;
  executionTerm: string;
  commercialConditions: string;
  technicalNotes: string;
  items: QuoteItemSpec[];
}

const CRM_QUOTES: QuoteSpec[] = [
  // Fully itemized — linked to the GOLDEN THREAD ganada opp (idx 18).
  {
    oppIdx: 18,
    status: 'ACEPTADA',
    validUntilOffsetDays: -2,
    executionTerm: '15 días hábiles desde la aceptación',
    commercialConditions: 'Pago 50% al inicio y 50% contra entrega de informe. Valores en CLP + IVA.',
    technicalNotes: 'Vuelos con RPAS DJI Matrice 300 RTK. Entrega de ortofoto georreferenciada y modelo 3D.',
    items: [
      { serviceIdx: 0, description: 'Inspección con dron del rajo — 3 jornadas', quantity: 3, unit: 'jornada', unitPrice: 850000, discountPct: 0 },
      { serviceIdx: 3, description: 'Fotogrametría y ortofoto del sector norte', quantity: 1, unit: 'proyecto', unitPrice: 3200000, discountPct: 5 },
      { serviceIdx: 2, description: 'Termografía aérea complementaria', quantity: 2, unit: 'jornada', unitPrice: 1100000, discountPct: 0 },
    ],
  },
  // Fully itemized — linked to the negociación contract opp (idx 17).
  {
    oppIdx: 17,
    status: 'ENVIADA',
    validUntilOffsetDays: 20,
    executionTerm: 'Contrato anual con vuelos mensuales',
    commercialConditions: 'Facturación mensual. Reajuste anual por IPC. Valores en CLP + IVA.',
    technicalNotes: 'Plan anual de monitoreo y termografía de la planta fotovoltaica completa.',
    items: [
      { serviceIdx: 9, description: 'Monitoreo de avance y estado — plan mensual (12 meses)', quantity: 12, unit: 'mes', unitPrice: 1450000, discountPct: 10 },
      { serviceIdx: 2, description: 'Termografía aérea trimestral', quantity: 4, unit: 'jornada', unitPrice: 1100000, discountPct: 0 },
      { serviceIdx: 7, description: 'Limpieza de paneles solares — campaña semestral', quantity: 2, unit: 'm2', unitPrice: 950, discountPct: 0 },
    ],
  },
  // Itemized — cotización enviada termografía (idx 16).
  {
    oppIdx: 16,
    status: 'ENVIADA',
    validUntilOffsetDays: 14,
    executionTerm: '5 días hábiles',
    commercialConditions: 'Pago a 30 días. Valores en CLP + IVA.',
    technicalNotes: 'Termografía de subestación con cámara FLIR radiométrica.',
    items: [
      { serviceIdx: 2, description: 'Termografía aérea de subestación', quantity: 1, unit: 'jornada', unitPrice: 1100000, discountPct: 0 },
      { serviceIdx: 0, description: 'Inspección con dron complementaria', quantity: 1, unit: 'jornada', unitPrice: 850000, discountPct: 0 },
    ],
  },
  // Borrador, sin ítems aún (idx 15 cotización en preparación).
  {
    oppIdx: 15,
    status: 'BORRADOR',
    validUntilOffsetDays: 18,
    executionTerm: 'Por definir',
    commercialConditions: 'Borrador en preparación.',
    technicalNotes: 'Pendiente confirmar alcance de la fotogrametría post-tronadura.',
    items: [],
  },
  // En revisión, con ítems (idx 12 mantención preventiva).
  {
    oppIdx: 12,
    status: 'EN_REVISION',
    validUntilOffsetDays: 25,
    executionTerm: '4 jornadas mensuales',
    commercialConditions: 'Pago a 30 días. Valores en CLP + IVA.',
    technicalNotes: 'Rutinas de mantención preventiva sobre línea metalúrgica.',
    items: [
      { serviceIdx: 11, description: 'Mantención preventiva — jornadas mensuales', quantity: 4, unit: 'jornada', unitPrice: 780000, discountPct: 0 },
    ],
  },
];

// ── Activity templates ───────────────────────────────────────────────────────
// clientIdx → CRM_CLIENTS; oppIdx → CRM_OPPS (null = no opp); leadIdx → CRM_LEADS
// (null = no lead). dueOffsetDays only applies to TAREA; positive future offsets
// become "próximas tareas" (done=false). dateOffsetDays is the activity date.
interface ActivitySpec {
  clientIdx: number;
  oppIdx: number | null;
  leadIdx: number | null;
  type: CrmActivityType;
  content: string;
  dateOffsetDays: number;
  dueOffsetDays: number | null;
  done: boolean;
}

const CRM_ACTIVITIES: ActivitySpec[] = [
  { clientIdx: 0, oppIdx: 0, leadIdx: null, type: 'LLAMADA', content: 'Llamada de calificación. Interés en inspección periódica del rajo con dron.', dateOffsetDays: -14, dueOffsetDays: null, done: false },
  { clientIdx: 0, oppIdx: 15, leadIdx: null, type: 'REUNION', content: 'Reunión técnica para definir alcance de la fotogrametría post-tronadura.', dateOffsetDays: -5, dueOffsetDays: null, done: false },
  { clientIdx: 0, oppIdx: 15, leadIdx: null, type: 'TAREA', content: 'Preparar cotización de fotogrametría con modelo 3D.', dateOffsetDays: -2, dueOffsetDays: 4, done: false },
  { clientIdx: 0, oppIdx: 18, leadIdx: 0, type: 'NOTA', content: 'Inspección del rajo cerrada y aceptada. Lead convertido a oportunidad ganada.', dateOffsetDays: -8, dueOffsetDays: null, done: true },
  { clientIdx: 2, oppIdx: 1, leadIdx: 1, type: 'LLAMADA', content: 'Cliente reporta paneles con baja generación. Interés en termografía aérea.', dateOffsetDays: -10, dueOffsetDays: null, done: false },
  { clientIdx: 2, oppIdx: 17, leadIdx: null, type: 'REUNION', content: 'Reunión por contrato anual de monitoreo y termografía de la planta.', dateOffsetDays: -6, dueOffsetDays: null, done: false },
  { clientIdx: 2, oppIdx: 17, leadIdx: null, type: 'TAREA', content: 'Enviar propuesta de contrato anual con reajuste por IPC.', dateOffsetDays: 0, dueOffsetDays: 6, done: false },
  { clientIdx: 2, oppIdx: 19, leadIdx: null, type: 'NOTA', content: 'Limpieza de paneles campaña verano cerrada y facturada.', dateOffsetDays: -3, dueOffsetDays: null, done: true },
  { clientIdx: 1, oppIdx: 4, leadIdx: 2, type: 'REUNION', content: 'Levantamiento de requerimiento de fotogrametría mensual de la obra.', dateOffsetDays: -11, dueOffsetDays: null, done: false },
  { clientIdx: 1, oppIdx: 20, leadIdx: null, type: 'NOTA', content: 'Fotogrametría trimestral cerrada. Coordinando primer vuelo.', dateOffsetDays: -20, dueOffsetDays: null, done: true },
  { clientIdx: 4, oppIdx: 7, leadIdx: 4, type: 'TAREA', content: 'Coordinar inspección piloto de caminos de faena.', dateOffsetDays: -3, dueOffsetDays: 9, done: false },
  { clientIdx: 4, oppIdx: 16, leadIdx: null, type: 'REUNION', content: 'Presentación de propuesta de termografía de subestación.', dateOffsetDays: -9, dueOffsetDays: null, done: false },
  { clientIdx: 6, oppIdx: 8, leadIdx: 5, type: 'LLAMADA', content: 'Primer contacto. Requieren inspección estructural de silos antes de certificar.', dateOffsetDays: -12, dueOffsetDays: null, done: false },
  { clientIdx: 6, oppIdx: 21, leadIdx: null, type: 'NOTA', content: 'Inspección estructural de naves cerrada. Kickoff agendado.', dateOffsetDays: -1, dueOffsetDays: null, done: true },
  { clientIdx: 8, oppIdx: 10, leadIdx: 7, type: 'TAREA', content: 'Enviar propuesta técnica de inspección de aerogeneradores.', dateOffsetDays: -1, dueOffsetDays: 3, done: false },
  { clientIdx: 10, oppIdx: 12, leadIdx: 8, type: 'REUNION', content: 'Evaluación en planta para plan de mantención preventiva.', dateOffsetDays: -8, dueOffsetDays: null, done: false },
  { clientIdx: 5, oppIdx: 9, leadIdx: 10, type: 'TAREA', content: 'Cotizar levantamiento topográfico con dron del predio.', dateOffsetDays: -2, dueOffsetDays: 8, done: false },
  { clientIdx: 3, oppIdx: 3, leadIdx: 3, type: 'LLAMADA', content: 'Solicitan material aéreo para campaña de venta del proyecto.', dateOffsetDays: -4, dueOffsetDays: null, done: false },
  { clientIdx: 11, oppIdx: 13, leadIdx: 9, type: 'NOTA', content: 'Evalúan limpieza técnica de estructuras de bodegas portuarias.', dateOffsetDays: -7, dueOffsetDays: null, done: false },
];

export async function seedComercial(p: PrismaClient, companyId: string) {
  console.log('› Seeding Comercial (CRM) demo data…');

  // Look up the company's own RUT/name (issuer of the EMITIDO tax docs).
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const issuerRut = company?.taxId ?? '76.123.456-7';
  const issuerName = company?.name ?? 'Empresa Demo SpA';

  /* 1) CLIENTS — upsert Counterparty type=CLIENT by (companyId, taxId). Reuse
        existing CLIENTs (by taxId match) and create the rest. */
  const clientIdByIdx = new Map<number, string>();
  let clientsCreated = 0;
  let clientsReused = 0;
  for (let i = 0; i < CRM_CLIENTS.length; i++) {
    const spec = CRM_CLIENTS[i];
    const taxId = formatRut(spec.rutBody);
    const existing = await prisma.counterparty.findUnique({
      where: { companyId_taxId: { companyId, taxId } },
    });
    const row = await prisma.counterparty.upsert({
      where: { companyId_taxId: { companyId, taxId } },
      update: { name: spec.name, type: 'CLIENT', email: spec.email, phone: spec.phone, address: spec.address },
      create: { companyId, name: spec.name, type: 'CLIENT', taxId, email: spec.email, phone: spec.phone, address: spec.address },
    });
    if (existing) clientsReused++;
    else clientsCreated++;
    clientIdByIdx.set(i, row.id);
  }

  /* 2) TAX HISTORY — EMITIDO FACTURA_ELECTRONICA into existing tax_documents.
        First clear any CRM-demo invoices from a PRIOR demo run (folios in the
        10000–11999 range with no movement attached) so renamed clients never
        keep stale receiverName rows. Then re-insert coherent invoices,
        idempotent via deterministic folios (folioBase + n) and skip-if-exists
        on @@unique([companyId,type,folio,direction]). */
  await prisma.taxDocument.deleteMany({
    where: {
      companyId,
      type: 'FACTURA_ELECTRONICA',
      direction: 'EMITIDO',
      folio: { gte: 10000, lt: 12000 },
      movementId: null,
    },
  });

  let taxDocsAdded = 0;
  for (const spec of CRM_CLIENTS) {
    if (spec.taxDocs === 0) continue;
    const receiverRut = formatRut(spec.rutBody);
    for (let n = 0; n < spec.taxDocs; n++) {
      const folio = spec.folioBase + n;
      const exists = await prisma.taxDocument.findUnique({
        where: {
          companyId_type_folio_direction: {
            companyId,
            type: 'FACTURA_ELECTRONICA',
            folio,
            direction: 'EMITIDO',
          },
        },
      });
      if (exists) continue;
      // Deterministic-but-varied net amount; tax = round(net*0.19); total exact.
      const netAmount = 1_200_000 + ((spec.folioBase / 100 + n) % 7) * 480_000;
      const taxAmount = Math.round(netAmount * 0.19);
      const totalAmount = netAmount + taxAmount;
      // Spread issue dates over the last ~12 months (n indexes recent → older).
      const issueDate = daysFromNow(-(30 + n * 70 + (spec.folioBase % 30)));
      await prisma.taxDocument.create({
        data: {
          companyId,
          type: 'FACTURA_ELECTRONICA',
          direction: 'EMITIDO',
          folio,
          issuerRut,
          issuerName,
          receiverRut,
          receiverName: spec.name,
          issueDate,
          netAmount,
          taxAmount,
          totalAmount,
          currency: 'CLP',
          status: 'ACCEPTED',
        },
      });
      taxDocsAdded++;
    }
  }

  /* 3) STAGES — full reset then insert (11-stage drone pipeline). Opportunities
        reference stages by FK, so they are wiped first (step 4) before stages. */
  await prisma.crmActivity.deleteMany({ where: { companyId } });
  await prisma.crmQuoteItem.deleteMany({ where: { companyId } });
  await prisma.crmQuote.deleteMany({ where: { companyId } });
  await prisma.crmOpportunity.deleteMany({ where: { companyId } });
  await prisma.crmLead.deleteMany({ where: { companyId } });
  await prisma.crmStage.deleteMany({ where: { companyId } });
  await prisma.serviceCatalog.deleteMany({ where: { companyId } });

  const stageIdByName = new Map<string, string>();
  for (const s of CRM_STAGES) {
    const row = await prisma.crmStage.create({
      data: { companyId, name: s.name, order: s.order, isWon: s.isWon, isLost: s.isLost },
    });
    stageIdByName.set(s.name, row.id);
  }

  /* 4) SERVICE CATALOGUE — the B2B drone / industrial services. */
  const serviceIdByIdx = new Map<number, string>();
  for (let i = 0; i < CRM_SERVICES.length; i++) {
    const s = CRM_SERVICES[i];
    const row = await prisma.serviceCatalog.create({
      data: {
        companyId,
        name: s.name,
        category: s.category,
        description: s.description,
        billingUnit: s.billingUnit,
        basePrice: s.basePrice,
        requiresEquipment: s.requiresEquipment,
        requiresCertifiedStaff: s.requiresCertifiedStaff,
        active: true,
      },
    });
    serviceIdByIdx.set(i, row.id);
  }

  /* Resolve seeded Marketing campaigns by NAME (robust against ordering) so
     opportunities + leads can reference them as lead source. */
  const campaignsByName = new Map<string, { id: string; name: string; cost: number }>();
  const campaignRows = await prisma.marketingCampaign.findMany({ where: { companyId } });
  for (const c of campaignRows) {
    campaignsByName.set(c.name, { id: c.id, name: c.name, cost: Number(c.cost) });
  }
  // CAMPAIGNS is the marketing seed's source array; index → name → row.
  const campaignIdByIdx = (idx: number | null): { id: string; name: string; cost: number } | null => {
    if (idx === null) return null;
    const spec = CAMPAIGNS[idx];
    if (!spec) return null;
    return campaignsByName.get(spec.name) ?? null;
  };

  /* 5) LEADS. */
  const leadIdByIdx = new Map<number, string>();
  const leadStatusCount = new Map<CrmLeadStatus, number>();
  let leadsCampaignLinked = 0;
  let goldenLead: { contactName: string; company: string; campaignName: string } | null = null;
  for (let i = 0; i < CRM_LEADS.length; i++) {
    const l = CRM_LEADS[i];
    const campaign = campaignIdByIdx(l.campaignIdx);
    if (campaign) leadsCampaignLinked++;
    const row = await prisma.crmLead.create({
      data: {
        companyId,
        contactName: l.contactName,
        company: l.company,
        position: l.position,
        phone: l.phone,
        email: l.email,
        serviceInterest: l.serviceInterest,
        source: l.source,
        sourceCampaignId: campaign?.id ?? null,
        status: l.status,
        ownerName: CRM_OWNERS[l.ownerIdx],
        priority: l.priority,
        discardReason: l.discardReason ?? null,
        createdDate: daysFromNow(l.createdOffsetDays),
        nextAction: l.nextAction ?? null,
      },
    });
    leadIdByIdx.set(i, row.id);
    leadStatusCount.set(l.status, (leadStatusCount.get(l.status) ?? 0) + 1);
    // The golden lead = first CONVERTIDO lead sourced from a campaign.
    if (l.status === 'CONVERTIDO' && campaign && !goldenLead) {
      goldenLead = { contactName: l.contactName, company: l.company, campaignName: campaign.name };
    }
  }

  /* 6) PIPELINE — insert the deterministic opportunity dataset. */
  const today = daysFromNow(0);
  const oppIdByIdx = new Map<number, string>();
  let oppsCampaignLinked = 0;
  let wonCount = 0;
  let lostCount = 0;
  let goldenThread:
    | { campaignName: string; oppTitle: string; amount: number; cost: number; leadId: string | null }
    | null = null;

  for (let i = 0; i < CRM_OPPS.length; i++) {
    const spec = CRM_OPPS[i];
    const stageId = stageIdByName.get(spec.stageName)!;
    const stage = CRM_STAGES.find((s) => s.name === spec.stageName)!;
    const counterpartyId = clientIdByIdx.get(spec.clientIdx)!;
    const campaign = campaignIdByIdx(spec.campaignIdx);
    if (campaign) oppsCampaignLinked++;
    const expected = spec.expectedOffsetDays === null ? null : daysFromNow(spec.expectedOffsetDays);
    const isWon = stage.isWon;
    const isLost = stage.isLost;
    if (isWon) wonCount++;
    if (isLost) lostCount++;

    const service = serviceByIdx(spec.serviceIdx);
    const serviceId = serviceIdByIdx.get(spec.serviceIdx)!;
    // requires* flags derived from the chosen service (drone → drone+certified).
    const requiresDrone = service.category === 'DRONE';
    const requiresCertifiedStaff = service.requiresCertifiedStaff;
    const requiresVisit =
      service.category === 'INSPECCION' || service.category === 'INDUSTRIAL' || service.category === 'LIMPIEZA';

    // The GOLDEN THREAD won opp carries convertedFromLeadId = the golden lead.
    const isGoldenOpp = spec.tags.includes('golden-thread');
    const convertedFromLeadId = isGoldenOpp ? leadIdByIdx.get(0) ?? null : null;

    const created = await prisma.crmOpportunity.create({
      data: {
        companyId,
        title: spec.title,
        counterpartyId,
        amount: spec.amount,
        probability: spec.probability,
        expectedCloseDate: expected,
        ownerName: CRM_OWNERS[spec.ownerIdx],
        stageId,
        sourceCampaignId: campaign?.id ?? null,
        serviceId,
        needDetected: spec.needDetected,
        serviceZone: spec.serviceZone,
        requiresVisit,
        requiresDrone,
        requiresCertifiedStaff,
        lossReason: spec.lossReason ?? null,
        convertedFromLeadId,
        tags: spec.tags,
        // SIMULATED Finanzas commitment for won opportunities.
        generatedCommitmentAmount: isWon ? spec.amount : null,
        generatedCommitmentDate: isWon ? expected ?? today : null,
      },
    });
    oppIdByIdx.set(i, created.id);

    // Capture the golden thread: first WON opp with a campaign whose amount > cost.
    if (isWon && campaign && spec.amount > campaign.cost && !goldenThread) {
      goldenThread = {
        campaignName: campaign.name,
        oppTitle: spec.title,
        amount: spec.amount,
        cost: campaign.cost,
        leadId: convertedFromLeadId,
      };
    }
  }

  /* 7) QUOTES — meta + items with server-side total recomputation. */
  let quotesCreated = 0;
  let quotesItemized = 0;
  for (const q of CRM_QUOTES) {
    const oppSpec = CRM_OPPS[q.oppIdx];
    const opportunityId = oppIdByIdx.get(q.oppIdx)!;
    const counterpartyId = clientIdByIdx.get(oppSpec.clientIdx)!;

    // Compute line totals + quote aggregates exactly like QuotesService.
    let subtotal = 0;
    const itemRows = q.items.map((it) => {
      const lineTotal = Math.round(it.quantity * it.unitPrice * (1 - it.discountPct / 100));
      subtotal += lineTotal;
      return {
        serviceId: it.serviceIdx === null ? null : serviceIdByIdx.get(it.serviceIdx) ?? null,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        discountPct: it.discountPct,
        lineTotal,
      };
    });
    subtotal = Math.round(subtotal);
    const ivaAmount = Math.round(subtotal * 0.19);
    const total = subtotal + ivaAmount;

    const created = await prisma.crmQuote.create({
      data: {
        companyId,
        opportunityId,
        counterpartyId,
        status: q.status,
        validUntil: q.validUntilOffsetDays === null ? null : daysFromNow(q.validUntilOffsetDays),
        executionTerm: q.executionTerm,
        commercialConditions: q.commercialConditions,
        technicalNotes: q.technicalNotes,
        subtotal,
        ivaAmount,
        total,
      },
    });
    // Items carry companyId directly (the model requires it).
    for (const it of itemRows) {
      await prisma.crmQuoteItem.create({
        data: { companyId, quoteId: created.id, ...it },
      });
    }
    quotesCreated++;
    if (q.items.length >= 3) quotesItemized++;
  }

  /* 8) ACTIVITIES (linked to clients, opportunities and/or leads). */
  let activitiesCreated = 0;
  let upcomingTasks = 0;
  for (const a of CRM_ACTIVITIES) {
    const counterpartyId = clientIdByIdx.get(a.clientIdx)!;
    const opportunityId = a.oppIdx === null ? null : oppIdByIdx.get(a.oppIdx) ?? null;
    const leadId = a.leadIdx === null ? null : leadIdByIdx.get(a.leadIdx) ?? null;
    const dueDate = a.dueOffsetDays === null ? null : daysFromNow(a.dueOffsetDays);
    if (a.type === 'TAREA' && !a.done && a.dueOffsetDays !== null && a.dueOffsetDays >= 0) {
      upcomingTasks++;
    }
    await prisma.crmActivity.create({
      data: {
        companyId,
        counterpartyId,
        opportunityId,
        leadId,
        type: a.type,
        content: a.content,
        date: daysFromNow(a.dateOffsetDays),
        dueDate,
        done: a.done,
      },
    });
    activitiesCreated++;
  }

  const leadsSummary = [...leadStatusCount.entries()]
    .map(([s, n]) => `${s}:${n}`)
    .join(' ');

  console.log(
    `  Clients: ${CRM_CLIENTS.length} (created ${clientsCreated}, reused ${clientsReused}) · ` +
      `Tax docs added: ${taxDocsAdded} · Stages: ${CRM_STAGES.length} · Services: ${CRM_SERVICES.length} · ` +
      `Leads: ${CRM_LEADS.length} [${leadsSummary}] (campaign-linked ${leadsCampaignLinked}) · ` +
      `Opportunities: ${CRM_OPPS.length} (won ${wonCount}, lost ${lostCount}, campaign-linked ${oppsCampaignLinked}) · ` +
      `Quotes: ${quotesCreated} (itemized≥3 ${quotesItemized}) · ` +
      `Activities: ${activitiesCreated} (upcoming tasks ${upcomingTasks})`,
  );
  if (goldenThread) {
    console.log(
      `  ★ GOLDEN THREAD → campaign "${goldenThread.campaignName}" (cost $${goldenThread.cost.toLocaleString('es-CL')}) ` +
        (goldenLead
          ? `→ lead "${goldenLead.contactName} / ${goldenLead.company}" (CONVERTIDO) `
          : '') +
        `→ won opp "${goldenThread.oppTitle}" (amount $${goldenThread.amount.toLocaleString('es-CL')}` +
        `${goldenThread.leadId ? `, convertedFromLeadId=${goldenThread.leadId}` : ''}) ` +
        `→ campaign-roi POSITIVE (attributedRevenue > cost).`,
    );
  } else {
    console.log('  ⚠ GOLDEN THREAD not established — check campaign seed / amounts.');
  }
}

/* ── main ───────────────────────────────────────────────────────────────── */

async function resolveCompanyId(): Promise<string | null> {
  // Prefer AGS Solutions by RUT (both dotted and plain forms), else first company.
  const ags = await prisma.company.findFirst({
    where: { taxId: { in: ['77.004.647-5', '77004647-5'] } },
  });
  if (ags) {
    console.log(`Demo company: ${ags.name} (${ags.id}) [AGS by RUT]`);
    return ags.id;
  }
  const first = await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
  if (first) {
    console.log(`Demo company: ${first.name} (${first.id}) [first company]`);
    return first.id;
  }
  return null;
}

async function main() {
  const companyId = await resolveCompanyId();
  if (!companyId) {
    console.error('No company found. Run the base seed (npm run prisma:seed) first. Exiting.');
    process.exit(0);
  }
  await seedRrhh(prisma, companyId);
  await seedMarketing(prisma, companyId);
  await seedComercial(prisma, companyId);
  console.log('✔ Demo seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
