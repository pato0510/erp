import { Module } from '@nestjs/common';
import { IncidentsModule } from './incidents/incidents.module';

/* HSEC-001 — HSEC module aggregator (mirrors the COM-001/MKT-001/CAL-001 scaffold).
 * Registered in AppModule since the shell ticket. Feature submodules compose here as their
 * tickets land: HSEC-002 IncidentsModule (incident CRUD + status machine + INC-{YYYY}-{0000}
 * numbering); next: HSEC-003 RrhhEmployeeRead leaf + afectados, HSEC-006 trainings, HSEC-008
 * EPP. PoliciesGuard / CaslAbilityFactory / PrismaService come from the global Casl/Prisma
 * modules; the HSEC CASL floor + MANAGER grants landed in HSEC-001 (the matrix is uniform —
 * PART1 decision 3). */
@Module({
  imports: [IncidentsModule],
})
export class HsecModule {}
