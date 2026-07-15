import { Module } from '@nestjs/common';
import { ActividadesController } from './actividades.controller';

/* CAL-001 — Calendario de Actividades module aggregator (mirrors the COM-001/MKT-001
 * scaffold). Ships the module shell (guarded ping + permissions endpoint); feature
 * submodules (areas in CAL-002, activities in CAL-003, birthdays feed in CAL-006) are
 * composed here as their tickets land, the same way MarketingModule aggregates its
 * feature submodules. PoliciesGuard / CaslAbilityFactory / PrismaService are provided by
 * the global Casl/Prisma modules — never per-module. */
@Module({
  controllers: [ActividadesController],
})
export class ActividadesModule {}
