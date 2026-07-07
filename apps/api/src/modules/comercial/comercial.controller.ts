import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  AccountSubject,
  ActivitySubject,
  AvailabilitySubject,
  ContactSubject,
  OpportunitySubject,
  QuoteSubject,
  ServiceCatalogSubject,
} from '../common/casl/casl-ability.factory';
import type { AppAbility } from '../common/casl/casl-ability.factory';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentAbility } from '../common/decorators/current-ability.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { DisponibilidadService } from '../rrhh/disponibilidad/disponibilidad.service';

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
  /* COM-012 — ComercialModule imports RRHH's DisponibilidadModule (the sanctioned
     expose/consume seam), which EXPORTS DisponibilidadService. We INJECT it here —
     never re-provide it — and touch ONLY its reason-free method (see availableStaff). */
  constructor(private readonly disponibilidad: DisponibilidadService) {}

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
      // COM-012 — the PII-safe availability projection is READ-ONLY (no write concept).
      // Gated on the EXISTING read AvailabilitySubject ability (RRHH §1.2 audience:
      // MANAGER/ADMIN/SUPER_ADMIN; ACCOUNTANT/ANALYST/VIEWER excluded).
      availability: { read: ability.can('read', AvailabilitySubject) },
    };
  }

  /* COM-012 — PII-safe availability projection (Comercial → RRHH). This is the
   * SANCTIONED cross-module consumption of disponibilidad-servicio that the RRHH QA
   * doc §3 flagged as a deliberate decision to make. It answers "who is available on
   * date X?" for deal operators by calling ONLY DisponibilidadService.
   * forServiceDisponibles — the reason-free method that returns EXCLUSIVELY available
   * staff as {employeeId, fullName, cargo}. Its sibling methods (getAvailability /
   * forServiceSingle / forServiceBatch / getMatriz / getAlertas) carry health-adjacent
   * PII (e.g. "Licencia médica") and are intentionally NEVER reachable through this
   * feature. Audience = the RRHH §1.2 availability audience: gated on the EXISTING
   * read AvailabilitySubject ability (MANAGER/ADMIN/SUPER_ADMIN; ACCOUNTANT excluded) —
   * one source of truth, no new subject, no role strings. */
  @Get('available-staff')
  @CheckPolicies((ability) => ability.can('read', AvailabilitySubject))
  async availableStaff(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Query('date') date?: string,
  ) {
    const dateStr = this.resolveDateParam(date);
    const result = await this.disponibilidad.forServiceDisponibles(companyId, user.id, dateStr);
    // EXPLICIT field map (never a spread): even if an upstream row gains fields
    // (state/reason/until…), ONLY these three can ever leave this endpoint.
    return result.employees.map((e) => ({
      employeeId: e.employeeId,
      fullName: e.fullName,
      cargo: e.cargo,
    }));
  }

  /* Validate the optional ?date (YYYY-MM-DD). Undefined → today (the service anchors
   * to UTC midnight per the HR-004b convention). A malformed/impossible date is a 400. */
  private resolveDateParam(date?: string): string | undefined {
    if (date === undefined || date === '') return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Fecha inválida; usa el formato YYYY-MM-DD.');
    }
    // Round-trip check — rejects an impossible day that JS would silently roll over
    // (e.g. 2026-02-30 → 2026-03-02).
    const d = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) {
      throw new BadRequestException('Fecha inválida; usa el formato YYYY-MM-DD.');
    }
    return date;
  }
}
