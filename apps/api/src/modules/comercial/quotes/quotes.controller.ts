import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { QuoteSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { AddQuoteLineDto } from './dto/add-quote-line.dto';
import { ChangeQuoteStatusDto } from './dto/change-quote-status.dto';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { QuotesService } from './quotes.service';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { UpdateQuoteLineDto } from './dto/update-quote-line.dto';

/* COM-010 — quotes CRUD + state machine. EVERY endpoint declares @CheckPolicies on
 * QuoteSubject (PoliciesGuard fails OPEN). READ: MANAGER/ADMIN/SUPER_ADMIN + ACCOUNTANT;
 * WRITE (create/update/status/lines/delete): MANAGER/ADMIN/SUPER_ADMIN. Quotes are a
 * sub-resource of opportunities for create/list; the individual quote + its lines +
 * status transition hang off /comercial/quotes/:id. Writes run through executeWithRls. */
@Controller('comercial')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class QuotesController {
  constructor(private readonly service: QuotesService) {}

  @Get('opportunities/:opportunityId/quotes')
  @CheckPolicies((ability) => ability.can('read', QuoteSubject))
  findAll(@Param('opportunityId') opportunityId: string, @CurrentCompany() companyId: string) {
    return this.service.findAllByOpportunity(companyId, opportunityId);
  }

  @Post('opportunities/:opportunityId/quotes')
  @CheckPolicies((ability) => ability.can('create', QuoteSubject))
  create(
    @Param('opportunityId') opportunityId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateQuoteDto,
  ) {
    return this.service.create(companyId, user.id, opportunityId, dto);
  }

  @Get('quotes/:id')
  @CheckPolicies((ability) => ability.can('read', QuoteSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Patch('quotes/:id')
  @CheckPolicies((ability) => ability.can('update', QuoteSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateQuoteDto,
  ) {
    return this.service.update(companyId, user.id, id, dto);
  }

  /* Canonical status-transition path — all state-machine rules enforced here. */
  @Patch('quotes/:id/status')
  @CheckPolicies((ability) => ability.can('update', QuoteSubject))
  changeStatus(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ChangeQuoteStatusDto,
  ) {
    return this.service.changeStatus(companyId, user.id, id, dto);
  }

  @Delete('quotes/:id')
  @CheckPolicies((ability) => ability.can('delete', QuoteSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(companyId, user.id, id);
  }

  @Post('quotes/:id/lines')
  @CheckPolicies((ability) => ability.can('update', QuoteSubject))
  addLine(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: AddQuoteLineDto,
  ) {
    return this.service.addLine(companyId, user.id, id, dto);
  }

  @Patch('quotes/:id/lines/:lineId')
  @CheckPolicies((ability) => ability.can('update', QuoteSubject))
  updateLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateQuoteLineDto,
  ) {
    return this.service.updateLine(companyId, user.id, id, lineId, dto);
  }

  @Delete('quotes/:id/lines/:lineId')
  @CheckPolicies((ability) => ability.can('update', QuoteSubject))
  removeLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.removeLine(companyId, user.id, id, lineId);
  }
}
