import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  AccountSubject,
  ActivitySubject,
  ContactSubject,
  OpportunitySubject,
  QuoteSubject,
  ServiceCatalogSubject,
} from '../common/casl/casl-ability.factory';
import type { AppAbility } from '../common/casl/casl-ability.factory';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentAbility } from '../common/decorators/current-ability.decorator';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';

/* COM-001 — Comercial (CRM) module shell.
 *
 * Skeleton only: no data model, no CRUD (those land in COM-002+). The single
 * endpoint proves the authorization wiring end-to-end. NOTE: PoliciesGuard FAILS
 * OPEN — a route without a @CheckPolicies handler is authorized-by-default. Every
 * Comercial endpoint MUST declare @CheckPolicies; never leave one bare. This ping
 * gates on `read Account`, so it is never world-open: JWT + active membership are
 * always required, and only a role with read on Account passes. With the COM-001
 * default-deny floor in place (the inherited blanket `read all` is revoked on the
 * Comercial subjects for MANAGER/ACCOUNTANT/ANALYST, mirroring how RRHH revokes via
 * RRHH_SUBJECTS), this ping returns 200 ONLY for SUPER_ADMIN/ADMIN (via `manage
 * all`); MANAGER, ACCOUNTANT, ANALYST and VIEWER all get 403. Positive per-role
 * read grants for Comercial arrive with the per-entity tickets (COM-002+). */
@Controller('comercial')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ComercialController {
  @Get('health')
  @CheckPolicies((ability) => ability.can('read', AccountSubject))
  health() {
    return {
      status: 'ok',
      module: 'comercial',
      timestamp: new Date().toISOString(),
    };
  }

  /* COM-004b — the caller's Comercial abilities, computed FROM the CASL ability
   * PoliciesGuard built (read via @CurrentAbility), never from role strings. The
   * frontend consumes these flags to gate write controls, so the UI can never
   * drift from the CASL matrix. Gated on `read Account` — the read every
   * Comercial-UI caller has (MANAGER/ADMIN/SUPER_ADMIN + ACCOUNTANT); ANALYST/
   * VIEWER 403, which is fine (they never reach the Comercial UI). This is payload
   * shaping (self-description), not access control — real access stays in
   * @CheckPolicies on every feature endpoint. */
  @Get('permissions')
  @CheckPolicies((ability) => ability.can('read', AccountSubject))
  permissions(@CurrentAbility() ability: AppAbility) {
    const flagsFor = (
      subject:
        | typeof AccountSubject
        | typeof ActivitySubject
        | typeof ContactSubject
        | typeof OpportunitySubject
        | typeof QuoteSubject
        | typeof ServiceCatalogSubject,
    ) => ({
      read: ability.can('read', subject),
      create: ability.can('create', subject),
      update: ability.can('update', subject),
      delete: ability.can('delete', subject),
    });
    return {
      account: flagsFor(AccountSubject),
      contact: flagsFor(ContactSubject),
      // COM-007 — the kanban gates drag/create/close/reopen on opportunity.update
      // (MANAGER/ADMIN/SUPER_ADMIN); ACCOUNTANT reads the board but sees no controls.
      opportunity: flagsFor(OpportunitySubject),
      // COM-008 — the activity timeline gates register/edit/delete on activity writes;
      // ACCOUNTANT reads timelines but sees no controls.
      activity: flagsFor(ActivitySubject),
      // COM-010 — the quote editor gates create/edit/status/delete on quote writes;
      // ACCOUNTANT reads quotes but sees no controls.
      quote: flagsFor(QuoteSubject),
      serviceCatalog: flagsFor(ServiceCatalogSubject),
    };
  }
}
