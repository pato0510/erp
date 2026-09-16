import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AccountSubject, EnterpriseSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { AssignAccountsDto } from './dto/assign-accounts.dto';
import { CreateEnterpriseDto } from './dto/create-enterprise.dto';
import { UpdateEnterpriseDto } from './dto/update-enterprise.dto';
import { EnterprisesService } from './enterprises.service';

/* COM-018 — enterprises (the client's parent company; Enterprise ≠ Company, the tenant).
 * EVERY endpoint declares @CheckPolicies on EnterpriseSubject (PoliciesGuard fails OPEN).
 * Grants mirror AccountSubject — READ: MANAGER/ADMIN/SUPER_ADMIN + ACCOUNTANT; WRITE
 * (create/update): MANAGER/ADMIN/SUPER_ADMIN. NO DELETE: deactivation is PATCH
 * isActive=false and linked accounts keep their link. Reads are company-scoped; writes
 * run through executeWithRls.
 * COM-021 — POST :id/accounts bulk-assigns UNLINKED accounts to an active enterprise. It
 * MUTATES ACCOUNTS, so its gate is `update` on AccountSubject (not Enterprise): the same
 * ability the account form needs to set enterpriseId one by one. */
@Controller('comercial/enterprises')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class EnterprisesController {
  constructor(private readonly service: EnterprisesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', EnterpriseSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('q') q?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.findAll(companyId, {
      q: q || undefined,
      includeInactive: includeInactive === 'true',
    });
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', EnterpriseSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateEnterpriseDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', EnterpriseSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateEnterpriseDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Post(':id/accounts')
  @CheckPolicies((ability) => ability.can('update', AccountSubject))
  assignAccounts(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: AssignAccountsDto,
  ) {
    return this.service.assignAccounts(id, companyId, user.id, dto);
  }
}
