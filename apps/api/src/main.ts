// Sentry must be imported before everything else
import './instrument';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app/app.module';
import { SentryExceptionFilter } from './modules/common/filters/sentry-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // Security headers — Helmet defaults give us CSP, HSTS, X-Frame-Options,
  // X-Content-Type-Options, Referrer-Policy. We relax CSP to only cover
  // connect/img/script/style needed for the docs/health endpoints; the frontend
  // lives on a separate origin, so browsers won't load assets from this host.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // HSTS: one year, include subdomains. Only effective over HTTPS in prod.
      hsts: {
        maxAge: 60 * 60 * 24 * 365,
        includeSubDomains: true,
      },
      // We serve JSON, not cross-origin embeds — deny framing outright.
      frameguard: { action: 'deny' },
    }),
  );

  // CORS — only the configured frontend may call us, and only with the methods
  // and headers we actually use. credentials=true is required for HttpOnly
  // cookie auth.
  const frontendUrl =
    process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000';
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-company-id'],
  });

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // drop fields not declared in the DTO
      forbidNonWhitelisted: true, // reject outright if unknown fields arrive
      transform: true, // auto-convert query strings → numbers/dates per DTO
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new SentryExceptionFilter());
  const port = process.env.API_PORT || process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`);
  Logger.log(`🔒 CORS allowed origin: ${frontendUrl}`);
}

bootstrap();
