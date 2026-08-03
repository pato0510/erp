import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Request, Response } from 'express';

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    /* PLAT-001 — surface class-validator constraint messages. Nest's ValidationPipe throws a
       BadRequestException whose getResponse().message is the string[] of failing
       constraints, while exception.message is the generic "Bad Request Exception" — so every
       DTO-level message was invisible platform-wide (HSEC-008 finding). We read
       getResponse():
       - { message: string }   → the service-thrown path, kept BYTE-IDENTICAL to today
         (getResponse().message equals exception.message for a string-constructed HttpException).
       - { message: string[] } → DIRECTOR RULING: join into ONE string with ' · '. The
         platform's 4xx body has always carried `message` as a STRING and every frontend
         renders it directly; an array would coerce to a comma-blob. Joining server-side keeps
         the string contract while surfacing every failing constraint.
       - anything else / non-HttpException → the previous fallback, UNCHANGED. */
    let message: string;
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      const resMessage =
        typeof res === 'object' && res !== null
          ? (res as { message?: unknown }).message
          : undefined;
      if (typeof resMessage === 'string') {
        message = resMessage;
      } else if (Array.isArray(resMessage)) {
        message = resMessage.join(' · ');
      } else {
        message = exception.message;
      }
    } else {
      message = 'Internal server error';
    }

    // Only capture 5xx errors in Sentry (not client errors like 404, 400)
    if (status >= 500) {
      Sentry.captureException(exception, {
        extra: {
          url: request.url,
          method: request.method,
          statusCode: status,
        },
      });

      this.logger.error(
        `${request.method} ${request.url} ${status} - ${exception instanceof Error ? exception.message : 'Unknown error'}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
