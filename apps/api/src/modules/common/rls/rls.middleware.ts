import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';

export const tenantStorage = new AsyncLocalStorage<{ companyId: string }>();

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const companyId = req.headers['x-company-id'] as string | undefined;

    if (companyId) {
      tenantStorage.run({ companyId }, () => next());
    } else {
      next();
    }
  }
}
