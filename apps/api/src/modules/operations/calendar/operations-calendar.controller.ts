import { Controller, Get, ParseIntPipe, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import {
  CalendarEventType,
  CalendarSeverity,
  GetEventsDto,
  OperationsCalendarService,
} from './operations-calendar.service';

const ALL_TYPE_VALUES: CalendarEventType[] = [
  'document_expiration',
  'permit_expiration',
  'work_permit_scheduled',
  'acknowledgment_deadline',
  'exception_expiration',
  'procedure_published',
];

const SEVERITY_VALUES: CalendarSeverity[] = ['INFO', 'WARNING', 'CRITICAL', 'BLOCKING'];

/* OPS-030 — read-only calendar feed. Mirrors the dashboard
   controller's posture: any authenticated user can read; RLS scopes
   data per company; no CASL because the calendar surfaces data the
   caller is already authorized to see on the source pages. */
@Controller('operations/calendar')
@UseGuards(JwtAuthGuard)
export class OperationsCalendarController {
  constructor(private readonly service: OperationsCalendarService) {}

  @Get('events')
  events(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('types') types: string | undefined,
    @Query('assetId') assetId: string | undefined,
    @Query('locationId') locationId: string | undefined,
    @Query('severity') severity: string | undefined,
  ) {
    return this.service.getEvents(
      companyId,
      user.id,
      this.buildDto({
        startDate,
        endDate,
        types,
        assetId,
        locationId,
        severity,
      }),
    );
  }

  @Get('events/by-date')
  eventsByDate(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Query('date') date: string,
    @Query('types') types: string | undefined,
  ) {
    return this.service.getEventsByDate(companyId, user.id, date, this.parseTypes(types));
  }

  @Get('month-summary')
  monthSummary(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.service.getMonthSummary(companyId, user.id, year, month);
  }

  /* iCal export. Streams a text/calendar body with a Content-
     Disposition that prompts the browser to save it as a .ics file.
     We use @Res() because NestJS's default JSON serializer would
     wrap the body in quotes and break iCal parsers. */
  @Get('export')
  async export(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('types') types: string | undefined,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    const dto = this.buildDto({ startDate, endDate, types });
    /* Public base URL for `URL:` lines inside VEVENTs — falls back
       to api.excelsia.cl if env isn't set, but in practice
       OPERATIONS_PUBLIC_URL on Railway should hold app.excelsia.cl. */
    const publicBaseUrl =
      process.env.OPERATIONS_PUBLIC_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      'https://app.excelsia.cl';
    const { filename, body } = await this.service.exportIcal(
      companyId,
      user.id,
      dto,
      publicBaseUrl,
    );
    /* `format` is accepted for forward-compat (CSV later?) but we
       only emit iCal today. Anything else degrades gracefully. */
    void format;
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(body);
  }

  /* ---- Helpers ------------------------------------------------ */

  private buildDto(input: {
    startDate: string;
    endDate: string;
    types?: string;
    assetId?: string;
    locationId?: string;
    severity?: string;
  }): GetEventsDto {
    const dto: GetEventsDto = {
      startDate: input.startDate,
      endDate: input.endDate,
      types: this.parseTypes(input.types),
      assetId: input.assetId,
      locationId: input.locationId,
    };
    if (input.severity) {
      const sev = input.severity.toUpperCase();
      if ((SEVERITY_VALUES as string[]).includes(sev)) {
        dto.severity = sev as CalendarSeverity;
      }
    }
    return dto;
  }

  private parseTypes(input: string | undefined): CalendarEventType[] | undefined {
    if (!input || input.trim().length === 0) return undefined;
    const parts = input
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean) as string[];
    const valid = parts.filter((p): p is CalendarEventType =>
      (ALL_TYPE_VALUES as string[]).includes(p),
    );
    return valid.length > 0 ? valid : undefined;
  }
}
