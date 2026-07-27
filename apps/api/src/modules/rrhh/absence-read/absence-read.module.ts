import { Module } from '@nestjs/common';
import { RrhhAbsenceReadService } from './absence-read.service';

/* CAL-018 — the RRHH "ausencias" LEAF (the RrhhBirthdayRead / AttributionRead / OpsCalendarRead /
 * ComercialCierresRead pattern, exactly). It EXPORTS RrhhAbsenceReadService and imports NOTHING
 * (only the global PrismaService + Prisma enums, reading VacationRequest / Absence / Employee).
 * Importing nothing keeps the master's graph acyclic: ActividadesModule → RrhhAbsenceReadModule,
 * no back-edge, no forwardRef. The narrowed return type (AusenciaCalendarEntry — employeeId +
 * fullName + range, NOTHING else) is the whole contract: the PII-toxic fields (category,
 * medicalFolio, healthEntity, absence type/motivo, status) have NO slot to leak into (the CAL-006
 * structural-privacy discipline, final exam). */
@Module({
  providers: [RrhhAbsenceReadService],
  exports: [RrhhAbsenceReadService],
})
export class RrhhAbsenceReadModule {}
