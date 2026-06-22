import { IsDateString, IsOptional } from 'class-validator';

/** Drag-and-drop reschedule of a CalendarItem: new date (+ optional endDate). */
export class RescheduleCalendarItemDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;
}
