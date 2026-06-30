import { Module } from '@nestjs/common';
import { CertificationsModule } from '../certifications/certifications.module';
import { DisponibilidadController } from './disponibilidad.controller';
import { DisponibilidadServicioController } from './disponibilidad-servicio.controller';
import { DisponibilidadService } from './disponibilidad.service';

/* HR-015 — tablero de disponibilidad (READ-ONLY team board). Imports
   CertificationsModule to REUSE CertificationsService.compliance for the matriz
   (HR-014). The availability + alerts reads reuse the HR-011/HR-012/HR-007
   predicates directly. PrismaService/RlsService come from their @Global modules.

   HR-016 — DisponibilidadServicioController exposes the read-only cross-module
   "disponibilidad para servicio" contract (Operations/Comercial consume it). It
   reuses the SAME DisponibilidadService resolution — no new dependency. */
@Module({
  imports: [CertificationsModule],
  controllers: [DisponibilidadController, DisponibilidadServicioController],
  providers: [DisponibilidadService],
  exports: [DisponibilidadService],
})
export class DisponibilidadModule {}
