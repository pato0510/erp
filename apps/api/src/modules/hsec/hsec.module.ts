import { Module } from '@nestjs/common';

/* HSEC-001 — HSEC module aggregator skeleton (mirrors the COM-001/MKT-001/CAL-001 scaffold).
 * Registered in AppModule so the module namespace exists from the shell ticket onward.
 * Deliberately EMPTY this ticket: no controllers, no providers, no Prisma models, no
 * migration — feature submodules compose here as their tickets land (HSEC-002 incidents,
 * HSEC-003 RrhhEmployeeRead leaf + afectados, HSEC-006 trainings, HSEC-008 EPP).
 * PoliciesGuard / CaslAbilityFactory / PrismaService come from the global Casl/Prisma
 * modules; the HSEC CASL floor + MANAGER grants land in casl-ability.factory.ts this same
 * ticket (the matrix is uniform — PART1 decision 3). */
@Module({})
export class HsecModule {}
