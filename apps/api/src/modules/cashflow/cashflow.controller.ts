import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CashflowService } from './cashflow.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { SetOpeningBalanceDto } from './dto/set-opening-balance.dto';
import { CreateCommitmentDto } from './dto/create-commitment.dto';
import { FilterCommitmentDto } from './dto/filter-commitment.dto';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { MovementSubject } from '../common/casl/casl-ability.factory';

@Controller('cashflow')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class CashflowController {
  constructor(private readonly cashflowService: CashflowService) {}

  // ── Position ───────────────────────────────────────────

  @Get('position')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getPosition(
    @CurrentCompany() companyId: string,
    @Query('fiscalPeriodId') fiscalPeriodId: string,
  ) {
    return this.cashflowService.getConsolidatedCash(companyId, fiscalPeriodId);
  }

  @Get('free')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getFreeCash(
    @CurrentCompany() companyId: string,
    @Query('fiscalPeriodId') fiscalPeriodId: string,
  ) {
    return this.cashflowService.getFreeCash(companyId, fiscalPeriodId);
  }

  // ── Bank Accounts ──────────────────────────────────────

  @Get('accounts')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  findAccounts(@CurrentCompany() companyId: string) {
    return this.cashflowService.findAccounts(companyId);
  }

  @Post('accounts')
  @CheckPolicies((ability) => ability.can('create', MovementSubject))
  createAccount(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateBankAccountDto,
  ) {
    return this.cashflowService.createAccount(companyId, user.id, dto);
  }

  @Post('accounts/:id/balance')
  @CheckPolicies((ability) => ability.can('update', MovementSubject))
  setBalance(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: SetOpeningBalanceDto,
  ) {
    return this.cashflowService.setOpeningBalance(companyId, user.id, dto);
  }

  // ── Commitments ────────────────────────────────────────

  @Get('commitments')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  findCommitments(@CurrentCompany() companyId: string, @Query() filters: FilterCommitmentDto) {
    return this.cashflowService.findCommitments(companyId, filters);
  }

  @Get('commitments/upcoming')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getUpcoming(@CurrentCompany() companyId: string, @Query('days') days?: string) {
    return this.cashflowService.getUpcoming(companyId, days ? parseInt(days, 10) : 30);
  }

  @Post('commitments')
  @CheckPolicies((ability) => ability.can('create', MovementSubject))
  createCommitment(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCommitmentDto,
  ) {
    return this.cashflowService.createCommitment(companyId, user.id, dto);
  }

  @Patch('commitments/:id/pay')
  @CheckPolicies((ability) => ability.can('update', MovementSubject))
  markAsPaid(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body('movementId') movementId?: string,
  ) {
    return this.cashflowService.markAsPaid(id, companyId, user.id, movementId);
  }

  @Patch('commitments/:id/cancel')
  @CheckPolicies((ability) => ability.can('update', MovementSubject))
  cancelCommitment(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.cashflowService.cancelCommitment(id, companyId, user.id);
  }
}
