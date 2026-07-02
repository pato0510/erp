import { Module } from '@nestjs/common';
import { ComercialController } from './comercial.controller';

/* COM-001 — Comercial (CRM) module aggregator (skeleton only). Registers the
 * gated health controller. Feature submodules (accounts, contacts, opportunities,
 * activities, service catalog, quotes) are imported here as their tickets
 * (COM-002+) land, mirroring how RrhhModule / OperationsModule aggregate their
 * feature submodules. PoliciesGuard / CaslAbilityFactory / PrismaService are
 * provided by the global Casl/Prisma modules. */
@Module({
  controllers: [ComercialController],
})
export class ComercialModule {}
