import type { CSSProperties, ReactNode } from 'react';
import styles from '../HubScene.module.css';

interface SceneFrameProps {
  labels: readonly [string, string];
  children: ReactNode;
}

export function SceneFrame({ labels, children }: SceneFrameProps) {
  return (
    <div className={styles.canvas}>
      <div className={styles.grid} />
      <svg width={96} height={52} viewBox="0 0 96 52" className={styles.graphic} focusable="false">
        {children}
      </svg>
      {labels.map((label, index) => (
        <span
          key={label}
          className={styles.label}
          style={{ '--label-index': index } as CSSProperties}
        >
          <span className={styles.labelInner}>
            <span className={styles.marker} />
            {label}
          </span>
        </span>
      ))}
      <div className={styles.sweep} />
    </div>
  );
}

export function SceneNode({ step, children }: { step: number; children: ReactNode }) {
  return (
    <g className={styles.node} style={{ '--node-step': step } as CSSProperties}>
      {children}
    </g>
  );
}
