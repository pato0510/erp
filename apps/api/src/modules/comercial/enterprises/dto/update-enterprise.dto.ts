import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateEnterpriseDto } from './create-enterprise.dto';

/* COM-018 — edit an enterprise. All create fields optional (same validations) plus
   `isActive`: there is NO DELETE — deactivation is isActive=false and linked accounts
   keep their link. `rut: null` (or '') clears the RUT. */
export class UpdateEnterpriseDto extends PartialType(CreateEnterpriseDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
