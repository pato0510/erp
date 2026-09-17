import type { CSSProperties } from 'react';
import styles from './HubStatusLine.module.css';

export type HubStatusKind = 'atencion' | 'correcto' | 'informativo';

interface HubStatusLineProps {
  kind: HubStatusKind;
  message: string;
}

export function HubStatusLine({ kind, message }: HubStatusLineProps) {
  const label = `Estado: ${message}`;

  return (
    <span
      role="note"
      className={styles.status}
      style={{ '--status-color': `var(--hub-status-${kind})` } as CSSProperties}
      title={label}
      aria-label={label}
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.prompt} aria-hidden="true">
        &gt;
      </span>
      <span className={styles.message}>{message}</span>
    </span>
  );
}
