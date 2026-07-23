import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ServiceOrderStatus } from '@prisma/client';
import { ServiceOrderSubject } from '../../common/casl/casl-ability.factory';
import type { AppAbility } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentAbility } from '../../common/decorators/current-ability.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { ChangeServiceOrderStatusDto } from './dto/change-service-order-status.dto';
import { SetExecutionDatesDto } from './dto/set-execution-dates.dto';
import { ServiceOrdersService } from './service-orders.service';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';

/* COM-013a — service orders (the work a won Comercial deal becomes). READ-only for
 * users plus a status machine; there is NO user-facing create endpoint (orders are born
 * from the COM-013b handoff via ServiceOrdersService.createFromHandoff). EVERY endpoint
 * declares @CheckPolicies on ServiceOrderSubject (PoliciesGuard fails OPEN). READ: the
 * operational-work-entity audience (all roles — SA/ADMIN via manage-all, MANAGER/
 * ACCOUNTANT/ANALYST via read-all, VIEWER via explicit grant), mirroring OperationalAsset/
 * WorkPermit read. WRITE (general update + status): the management audience only
 * (MANAGER/ADMIN/SUPER_ADMIN), mirroring OperationalAsset write. Writes run through
 * executeWithRls. */
@Controller('operations/service-orders')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ServiceOrdersController {
  constructor(private readonly service: ServiceOrdersService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', ServiceOrderSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(companyId, {
      status: status ? (status as ServiceOrderStatus) : undefined,
      search: search || undefined,
    });
  }

  /* CAL-015 — "Servicios activos": in-flight orders (RECIBIDA + EN_EJECUCION) where ops sets the
     execution window. Declared BEFORE :id so the literal path wins over the param route. */
  @Get('active')
  @CheckPolicies((ability) => ability.can('read', ServiceOrderSubject))
  listActive(@CurrentCompany() companyId: string) {
    return this.service.listActive(companyId);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', ServiceOrderSubject))
  findOne(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentAbility() ability: AppAbility,
  ) {
    // MKT-007b — the ability shapes the embedded `origin` (Opportunity/Campaign reads).
    return this.service.findOne(id, companyId, ability);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', ServiceOrderSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateServiceOrderDto,
  ) {
    return this.service.update(companyId, user.id, id, dto);
  }

  /* CAL-015 — set/clear the execution dates (ops writers). Focused sub-route mirroring the
     :id/status convention; NOT the status machine — pure scheduling. */
  @Patch(':id/execution-dates')
  @CheckPolicies((ability) => ability.can('update', ServiceOrderSubject))
  setExecutionDates(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: SetExecutionDatesDto,
  ) {
    return this.service.setExecutionDates(companyId, user.id, id, dto);
  }

  /* Canonical status-transition path — all machine rules enforced here. */
  @Patch(':id/status')
  @CheckPolicies((ability) => ability.can('update', ServiceOrderSubject))
  changeStatus(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ChangeServiceOrderStatusDto,
  ) {
    return this.service.changeStatus(companyId, user.id, id, dto);
  }
}
