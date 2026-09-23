import { IsIn, IsOptional } from 'class-validator';
import type { MembersScope } from '../members.service';

export class MembersQueryDto {
  @IsOptional()
  @IsIn(['active', 'all'], { message: 'scope debe ser active o all.' })
  scope: MembersScope = 'all';
}
