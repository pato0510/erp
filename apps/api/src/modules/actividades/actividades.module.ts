import { Module } from '@nestjs/common';
import { RrhhBirthdayReadModule } from '../rrhh/birthday-read/birthday-read.module';
import { OpsCalendarReadModule } from '../operations/calendar-read/ops-calendar-read.module';
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
 * collections into that same envelope). The graph is acyclic by construction — ActividadesModule →
 * { RrhhBirthdayReadModule, OpsCalendarReadModule }, BOTH leaves that import NOTHING — no
 * forwardRef. PoliciesGuard / CaslAbilityFactory / PrismaService come from the global Casl/Prisma
 * modules. */
@Module({
  imports: [
    AreasModule,
    ActivitiesModule,
    RrhhBirthdayReadModule,
    OpsCalendarReadModule,
    MembersReadModule,
  ],
  controllers: [ActividadesController],
})
export class ActividadesModule {}
