import { PartialType } from '@nestjs/mapped-types';
import { CreateAlertRuleDto } from './create-alert-rule.dto';

/* All fields optional — service treats undefined as "no change". */
export class UpdateAlertRuleDto extends PartialType(CreateAlertRuleDto) {}
