import { Module } from '@nestjs/common';
import { NotificationModule } from '../../operations/notifications/notification.module';
import { RrhhEmployeeReadModule } from '../../rrhh/employee-read/employee-read.module';
import { IncidentPersonsController } from './incident-persons.controller';
import { IncidentPersonsService } from './incident-persons.service';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

/* HSEC-002/003/004 — incidents feature submodule (CRUD + machine + afectados + attachments +
 * the GRAVE|FATAL notification). Imports the RrhhEmployeeRead LEAF (imports nothing — the
 * graph stays acyclic, no forwardRef) and NotificationModule for the thin direct
 * createGeneric path (the RRHH wiring precedent, employee-documents.module.ts:2 — NO cron,
 * NO ops alert engine). StorageService is @Global. PoliciesGuard / CaslAbilityFactory /
 * PrismaService / RlsService come from the global Casl/Prisma/Rls modules. */
@Module({
  imports: [RrhhEmployeeReadModule, NotificationModule],
  controllers: [IncidentsController, IncidentPersonsController],
  providers: [IncidentsService, IncidentPersonsService],
})
export class IncidentsModule {}
