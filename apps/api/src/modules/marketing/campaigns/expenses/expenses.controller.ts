import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { MarketingExpenseSubject } from '../../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../../iam/guards/jwt-auth.guard';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpensesService } from './expenses.service';
import { UpdateExpenseDto } from './dto/update-expense.dto';

/* MKT-005 — the campaign expense ledger, as a SUB-RESOURCE of campaigns
 * (…/campaigns/:campaignId/expenses). Every endpoint declares @CheckPolicies on the
 * MarketingExpense subject (PoliciesGuard fails OPEN). READ (list) → MANAGER/ADMIN/
 * SUPER_ADMIN + ACCOUNTANT (budget/spend are financial data); every MUTATION
 * (create/update/delete) → MANAGER/ADMIN/SUPER_ADMIN only, so ACCOUNTANT reads the
 * ledger but cannot mutate it and ANALYST/VIEWER stay floored. Writes run through
 * executeWithRls; createdBy is the JWT actor. */
@Controller('marketing/campaigns/:campaignId/expenses')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', MarketingExpenseSubject))
  findAll(@Param('campaignId') campaignId: string, @CurrentCompany() companyId: string) {
    return this.service.findAll(companyId, campaignId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', MarketingExpenseSubject))
  create(
    @Param('campaignId') campaignId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateExpenseDto,
  ) {
    return this.service.create(companyId, user.id, campaignId, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', MarketingExpenseSubject))
  update(
    @Param('campaignId') campaignId: string,
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.service.update(companyId, user.id, campaignId, id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', MarketingExpenseSubject))
  remove(
    @Param('campaignId') campaignId: string,
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(companyId, user.id, campaignId, id);
  }
}
