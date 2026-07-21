import { Module } from '@nestjs/common';
import { MembersReadService } from './members-read.service';

/* CAL-008 — members-lite read module. Exports MembersReadService (consumed by the root
 * ActividadesController for GET /actividades/members) and imports NOTHING — it uses only the
 * global PrismaService to read the platform-common Membership/User tables. */
@Module({
  providers: [MembersReadService],
  exports: [MembersReadService],
})
export class MembersReadModule {}
