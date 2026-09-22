import { ForbiddenException } from '@nestjs/common';

export function passwordChangeRequiredException() {
  return new ForbiddenException({
    statusCode: 403,
    code: 'PASSWORD_CHANGE_REQUIRED',
    message: 'Debes cambiar tu contraseña para continuar.',
  });
}
