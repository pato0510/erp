import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CrmActivityType } from '@prisma/client';

/**
 * Creates a CrmActivity. At least one of counterpartyId / opportunityId is
 * expected in practice (a note pinned to a client and/or an opportunity), but
 * both are optional at the column level. dueDate + done are used by the
 * "próximas tareas" view (type TAREA, done=false, dueDate>=today).
 */
export class CreateActivityDto {
  @IsEnum(CrmActivityType)
  type: CrmActivityType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

  @IsOptional()
  @IsUUID()
  opportunityId?: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;
}
