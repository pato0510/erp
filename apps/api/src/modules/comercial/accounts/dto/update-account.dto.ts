import { PartialType } from '@nestjs/mapped-types';
import { CreateAccountDto } from './create-account.dto';

/* All fields optional. To UNLINK a counterparty, send counterpartyId: null (it
   passes @IsOptional and the service clears the FK). Status transitions are free
   (any status → any status). */
export class UpdateAccountDto extends PartialType(CreateAccountDto) {}
