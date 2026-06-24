import { Module } from '@nestjs/common';
import { RrhhController } from './rrhh.controller';
import { JobPositionsModule } from './job-positions/job-positions.module';

/* RRHH module aggregator. HR-001 added the gated health controller; HR-002
 * adds JobPositionsModule (cargos). Further submodules (employees, contracts,
 * documents, certifications, …) are imported here as their tickets land —
 * mirroring how OperationsModule aggregates its feature submodules.
 * PoliciesGuard / CaslAbilityFactory / PrismaService are provided by the global
 * Casl/Prisma modules. */
@Module({
  imports: [JobPositionsModule],
  controllers: [RrhhController],
})
export class RrhhModule {}
