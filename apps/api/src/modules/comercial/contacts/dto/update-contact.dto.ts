import { PartialType } from '@nestjs/mapped-types';
import { CreateContactDto } from './create-contact.dto';

/* All fields optional. Setting isPrimary=true unsets any other primary contact of
   the same account (service layer, atomic). If accountId is provided it is
   re-validated company-scoped. */
export class UpdateContactDto extends PartialType(CreateContactDto) {}
