import { Module } from '@nestjs/common';
import { RrhhController } from './rrhh.controller';

/* HR-001 — RRHH module scaffold. Controller only: no services, no Prisma
 * models, no migration. The data model (employees, contracts, documents,
 * certifications, …) lands in HR-002+. PoliciesGuard / CaslAbilityFactory /
 * PrismaService are provided by the global Casl/Prisma modules, so no extra
 * imports are needed here (same pattern as every other feature module). */
@Module({
  controllers: [RrhhController],
})
export class RrhhModule {}
