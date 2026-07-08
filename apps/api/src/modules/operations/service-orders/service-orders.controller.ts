import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ServiceOrderStatus } from '@prisma/client';
import { ServiceOrderSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { ChangeServiceOrderStatusDto } from './dto/change-service-order-status.dto';
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

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', ServiceOrderSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
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
