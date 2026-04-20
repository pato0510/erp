import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReconciliationStatus } from '@prisma/client';
import { ReconciliationService } from './reconciliation.service';
import { ManualMatchDto, RejectMatchDto } from './dto/manual-match.dto';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MovementSubject } from '../common/casl/casl-ability.factory';

const VALID_STATUSES: ReconciliationStatus[] = [
  'PENDING',
  'AUTO_MATCHED',
  'SUGGESTED',
  'CONFIRMED',
  'REJECTED',
  'MANUAL',
];

@Controller('reconciliation')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post('run')
  @CheckPolicies((ability) => ability.can('update', MovementSubject))
  run(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Query('fiscalPeriodId') fiscalPeriodId?: string,
  ) {
    return this.reconciliationService.runMatching(companyId, user.id, fiscalPeriodId);
  }

  @Get('workbench')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  workbench(@CurrentCompany() companyId: string, @Query('fiscalPeriodId') fiscalPeriodId?: string) {
    return this.reconciliationService.getWorkbenchData(companyId, fiscalPeriodId);
  }

  @Get('kpis')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  kpis(@CurrentCompany() companyId: string, @Query('fiscalPeriodId') fiscalPeriodId?: string) {
    return this.reconciliationService.getKpis(companyId, fiscalPeriodId);
  }

  @Get('matches')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getMatches(
    @CurrentCompany() companyId: string,
    @Query('status') status?: string,
    @Query('fiscalPeriodId') fiscalPeriodId?: string,
    @Query('matchType') matchType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (status && !VALID_STATUSES.includes(status as ReconciliationStatus)) {
      throw new BadRequestException(`status debe ser uno de: ${VALID_STATUSES.join(', ')}`);
    }
    return this.reconciliationService.getMatches(companyId, {
      status: status as ReconciliationStatus | undefined,
      fiscalPeriodId,
      matchType,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Patch('matches/:id/confirm')
  @CheckPolicies((ability) => ability.can('update', MovementSubject))
  confirm(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.reconciliationService.confirmMatch(id, companyId, user.id);
  }

  @Patch('matches/:id/reject')
  @CheckPolicies((ability) => ability.can('update', MovementSubject))
  reject(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() body: RejectMatchDto,
  ) {
    return this.reconciliationService.rejectMatch(id, companyId, user.id, body.notes);
  }

  @Post('matches/manual')
  @CheckPolicies((ability) => ability.can('update', MovementSubject))
  manual(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ManualMatchDto,
  ) {
    return this.reconciliationService.createManualMatch(companyId, user.id, dto);
  }
}
