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
import { CertificationCategory } from '@prisma/client';
import { CertificationSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CertificationTypesService } from './certification-types.service';
import { CreateCertificationTypeDto } from './dto/create-certification-type.dto';
import { UpdateCertificationTypeDto } from './dto/update-certification-type.dto';

/* HR-014 — certification/habilitación type catalog. Every endpoint gates on
   CertificationSubject (read⟺manage: MANAGER/ADMIN/SUPER_ADMIN; others 403).
   PoliciesGuard allows handler-less routes, so every endpoint declares one. */
@Controller('rrhh/certification-types')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class CertificationTypesController {
  constructor(private readonly service: CertificationTypesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', CertificationSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('category') category?: string,
  ) {
    return this.service.findAll(companyId, {
      activeOnly: activeOnly === 'true',
      category: category ? (category as CertificationCategory) : undefined,
    });
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
    @Body() dto: CreateCertificationTypeDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Post('seed-recommended')
  @CheckPolicies((ability) => ability.can('create', CertificationSubject))
  seedRecommended(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.seedRecommended(companyId, user.id);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', CertificationSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateCertificationTypeDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('update', CertificationSubject))
  deactivate(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.deactivate(id, companyId, user.id);
  }
}
