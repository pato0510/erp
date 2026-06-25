import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateAfpRateDto } from './dto/create-afp-rate.dto';
import { CreateParameterSetDto } from './dto/create-parameter-set.dto';
import { UpdateAfpRateDto } from './dto/update-afp-rate.dto';
import { UpdateParameterSetDto } from './dto/update-parameter-set.dto';

/* The verified 2026 seed (HR-008 §3.4, Superintendencia de Pensiones). This is
   DATA, seeded into payroll_parameter_sets — it is NEVER read by any formula
   (there is no liquidación engine in Nivel A). The 4 AFP comisiones we could not
   verify are intentionally NULL — the admin completes them from spensiones.cl. */
const SEED_2026 = {
  name: '2026',
  effectiveFrom: '2026-02-01',
  topeImponibleAfpSaludUf: 90.0,
  topeImponibleAfcUf: 135.2,
  tasaAfpObligatoria: 10.0,
  tasaSalud: 7.0,
  tasaAfcIndefinidoTrabajador: 0.6,
  tasaAfcIndefinidoEmpleador: 2.4,
  tasaAfcPlazoFijoEmpleador: 3.0,
  tasaSis: 1.53,
  afp: [
    { afpName: 'Uno', comisionPorcentaje: 0.49 }, // VERIFIED
    { afpName: 'Modelo', comisionPorcentaje: 0.58 }, // VERIFIED
    { afpName: 'Provida', comisionPorcentaje: 1.45 }, // VERIFIED
    { afpName: 'Capital', comisionPorcentaje: null }, // admin completes
    { afpName: 'Cuprum', comisionPorcentaje: null }, // admin completes
    { afpName: 'Habitat', comisionPorcentaje: null }, // admin completes
    { afpName: 'PlanVital', comisionPorcentaje: null }, // admin completes
  ] as { afpName: string; comisionPorcentaje: number | null }[],
};

