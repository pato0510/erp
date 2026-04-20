import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ClosingService } from './closing.service';
import { ClosePeriodDto, ReopenPeriodDto } from './dto/closing.dto';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FiscalPeriodSubject } from '../common/casl/casl-ability.factory';

@Controller('closing')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ClosingController {
  constructor(private readonly closingService: ClosingService) {}

  @Get('checklist')
  @CheckPolicies((ability) => ability.can('read', FiscalPeriodSubject))
  getChecklist(
    @CurrentCompany() companyId: string,
    @Query('fiscalPeriodId') fiscalPeriodId?: string,
  ) {
    if (!fiscalPeriodId) throw new BadRequestException('fiscalPeriodId es requerido');
    return this.closingService.getChecklist(companyId, fiscalPeriodId);
  }

  @Get('summary')
  @CheckPolicies((ability) => ability.can('read', FiscalPeriodSubject))
  getSummary(
    @CurrentCompany() companyId: string,
    @Query('fiscalPeriodId') fiscalPeriodId?: string,
  ) {
    if (!fiscalPeriodId) throw new BadRequestException('fiscalPeriodId es requerido');
    return this.closingService.getClosingSummary(companyId, fiscalPeriodId);
  }

  // Close & reopen are gated to ADMIN+ via CASL `delete` (which MANAGER lacks on
  // FiscalPeriodSubject); the service performs a second role check for reopen.
  @Post('close')
  @CheckPolicies((ability) => ability.can('delete', FiscalPeriodSubject))
  closePeriod(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ClosePeriodDto,
  ) {
    return this.closingService.closePeriod(companyId, user.id, dto.fiscalPeriodId, dto.notes);
  }

  @Post('reopen')
  @CheckPolicies((ability) => ability.can('delete', FiscalPeriodSubject))
  reopenPeriod(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ReopenPeriodDto,
  ) {
    return this.closingService.reopenPeriod(companyId, user.id, dto.fiscalPeriodId, dto.reason);
  }
}
