import { Module } from '@nestjs/common';
import { ComercialCierresReadService } from './cierres-read.service';

/* CAL-017 — the Comercial "cierres esperados" LEAF (the AttributionRead / RrhhBirthdayRead /
 * OpsCalendarRead pattern, exactly). It EXPORTS ComercialCierresReadService and imports NOTHING
 * (only the global PrismaService + Prisma enums). Importing nothing keeps the master's graph
 * acyclic: ActividadesModule → ComercialCierresReadModule, with no back-edge, so no forwardRef.
 * The narrowed return type (CierreCalendarEntry — name + expected date, NO stage, NO amount) is
 * the whole contract; the pipeline's shape is commercially sensitive and never leaves Comercial. */
@Module({
  providers: [ComercialCierresReadService],
  exports: [ComercialCierresReadService],
})
export class ComercialCierresReadModule {}
