import { SceneFrame, SceneNode } from './SceneFrame';
import styles from '../HubScene.module.css';

const PEOPLE = [
  { x: 48, y: 6 },
  { x: 10, y: 44 },
  { x: 48, y: 44 },
  { x: 86, y: 44 },
];

export function RrhhScene() {
  return (
    <SceneFrame labels={['Personas', 'Talento']}>
      <path className={styles.connection} pathLength={1} d="M48 10V24" />
      <path className={styles.connection} pathLength={1} d="M10 24H86" />
      <path className={styles.connection} pathLength={1} d="M10 24V40" />
      <path className={styles.connection} pathLength={1} d="M48 24V40" />
      <path className={styles.connection} pathLength={1} d="M86 24V40" />
      {PEOPLE.map(({ x, y }, index) => (
        <SceneNode key={`${x}-${y}`} step={index}>
          <circle cx={x} cy={y} r={4} />
        </SceneNode>
      ))}
    </SceneFrame>
  );
}
