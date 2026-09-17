import { SceneFrame, SceneNode } from './SceneFrame';
import styles from '../HubScene.module.css';

const ROWS = [
  { y: 28, step: 0 },
  { y: 55, step: 2 },
  { y: 82, step: 5 },
];

export function GestionScene() {
  return (
    <SceneFrame labels={['Objetivos', 'Organización']}>
      <path className={styles.connection} pathLength={1} d="M162 33H152V60H162M152 60V87H162" />
      {ROWS.map(({ y, step }) => (
        <SceneNode key={y} step={step}>
          <rect x={162} y={y} width={62} height={10} rx={1} />
          <rect className={styles.point} x={167} y={y + 4} width={2} height={2} />
          <path className={styles.secondary} d={`M174 ${y + 5}h43`} />
        </SceneNode>
      ))}
    </SceneFrame>
  );
}
