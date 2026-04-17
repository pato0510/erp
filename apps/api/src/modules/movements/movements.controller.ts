import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { MovementsService } from './movements.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { UpdateMovementDto } from './dto/update-movement.dto';
import { FilterMovementDto } from './dto/filter-movement.dto';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { MovementSubject } from '../common/casl/casl-ability.factory';

@Controller('movements')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class MovementsController {
  constructor(private readonly movementsService: MovementsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  findAll(@CurrentCompany() companyId: string, @Query() filters: FilterMovementDto) {
    return this.movementsService.findAll(companyId, filters);
  }

  @Get('summary')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getSummary(@CurrentCompany() companyId: string, @Query('fiscalPeriodId') fiscalPeriodId: string) {
    return this.movementsService.getSummary(companyId, fiscalPeriodId);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.movementsService.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', MovementSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateMovementDto,
  ) {
    return this.movementsService.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', MovementSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateMovementDto,
  ) {
    return this.movementsService.update(id, companyId, user.id, dto);
  }

  @Post(':id/confirm')
  @CheckPolicies((ability) => ability.can('update', MovementSubject))
  confirm(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.movementsService.confirm(id, companyId, user.id);
  }

  @Post(':id/cancel')
  @CheckPolicies((ability) => ability.can('update', MovementSubject))
  cancel(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body('reason') reason?: string,
  ) {
    return this.movementsService.cancel(id, companyId, user.id, reason);
  }
}
