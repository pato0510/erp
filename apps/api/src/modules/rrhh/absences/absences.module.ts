import { Module } from '@nestjs/common';
import { AbsenceTypesController } from './absence-types.controller';
import { AbsenceTypesService } from './absence-types.service';
import { AbsencesController } from './absences.controller';
import { AbsencesService } from './absences.service';

/* HR-012 — ausencias: permisos + licencias (unified) + configurable types.
   Availability is a SOFT read-only marker (no Operations integration — HR-016).
   PrismaService/RlsService come from their @Global modules. */
@Module({
  controllers: [AbsenceTypesController, AbsencesController],
  providers: [AbsenceTypesService, AbsencesService],
  exports: [AbsenceTypesService, AbsencesService],
})
export class AbsencesModule {}
