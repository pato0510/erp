import { Module } from '@nestjs/common';
import { AreasModule } from './areas/areas.module';
import { ActividadesController } from './actividades.controller';

/* CAL-001 — Calendario de Actividades module aggregator (mirrors the COM-001/MKT-001
 * scaffold). Ships the module shell (guarded ping + permissions endpoint) and composes
 * feature submodules as their tickets land: CAL-002 AreasModule (the area catalog);
 * activities (CAL-003) and the birthdays feed (CAL-006) follow. PoliciesGuard /
 * CaslAbilityFactory / PrismaService are provided by the global Casl/Prisma modules. */
@Module({
  imports: [AreasModule],
  controllers: [ActividadesController],
})
export class ActividadesModule {}
