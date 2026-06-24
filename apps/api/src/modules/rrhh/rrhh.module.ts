import { Module } from '@nestjs/common';
import { RrhhController } from './rrhh.controller';
import { JobPositionsModule } from './job-positions/job-positions.module';
import { EmployeesModule } from './employees/employees.module';
import { EmployeeDocumentsModule } from './employee-documents/employee-documents.module';

/* RRHH module aggregator. HR-001 added the gated health controller; HR-002
 * JobPositionsModule (cargos); HR-003 EmployeesModule (employees + guarded
 * compensation); HR-004a EmployeeDocumentsModule (document types + requirements
 * matrix + records, copy-adapted from the Operations doc-control engine).
 * Further submodules (contracts, certifications, …) are imported here as their
 * tickets land — mirroring how OperationsModule aggregates its feature
 * submodules. PoliciesGuard / CaslAbilityFactory / PrismaService are provided by
 * the global Casl/Prisma modules. */
@Module({
  imports: [JobPositionsModule, EmployeesModule, EmployeeDocumentsModule],
  controllers: [RrhhController],
})
export class RrhhModule {}
