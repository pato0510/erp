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
import { CampaignChannel, CampaignStatus } from '@prisma/client';
import { CampaignSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CampaignLookupService } from './campaign-lookup.service';
import { CampaignsService } from './campaigns.service';
import { ChangeCampaignStatusDto } from './dto/change-campaign-status.dto';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

/* MKT-002 — campaigns CRUD + status machine. EVERY endpoint declares @CheckPolicies
 * on CampaignSubject (PoliciesGuard fails OPEN). READ: MANAGER/ADMIN/SUPER_ADMIN +
 * ACCOUNTANT (budget/spend are financial data). WRITE (create/update/status/delete):
 * MANAGER/ADMIN/SUPER_ADMIN only. Status changes go ONLY through PATCH /:id/status;
 * closed campaigns reject general PATCH. All writes run through executeWithRls;
 * createdBy is the JWT actor, never the DTO. */
@Controller('marketing/campaigns')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class CampaignsController {
  constructor(
    private readonly service: CampaignsService,
    private readonly lookup: CampaignLookupService,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', CampaignSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('status') status?: string,
    @Query('channel') channel?: string,
  ) {
    return this.service.findAll(companyId, {
      status: status ? (status as CampaignStatus) : undefined,
      channel: channel ? (channel as CampaignChannel) : undefined,
    });
  }

  /* MKT-004 — campaign calendar feed for a month (YYYY-MM). Declared BEFORE the
     `:id` route so "/calendar" is never captured as an id. Returns campaigns
     intersecting the month as ranges (no per-day expansion — the client expands). */
  @Get('calendar')
  @CheckPolicies((ability) => ability.can('read', CampaignSubject))
  calendar(@CurrentCompany() companyId: string, @Query('month') month?: string) {
    return this.service.calendar(companyId, month);
  }

  /* MKT-006 — options for the Comercial "Campaña de origen" select. Declared BEFORE the
     `:id` route so "/lookup" is never captured as an id. Gated read Campaign (every role
     that reads accounts also reads Campaign). Excludes CANCELADA. */
  @Get('lookup')
  @CheckPolicies((ability) => ability.can('read', CampaignSubject))
  lookupForSelect(@CurrentCompany() companyId: string) {
    return this.lookup.listForSelect(companyId);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', CampaignSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', CampaignSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCampaignDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', CampaignSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  /* The canonical status machine. Gated on `update` — the same write ability as a
     general edit (ACCOUNTANT read-only → 403 here). */
  @Patch(':id/status')
  @CheckPolicies((ability) => ability.can('update', CampaignSubject))
  changeStatus(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ChangeCampaignStatusDto,
  ) {
    return this.service.changeStatus(id, companyId, user.id, dto.status);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', CampaignSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
