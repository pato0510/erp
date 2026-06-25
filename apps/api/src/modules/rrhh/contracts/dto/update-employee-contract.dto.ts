import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ContractStatus,
  ContractType,
  ContractWorkSchedule,
  GratificationType,
} from '@prisma/client';

/* Body for PATCH /api/rrhh/contracts/:id. Every field optional; the service
   only writes the keys present. If the patch leaves the contract a principal
   (parentContractId NULL) with status VIGENTE, the service re-asserts the
   one-principal-VIGENTE rule. parentContractId is intentionally NOT editable
   here (an anexo can't be re-parented; create a new one instead). */
export class UpdateEmployeeContractDto {
  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contractualRole?: string;

  @IsOptional()
  @IsEnum(ContractWorkSchedule)
  workSchedule?: ContractWorkSchedule;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseSalary?: number;

  @IsOptional()
  @IsEnum(GratificationType)
  gratification?: GratificationType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  gratificationAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  mealAllowance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  transportAllowance?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  workLocation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  mainDuties?: string;

  @IsOptional()
  @IsUUID()
  supervisorId?: string;

  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
