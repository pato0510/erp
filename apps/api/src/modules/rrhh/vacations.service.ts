import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

const DIAS_POR_MES = 1.25; // 15 días hábiles / 12 meses (directional)

/** Latest vacation record per employee → { devengados, tomados, saldo }. */
function summarize(rec: { mesesTrabajados: number; diasTomados: unknown }) {
  const devengados = Number((rec.mesesTrabajados * DIAS_POR_MES).toFixed(2));
  const tomados = Number(rec.diasTomados);
  const saldo = Number((devengados - tomados).toFixed(2));
  return { devengados, tomados, saldo };
}

@Injectable()
export class VacationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { companyId },
      orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
      include: {
        vacations: { orderBy: { fechaCorte: 'desc' }, take: 1 },
      },
    });

    return employees.map((e) => {
      const rec = e.vacations[0];
      const base = rec
        ? summarize(rec)
        : { devengados: 0, tomados: 0, saldo: 0 };
      return {
        employeeId: e.id,
        nombre: `${e.nombres} ${e.apellidos}`.trim(),
        area: e.area,
        cargo: e.cargo,
        mesesTrabajados: rec?.mesesTrabajados ?? 0,
        fechaCorte: rec?.fechaCorte ?? null,
        ...base,
      };
    });
  }

  async findByEmployee(employeeId: string, companyId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      include: { vacations: { orderBy: { fechaCorte: 'desc' } } },
    });
    if (!employee) throw new NotFoundException('Trabajador no encontrado');

    const records = employee.vacations.map((rec) => ({
      id: rec.id,
      mesesTrabajados: rec.mesesTrabajados,
      diasTomados: Number(rec.diasTomados),
      fechaCorte: rec.fechaCorte,
      ...summarize(rec),
    }));

    const latest = records[0] ?? { devengados: 0, tomados: 0, saldo: 0 };

    return {
      employeeId: employee.id,
      nombre: `${employee.nombres} ${employee.apellidos}`.trim(),
      devengados: latest.devengados,
      tomados: latest.tomados,
      saldo: latest.saldo,
      records,
    };
  }
}
