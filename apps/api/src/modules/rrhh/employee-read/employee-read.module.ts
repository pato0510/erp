import { Module } from '@nestjs/common';
import { RrhhEmployeeReadService } from './employee-read.service';

/* HSEC-003 — the RRHH "roster-lite" LEAF (the RrhhBirthdayRead / RrhhAbsenceRead /
 * AttributionRead / OpsCalendarRead pattern, exactly). It EXPORTS RrhhEmployeeReadService and
 * imports NOTHING (only the global PrismaService, reading Employee). Importing nothing keeps
 * the module graph acyclic: HsecModule → RrhhEmployeeReadModule, no back-edge, no forwardRef.
 * The narrowed return shape ({ employeeId, fullName } — NOTHING else) is the whole contract:
 * rut, area, status, email and every other Employee column have NO slot to leak into (the
 * CAL-006/CAL-018 structural-privacy discipline). */
@Module({
  providers: [RrhhEmployeeReadService],
  exports: [RrhhEmployeeReadService],
})
export class RrhhEmployeeReadModule {}
