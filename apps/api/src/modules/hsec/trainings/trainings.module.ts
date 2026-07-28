import { Module } from '@nestjs/common';
import { RrhhEmployeeReadModule } from '../../rrhh/employee-read/employee-read.module';
import { TrainingsController } from './trainings.controller';
import { TrainingsService } from './trainings.service';

/* HSEC-006 — trainings feature submodule (CRUD + attendees + planilla file). Imports ONLY
 * the RrhhEmployeeRead LEAF (which imports nothing — the graph stays acyclic, no
 * forwardRef). StorageService is @Global. PoliciesGuard / CaslAbilityFactory /
 * PrismaService / RlsService come from the global Casl/Prisma/Rls modules. */
@Module({
  imports: [RrhhEmployeeReadModule],
  controllers: [TrainingsController],
  providers: [TrainingsService],
})
export class TrainingsModule {}
