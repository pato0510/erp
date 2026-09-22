import { BadRequestException } from '@nestjs/common';
import { Matches } from 'class-validator';

export const PASSWORD_POLICY = /^(?=[\s\S]*[A-Za-z])(?=[\s\S]*[0-9])[\s\S]{10,100}$/u;
export const PASSWORD_POLICY_MESSAGE =
  'La contraseña debe tener entre 10 y 100 caracteres, al menos una letra y un número.';

export function IsPassword() {
  return Matches(PASSWORD_POLICY, { message: PASSWORD_POLICY_MESSAGE });
}

export function assertPasswordPolicy(password: unknown): asserts password is string {
  if (typeof password !== 'string' || !PASSWORD_POLICY.test(password)) {
    throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
  }
}
