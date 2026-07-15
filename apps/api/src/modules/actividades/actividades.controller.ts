import { Controller, Get, UseGuards } from '@nestjs/common';
import { ActivityAreaSubject, CalendarActivitySubject } from '../common/casl/casl-ability.factory';
import type { AppAbility } from '../common/casl/casl-ability.factory';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentAbility } from '../common/decorators/current-ability.decorator';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';

/* CAL-001 — Calendario de Actividades module shell.
 *
 * Skeleton only: no data model, no CRUD (those land in CAL-002+). NOTE: PoliciesGuard
 * FAILS OPEN — a route without a @CheckPolicies handler is authorized-by-default. Every
 * endpoint MUST declare @CheckPolicies; never leave one bare. Both endpoints gate on
 * `read CalendarActivity`. THE INVERSION (Part 1 §4): the calendar read is granted to ALL
 * SIX roles (no money on this surface, founder Q4), so — unlike every prior module's ping
 * — this ping returns 200 for MANAGER/ADMIN/SUPER_ADMIN, ACCOUNTANT, ANALYST **and
 * VIEWER**. Write access (CAL-002+) stays MANAGER/ADMIN/SUPER_ADMIN. */
@Controller('actividades')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ActividadesController {
  /* Proves the guard chain end-to-end. Gated on `read CalendarActivity` — which all six
     roles hold — so every authenticated caller gets 200 (the inverted cell, live). */
  @Get('ping')
  @CheckPolicies((ability) => ability.can('read', CalendarActivitySubject))
  ping() {
    return {
      status: 'ok',
      module: 'actividades',
      timestamp: new Date().toISOString(),
    };
  }

  /* CAL-001 — the caller's Calendario abilities, computed FROM the CASL ability
     PoliciesGuard built (read via @CurrentAbility), never from role strings. The frontend
     consumes these flags (via a useCanWrite-style hook in CAL-002/005) to gate write
     controls, so the UI can never drift from the CASL matrix. Gated on `read
     CalendarActivity` — held by all six roles — so everyone reaches it; write flags shape
     the affordances. This is payload shaping (self-description), not access control — real
     access stays in @CheckPolicies on every feature endpoint (CAL-002+). */
  @Get('permissions')
  @CheckPolicies((ability) => ability.can('read', CalendarActivitySubject))
  permissions(@CurrentAbility() ability: AppAbility) {
    const flagsFor = (subject: typeof CalendarActivitySubject | typeof ActivityAreaSubject) => ({
      read: ability.can('read', subject),
      create: ability.can('create', subject),
      update: ability.can('update', subject),
      delete: ability.can('delete', subject),
    });
    return {
      calendarActivity: flagsFor(CalendarActivitySubject),
      activityArea: flagsFor(ActivityAreaSubject),
    };
  }
}
