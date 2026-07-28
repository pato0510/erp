import { Module } from '@nestjs/common';
import { RrhhEmployeeReadModule } from '../../rrhh/employee-read/employee-read.module';
import { IncidentPersonsController } from './incident-persons.controller';
import { IncidentPersonsService } from './incident-persons.service';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

/* HSEC-002/003 — incidents feature submodule (CRUD + machine + afectados). Imports ONLY the
 * RrhhEmployeeRead LEAF (which imports nothing — the graph stays acyclic, no forwardRef):
 * names resolve through the two-key signed contract. PoliciesGuard / CaslAbilityFactory /
 * PrismaService / RlsService come from the global Casl/Prisma/Rls modules. */
@Module({
  imports: [RrhhEmployeeReadModule],
  controllers: [IncidentsController, IncidentPersonsController],
  providers: [IncidentsService, IncidentPersonsService],
})
export class IncidentsModule {}
