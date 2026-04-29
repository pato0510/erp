import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuditPackageSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { AuditPackageService } from './audit-package.service';
import { AuditPackageFiltersDto, GeneratePackageDto } from './dto/generate-package.dto';
import { LEGAL_FRAMEWORK_CHILE, REPORT_FILES } from './legal-framework.constant';

const VALIDATE_MAX_BYTES = 100 * 1024 * 1024;

/* OPS-036 — audit package endpoints. Sits under /operations/audit
   so that the existing /audit (PostgreSQL trigger row history)
   remains a separate surface. The controller-level PoliciesGuard
   short-circuits to true when no @CheckPolicies metadata is set,
   so /legal-framework stays open to every authenticated user. */
@Controller('operations/audit')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AuditPackageController {
  constructor(private readonly service: AuditPackageService) {}

  @Post('generate-package')
  @CheckPolicies((ability) => ability.can('create', AuditPackageSubject))
  async generatePackage(
    @Body() dto: GeneratePackageDto,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.generatePackage(companyId, user.id, dto);
  }

  @Get('packages')
  @CheckPolicies((ability) => ability.can('read', AuditPackageSubject))
  async listPackages(
    @CurrentCompany() companyId: string,
    @Query() filters: AuditPackageFiltersDto,
  ) {
    return this.service.findAll(companyId, filters);
  }

  @Get('packages/:id')
  @CheckPolicies((ability) => ability.can('read', AuditPackageSubject))
  async getPackage(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(companyId, id);
  }

  @Get('packages/:id/download')
  @CheckPolicies((ability) => ability.can('read', AuditPackageSubject))
  async downloadPackage(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.downloadPackage(companyId, id);
    const pkg = await this.service.findOne(companyId, id);
    const dateStr = pkg.generatedAt.toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="paquete-auditoria-${dateStr}.zip"`);
    res.send(buffer);
  }

  /* The validator inspects an uploaded ZIP; no DB access — read
     permission is enough. We bound the upload size separately
     because a malicious 10 GB ZIP would otherwise pin the worker. */
  @Post('validate-package')
  @CheckPolicies((ability) => ability.can('read', AuditPackageSubject))
  @UseInterceptors(FileInterceptor('file'))
  async validatePackage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Sube un archivo .zip para validar.');
    }
    if (file.size > VALIDATE_MAX_BYTES) {
      throw new BadRequestException(
        `Archivo demasiado grande (máx ${VALIDATE_MAX_BYTES / 1024 / 1024} MB).`,
      );
    }
    return this.service.validatePackageIntegrity(file.buffer);
  }

  @Get('compliance-snapshot')
  @CheckPolicies((ability) => ability.can('read', AuditPackageSubject))
  async getComplianceSnapshot(@CurrentCompany() companyId: string) {
    return this.service.getDataSnapshot(companyId);
  }

  /* Static — no CASL guard needed. Returned both for the audit
     page's framework cards and as documentation. */
  @Get('legal-framework')
  getLegalFramework() {
    return {
      framework: LEGAL_FRAMEWORK_CHILE,
      reports: REPORT_FILES.REPORTS,
    };
  }
}
