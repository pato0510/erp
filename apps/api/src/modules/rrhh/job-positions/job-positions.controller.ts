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
import { AreaRRHH } from '@prisma/client';
import { JobPositionSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateJobPositionDto } from './dto/create-job-position.dto';
import { UpdateJobPositionDto } from './dto/update-job-position.dto';
import { JobPositionsService } from './job-positions.service';

/* HR-002 — cargos / perfiles de cargo. EVERY endpoint declares @CheckPolicies
 * on JobPositionSubject — PoliciesGuard fails OPEN, so a bare endpoint would be
 * authorized-by-default. Baseline (HR-001 + HR-002): MANAGER/ADMIN/SUPER_ADMIN
 * manage; every other role gets 403. */
@Controller('rrhh/job-positions')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class JobPositionsController {
  constructor(private readonly service: JobPositionsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', JobPositionSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('area') area?: string,
    @Query('active') active?: string,
  ) {
    return this.service.findAll(companyId, {
      area: area ? (area as AreaRRHH) : undefined,
      active: active === undefined ? undefined : active === 'true',
    });
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', JobPositionSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', JobPositionSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateJobPositionDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', JobPositionSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateJobPositionDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', JobPositionSubject))
  deactivate(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.deactivate(id, companyId, user.id);
  }
}
