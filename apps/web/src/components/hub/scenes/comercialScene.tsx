import { SceneFrame, SceneNode } from './SceneFrame';
import styles from '../HubScene.module.css';

const NODES = [
  { x: 8, y: 26 },
  { x: 48, y: 6 },
  { x: 48, y: 46 },
  { x: 88, y: 26 },
];

export function ComercialScene() {
  return (
    <SceneFrame labels={['Clientes', 'Oportunidades']}>
      <path className={styles.connection} pathLength={1} d="M8 26L48 6L88 26" />
      <path className={styles.connection} pathLength={1} d="M8 26L48 46L88 26" />
      {NODES.map(({ x, y }, index) => (
        <SceneNode key={`${x}-${y}`} step={index}>
          <circle cx={x} cy={y} r={3.5} />
        </SceneNode>
      ))}
    </SceneFrame>
  );
}
