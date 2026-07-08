import { ServiceOrderStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

/* COM-013a — the canonical status-change payload. The service enforces the machine
   (RECIBIDA→EN_EJECUCION→COMPLETADA, →CANCELADA from any non-terminal; terminal states
   reject). */
export class ChangeServiceOrderStatusDto {
  @IsEnum(ServiceOrderStatus)
  status: ServiceOrderStatus;
}
