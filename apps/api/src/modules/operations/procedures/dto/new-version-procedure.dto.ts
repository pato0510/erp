import { IsString, MaxLength, MinLength } from 'class-validator';
import { CreateProcedureDto } from './create-procedure.dto';

/* CreateNewVersionDto reuses every editable metadata field from
   CreateProcedureDto, but the `version` and `changelog` fields are
   strictly required so the new version is identifiable. */
export class CreateNewVersionDto extends CreateProcedureDto {
  declare code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  declare version: string;

  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  declare changelog: string;
}
