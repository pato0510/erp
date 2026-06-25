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
import { AbsenceCategory } from '@prisma/client';
import { LeaveRequestSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { AbsenceTypesService } from './absence-types.service';
import { CreateAbsenceTypeDto } from './dto/create-absence-type.dto';
import { UpdateAbsenceTypeDto } from './dto/update-absence-type.dto';

/* HR-012 — configurable permit/licencia type catalog. Gated on LeaveRequestSubject
 * (the existing RRHH leave subject; licencias ride the same RRHH manage grant —
 * MANAGER/ADMIN/SUPER_ADMIN; ACCOUNTANT/ANALYST/VIEWER get 403). Every endpoint
 * declares @CheckPolicies (PoliciesGuard allows a handler-less route, so absence
 * of the decorator would mean "open" — hence every one declares it). */
@Controller('rrhh/absence-types')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AbsenceTypesController {
  constructor(private readonly service: AbsenceTypesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', LeaveRequestSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('category') category?: string,
  ) {
    return this.service.findAll(companyId, {
      activeOnly: activeOnly === 'true',
      category: category ? (category as AbsenceCategory) : undefined,
    });
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', LeaveRequestSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', LeaveRequestSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateAbsenceTypeDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Post('seed-recommended')
  @CheckPolicies((ability) => ability.can('create', LeaveRequestSubject))
  seedRecommended(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.seedRecommended(companyId, user.id);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', LeaveRequestSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateAbsenceTypeDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('update', LeaveRequestSubject))
  deactivate(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.deactivate(id, companyId, user.id);
  }
}
