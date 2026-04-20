import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

// Prisma + pg already parameterize queries so classic SQL injection is not a
// real risk here. What CAN slip through is a null byte (\u0000) inside a
// string — Postgres text columns reject it with "invalid byte sequence for
// encoding UTF8", the error bubbles as a 500 and the request looks like it
// crashed the server. We strip it pre-emptively. Keep the scrubbing minimal:
// stripping quotes, semicolons or comment markers here would silently mangle
// legitimate user content (descriptions, notes, etc.).
@Injectable()
export class NullByteSanitizerMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    if (req.body && typeof req.body === 'object') {
      sanitizeInPlace(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      sanitizeInPlace(req.query as Record<string, unknown>);
    }
    next();
  }
}

function sanitizeInPlace(obj: Record<string, unknown> | unknown[]): void {
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const value = obj[i];
      if (typeof value === 'string') {
        obj[i] = stripNullBytes(value);
      } else if (value && typeof value === 'object') {
        sanitizeInPlace(value as Record<string, unknown> | unknown[]);
      }
    }
    return;
  }

  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === 'string') {
      obj[key] = stripNullBytes(value);
    } else if (value && typeof value === 'object') {
      sanitizeInPlace(value as Record<string, unknown> | unknown[]);
    }
  }
}

function stripNullBytes(s: string): string {
  // Strip \u0000 plus other C0 control chars except \t (\u0009), \n (\u000A),
  // \r (\u000D) which are legitimately used in notes/multiline fields.
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}
