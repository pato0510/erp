import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  CampaignSubject,
  MarketingExpenseSubject,
  PresenceSnapshotSubject,
} from '../common/casl/casl-ability.factory';
import type { AppAbility } from '../common/casl/casl-ability.factory';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentAbility } from '../common/decorators/current-ability.decorator';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';

/* MKT-001 — Marketing module shell.
 *
 * Skeleton only: no data model, no CRUD (those land in MKT-002+). NOTE:
 * PoliciesGuard FAILS OPEN — a route without a @CheckPolicies handler is
 * authorized-by-default. Every Marketing endpoint MUST declare @CheckPolicies;
 * never leave one bare. Both endpoints gate on `read Campaign`, so they are never
 * world-open: JWT + active membership are always required. With the MKT-001
 * default-deny floor in place (blanket `read all` revoked on Marketing subjects
 * for MANAGER/ACCOUNTANT/ANALYST, then re-granted per the Part 1 §5 matrix), the
 * ping returns 200 for MANAGER/ADMIN/SUPER_ADMIN and ACCOUNTANT (all read
 * Campaign); ANALYST and VIEWER get 403. */
@Controller('marketing')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class MarketingController {
  /* Proves the guard chain end-to-end: gated on `read Campaign`, so a role that
     cannot read Campaign (ANALYST/VIEWER) gets 403 while MANAGER/ACCOUNTANT get 200. */
  @Get('ping')
  @CheckPolicies((ability) => ability.can('read', CampaignSubject))
  ping() {
    return {
      status: 'ok',
      module: 'marketing',
      timestamp: new Date().toISOString(),
    };
  }

  /* MKT-001 — the caller's Marketing abilities, computed FROM the CASL ability
     PoliciesGuard built (read via @CurrentAbility), never from role strings. The
     frontend consumes these flags (via a useCanWrite-style hook in MKT-003) to gate
     write controls, so the UI can never drift from the CASL matrix. Gated on `read
     Campaign` — the read every Marketing-UI caller has (MANAGER/ADMIN/SUPER_ADMIN +
     ACCOUNTANT); ANALYST/VIEWER 403, which is fine (they never reach the Marketing
     UI). This is payload shaping (self-description), not access control — real access
     stays in @CheckPolicies on every feature endpoint (MKT-002+). */
  @Get('permissions')
  @CheckPolicies((ability) => ability.can('read', CampaignSubject))
  permissions(@CurrentAbility() ability: AppAbility) {
    const flagsFor = (
      subject:
        | typeof CampaignSubject
        | typeof MarketingExpenseSubject
        | typeof PresenceSnapshotSubject,
    ) => ({
      read: ability.can('read', subject),
      create: ability.can('create', subject),
      update: ability.can('update', subject),
      delete: ability.can('delete', subject),
    });
    return {
      campaign: flagsFor(CampaignSubject),
      marketingExpense: flagsFor(MarketingExpenseSubject),
      presenceSnapshot: flagsFor(PresenceSnapshotSubject),
    };
  }
}
