import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { RrhhEmployeeReadService } from '../../rrhh/employee-read/employee-read.service';
import { CreateIncidentPersonDto } from './dto/create-incident-person.dto';
import { UpdateIncidentPersonDto } from './dto/update-incident-person.dto';

/* HSEC-003 — afectados of an incident. employeeId is a BARE uuid resolved via the
 * RrhhEmployeeRead leaf (the two-key signed contract, PART1 decisions 4/5):
 * - Membership check on WRITE: the id must resolve through resolveNamesByIds (company-scoped,
 *   ANY employee status) → otherwise 400. A DESVINCULADO employee IS addable — historical
 *   incidents get registered late, and the afectado of that day may since have left; their
 *   name keeps resolving in history (decision 4b).
 * - Duplicate pair: DB unique (incidentId, employeeId) is the backstop; the service catches
 *   P2002 → 409 verbatim (the house two-layer style).
 * Incident-belongs-to-company is enforced on every route (404 otherwise). */
@Injectable()
export class IncidentPersonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly employeeRead: RrhhEmployeeReadService,
  ) {}

  private async getIncidentOrThrow(incidentId: string, companyId: string) {
    const incident = await this.prisma.hsecIncident.findFirst({
      where: { id: incidentId, companyId },
    });
    if (!incident) throw new NotFoundException('Incidente no encontrado');
    return incident;
  }

  private async getPersonOrThrow(personId: string, incidentId: string, companyId: string) {
    const person = await this.prisma.hsecIncidentPerson.findFirst({
      where: { id: personId, incidentId, companyId },
    });
    if (!person) throw new NotFoundException('Afectado no encontrado');
    return person;
  }

  /** Rows + names in ONE resolveNamesByIds batch (no N+1). A name that no longer resolves
   *  (row hard-deleted from RRHH) degrades to null — the afectado row itself stays. */
  async list(incidentId: string, companyId: string) {
    await this.getIncidentOrThrow(incidentId, companyId);
    const rows = await this.prisma.hsecIncidentPerson.findMany({
      where: { companyId, incidentId },
      orderBy: { createdAt: 'asc' },
    });
    const names = await this.employeeRead.resolveNamesByIds(
      companyId,
      rows.map((r) => r.employeeId),
    );
    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      fullName: names[r.employeeId] ?? null,
      injuryType: r.injuryType,
      bodyPart: r.bodyPart,
      medicalAttention: r.medicalAttention,
      lostDays: r.lostDays,
      detail: r.detail,
    }));
  }

  async create(
    incidentId: string,
    companyId: string,
    userId: string,
    dto: CreateIncidentPersonDto,
  ) {
    await this.getIncidentOrThrow(incidentId, companyId);
    // Membership gate via the leaf: company-scoped, ANY status (DESVINCULADO addable).
    const names = await this.employeeRead.resolveNamesByIds(companyId, [dto.employeeId]);
    const fullName = names[dto.employeeId];
    if (fullName === undefined) {
      throw new BadRequestException('El empleado no pertenece a la empresa.');
    }
    try {
      const row = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.hsecIncidentPerson.create({
          data: {
            companyId,
            incidentId,
            employeeId: dto.employeeId,
            injuryType: dto.injuryType ?? null,
            bodyPart: dto.bodyPart ?? null,
            medicalAttention: dto.medicalAttention ?? false,
            lostDays: dto.lostDays ?? null,
            detail: dto.detail ?? null,
          },
        });
      });
      return { ...row, fullName };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(
          'El empleado ya está registrado como afectado en este incidente.',
        );
      }
      throw e;
    }
  }

  async update(
    incidentId: string,
    personId: string,
    companyId: string,
    userId: string,
    dto: UpdateIncidentPersonDto,
  ) {
    await this.getIncidentOrThrow(incidentId, companyId);
    await this.getPersonOrThrow(personId, incidentId, companyId);
    const data: Prisma.HsecIncidentPersonUncheckedUpdateInput = {};
    if (dto.injuryType !== undefined) data.injuryType = dto.injuryType ?? null;
    if (dto.bodyPart !== undefined) data.bodyPart = dto.bodyPart ?? null;
    if (dto.medicalAttention !== undefined) data.medicalAttention = dto.medicalAttention;
    if (dto.lostDays !== undefined) data.lostDays = dto.lostDays ?? null;
    if (dto.detail !== undefined) data.detail = dto.detail ?? null;

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.hsecIncidentPerson.update({ where: { id: personId }, data });
    });
  }

  async remove(incidentId: string, personId: string, companyId: string, userId: string) {
    await this.getIncidentOrThrow(incidentId, companyId);
    await this.getPersonOrThrow(personId, incidentId, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.hsecIncidentPerson.delete({ where: { id: personId } });
    });
  }
}
