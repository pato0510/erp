import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EmployeeDocumentSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateEmployeeDocumentTypeDto } from './dto/create-employee-document-type.dto';
import { UpdateEmployeeDocumentTypeDto } from './dto/update-employee-document-type.dto';
import { EmployeeDocumentTypesService } from './employee-document-types.service';

/* HR-004a — RRHH document-type catalog. Every endpoint gates on
   EmployeeDocumentSubject (PoliciesGuard fails OPEN). MANAGER/ADMIN/SUPER_ADMIN
   manage; every other role is denied (RRHH read is revoked for ACCOUNTANT/
   ANALYST and never granted to VIEWER). */
@Controller('rrhh/document-types')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class EmployeeDocumentTypesController {
  constructor(private readonly service: EmployeeDocumentTypesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', EmployeeDocumentSubject))
  findAll(@CurrentCompany() companyId: string, @Query('activeOnly') activeOnly?: string) {
    return this.service.findAll(companyId, activeOnly === 'true');
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', EmployeeDocumentSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', EmployeeDocumentSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateEmployeeDocumentTypeDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  /* Seed the recommended Chilean HR document types for the current company.
     Idempotent (skips ones already present). */
  @Post('seed-recommended')
  @CheckPolicies((ability) => ability.can('create', EmployeeDocumentSubject))
  seedRecommended(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.seedRecommended(companyId, user.id);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', EmployeeDocumentSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateEmployeeDocumentTypeDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('update', EmployeeDocumentSubject))
  deactivate(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.deactivate(id, companyId, user.id);
  }
}
