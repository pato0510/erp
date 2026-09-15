import {
  BadRequestException,
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
import { OpportunityNoteSubject } from '../../common/casl/casl-ability.factory';
import type { AppAbility } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentAbility } from '../../common/decorators/current-ability.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateOpportunityNoteDto } from './dto/create-opportunity-note.dto';
import { UpdateOpportunityNoteDto } from './dto/update-opportunity-note.dto';
import { OpportunityNotesService } from './opportunity-notes.service';

/* COM-016 — opportunity notes CRUD (the internal comment thread on a deal). EVERY
 * endpoint declares @CheckPolicies on OpportunityNoteSubject (PoliciesGuard fails OPEN).
 * Grants mirror ActivitySubject one-to-one — READ: MANAGER/ADMIN/SUPER_ADMIN +
 * ACCOUNTANT; WRITE (create/update/delete): MANAGER/ADMIN/SUPER_ADMIN. The list is
 * scoped by opportunity (required). On top of the CASL gate the service enforces
 * author-only edit and author-or-ADMIN delete (via `manage` on the subject, read from
 * the ability PoliciesGuard built). Writes run through executeWithRls. */
@Controller('comercial/opportunity-notes')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class OpportunityNotesController {
  constructor(private readonly service: OpportunityNotesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', OpportunityNoteSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('opportunityId') opportunityId?: string,
    @Query('limit') limit?: string,
  ) {
    if (!opportunityId) throw new BadRequestException('Debes indicar opportunityId.');
    const take = limit ? Number(limit) : undefined;
    return this.service.findAllByOpportunity(companyId, opportunityId, take);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', OpportunityNoteSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateOpportunityNoteDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', OpportunityNoteSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateOpportunityNoteDto,
  ) {
    return this.service.update(companyId, user.id, id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', OpportunityNoteSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.service.remove(companyId, user.id, id, ability);
  }
}
