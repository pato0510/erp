import { Module } from '@nestjs/common';
import { RrhhBirthdayReadModule } from '../rrhh/birthday-read/birthday-read.module';
import { RrhhAbsenceReadModule } from '../rrhh/absence-read/absence-read.module';
import { OpsCalendarReadModule } from '../operations/calendar-read/ops-calendar-read.module';
import { CampaignsModule } from '../marketing/campaigns/campaigns.module';
import { ComercialCierresReadModule } from '../comercial/cierres-read/cierres-read.module';
import { ActivitiesModule } from './activities/activities.module';
import { AreasModule } from './areas/areas.module';
import { MembersReadModule } from './members/members-read.module';
import { ActividadesController } from './actividades.controller';

/* CAL-001 — Calendario de Actividades module aggregator (mirrors the COM-001/MKT-001
 * scaffold). Ships the module shell (guarded ping + permissions endpoint + the month feed)
 * and composes feature submodules as their tickets land: CAL-002 AreasModule (the area
 * catalog); CAL-003 ActivitiesModule (calendar-activity CRUD + status machine, whose exported
 * service also backs the root controller's GET /actividades/calendar feed); CAL-006
 * RrhhBirthdayReadModule (the RRHH birthday leaf, whose BirthdayReadService the root controller
 * folds into the SAME /actividades/calendar envelope); CAL-016 OpsCalendarReadModule (the
 * Operaciones leaf, whose OpsCalendarReadService feeds the `servicios` + `vencimientos`
 * collections into that same envelope); CAL-017 CampaignsModule (Marketing — reused via its
 * already-exported CampaignLookupService, now also serving `campanas`) + ComercialCierresReadModule
 * (the Comercial leaf, whose ComercialCierresReadService feeds `cierres`). The graph is acyclic by
 * construction — ActividadesModule → { RrhhBirthdayReadModule, RrhhAbsenceReadModule,
 * OpsCalendarReadModule, ComercialCierresReadModule } (all leaves that import NOTHING) +
 * CampaignsModule (whose only edge is → AttributionReadModule, itself a leaf) — no forwardRef.
 * CAL-018 closes the arc: the master now eats from FOUR leaves + the CampaignLookup reuse.
 * PoliciesGuard / CaslAbilityFactory / PrismaService come from the global Casl/Prisma modules. */
@Module({
  imports: [
    AreasModule,
    ActivitiesModule,
    RrhhBirthdayReadModule,
    RrhhAbsenceReadModule,
    OpsCalendarReadModule,
    CampaignsModule,
    ComercialCierresReadModule,
    MembersReadModule,
  ],
  controllers: [ActividadesController],
})
export class ActividadesModule {}
