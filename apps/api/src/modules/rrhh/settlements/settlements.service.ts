import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SettlementStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { UpdateSettlementDto } from './dto/update-settlement.dto';

/* Decimal/number/null → number (null counts as 0 in sums). */
function n(v: Prisma.Decimal | number | string | null | undefined): number {
  return v === null || v === undefined ? 0 : Number(v);
}

const RECONCILE_TOLERANCE = 0.5; // CLP — entered values rarely land to the exact peso

const SETTLEMENT_INCLUDE = {
  document: { select: { id: true, fileName: true } },
} satisfies Prisma.PayrollSettlementInclude;

interface AmountLike {
  totalHaberes: number | string | Prisma.Decimal | null;
  totalDescuentos: number | string | Prisma.Decimal | null;
  liquidoPagado: number | string | Prisma.Decimal | null;
  descUAfp: number | string | Prisma.Decimal | null;
  descSalud: number | string | Prisma.Decimal | null;
  descAfc: number | string | Prisma.Decimal | null;
  descImpuestoUnico: number | string | Prisma.Decimal | null;
  otrosDescuentos: number | string | Prisma.Decimal | null;
  haberesImponibles: number | string | Prisma.Decimal | null;
  aporteAfcEmpleador?: number | string | Prisma.Decimal | null;
  aporteSis?: number | string | Prisma.Decimal | null;
  aporteMutual?: number | string | Prisma.Decimal | null;
  otrosAportesEmpleador?: number | string | Prisma.Decimal | null;
  afpName?: string | null;
}

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  private utcToday(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  /* costo empresa = a SUM of ENTERED values: totalHaberes + the employer aportes.
     This is NOT a previsional derivation — no rate is applied; it is purely the
     sum of what the admin entered. */
  private computeCostoEmpresa(s: AmountLike): number {
    return (
      n(s.totalHaberes) +
      n(s.aporteAfcEmpleador) +
      n(s.aporteSis) +
      n(s.aporteMutual) +
      n(s.otrosAportesEmpleador)
    );
  }

  private enrich<T extends AmountLike>(s: T) {
    return { ...s, costoEmpresaComputed: this.computeCostoEmpresa(s) };
  }

  /* SOFT validation — advisory ONLY. Never blocks, never recomputes, never
     overwrites entered values. Returns reconciliation warnings (+ an optional AFP
     reference hint from the HR-008 params). */
  private async softValidate(companyId: string, v: AmountLike): Promise<string[]> {
    const warnings: string[] = [];
    const haberes = n(v.totalHaberes);
    const desc = n(v.totalDescuentos);
    const liq = n(v.liquidoPagado);

    if (Math.abs(haberes - desc - liq) > RECONCILE_TOLERANCE) {
      warnings.push(
        `El líquido ingresado (${liq}) no cuadra con total haberes − total descuentos (${haberes - desc}).`,
      );
    }
    const sumDesc =
      n(v.descUAfp) + n(v.descSalud) + n(v.descAfc) + n(v.descImpuestoUnico) + n(v.otrosDescuentos);
    if (Math.abs(sumDesc - desc) > RECONCILE_TOLERANCE) {
      warnings.push(
        `El total de descuentos (${desc}) no coincide con la suma de los descuentos (${sumDesc}).`,
      );
    }

    /* Optional advisory hint: compare the entered AFP discount against an ESTIMATE
       from the vigente HR-008 parameters. This is a sanity reference, NOT a
       recalculation — the entered value is kept as-is regardless. */
    if (v.afpName && n(v.haberesImponibles) > 0) {
      const ref = await this.getAfpReference(companyId, v.afpName);
      if (ref && ref.comision != null) {
        const estimate = ((ref.tasaAfpObligatoria + ref.comision) / 100) * n(v.haberesImponibles);
        if (estimate > 0 && Math.abs(n(v.descUAfp) - estimate) > 0.1 * estimate) {
          warnings.push(
            `Referencia: el descuento AFP ingresado (${n(v.descUAfp)}) se aleja del estimado ~${Math.round(estimate)} según los parámetros vigentes (${ref.tasaAfpObligatoria}% + comisión ${ref.comision}%). Es sólo una referencia; no se recalcula.`,
          );
        }
      }
    }
    return warnings;
  }

  private async getAfpReference(companyId: string, afpName: string) {
    const today = this.utcToday();
    const set = await this.prisma.payrollParameterSet.findFirst({
      where: {
        companyId,
        active: true,
        effectiveFrom: { lte: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
      },
      include: { afpRates: { where: { afpName } } },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!set) return null;
    const rate = set.afpRates[0];
    return {
      tasaAfpObligatoria: Number(set.tasaAfpObligatoria),
      comision: rate?.comisionPorcentaje != null ? Number(rate.comisionPorcentaje) : null,
    };
  }

  private async getEmployeeOrThrow(employeeId: string, companyId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: { id: true },
    });
    if (!employee) throw new BadRequestException('El trabajador no existe en esta empresa.');
    return employee;
  }

  async findAll(companyId: string, employeeId: string, year?: number) {
    if (!employeeId) throw new BadRequestException('employeeId es obligatorio.');
    const rows = await this.prisma.payrollSettlement.findMany({
      where: { companyId, employeeId, ...(year ? { periodYear: year } : {}) },
      include: SETTLEMENT_INCLUDE,
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });
    return rows.map((r) => this.enrich(r));
  }

  async findOne(id: string, companyId: string) {
    const row = await this.prisma.payrollSettlement.findFirst({
      where: { id, companyId },
      include: { ...SETTLEMENT_INCLUDE, employee: { select: { id: true, fullName: true } } },
    });
    if (!row) throw new NotFoundException('Liquidación no encontrada');
    return this.enrich(row);
  }

  async create(companyId: string, userId: string, dto: CreateSettlementDto) {
    await this.getEmployeeOrThrow(dto.employeeId, companyId);
    const warnings = await this.softValidate(companyId, dto);
    try {
      const created = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.payrollSettlement.create({
          data: {
            companyId,
            createdBy: userId,
            employeeId: dto.employeeId,
            periodYear: dto.periodYear,
            periodMonth: dto.periodMonth,
            haberesImponibles: dto.haberesImponibles,
            haberesNoImponibles: dto.haberesNoImponibles,
            sueldoBase: dto.sueldoBase ?? null,
            gratificacion: dto.gratificacion ?? null,
            totalHaberes: dto.totalHaberes,
            descUAfp: dto.descUAfp,
            descSalud: dto.descSalud,
            descAfc: dto.descAfc,
            descImpuestoUnico: dto.descImpuestoUnico,
            otrosDescuentos: dto.otrosDescuentos,
            totalDescuentos: dto.totalDescuentos,
            liquidoPagado: dto.liquidoPagado,
            aporteAfcEmpleador: dto.aporteAfcEmpleador ?? null,
            aporteSis: dto.aporteSis ?? null,
            aporteMutual: dto.aporteMutual ?? null,
            otrosAportesEmpleador: dto.otrosAportesEmpleador ?? null,
            costoEmpresa: dto.costoEmpresa ?? null,
            afpName: dto.afpName ?? null,
            status: dto.status ?? 'BORRADOR',
            documentId: dto.documentId ?? null,
            notes: dto.notes ?? null,
          },
          include: SETTLEMENT_INCLUDE,
        });
      });
      return { ...this.enrich(created), warnings };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe una liquidación para este trabajador en ese período (año/mes).',
        );
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new BadRequestException('El documento vinculado no existe.');
      }
      throw err;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateSettlementDto) {
    const existing = await this.prisma.payrollSettlement.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException('Liquidación no encontrada');
    if (existing.status === 'PAGADA' || existing.status === 'ANULADA') {
      throw new BadRequestException('Sólo se pueden editar liquidaciones en BORRADOR o EMITIDA.');
    }

    const data: Prisma.PayrollSettlementUncheckedUpdateInput = { updatedBy: userId };
    const fields: (keyof UpdateSettlementDto)[] = [
      'haberesImponibles',
      'haberesNoImponibles',
      'sueldoBase',
      'gratificacion',
      'totalHaberes',
      'descUAfp',
      'descSalud',
      'descAfc',
      'descImpuestoUnico',
      'otrosDescuentos',
      'totalDescuentos',
      'liquidoPagado',
      'aporteAfcEmpleador',
      'aporteSis',
      'aporteMutual',
      'otrosAportesEmpleador',
      'costoEmpresa',
      'afpName',
      'documentId',
      'notes',
    ];
    for (const f of fields) {
      if (dto[f] !== undefined) {
        (data as Record<string, unknown>)[f] = dto[f] === '' ? null : (dto[f] as unknown);
      }
    }

    /* Re-run soft validation on the MERGED values (advisory only). */
    const merged = { ...existing, ...dto } as unknown as AmountLike;
    const warnings = await this.softValidate(companyId, merged);

    const updated = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.payrollSettlement.update({ where: { id }, data, include: SETTLEMENT_INCLUDE });
    });
    return { ...this.enrich(updated), warnings };
  }

  async setStatus(id: string, companyId: string, userId: string, status: SettlementStatus) {
    const existing = await this.prisma.payrollSettlement.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Liquidación no encontrada');
    const updated = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.payrollSettlement.update({
        where: { id },
        data: { status, updatedBy: userId },
        include: SETTLEMENT_INCLUDE,
      });
    });
    return this.enrich(updated);
  }

  async remove(id: string, companyId: string, userId: string) {
    const existing = await this.prisma.payrollSettlement.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Liquidación no encontrada');
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.payrollSettlement.delete({ where: { id } });
    });
    return { id, deleted: true };
  }

  /* AGGREGATE — totals across employees for a period. Returns ONLY sums +
     headcount; NEVER any per-person row. Gated at the controller on `read`
     EmployeeCompensation (so ACCOUNTANT may call it; VIEWER/ANALYST cannot).
     ANULADA settlements are excluded. */
  async aggregate(companyId: string, year: number, month: number) {
    const agg = await this.prisma.payrollSettlement.aggregate({
      where: { companyId, periodYear: year, periodMonth: month, status: { not: 'ANULADA' } },
      _sum: {
        liquidoPagado: true,
        totalHaberes: true,
        aporteAfcEmpleador: true,
        aporteSis: true,
        aporteMutual: true,
        otrosAportesEmpleador: true,
      },
      _count: { _all: true },
    });
    const sumHaberes = n(agg._sum.totalHaberes);
    const sumLiquido = n(agg._sum.liquidoPagado);
    const sumAportes =
      n(agg._sum.aporteAfcEmpleador) +
      n(agg._sum.aporteSis) +
      n(agg._sum.aporteMutual) +
      n(agg._sum.otrosAportesEmpleador);
    return {
      year,
      month,
      headcount: agg._count._all,
      sumLiquido,
      sumHaberes,
      sumCostoEmpresa: sumHaberes + sumAportes,
      currency: 'CLP',
    };
  }
}
