/* AUTH-002 — client mirror of the api's single password policy (AUTH-001,
   apps/api/src/modules/iam/password-policy.ts): 10–100 characters, at least one ASCII
   letter and one digit. The server stays the authority; this only drives the live
   checklist and the submit gate. "Distinta de la actual" is server-checked, never here. */

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 100;

export const PASSWORD_POLICY_MESSAGE =
  'La contraseña debe tener entre 10 y 100 caracteres, al menos una letra y un número.';

export interface PasswordRule {
  key: 'length' | 'letter' | 'digit';
  label: string;
  met: boolean;
}

export function passwordRules(password: string): PasswordRule[] {
  return [
    {
      key: 'length',
      label: `${PASSWORD_MIN} caracteres o más`,
      met: password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX,
    },
    { key: 'letter', label: 'Una letra', met: /[A-Za-z]/.test(password) },
    { key: 'digit', label: 'Un número', met: /[0-9]/.test(password) },
  ];
}

export function meetsPasswordPolicy(password: string): boolean {
  return passwordRules(password).every((rule) => rule.met);
}
