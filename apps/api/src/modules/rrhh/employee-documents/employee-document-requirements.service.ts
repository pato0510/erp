import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateEmployeeDocumentRequirementDto } from './dto/create-employee-document-requirement.dto';
import { UpdateEmployeeDocumentRequirementDto } from './dto/update-employee-document-requirement.dto';

/* Two-level specificity (copy-adapted from the asset>subtype>type engine):
   employee(2) > jobPosition(1). */
type Specificity = 1 | 2;

interface RequirementFilters {
  employeeId?: string;
  jobPositionId?: string;
  documentTypeId?: string;
}

@Injectable()
export class EmployeeDocumentRequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /* Validates that exactly one of employeeId / jobPositionId is set. The DB also
     enforces this via a CHECK constraint, but catching it here gives a friendly
     error. */
  private validateSingleTarget(payload: {
    employeeId?: string | null;
    jobPositionId?: string | null;
  }) {
    const targets = [payload.employeeId, payload.jobPositionId].filter(
      (t) => t !== undefined && t !== null && t !== '',
    );
    if (targets.length !== 1) {
      throw new BadRequestException(
        'Debe especificar exactamente uno de: employeeId o jobPositionId.',
      );
    }
  }

  findAll(companyId: string, filters: RequirementFilters) {
    const where: Prisma.EmployeeDocumentRequirementWhereInput = { companyId };
    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.jobPositionId) where.jobPositionId = filters.jobPositionId;
    if (filters.documentTypeId) where.documentTypeId = filters.documentTypeId;
    return this.prisma.employeeDocumentRequirement.findMany({
      where,
      include: { documentType: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const req = await this.prisma.employeeDocumentRequirement.findFirst({
      where: { id, companyId },
      include: { documentType: true },
    });
    if (!req) throw new NotFoundException('Requisito documental no encontrado');
    return req;
  }

  async create(companyId: string, userId: string, dto: CreateEmployeeDocumentRequirementDto) {
    this.validateSingleTarget(dto);
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.employeeDocumentRequirement.create({
          data: {
            companyId,
            createdBy: userId,
            documentTypeId: dto.documentTypeId,
            employeeId: dto.employeeId ?? null,
            jobPositionId: dto.jobPositionId ?? null,
            isMandatory: dto.isMandatory ?? true,
            appliesToClient: dto.appliesToClient ?? null,
            appliesToSite: dto.appliesToSite ?? null,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new BadRequestException(
          'Referencia inválida: el tipo de documento, el trabajador o el cargo destino no existe.',
        );
      }
      throw err;
    }
  }

  async update(
    id: string,
    companyId: string,
    userId: string,
    dto: UpdateEmployeeDocumentRequirementDto,
  ) {
    const existing = await this.findOne(id, companyId);

    const touchesTarget = dto.employeeId !== undefined || dto.jobPositionId !== undefined;
    if (touchesTarget) {
      this.validateSingleTarget({
        employeeId: dto.employeeId ?? existing.employeeId ?? null,
        jobPositionId: dto.jobPositionId ?? existing.jobPositionId ?? null,
      });
    }

    const data: Prisma.EmployeeDocumentRequirementUncheckedUpdateInput = { updatedBy: userId };
    if (dto.employeeId !== undefined) data.employeeId = dto.employeeId || null;
    if (dto.jobPositionId !== undefined) data.jobPositionId = dto.jobPositionId || null;
    if (dto.documentTypeId !== undefined) data.documentTypeId = dto.documentTypeId;
    if (dto.isMandatory !== undefined) data.isMandatory = dto.isMandatory;
    if (dto.appliesToClient !== undefined) data.appliesToClient = dto.appliesToClient || null;
    if (dto.appliesToSite !== undefined) data.appliesToSite = dto.appliesToSite || null;

    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.employeeDocumentRequirement.update({ where: { id }, data });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new BadRequestException(
          'Referencia inválida: el tipo de documento, el trabajador o el cargo destino no existe.',
        );
      }
      throw err;
    }
  }

  async remove(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.employeeDocumentRequirement.delete({ where: { id } });
    });
  }

  /* Matrix resolution engine. Returns the set of document requirements that
     apply to a given employee, with the most specific scope winning when the
     same documentTypeId appears at both levels:

       specificity:  employee(2) > jobPosition(1)

     Copy-adapted from DocumentRequirementsService.resolveRequirementsForAsset
     (asset(3) > subtype(2) > type(1)). */
  async resolveRequirementsForEmployee(companyId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: { id: true, jobPositionId: true },
    });
    if (!employee) throw new NotFoundException('Trabajador no encontrado');

    const orClauses: Prisma.EmployeeDocumentRequirementWhereInput[] = [{ employeeId: employee.id }];
    if (employee.jobPositionId) {
      orClauses.push({ jobPositionId: employee.jobPositionId });
    }

    const candidates = await this.prisma.employeeDocumentRequirement.findMany({
      where: { companyId, OR: orClauses },
      include: { documentType: true },
    });

    const bestByDocType = new Map<
      string,
      { specificity: Specificity; req: (typeof candidates)[number] }
    >();

    for (const req of candidates) {
      const specificity: Specificity = req.employeeId ? 2 : 1;
      const current = bestByDocType.get(req.documentTypeId);
      if (!current || specificity > current.specificity) {
        bestByDocType.set(req.documentTypeId, { specificity, req });
      }
    }

    return Array.from(bestByDocType.values()).map(({ req, specificity }) => ({
      ...req,
      resolvedFrom: specificity === 2 ? 'employee' : 'jobPosition',
    }));
  }
}
