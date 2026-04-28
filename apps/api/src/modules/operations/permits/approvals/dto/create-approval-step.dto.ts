import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateApprovalStepDto {
  /* Exactly one of these must be set; the service enforces it. */
  @IsOptional()
  @IsUUID()
  workPermitTypeId?: string;

  @IsOptional()
  @IsUUID()
  permitTypeId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  stepOrder: number;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @ArrayMaxSize(8)
  requiredRoles: string[];

  @IsOptional()
  @IsUUID()
  requiresSpecificUserId?: string;

  @IsOptional()
  @IsBoolean()
  mustBeDifferentFromRequester?: boolean;

  @IsOptional()
  @IsBoolean()
  mustBeDifferentFromPreviousApprovers?: boolean;

  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;
}
