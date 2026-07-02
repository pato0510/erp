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
import { ContactSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

/* COM-004 — contacts CRUD (people within an account). EVERY endpoint declares
 * @CheckPolicies on ContactSubject (PoliciesGuard fails OPEN). Same permission
 * profile as accounts: READ for MANAGER/ADMIN/SUPER_ADMIN + ACCOUNTANT; WRITE
 * (create/update/delete) for MANAGER/ADMIN/SUPER_ADMIN. List is by account
 * (accountId is required — the natural access path). create/update validate the
 * parent account is in the same company (cross-company rejected) and enforce the
 * single-primary rule. DELETE is a hard delete (no lifecycle field). Writes run
 * through executeWithRls. */
@Controller('comercial/contacts')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ContactsController {
  constructor(private readonly service: ContactsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', ContactSubject))
  findAll(@CurrentCompany() companyId: string, @Query('accountId') accountId: string) {
    return this.service.findAll(companyId, accountId);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', ContactSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', ContactSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateContactDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', ContactSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateContactDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', ContactSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
