import { Injectable } from '@nestjs/common';
import { CertificationStatus, EmployeeDocumentStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PayrollService } from './payroll.service';
import { AvailabilityService } from './availability.service';
import { CertificationsService } from './certifications.service';
import { calcularLiquidacion } from './payroll/payroll.calculator';
import { deriveDocumentStatus, diasRestantes, toPayrollParams } from './rrhh.helpers';

const ALERT_WINDOW_DAYS = 30;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payroll: PayrollService,
    private readonly availability: AvailabilityService,
    private readonly certifications: CertificationsService,
  ) {}

  async getDashboard(companyId: string) {
    const [employees, params, documents, certAlertas, availabilitySnapshot] = await Promise.all([
      this.prisma.employee.findMany({
        where: { companyId, estado: 'ACTIVO' },
        include: {
          contracts: { where: { activo: true }, orderBy: { fechaInicio: 'desc' }, take: 1 },
        },
      }),
      this.prisma.payrollParameter.findFirst({
        where: { companyId, isActive: true },
        orderBy: { periodo: 'desc' },
      }),
      this.prisma.employeeDocument.findMany({
        where: { companyId },
        include: { employee: { select: { id: true, nombres: true, apellidos: true } } },
      }),
      this.certifications.findExpiring(companyId),
      this.availability.todaySnapshot(companyId),
    ]);

    const headcount = employees.length;

    // Masa salarial bruta = suma de sueldos brutos de contratos activos.
    let masaSalarialBruto = 0;
    let masaSalarialLiquido = 0;
    const payrollParams = params ? toPayrollParams(params) : null;

    for (const e of employees) {
      const contract = e.contracts[0];
      if (!contract) continue;
      const bruto = Number(contract.sueldoBruto);
      masaSalarialBruto += bruto;
      if (payrollParams) {
        masaSalarialLiquido += calcularLiquidacion(bruto, payrollParams, contract.afp).sueldoLiquido;
      }
    }

    // Headcount por área.
    const areaMap = new Map<string, number>();
    for (const e of employees) {
      areaMap.set(e.area, (areaMap.get(e.area) ?? 0) + 1);
    }
    const byArea = [...areaMap.entries()]
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count);

    // Alertas: documentos por vencer (<= 30 días) o vencidos.
    const alerts = documents
      .map((d) => {
        const estado = deriveDocumentStatus(d.fechaVencimiento, d.estado);
        const dias = diasRestantes(d.fechaVencimiento);
        return {
          employeeId: d.employee.id,
          nombre: `${d.employee.nombres} ${d.employee.apellidos}`.trim(),
          tipoDocumento: d.tipoDocumento,
          fechaVencimiento: d.fechaVencimiento,
          estado,
          diasRestantes: dias,
        };
      })
      .filter(
        (a) =>
          a.estado === EmployeeDocumentStatus.VENCIDO ||
          (a.estado === EmployeeDocumentStatus.POR_VENCER &&
            a.diasRestantes !== null &&
            a.diasRestantes <= ALERT_WINDOW_DAYS),
      )
      .sort((a, b) => (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0));

    // Certification metrics + alert items (POR_VENCER / VENCIDA).
    const certificacionesPorVencer = certAlertas.filter(
      (c) => c.status === CertificationStatus.POR_VENCER,
    ).length;
    const certificacionesVencidas = certAlertas.filter(
      (c) => c.status === CertificationStatus.VENCIDA,
    ).length;

    return {
      headcount,
      masaSalarialBruto: Math.round(masaSalarialBruto),
      masaSalarialLiquido: Math.round(masaSalarialLiquido),
      byArea,
      alerts,
      // ── Certifications & availability (drone/industrial upgrade) ──────
      dotacionActiva: availabilitySnapshot.dotacionActiva,
      disponiblesHoy: availabilitySnapshot.disponiblesHoy,
      noDisponiblesHoy: availabilitySnapshot.noDisponiblesHoy,
      certificacionesPorVencer,
      certificacionesVencidas,
      certAlertas,
    };
  }
}
