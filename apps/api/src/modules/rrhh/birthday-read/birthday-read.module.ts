import { Module } from '@nestjs/common';
import { BirthdayReadService } from './birthday-read.service';

/* CAL-006 — the RRHH birthday leaf (the AttributionReadModule pattern). It EXPORTS
 * BirthdayReadService and imports NOTHING (it uses only the global PrismaService, reading only
 * the Employee table). Importing nothing is what keeps the module graph acyclic:
 * ActividadesModule → RrhhBirthdayReadModule, with no back-edge, so no forwardRef is needed. */
@Module({
  providers: [BirthdayReadService],
  exports: [BirthdayReadService],
})
export class RrhhBirthdayReadModule {}
