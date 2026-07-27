import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ActivityAreaSubject,
  CalendarActivitySubject,
  CampaignSubject,
  DocumentRecordSubject,
  EmployeeSubject,
  OpportunitySubject,
  ServiceOrderSubject,
} from '../common/casl/casl-ability.factory';
import type { AppAbility } from '../common/casl/casl-ability.factory';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentAbility } from '../common/decorators/current-ability.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { BirthdayReadService } from '../rrhh/birthday-read/birthday-read.service';
import { RrhhAbsenceReadService } from '../rrhh/absence-read/absence-read.service';
import { OpsCalendarReadService } from '../operations/calendar-read/ops-calendar-read.service';
import { CampaignLookupService } from '../marketing/campaigns/campaign-lookup.service';
import { ComercialCierresReadService } from '../comercial/cierres-read/cierres-read.service';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { ActivitiesService } from './activities/activities.service';
import { MembersReadService } from './members/members-read.service';

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
  constructor(
    private readonly activities: ActivitiesService,
    // CAL-006 — the RRHH birthday leaf (exported by RrhhBirthdayReadModule). The @CheckPolicies
    // all-roles read gate on GET /calendar IS the founder-signed exposure (decision d).
    private readonly birthdays: BirthdayReadService,
    // CAL-018 — the RRHH absence leaf (exported by RrhhAbsenceReadModule). Feeds `ausencias` (name +
    // range + the UI constant "No disponible") to all six roles per the matrix — NEVER the motivo/
    // health PII (structurally impossible); the ability only shapes each entry's link.
    private readonly absences: RrhhAbsenceReadService,
    // CAL-016 — the Operaciones calendar leaf (exported by OpsCalendarReadModule). Feeds the
    // `servicios` + `vencimientos` collections into the SAME envelope, both visible to all six
    // roles per the signed matrix; the ability only shapes each entry's link (below).
    private readonly opsCalendar: OpsCalendarReadService,
    // CAL-017 — Marketing's ALREADY-exposed lookup (reused, not a new service) feeds `campanas`
    // (visible to all six per the matrix); Comercial's cierres leaf feeds `cierres` — THE FIRST
    // GATED collection: present ONLY when the caller can read Opportunity (the key is ABSENT
    // otherwise, not an empty array).
    private readonly campaignLookup: CampaignLookupService,
    private readonly cierres: ComercialCierresReadService,
    // CAL-008 — members-lite read (§2.4). Same all-roles read gate = the signed name exposure.
    private readonly members: MembersReadService,
  ) {}

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

  /* CAL-003/006/016/017/018 — the month FEED. Canonical public path GET /actividades/calendar?
     month=YYYY-MM (Part 1 §3). Envelope { activities, birthdays, servicios, vencimientos, campanas,
     ausencias[, cierres] }:
     - activities from ActivitiesService.monthFeed (UTC-clamped, CANCELADA excluded — decision e).
       The ?kind= param governs THESE rows ONLY (activities); the foreign collections below are
       independent of it.
     - birthdays from the RRHH leaf (name + day/month, NEVER the year — decision d).
     - servicios + vencimientos (CAL-016) from the Operaciones leaf.
     - campanas (CAL-017) from Marketing's CampaignLookupService: campaigns intersecting the month.
       Visible to ALL SIX roles (the matrix); ability only shapes the link.
     - ausencias (CAL-018) from the RRHH absence leaf: ACTIVE employees' not-available windows
       (name + range + the UI constant "No disponible" — NEVER the motivo/health PII). Visible to
       ALL SIX roles (the matrix); ability shapes only the link to the RRHH employee.
     - cierres (CAL-017) from the Comercial leaf: open opportunities with an expected close in the
       month. THE ONLY GATED collection — present ONLY when ability.can('read', Opportunity)
       (MANAGER/ADMIN/SA/ACCOUNTANT). When the caller CANNOT read Opportunity, the `cierres` KEY IS
       ABSENT from the envelope (not an empty array — the collection does not exist for them).
     All six-role collections are ability-shaped only on their `link` (the OriginCard precedent):
     a caller who cannot read the target subject gets `link: null` (the chip modal still opens,
     sans door — "the chip is not a door"). Gated on `read CalendarActivity` — held by all six
     roles. Bad month → 400 (via parseMonth). Each collection is UTC-month-clamped independently. */
  @Get('calendar')
  @CheckPolicies((ability) => ability.can('read', CalendarActivitySubject))
  async calendar(
    @CurrentCompany() companyId: string,
    @CurrentAbility() ability: AppAbility,
    @Query('month') month: string,
    @Query('kind') kind?: string,
  ) {
    const { year, mon } = this.activities.parseMonth(month);
    // UTC month clamp per collection: [monthStart, last ms of the month] — the ops aggregator's
    // inclusive window (getMonthSummary), so `vencimientos` matches the ops calendar SET exactly.
    // For @db.Date columns (campaigns/opportunities) this last-ms bound is day-equivalent to the
    // Marketing endpoint's last-day-midnight bound, so `campanas` matches that endpoint's SET too.
    const monthStart = new Date(Date.UTC(year, mon - 1, 1));
    const monthEndInclusive = new Date(Date.UTC(year, mon, 1) - 1);

    const canReadOpportunity = ability.can('read', OpportunitySubject);

    const [feed, birthdays, servicios, vencimientos, campanas, ausencias, cierres] =
      await Promise.all([
        this.activities.monthFeed(companyId, month, kind),
        this.birthdays.listForMonth(companyId, mon),
        this.opsCalendar.listServiciosForRange(companyId, monthStart, monthEndInclusive),
        this.opsCalendar.listVencimientosForRange(companyId, monthStart, monthEndInclusive),
        this.campaignLookup.listForCalendarRange(companyId, monthStart, monthEndInclusive),
        this.absences.listAusenciasForRange(companyId, monthStart, monthEndInclusive),
        // Only query Comercial when the caller may see it — no point fetching a collection we will
        // then omit. This IS the gate; the key-absence below reflects the same condition.
        canReadOpportunity
          ? this.cierres.listCierresForRange(companyId, monthStart, monthEndInclusive)
          : Promise.resolve(null),
      ]);

    // Ability-shaped links (per collection, no role strings).
    const canOpenServicio = ability.can('read', ServiceOrderSubject);
    const canOpenVencimiento = ability.can('read', DocumentRecordSubject);
    const canOpenCampaign = ability.can('read', CampaignSubject);
    const canOpenEmployee = ability.can('read', EmployeeSubject);

    const envelope: {
      activities: unknown;
      birthdays: unknown;
      servicios: unknown;
      vencimientos: unknown;
      campanas: unknown;
      ausencias: unknown;
      cierres?: unknown;
    } = {
      activities: feed.activities,
      birthdays,
      servicios: servicios.map((s) => ({
        ...s,
        link: canOpenServicio ? '/operaciones/servicios-activos' : null,
      })),
      vencimientos: vencimientos.map((v) => ({
        ...v,
        link: canOpenVencimiento ? '/operaciones/documentos' : null,
      })),
      campanas: campanas.map((c) => ({
        ...c,
        link: canOpenCampaign ? `/marketing/campanas/${c.campaignId}` : null,
      })),
      ausencias: ausencias.map((a) => ({
        ...a,
        link: canOpenEmployee ? `/rrhh/trabajadores/${a.employeeId}` : null,
      })),
    };
    // THE SHAPING: add the `cierres` KEY only for Opportunity readers. cierres is non-null exactly
    // when canReadOpportunity (guaranteed by the fetch above); a non-reader's envelope simply lacks
    // the key. The link is always resolvable here (a cierres reader can read Opportunity).
    if (canReadOpportunity && cierres) {
      envelope.cierres = cierres.map((c) => ({
        ...c,
        link: `/comercial/pipeline/${c.opportunityId}`,
      }));
    }
    return envelope;
  }

  /* CAL-008 — members-lite roster for the Responsable select + name resolution (§2.4). Gated
     `read CalendarActivity` — held by all six roles, which IS the founder-signed name exposure.
     Returns only { userId, displayName } (structural privacy line). */
  @Get('members')
  @CheckPolicies((ability) => ability.can('read', CalendarActivitySubject))
  listMembers(@CurrentCompany() companyId: string) {
    return this.members.listForCompany(companyId);
  }
}
