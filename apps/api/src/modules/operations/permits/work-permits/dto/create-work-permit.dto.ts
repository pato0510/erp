import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class WorkTeamMemberDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  signature?: string;
}

export class CreateWorkPermitDto {
  @IsUUID()
  permitTypeId: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  workLocation?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsISO8601()
  plannedStart: string;

  @IsISO8601()
  plannedEnd: string;

  @IsUUID()
  supervisorId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WorkTeamMemberDto)
  workTeam: WorkTeamMemberDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(40)
  identifiedRisks?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(40)
  controlMeasures?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  additionalNotes?: string;

  /* When true the permit is created in PENDING_AUTHORIZATION instead
     of DRAFT — convenience for the common "submit immediately" UX. */
  @IsOptional()
  @IsBoolean()
  submitImmediately?: boolean;
}
