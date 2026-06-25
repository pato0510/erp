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

/* Body for POST /api/rrhh/contracts. The PLAZO_FIJO/POR_OBRA → endDate rule and
   the "one principal VIGENTE per employee" rule are enforced in the service. If
   parentContractId is set, this row is an anexo of that principal. Dates are
   ISO8601 strings — the service parses them (stored as @db.Date). */
export class CreateEmployeeContractDto {
  @IsUUID()
  employeeId: string;

  @IsEnum(ContractType)
  contractType: ContractType;

  @IsISO8601()
  startDate: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contractualRole?: string;

  @IsEnum(ContractWorkSchedule)
  workSchedule: ContractWorkSchedule;

  @IsNumber()
  @Min(0)
  baseSalary: number;

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
  @IsUUID()
  parentContractId?: string;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
