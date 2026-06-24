import { Module } from '@nestjs/common';
import { RrhhController } from './rrhh.controller';
import { JobPositionsModule } from './job-positions/job-positions.module';
import { EmployeesModule } from './employees/employees.module';

/* RRHH module aggregator. HR-001 added the gated health controller; HR-002
 * JobPositionsModule (cargos); HR-003 EmployeesModule (employees + guarded
 * compensation). Further submodules (contracts, documents, certifications, …)
 * are imported here as their tickets land — mirroring how OperationsModule
 * aggregates its feature submodules. PoliciesGuard / CaslAbilityFactory /
 * PrismaService are provided by the global Casl/Prisma modules. */
@Module({
  imports: [JobPositionsModule, EmployeesModule],
  controllers: [RrhhController],
})
export class RrhhModule {}
