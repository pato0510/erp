import { SceneFrame, SceneNode } from './SceneFrame';
import styles from '../HubScene.module.css';

const RECORDS = [
  { x: 154, y: 30 },
  { x: 208, y: 30 },
  { x: 154, y: 54 },
  { x: 208, y: 54 },
  { x: 154, y: 78 },
  { x: 208, y: 78 },
];

export function FinanzasScene() {
  return (
    <SceneFrame labels={['Flujo de caja', 'Balance']}>
      <path className={styles.connection} pathLength={1} d="M176 35H188L196 59H208" />
      <path className={styles.connection} pathLength={1} d="M176 59H188L196 35H208" />
      <path className={styles.connection} pathLength={1} d="M176 83H208" />
      {RECORDS.map(({ x, y }, index) => (
        <SceneNode key={`${x}-${y}`} step={index}>
          <rect x={x} y={y} width={22} height={10} rx={1} />
          <path className={styles.secondary} d={`M${x + 5} ${y + 5}h12`} />
        </SceneNode>
      ))}
    </SceneFrame>
  );
}
