import { PartialType } from '@nestjs/mapped-types';
import { CreateExpenseDto } from './create-expense.dto';

/* MKT-005 — all fields optional (edit any of expenseDate/description/amount/vendorName/
   notes). amount, when provided, is still validated STRICTLY > 0. */
export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {}
