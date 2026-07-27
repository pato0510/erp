import { Module } from '@nestjs/common';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

/* HSEC-002 — incidents feature submodule. PoliciesGuard / CaslAbilityFactory /
 * PrismaService / RlsService come from the global Casl/Prisma/Rls modules. */
@Module({
  controllers: [IncidentsController],
  providers: [IncidentsService],
})
export class IncidentsModule {}
