import { SceneFrame, SceneNode } from './SceneFrame';
import styles from '../HubScene.module.css';

const NODES = [
  { x: 154, y: 60, step: 0 },
  { x: 190, y: 36, step: 1 },
  { x: 190, y: 84, step: 2 },
  { x: 224, y: 28, step: 3 },
  { x: 224, y: 46, step: 4 },
  { x: 224, y: 74, step: 5 },
  { x: 224, y: 92, step: 5 },
];

export function ComercialScene() {
  return (
    <SceneFrame labels={['Clientes', 'Oportunidades']}>
      <path className={styles.connection} pathLength={1} d="M154 60L190 36L224 28M190 36L224 46" />
      <path className={styles.connection} pathLength={1} d="M154 60L190 84L224 74M190 84L224 92" />
      {NODES.map(({ x, y, step }) => (
        <SceneNode key={`${x}-${y}`} step={step}>
          <rect className={styles.point} x={x - 2} y={y - 2} width={4} height={4} />
        </SceneNode>
      ))}
    </SceneFrame>
  );
}
