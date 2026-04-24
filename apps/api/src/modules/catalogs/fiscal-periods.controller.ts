import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PeriodStatus } from '@prisma/client';
import { FiscalPeriodsService } from './fiscal-periods.service';
import { CreateFiscalPeriodDto } from './dto/create-fiscal-period.dto';
import { UpdatePeriodStatusDto } from './dto/update-period-status.dto';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { FiscalPeriodSubject } from '../common/casl/casl-ability.factory';

@Controller('fiscal-periods')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class FiscalPeriodsController {
  constructor(private readonly fiscalPeriodsService: FiscalPeriodsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', FiscalPeriodSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('year') year?: string,
    @Query('status') status?: PeriodStatus,
  ) {
    return this.fiscalPeriodsService.findAll(
      companyId,
      year ? parseInt(year, 10) : undefined,
      status,
    );
  }

  @Get('current')
  @CheckPolicies((ability) => ability.can('read', FiscalPeriodSubject))
  findCurrent(@CurrentCompany() companyId: string) {
    return this.fiscalPeriodsService.findCurrent(companyId);
  }

  @Get('status/:year')
  @CheckPolicies((ability) => ability.can('read', FiscalPeriodSubject))
  getPeriodsStatus(@Param('year', ParseIntPipe) year: number, @CurrentCompany() companyId: string) {
    return this.fiscalPeriodsService.getPeriodsStatus(companyId, year);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', FiscalPeriodSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.fiscalPeriodsService.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', FiscalPeriodSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateFiscalPeriodDto,
  ) {
    return this.fiscalPeriodsService.create(companyId, user.id, dto);
  }

  @Post('generate/:year')
  @CheckPolicies((ability) => ability.can('create', FiscalPeriodSubject))
  generatePeriods(
    @Param('year', ParseIntPipe) year: number,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.fiscalPeriodsService.generatePeriods(companyId, user.id, year);
  }

  @Patch(':id/status')
  @CheckPolicies((ability) => ability.can('update', FiscalPeriodSubject))
  updateStatus(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdatePeriodStatusDto,
  ) {
    return this.fiscalPeriodsService.updateStatus(id, companyId, user.id, dto);
  }
}
