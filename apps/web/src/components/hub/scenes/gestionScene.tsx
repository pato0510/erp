import { SceneFrame, SceneNode } from './SceneFrame';
import styles from '../HubScene.module.css';

const ROWS = [
  { y: 6, end: 92 },
  { y: 26, end: 80 },
  { y: 46, end: 88 },
];

export function GestionScene() {
  return (
    <SceneFrame labels={['Objetivos', 'Organización']}>
      <path className={styles.connection} pathLength={1} d="M8 6V46" />
      {ROWS.map(({ y, end }) => (
        <path key={y} className={styles.connection} pathLength={1} d={`M18 ${y}H${end}`} />
      ))}
      {ROWS.map(({ y }, index) => (
        <SceneNode key={y} step={index}>
          <rect x={4.5} y={y - 3.5} width={7} height={7} />
        </SceneNode>
      ))}
    </SceneFrame>
  );
}
