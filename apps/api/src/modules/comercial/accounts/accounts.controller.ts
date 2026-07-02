import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccountPriority, AccountStatus } from '@prisma/client';
import { AccountSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

/* COM-003 — accounts CRUD (CRM core). EVERY endpoint declares @CheckPolicies on
 * AccountSubject (PoliciesGuard fails OPEN). READ: MANAGER/ADMIN/SUPER_ADMIN +
 * ACCOUNTANT (read-only portfolio). WRITE (create/update/delete): MANAGER/ADMIN/
 * SUPER_ADMIN. DELETE is a soft-deactivate (status INACTIVA). Linking a
 * counterparty happens via update and is company-scoped (cross-company links are
 * rejected); accounts NEVER create a counterparty. Writes run through
 * executeWithRls; reads are company-scoped. */
@Controller('comercial/accounts')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', AccountSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(companyId, {
      status: status ? (status as AccountStatus) : undefined,
      priority: priority ? (priority as AccountPriority) : undefined,
      search: search || undefined,
    });
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', AccountSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', AccountSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateAccountDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', AccountSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateAccountDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', AccountSubject))
  deactivate(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.deactivate(id, companyId, user.id);
  }
}
