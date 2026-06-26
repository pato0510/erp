import { Module } from '@nestjs/common';
import { CertificationsModule } from '../certifications/certifications.module';
import { DisponibilidadController } from './disponibilidad.controller';
import { DisponibilidadService } from './disponibilidad.service';

/* HR-015 — tablero de disponibilidad (READ-ONLY team board). Imports
   CertificationsModule to REUSE CertificationsService.compliance for the matriz
   (HR-014). The availability + alerts reads reuse the HR-011/HR-012/HR-007
   predicates directly. PrismaService/RlsService come from their @Global modules. */
@Module({
  imports: [CertificationsModule],
  controllers: [DisponibilidadController],
  providers: [DisponibilidadService],
  exports: [DisponibilidadService],
})
export class DisponibilidadModule {}
