import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { EmployeesService } from './employees.service';
import { calcularLiquidacion } from './payroll/payroll.calculator';
import { toPayrollParams } from './rrhh.helpers';

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
  ) {}

  /** Active PayrollParameter for the company (most recent if several active). */
  async getActiveParameter(companyId: string) {
    const param = await this.prisma.payrollParameter.findFirst({
      where: { companyId, isActive: true },
      orderBy: { periodo: 'desc' },
    });
    if (!param) {
      throw new NotFoundException(
        'No hay parámetros de remuneración configurados para esta empresa.',
      );
    }
    return param;
  }

  /** Returns the active parameter normalized for the frontend (numbers, JSON). */
  async getParameters(companyId: string) {
    const p = await this.getActiveParameter(companyId);
    return {
      id: p.id,
      periodo: p.periodo,
      ufValue: Number(p.ufValue),
      utmValue: Number(p.utmValue),
      topeImponibleUf: Number(p.topeImponibleUf),
      topeCesantiaUf: Number(p.topeCesantiaUf),
      saludRate: Number(p.saludRate),
      cesantiaRateTrabajador: Number(p.cesantiaRateTrabajador),
      afpRates: p.afpRates,
      taxBrackets: p.taxBrackets,
      isActive: p.isActive,
    };
  }

  async calculate(companyId: string, sueldoBruto: number, afp?: string) {
    const param = await this.getActiveParameter(companyId);
    return calcularLiquidacion(sueldoBruto, toPayrollParams(param), afp);
  }

  /** Computes a liquidación from a worker's active contract. */
  async calculateForEmployee(employeeId: string, companyId: string) {
    const employee = await this.employees.findOne(employeeId, companyId);
    const contract = employee.activeContract;
    if (!contract) {
      throw new NotFoundException('El trabajador no tiene un contrato activo.');
    }
    const breakdown = await this.calculate(companyId, Number(contract.sueldoBruto), contract.afp);
    return {
      employeeId: employee.id,
      nombre: employee.nombre,
      cargo: employee.cargo,
      area: employee.area,
      sueldoBruto: Number(contract.sueldoBruto),
      afp: contract.afp,
      salud: contract.salud,
      ...breakdown,
    };
  }
}
