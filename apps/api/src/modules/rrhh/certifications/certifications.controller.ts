import {
  BadRequestException,
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
import { CertificationCategory } from '@prisma/client';
import { CertificationSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CertificationsService, type CertDerivedStatus } from './certifications.service';
import { CreateCertificationDto } from './dto/create-certification.dto';
import { UpdateCertificationDto } from './dto/update-certification.dto';

/* HR-014 — certification records + compliance. Every endpoint gates on
   CertificationSubject (read⟺manage; ACCOUNTANT/ANALYST/VIEWER → 403), so the
   frontend gates its actions on whether the list GET succeeds. */
@Controller('rrhh/certifications')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class CertificationsController {
  constructor(private readonly service: CertificationsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', CertificationSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('employeeId') employeeId: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    if (!employeeId) throw new BadRequestException('employeeId es obligatorio.');
    return this.service.findAll(companyId, employeeId, {
      category: category ? (category as CertificationCategory) : undefined,
      status: status ? (status as CertDerivedStatus) : undefined,
    });
  }

  /* Per-employee compliance. Declared before `:id` so the literal segment wins. */
  @Get('compliance/:employeeId')
  @CheckPolicies((ability) => ability.can('read', CertificationSubject))
  compliance(@Param('employeeId') employeeId: string, @CurrentCompany() companyId: string) {
    return this.service.compliance(companyId, employeeId);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', CertificationSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', CertificationSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCertificationDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', CertificationSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateCertificationDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', CertificationSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
