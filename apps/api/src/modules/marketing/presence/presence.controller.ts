import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { PresenceSnapshotSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { PresenceService } from './presence.service';
import { UpsertPresenceDto } from './dto/upsert-presence.dto';

/* MKT-008 — digital-presence snapshots. EVERY endpoint declares @CheckPolicies on
 * PresenceSnapshotSubject (PoliciesGuard fails OPEN). NOTE the DISTINCTIVE cell of the
 * matrix (MKT-001 / Part 1 §5): only MANAGER/ADMIN/SUPER_ADMIN may read OR write here —
 * ACCOUNTANT has NO grant on PresenceSnapshot (it carries no money), unlike every other
 * Marketing surface where ACCOUNTANT reads. ANALYST/VIEWER floored. Writes run through
 * executeWithRls; createdBy is the JWT actor. */
@Controller('marketing/presence')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class PresenceController {
  constructor(private readonly service: PresenceService) {}

  /* The monthly upsert (idempotent per month via the (companyId, period) unique key). */
  @Put()
  @CheckPolicies((ability) => ability.can('create', PresenceSnapshotSubject))
  upsert(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpsertPresenceDto,
  ) {
    return this.service.upsert(companyId, user.id, dto);
  }

  /* Range list for charting; defaults to the last 12 months. */
  @Get()
  @CheckPolicies((ability) => ability.can('read', PresenceSnapshotSubject))
  findRange(
    @CurrentCompany() companyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findRange(companyId, from, to);
  }
}
