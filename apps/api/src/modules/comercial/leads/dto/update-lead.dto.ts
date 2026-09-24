import { PartialType, PickType } from '@nestjs/mapped-types';
import { CreateLeadDto } from './create-lead.dto';

// The account is immutable. Only contactId accepts null (clear the contact).
export class UpdateLeadDto extends PartialType(
  PickType(CreateLeadDto, ['name', 'contactId'] as const),
  { skipNullProperties: false },
) {}
