'use client';

import { Check, Circle } from 'lucide-react';
import { passwordRules } from '../../lib/password-policy';

/**
 * AUTH-002 — live checklist for the password policy. Each rule carries text + icon + a
 * screen-reader state, never colour alone; the colour is inherited (currentColor) so the
 * same list works on the dark (auth) stage and on themed app surfaces. Link it to the
 * input with aria-describedby={id}.
 */
export function PasswordChecklist({
  id,
  password,
  className,
}: {
  id: string;
  password: string;
  className?: string;
}) {
  return (
    <ul id={id} className={className} aria-label="Requisitos de la contraseña">
      {passwordRules(password).map((rule) => (
        <li
          key={rule.key}
          data-met={rule.met ? 'true' : 'false'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            opacity: rule.met ? 1 : 0.72,
          }}
        >
          {rule.met ? (
            <Check size={13} strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <Circle size={11} strokeWidth={2} aria-hidden="true" />
          )}
          <span>{rule.label}</span>
          <span className="sr-only">{rule.met ? '(cumplido)' : '(pendiente)'}</span>
        </li>
      ))}
    </ul>
  );
}

export default PasswordChecklist;
