import { Module } from '@nestjs/common';
import { RrhhEmployeeReadModule } from '../../rrhh/employee-read/employee-read.module';
import { EppDeliveriesController } from './epp-deliveries.controller';
import { EppDeliveriesService } from './epp-deliveries.service';
import { EppItemsController } from './epp-items.controller';
import { EppItemsService } from './epp-items.service';

/* HSEC-008 — EPP feature submodule (catalog + deliveries + acuse file). Imports ONLY the
 * RrhhEmployeeRead LEAF (which imports nothing — the graph stays acyclic, no forwardRef).
 * StorageService is @Global. PoliciesGuard / CaslAbilityFactory / PrismaService / RlsService
 * come from the global Casl/Prisma/Rls modules. */
@Module({
  imports: [RrhhEmployeeReadModule],
  controllers: [EppItemsController, EppDeliveriesController],
  providers: [EppItemsService, EppDeliveriesService],
})
export class EppModule {}
