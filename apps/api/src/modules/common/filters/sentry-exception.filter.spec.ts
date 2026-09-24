import { ArgumentsHost, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { SentryExceptionFilter } from './sentry-exception.filter';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

describe('SentryExceptionFilter API error contract', () => {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/api/test', method: 'POST' }),
    }),
  } as unknown as ArgumentsHost;

  it('preserves the exact forced-change error code and body', () => {
    const body = {
      statusCode: 403,
      code: 'PASSWORD_CHANGE_REQUIRED',
      message: 'Debes cambiar tu contraseña para continuar.',
    };
    new SentryExceptionFilter().catch(new ForbiddenException(body), host);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(body);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it.each([
    [
      new BadRequestException('La contraseña actual no es correcta.'),
      'La contraseña actual no es correcta.',
    ],
    [
      new BadRequestException(['first constraint', 'second constraint']),
      'first constraint · second constraint',
    ],
  ])('retains existing string and array-message behavior', (error, message) => {
    new SentryExceptionFilter().catch(error, host);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      message,
      timestamp: expect.any(String),
      path: '/api/test',
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'reopen validation text appears once',
      messages: ['Reabrir requiere un motivo.', 'Reabrir requiere un motivo.'],
      expected: 'Reabrir requiere un motivo.',
    },
    {
      name: 'distinct validation messages retain first-occurrence order',
      messages: ['A', 'B', 'A'],
      expected: 'A · B',
    },
  ])('deduplicates validation messages: $name', ({ messages, expected }) => {
    new SentryExceptionFilter().catch(new BadRequestException(messages), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      message: expected,
      timestamp: expect.any(String),
      path: '/api/test',
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('hides unexpected errors while retaining 5xx reporting', () => {
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      new SentryExceptionFilter().catch(new Error('private implementation detail'), host);
      expect(json).toHaveBeenCalledWith({
        statusCode: 500,
        message: 'Internal server error',
        timestamp: expect.any(String),
        path: '/api/test',
      });
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    } finally {
      logger.mockRestore();
    }
  });
});
