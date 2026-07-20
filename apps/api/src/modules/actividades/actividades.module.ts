import { Module } from '@nestjs/common';
import { ActivitiesModule } from './activities/activities.module';
import { AreasModule } from './areas/areas.module';
import { ActividadesController } from './actividades.controller';

/* CAL-001 — Calendario de Actividades module aggregator (mirrors the COM-001/MKT-001
 * scaffold). Ships the module shell (guarded ping + permissions endpoint + the month feed)
 * and composes feature submodules as their tickets land: CAL-002 AreasModule (the area
 * catalog); CAL-003 ActivitiesModule (calendar-activity CRUD + status machine, whose exported
 * service also backs the root controller's GET /actividades/calendar feed); the birthdays feed
 * (CAL-006) folds into that same feed next. PoliciesGuard / CaslAbilityFactory / PrismaService
 * are provided by the global Casl/Prisma modules. */
@Module({
  imports: [AreasModule, ActivitiesModule],
  controllers: [ActividadesController],
})
export class ActividadesModule {}
