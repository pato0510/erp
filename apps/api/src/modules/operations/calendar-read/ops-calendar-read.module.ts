import { Module } from '@nestjs/common';
import { OpsCalendarReadService } from './ops-calendar-read.service';

/* CAL-016 — the Operaciones calendar LEAF (the RrhhBirthdayRead / AttributionRead pattern,
 * exactly). It EXPORTS OpsCalendarReadService and imports NOTHING (it uses only the global
 * PrismaService, reading Operaciones' OWN tables — service_orders + document_records). Importing
 * nothing is what keeps the master's graph acyclic: ActividadesModule → OpsCalendarReadModule,
 * with no back-edge, so no forwardRef. The narrowed return types (ServicioCalendarEntry /
 * VencimientoCalendarEntry) are the whole contract — the master NEVER imports the fat ops
 * CalendarEventType taxonomy (recon Q3 verdict: narrow contract over thin export). */
@Module({
  providers: [OpsCalendarReadService],
  exports: [OpsCalendarReadService],
})
export class OpsCalendarReadModule {}