@Injectable()
export class PayrollParametersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  private utcToday(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  findAll(companyId: string) {
    return this.prisma.payrollParameterSet.findMany({
      where: { companyId },
      orderBy: [{ effectiveFrom: 'desc' }, { name: 'desc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const set = await this.prisma.payrollParameterSet.findFirst({
      where: { id, companyId },
      include: { afpRates: { orderBy: { afpName: 'asc' } } },
    });
    if (!set) throw new NotFoundException('Conjunto de parámetros no encontrado');
    return set;
  }

  /* The "vigente" set: effectiveFrom <= today AND (effectiveTo IS NULL OR >= today),
     active. Most-recent effectiveFrom wins if several overlap. */
  getCurrent(companyId: string) {
    const today = this.utcToday();
    return this.prisma.payrollParameterSet.findFirst({
      where: {
        companyId,
        active: true,
        effectiveFrom: { lte: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
      },
      include: { afpRates: { orderBy: { afpName: 'asc' } } },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async create(companyId: string, userId: string, dto: CreateParameterSetDto) {
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.payrollParameterSet.create({
          data: {
            companyId,
            createdBy: userId,
            name: dto.name,
            effectiveFrom: new Date(dto.effectiveFrom),
            effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
            topeImponibleAfpSaludUf: dto.topeImponibleAfpSaludUf,
            topeImponibleAfcUf: dto.topeImponibleAfcUf,
            tasaAfpObligatoria: dto.tasaAfpObligatoria,
            tasaSalud: dto.tasaSalud,
            tasaAfcIndefinidoTrabajador: dto.tasaAfcIndefinidoTrabajador,
            tasaAfcIndefinidoEmpleador: dto.tasaAfcIndefinidoEmpleador,
            tasaAfcPlazoFijoEmpleador: dto.tasaAfcPlazoFijoEmpleador,
            tasaSis: dto.tasaSis ?? null,
            active: dto.active ?? true,
            notes: dto.notes ?? null,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Ya existe un conjunto de parámetros con ese nombre.');
      }
      throw err;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateParameterSetDto) {
    await this.prisma.payrollParameterSet
      .findFirstOrThrow({ where: { id, companyId }, select: { id: true } })
      .catch(() => {
        throw new NotFoundException('Conjunto de parámetros no encontrado');
      });
    const data: Prisma.PayrollParameterSetUncheckedUpdateInput = { updatedBy: userId };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.effectiveFrom !== undefined) data.effectiveFrom = new Date(dto.effectiveFrom);
    if (dto.effectiveTo !== undefined)
      data.effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (dto.topeImponibleAfpSaludUf !== undefined)
      data.topeImponibleAfpSaludUf = dto.topeImponibleAfpSaludUf;
    if (dto.topeImponibleAfcUf !== undefined) data.topeImponibleAfcUf = dto.topeImponibleAfcUf;
    if (dto.tasaAfpObligatoria !== undefined) data.tasaAfpObligatoria = dto.tasaAfpObligatoria;
    if (dto.tasaSalud !== undefined) data.tasaSalud = dto.tasaSalud;
    if (dto.tasaAfcIndefinidoTrabajador !== undefined)
      data.tasaAfcIndefinidoTrabajador = dto.tasaAfcIndefinidoTrabajador;
    if (dto.tasaAfcIndefinidoEmpleador !== undefined)
      data.tasaAfcIndefinidoEmpleador = dto.tasaAfcIndefinidoEmpleador;
    if (dto.tasaAfcPlazoFijoEmpleador !== undefined)
      data.tasaAfcPlazoFijoEmpleador = dto.tasaAfcPlazoFijoEmpleador;
    if (dto.tasaSis !== undefined) data.tasaSis = dto.tasaSis;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.notes !== undefined) data.notes = dto.notes || null;
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.payrollParameterSet.update({
          where: { id },
          data,
          include: { afpRates: { orderBy: { afpName: 'asc' } } },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Ya existe un conjunto de parámetros con ese nombre.');
      }
      throw err;
    }
  }

  /* Seed the verified 2026 set + its 7 AFP rows. Idempotent: if a set named
     "2026" already exists for the company, return it untouched. */
  async seed2026(companyId: string, userId: string) {
    const existing = await this.prisma.payrollParameterSet.findFirst({
      where: { companyId, name: SEED_2026.name },
      include: { afpRates: { orderBy: { afpName: 'asc' } } },
    });
    if (existing) return { created: false, set: existing };

    const set = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const created = await tx.payrollParameterSet.create({
        data: {
          companyId,
          createdBy: userId,
          name: SEED_2026.name,
          effectiveFrom: new Date(SEED_2026.effectiveFrom),
          effectiveTo: null,
          topeImponibleAfpSaludUf: SEED_2026.topeImponibleAfpSaludUf,
          topeImponibleAfcUf: SEED_2026.topeImponibleAfcUf,
          tasaAfpObligatoria: SEED_2026.tasaAfpObligatoria,
          tasaSalud: SEED_2026.tasaSalud,
          tasaAfcIndefinidoTrabajador: SEED_2026.tasaAfcIndefinidoTrabajador,
          tasaAfcIndefinidoEmpleador: SEED_2026.tasaAfcIndefinidoEmpleador,
          tasaAfcPlazoFijoEmpleador: SEED_2026.tasaAfcPlazoFijoEmpleador,
          tasaSis: SEED_2026.tasaSis,
        },
      });
      await tx.afpRate.createMany({
        data: SEED_2026.afp.map((a) => ({
          companyId,
          createdBy: userId,
          parameterSetId: created.id,
          afpName: a.afpName,
          comisionPorcentaje: a.comisionPorcentaje,
        })),
      });
      return created;
    });

    return { created: true, set: await this.findOne(set.id, companyId) };
  }

  // ── AFP rates ──────────────────────────────────────────────────────────

  async addAfp(setId: string, companyId: string, userId: string, dto: CreateAfpRateDto) {
    await this.findOne(setId, companyId); // validates the set belongs to the company
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.afpRate.create({
          data: {
            companyId,
            createdBy: userId,
            parameterSetId: setId,
            afpName: dto.afpName,
            comisionPorcentaje: dto.comisionPorcentaje ?? null,
            active: dto.active ?? true,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Ya existe esa AFP en este conjunto de parámetros.');
      }
      throw err;
    }
  }

  async updateAfp(afpId: string, companyId: string, userId: string, dto: UpdateAfpRateDto) {
    const existing = await this.prisma.afpRate.findFirst({
      where: { id: afpId, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('AFP no encontrada');
    const data: Prisma.AfpRateUncheckedUpdateInput = { updatedBy: userId };
    if (dto.comisionPorcentaje !== undefined) data.comisionPorcentaje = dto.comisionPorcentaje;
    if (dto.active !== undefined) data.active = dto.active;
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.afpRate.update({ where: { id: afpId }, data });
    });
  }

  async removeAfp(afpId: string, companyId: string, userId: string) {
    const existing = await this.prisma.afpRate.findFirst({
      where: { id: afpId, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('AFP no encontrada');
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.afpRate.delete({ where: { id: afpId } });
    });
    return { id: afpId, deleted: true };
  }
}
