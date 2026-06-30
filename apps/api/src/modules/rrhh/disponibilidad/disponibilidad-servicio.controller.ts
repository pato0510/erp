import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AvailabilitySubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { DisponibilidadService } from './disponibilidad.service';

/* ════════════════════════════════════════════════════════════════════════════
 * HR-016 — "Disponibilidad para servicio" — CROSS-MODULE CONTRACT
 * ════════════════════════════════════════════════════════════════════════════
 *
 * OPTION A (owner-validated): RRHH EXPOSES this read-only availability query so
 * other modules (Operations now, Comercial later) can ASK "is this worker free
 * to be assigned on this date?". RRHH stays DECOUPLED — it does NOT import, call,
 * or know about Operations. Consumers depend on THIS endpoint; the dependency
 * arrow points into RRHH, never out of it.
 *
 * SCOPE: DISPONIBILIDAD ONLY (vacation / leave / permit). It answers "is the
 * person off?", NOT "is the person qualified for faena X?". Faena-based
 * habilitación (a faena entity + a per-faena required-document dossier) is a V2
 * extension and is intentionally out of scope here.
 *
 * READ-ONLY. No writes, no mutations. Company-scoped via executeWithRls. Carries
 * NO salary / compensation / settlement / finiquito data (asserted recursively in
 * the unit tests). The resolution is the EXACT HR-015 board logic, shared through
 * DisponibilidadService.resolveState + loadCoveringMaps (HR-012 blocking-absence
 * predicate + HR-011 {APROBADO,TOMADO} vacation predicate; precedence
 * VACACIONES > NO_DISPONIBLE > DISPONIBLE) — so the contract can never drift from
 * the human-facing board.
 *
 * ── RESPONSE SHAPE ──────────────────────────────────────────────────────────
 *   ForServiceAvailability = {
 *     employeeId : string
 *     fullName   : string
 *     date       : ISO-8601 (the UTC day resolved)
 *     available  : boolean          // === (state === 'DISPONIBLE')
 *     state      : 'DISPONIBLE' | 'VACACIONES' | 'NO_DISPONIBLE'
 *     reason     : string | null    // label of the blocking record, null if DISPONIBLE
 *     until      : ISO-8601 | null  // date the block ends, null if DISPONIBLE
 *   }
 *
 * ── ENDPOINTS ───────────────────────────────────────────────────────────────
 *   GET /api/rrhh/disponibilidad-servicio/:employeeId?date=YYYY-MM-DD
 *       → ForServiceAvailability. 404 if the id is not an employee of this company.
 *   GET /api/rrhh/disponibilidad-servicio?employeeIds=a,b,c&date=YYYY-MM-DD
 *       → { date, requested, count, items: ForServiceAvailability[] }
 *         Batched roster check (≤100 ids; ids not in the company are ignored).
 *   GET /api/rrhh/disponibilidad-servicio/disponibles?date=YYYY-MM-DD
 *       → { date, count, employees: { employeeId, fullName, cargo }[] }
 *         The ACTIVE employees DISPONIBLE on the date — "who can I assign".
 *   `date` defaults to today (UTC) when omitted.
 *
 * ── AUTH / GATING ───────────────────────────────────────────────────────────
 *   Same JWT/HttpOnly-cookie auth as the rest of the backend (it IS the same
 *   backend — no invented cross-service auth). Every endpoint @CheckPolicies on
 *   AvailabilitySubject (read). In the current RBAC that is MANAGER / ADMIN /
 *   SUPER_ADMIN; ACCOUNTANT (compensation-only), ANALYST (no RRHH read) and
 *   VIEWER all get 403 — identical to the HR-015 board. Rationale: the payload
 *   exposes employee names + the blocking reason (e.g. "Licencia médica"), which
 *   is RRHH-sensitive / health-adjacent PII, so it must not broaden beyond the
 *   RRHH-reading roles. When Operations / Comercial are wired in later, the
 *   calling user must hold an RRHH-reading role, OR the owner deliberately adds a
 *   dedicated cross-service grant on AvailabilitySubject in the CASL factory —
 *   a conscious, documented decision, not a default.
 * ════════════════════════════════════════════════════════════════════════════ */
@Controller('rrhh/disponibilidad-servicio')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class DisponibilidadServicioController {
  constructor(private readonly service: DisponibilidadService) {}

  /* Literal route declared before ':employeeId' so it is not shadowed. */
  @Get('disponibles')
  @CheckPolicies((ability) => ability.can('read', AvailabilitySubject))
  disponibles(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Query('date') date?: string,
  ) {
    return this.service.forServiceDisponibles(companyId, user.id, date);
  }

  /* Batch roster: ?employeeIds=a,b,c (comma-separated, ≤100). */
  @Get()
  @CheckPolicies((ability) => ability.can('read', AvailabilitySubject))
  batch(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Query('employeeIds') employeeIds?: string,
    @Query('date') date?: string,
  ) {
    const ids = (employeeIds ?? '').split(',');
    return this.service.forServiceBatch(companyId, user.id, ids, date);
  }

  @Get(':employeeId')
  @CheckPolicies((ability) => ability.can('read', AvailabilitySubject))
  single(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Param('employeeId') employeeId: string,
    @Query('date') date?: string,
  ) {
    return this.service.forServiceSingle(companyId, user.id, employeeId, date);
  }
}
